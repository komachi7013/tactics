import { AUDIO_CATALOG, type AudioCueId, type MusicId, type SoundId } from './audio-cues';
export type { MusicId, SoundId } from './audio-cues';

export interface AudioStatus {
  enabled: boolean;
  version: string;
  contextState: string;
  contextTime: number;
  loadingCue: MusicId | null;
  muted: boolean;
  hidden: boolean;
  bgm: number;
  se: number;
  cue: MusicId | null;
  activeCue: MusicId | null;
  error: string | null;
}
export interface AudioDependencies {
  createContext?: () => AudioContext;
  fetch?: typeof fetch;
  now?: () => number;
  resumeTimeoutMs?: number;
  loadTimeoutMs?: number;
}
type Voice = { source: AudioBufferSourceNode; gain: GainNode };
// With v1 peak bounds (BGM <= .32, SE <= .5), 2 BGM + 3 SE <= .749.
// Keep user category values in 0..1; this fixed margin also protects crossfades.
export const AUDIO_HEADROOM = 0.35;
export const AUDIO_RUNTIME_VERSION = 'audio-v1-r2';
const volume = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

/** Memory-only, gesture-unlocked playback. No save or browser storage access. */
export class GameAudio {
  private context: AudioContext | null = null;
  private disposed = false;
  private epoch = 0;
  private cueRevision = 0;
  private current: Voice | null = null;
  private retiring: Voice | null = null;
  private voices = new Set<Voice>();
  private sounds = new Set<Voice>();
  private buffers = new Map<AudioCueId, Promise<AudioBuffer>>();
  private pendingSounds = new Map<SoundId, number>();
  private lastSound = new Map<SoundId, number>();
  private enabling: Promise<void> | null = null;
  private state: AudioStatus = { enabled: false, version: AUDIO_RUNTIME_VERSION, contextState: 'not-created', contextTime: 0, loadingCue: null, muted: false, hidden: false, bgm: 0.5, se: 0.65, cue: null, activeCue: null, error: null };
  constructor(private readonly onChange: (status: AudioStatus) => void = () => {}, private readonly dependencies: AudioDependencies = {}) {}
  get status(): AudioStatus { return { ...this.state, contextState: this.context?.state ?? 'not-created', contextTime: this.context?.currentTime ?? 0 }; }
  private notify() { this.onChange(this.status); }
  private canPlay() { return !this.disposed && this.state.enabled && !this.state.muted && !this.state.hidden && this.context?.state === 'running'; }
  private fail(error: unknown) {
    if (this.disposed) return;
    this.state.error = `音声を再生できません: ${error instanceof Error ? error.message : String(error)}`;
    this.notify();
  }
  private bounded<T>(promise: Promise<T>, ms: number, label: string, abort?: () => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { abort?.(); reject(new Error(label)); }, ms);
      promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  }
  private contextChanged() {
    if (this.disposed) return;
    if (this.context?.state !== 'running') this.invalidate();
    this.notify();
    if (this.context?.state === 'running') this.startMusic();
  }
  enable(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.enabling) return this.enabling;
    try {
      // These calls run synchronously in the user's activation handler, before any fetch/await.
      if (!this.context || this.context.state === 'closed') {
        this.invalidate();
        if (this.context) this.context.onstatechange = null;
        this.context = (this.dependencies.createContext ?? (() => new AudioContext()))();
        this.context.onstatechange = () => this.contextChanged();
      }
      const resumed = this.context.resume();
      this.notify();
      this.enabling = this.bounded(resumed, this.dependencies.resumeTimeoutMs ?? 5000, '音の開始を待っています。音を再開するボタンで再試行できます。').then(() => {
        if (this.disposed) return;
        if (this.context?.state !== 'running') throw new Error(`音の処理が休止中です (${this.context?.state ?? 'unknown'})。再開ボタンで再試行してください。`);
        this.state.enabled = true;
        this.state.error = null;
        this.notify();
        this.startMusic();
      }).catch(error => {
        this.state.enabled = false;
        this.fail(error);
      }).finally(() => { this.enabling = null; });
      return this.enabling;
    } catch (error) { this.state.enabled = false; this.fail(error); return Promise.resolve(); }
  }
  setMuted(muted: boolean) {
    if (this.disposed || this.state.muted === muted) return;
    this.state.muted = muted;
    this.invalidate();
    this.notify();
    if (!muted) this.startMusic();
  }
  setHidden(hidden: boolean) {
    if (this.disposed || this.state.hidden === hidden) return;
    this.state.hidden = hidden;
    this.invalidate();
    this.notify();
    if (!hidden) this.startMusic();
  }
  setVolumes(values: { bgm?: number; se?: number }) {
    if (this.disposed) return;
    if (values.bgm !== undefined) this.state.bgm = volume(values.bgm, this.state.bgm);
    if (values.se !== undefined) this.state.se = volume(values.se, this.state.se);
    if (this.context) {
      if (this.current) this.ramp(this.current.gain, this.state.bgm, 0.03);
      for (const voice of this.sounds) this.ramp(voice.gain, this.state.se, 0.03);
    }
    this.notify();
  }
  setCue(cue: MusicId | null) {
    if (this.disposed || this.state.cue === cue) return;
    this.beginScene(cue);
  }
  /** Call on every scene/retry boundary, even when the BGM is unchanged. */
  beginScene(cue: MusicId | null) {
    if (this.disposed) return;
    this.epoch++;
    this.cueRevision++;
    this.state.loadingCue = null;
    this.pendingSounds.clear();
    this.lastSound.clear();
    for (const voice of this.sounds) { voice.source.stop(); this.release(voice); }
    const sameCue = this.state.cue === cue;
    this.state.cue = cue;
    if (!sameCue) this.stopMusic(true);
    this.notify();
    // Preserve an already playing same-cue BGM; reattach any pending load to this epoch.
    this.startMusic();
  }
  private load(id: AudioCueId): Promise<AudioBuffer> {
    const cached = this.buffers.get(id);
    if (cached) return cached;
    const context = this.context!;
    const controller = new AbortController();
    const request = Promise.resolve().then(() => (this.dependencies.fetch ?? fetch)(AUDIO_CATALOG[id], { credentials: 'same-origin', mode: 'same-origin', signal: controller.signal }))
      .then(response => {
        if (!response.ok) throw new Error(`${id} HTTP ${response.status}`);
        return response.arrayBuffer();
      }).then(bytes => {
        const header = new Uint8Array(bytes);
        const text = (start: number, end: number) => String.fromCharCode(...header.subarray(start, end));
        if (header.length < 12 || text(0, 4) !== 'RIFF' || text(8, 12) !== 'WAVE') throw new Error(`${id}: WAV音声を取得できませんでした`);
        return context.decodeAudioData(bytes);
      });
    const guarded = this.bounded(request, this.dependencies.loadTimeoutMs ?? 12000, `${id}: 音源の読み込みが完了しません。再試行できます。`, () => controller.abort()).catch(error => { if (this.buffers.get(id) === guarded) this.buffers.delete(id); throw error; });
    this.buffers.set(id, guarded);
    return guarded;
  }
  private ramp(gain: GainNode, target: number, seconds: number) {
    const time = this.context!.currentTime;
    gain.gain.cancelScheduledValues(time);
    gain.gain.setValueAtTime(gain.gain.value, time);
    gain.gain.linearRampToValueAtTime(target * AUDIO_HEADROOM, time + seconds);
  }
  private createVoice(buffer: AudioBuffer, loop: boolean): Voice {
    const source = this.context!.createBufferSource();
    const gain = this.context!.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain);
    gain.connect(this.context!.destination);
    const voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    return voice;
  }
  private release(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect(); voice.gain.disconnect();
    this.sounds.delete(voice);
    if (this.retiring === voice) this.retiring = null;
    if (this.current === voice) {
      this.current = null; this.state.activeCue = null;
      if (!this.disposed) this.notify();
    }
  }
  private start(voice: Voice) {
    try { voice.source.start(); }
    catch (error) { this.release(voice); throw error; }
  }
  private startMusic() {
    const cue = this.state.cue;
    if (!cue || !this.canPlay() || this.current) return;
    const revision = ++this.cueRevision;
    const epoch = this.epoch;
    this.state.loadingCue = cue;
    this.notify();
    void this.load(cue).then(buffer => {
      if (!this.canPlay() || epoch !== this.epoch || revision !== this.cueRevision || this.state.cue !== cue) return;
      this.state.loadingCue = null;
      const voice = this.createVoice(buffer, true);
      this.current = voice;
      voice.gain.gain.setValueAtTime(0, this.context!.currentTime);
      this.ramp(voice.gain, this.state.bgm, 0.3);
      this.start(voice);
      this.state.activeCue = cue;
      this.notify();
    }).catch(error => { if (epoch === this.epoch && revision === this.cueRevision) { this.state.loadingCue = null; this.fail(error); } });
  }
  playSE(id: SoundId) {
    if (!this.canPlay() || this.pendingSounds.has(id) || this.sounds.size >= 3) return;
    const now = (this.dependencies.now ?? (() => performance.now()))();
    if (now - (this.lastSound.get(id) ?? -Infinity) < 80) return;
    this.lastSound.set(id, now);
    const epoch = this.epoch;
    this.pendingSounds.set(id, epoch);
    void this.load(id).then(buffer => {
      if (!this.canPlay() || epoch !== this.epoch || this.sounds.size >= 3) return;
      const voice = this.createVoice(buffer, false);
      voice.gain.gain.setValueAtTime(this.state.se * AUDIO_HEADROOM, this.context!.currentTime);
      this.sounds.add(voice);
      this.start(voice);
    }).catch(error => { if (epoch === this.epoch) this.fail(error); })
      .finally(() => { if (this.pendingSounds.get(id) === epoch) this.pendingSounds.delete(id); });
  }
  private stopMusic(fade: boolean) {
    const voice = this.current;
    this.current = null;
    this.state.activeCue = null;
    if (voice) {
      if (this.retiring) { this.retiring.source.stop(); this.release(this.retiring); }
      if (fade) { this.retiring = voice; this.ramp(voice.gain, 0, 0.3); }
      voice.source.stop(this.context!.currentTime + (fade ? 0.3 : 0));
      if (!fade) this.release(voice);
    }
  }
  private invalidate() {
    this.epoch++; this.cueRevision++;
    this.state.loadingCue = null;
    this.stopMusic(false);
    for (const voice of this.voices) { voice.source.stop(); this.release(voice); }
    this.pendingSounds.clear();
    this.lastSound.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidate();
    for (const voice of this.voices) this.release(voice);
    this.pendingSounds.clear();
    this.lastSound.clear();
    this.buffers.clear();
    this.state.enabled = false;
    this.notify();
    if (this.context) this.context.onstatechange = null;
    if (this.context) void this.context.close().catch(() => { /* All sources already stopped; disposal is final. */ });
  }
}
