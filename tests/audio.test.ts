import { describe, expect, it, vi } from 'vitest';
import { AUDIO_HEADROOM, GameAudio } from '../src/audio';
import { AUDIO_CATALOG, MUSIC_IDS, SOUND_IDS } from '../src/audio-cues';

const waveHeader = () => new Uint8Array([82,73,70,70,0,0,0,0,87,65,86,69]).buffer;
const tick = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function backend() {
  let now = 100;
  const sources: { loop: boolean; buffer: unknown; onended: (() => void) | null; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const gains: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    state: 'running' as string, onstatechange: null as (() => void) | null, currentTime: 1, destination: {}, resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 1 }),
    createBufferSource: vi.fn(() => {
      const source = { loop: false, buffer: null as unknown, onended: null as (() => void) | null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      sources.push(source); return source;
    }),
    createGain: vi.fn(() => {
      const gain = { gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain); return gain;
    }),
  };
  const fetcher = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => waveHeader() });
  const createContext = vi.fn(() => context as unknown as AudioContext);
  const change = vi.fn();
  const audio = new GameAudio(change, { createContext, fetch: fetcher, now: () => now });
  return { audio, context, sources, gains, fetcher, createContext, change, advance: (ms: number) => { now += ms; } };
}

describe('memory-only gesture unlocked audio', () => {
  it('catalog fixes precisely three BGM and eight SE delivery URLs', () => {
    expect(MUSIC_IDS).toHaveLength(3); expect(SOUND_IDS).toHaveLength(8);
    for (const [id, path] of Object.entries(AUDIO_CATALOG)) expect(path).toBe(`/audio/v1/${id}.wav`);
  });
  it('does not construct context or fetch before enable, and resumes before requesting media', async () => {
    const b = backend(); b.audio.setCue('bgm-tactics'); b.audio.playSE('se-ui');
    expect(b.createContext).not.toHaveBeenCalled(); expect(b.fetcher).not.toHaveBeenCalled();
    const enabling = b.audio.enable();
    expect(b.context.resume).toHaveBeenCalledOnce(); expect(b.fetcher).not.toHaveBeenCalled();
    await enabling; await tick();
    expect(b.audio.status.enabled).toBe(true); expect(b.sources[0].loop).toBe(true);
    expect(b.audio.status.activeCue).toBe('bgm-tactics');
  });
  it('enable resolves without waiting for decode and concurrent enables share resume', async () => {
    const b = backend(); const pending = deferred<AudioBuffer>(); b.context.decodeAudioData.mockReturnValue(pending.promise);
    b.audio.setCue('bgm-tactics'); const first = b.audio.enable(); const second = b.audio.enable();
    expect(first).toBe(second); await first; await tick(); expect(b.sources).toHaveLength(0);
    pending.resolve({} as AudioBuffer); await tick(); expect(b.sources).toHaveLength(1);
  });
  it('same cue continues, changing cue fades the old source and starts only the latest delayed cue', async () => {
    const b = backend(); await b.audio.enable(); b.audio.setCue('bgm-briefing'); await tick();
    b.audio.setCue('bgm-briefing'); await tick(); expect(b.sources).toHaveLength(1);
    const pending = deferred<Response>(); b.fetcher.mockReturnValueOnce(pending.promise);
    b.audio.setCue('bgm-tactics'); b.audio.setCue('bgm-ending'); await tick();
    expect(b.sources[0].stop).toHaveBeenCalledWith(1.3);
    pending.resolve({ ok: true, arrayBuffer: async () => waveHeader() } as Response); await tick();
    expect(b.sources).toHaveLength(2); expect(b.audio.status.activeCue).toBe('bgm-ending');
  });
  it.each(['mute', 'hide', 'dispose'] as const)('rejects late BGM/SE after %s', async mode => {
    const b = backend(); await b.audio.enable();
    const pending = deferred<AudioBuffer>(); b.context.decodeAudioData.mockReturnValue(pending.promise);
    b.audio.setCue('bgm-tactics'); b.audio.playSE('se-ui'); await tick();
    if (mode === 'mute') b.audio.setMuted(true);
    else if (mode === 'hide') b.audio.setHidden(true);
    else b.audio.dispose();
    pending.resolve({} as AudioBuffer); await tick(); expect(b.sources).toHaveLength(0);
  });
  it('hidden stops music and SE immediately and returns to the requested cue only', async () => {
    const b = backend(); await b.audio.enable(); b.audio.setCue('bgm-tactics'); b.audio.playSE('se-ui'); await tick();
    expect(b.sources).toHaveLength(2); b.audio.setHidden(true);
    for (const source of b.sources) expect(source.stop).toHaveBeenCalled();
    b.audio.playSE('se-impact'); b.audio.setCue('bgm-ending'); await tick(); expect(b.sources).toHaveLength(2);
    b.audio.setHidden(false); await tick(); expect(b.sources).toHaveLength(3); expect(b.audio.status.activeCue).toBe('bgm-ending');
  });
  it('mute blocks new sound and unmute restarts music using cached audio', async () => {
    const b = backend(); await b.audio.enable(); b.audio.setCue('bgm-tactics'); await tick();
    b.audio.setMuted(true); b.audio.playSE('se-ui'); await tick(); expect(b.sources).toHaveLength(1);
    b.audio.setMuted(false); await tick(); expect(b.sources).toHaveLength(2); expect(b.fetcher).toHaveBeenCalledTimes(1);
  });
  it('suppresses the same ID while pending and for 80 ms, caps three active SE and frees ended voices', async () => {
    const b = backend(); await b.audio.enable(); b.audio.playSE('se-ui'); b.audio.playSE('se-ui'); await tick();
    expect(b.sources).toHaveLength(1); expect(b.fetcher).toHaveBeenCalledTimes(1);
    b.audio.playSE('se-ui'); await tick(); expect(b.sources).toHaveLength(1);
    b.advance(80); b.audio.playSE('se-ui'); b.audio.playSE('se-move'); b.audio.playSE('se-impact'); await tick();
    expect(b.sources).toHaveLength(3);
    b.sources[0].onended!(); expect(b.sources[0].disconnect).toHaveBeenCalledOnce(); expect(b.gains[0].disconnect).toHaveBeenCalledOnce();
    b.advance(80); b.audio.playSE('se-impact'); await tick(); expect(b.sources).toHaveLength(4);
  });
  it('reports failed fetch, evicts cache, and permits an explicit enable retry', async () => {
    const b = backend(); b.fetcher.mockResolvedValueOnce({ ok: false, status: 404 });
    b.audio.setCue('bgm-tactics'); await b.audio.enable(); await tick();
    expect(b.audio.status.error).toContain('404'); expect(b.sources).toHaveLength(0);
    await b.audio.enable(); await tick(); expect(b.fetcher).toHaveBeenCalledTimes(2); expect(b.sources).toHaveLength(1);
    expect(b.audio.status.error).toBeNull();
  });
  it('reports decode failure and resume rejection without throwing or losing gameplay', async () => {
    const b = backend(); b.context.resume.mockRejectedValueOnce(new Error('locked')); await b.audio.enable();
    expect(b.audio.status.enabled).toBe(false); expect(b.audio.status.error).toContain('locked');
    b.context.decodeAudioData.mockRejectedValueOnce(new Error('bad WAV')); await b.audio.enable(); b.audio.playSE('se-ui'); await tick();
    expect(b.audio.status.error).toContain('bad WAV'); expect(b.sources).toHaveLength(0);
  });
  it('contains a synchronous fetch failure, and retries the same SE after cooldown', async () => {
    const b = backend(); await b.audio.enable();
    b.fetcher.mockImplementationOnce(() => { throw new Error('fetch unavailable'); });
    expect(() => b.audio.playSE('se-ui')).not.toThrow(); await tick();
    expect(b.audio.status.error).toContain('fetch unavailable');
    b.advance(80); b.audio.playSE('se-ui'); await tick(); expect(b.sources).toHaveLength(1);
  });
  it('does not resurrect pre-hide requests after returning before decode completes', async () => {
    const b = backend(); await b.audio.enable();
    const pending = deferred<AudioBuffer>(); b.context.decodeAudioData.mockReturnValue(pending.promise);
    b.audio.setCue('bgm-tactics'); b.audio.playSE('se-ui'); await tick();
    b.audio.setHidden(true); b.audio.setHidden(false);
    pending.resolve({} as AudioBuffer); await tick();
    expect(b.sources).toHaveLength(1); expect(b.sources[0].loop).toBe(true);
  });
  it.each(['bgm-tactics', 'bgm-ending'] as const)('discards old delayed SE across beginScene(%s), allows new scene SE', async nextCue => {
    const b = backend(); await b.audio.enable(); b.audio.setCue('bgm-tactics'); await tick();
    const pending = deferred<AudioBuffer>(); b.context.decodeAudioData.mockReturnValueOnce(pending.promise);
    b.audio.playSE('se-impact'); await tick();
    b.audio.beginScene(nextCue); await tick();
    pending.resolve({} as AudioBuffer); await tick();
    expect(b.sources.filter(source => !source.loop)).toHaveLength(0);
    b.audio.playSE('se-impact'); await tick();
    expect(b.sources.filter(source => !source.loop)).toHaveLength(1);
    if (nextCue === 'bgm-tactics') {
      expect(b.sources.filter(source => source.loop)).toHaveLength(1);
      expect(b.sources[0].stop).not.toHaveBeenCalled();
    }
  });
  it('a new scene can request the same still-loading SE and gets exactly one new voice', async () => {
    const b = backend(); await b.audio.enable();
    const pending = deferred<AudioBuffer>(); b.context.decodeAudioData.mockReturnValueOnce(pending.promise);
    b.audio.playSE('se-victory'); await tick();
    b.audio.beginScene(null); b.audio.playSE('se-victory'); b.audio.playSE('se-victory');
    pending.resolve({} as AudioBuffer); await tick();
    expect(b.sources).toHaveLength(1); expect(b.fetcher).toHaveBeenCalledTimes(1);
    b.audio.playSE('se-victory'); await tick(); expect(b.sources).toHaveLength(1);
  });
  it('beginScene stops live SE, resets its cooldown and preserves a playing same-cue BGM', async () => {
    const b = backend(); await b.audio.enable(); b.audio.setCue('bgm-tactics'); b.audio.playSE('se-impact'); await tick();
    const oldSE = b.sources.find(source => !source.loop)!;
    b.audio.beginScene('bgm-tactics'); b.audio.playSE('se-victory'); await tick();
    expect(oldSE.stop).toHaveBeenCalled(); expect(oldSE.disconnect).toHaveBeenCalledOnce();
    expect(b.sources[0].stop).not.toHaveBeenCalled();
    expect(b.sources.filter(source => !source.loop && source.disconnect.mock.calls.length === 0)).toHaveLength(1);
    b.audio.beginScene('bgm-tactics'); b.audio.playSE('se-victory'); await tick();
    expect(b.sources.filter(source => !source.loop && source.disconnect.mock.calls.length === 0)).toHaveLength(1);
  });
  it('reattaches same-cue pending music to the new scene without duplicating sources', async () => {
    const b = backend(); await b.audio.enable();
    const pending = deferred<AudioBuffer>(); b.context.decodeAudioData.mockReturnValueOnce(pending.promise);
    b.audio.beginScene('bgm-tactics'); await tick(); b.audio.beginScene('bgm-tactics');
    pending.resolve({} as AudioBuffer); await tick();
    expect(b.sources).toHaveLength(1); expect(b.audio.status.activeCue).toBe('bgm-tactics');
  });
  it('rapid BGM changes keep at most two connected music voices with fixed mix headroom', async () => {
    const b = backend(); await b.audio.enable(); b.audio.setVolumes({ bgm: 1, se: 1 });
    for (const cue of ['bgm-tactics', 'bgm-briefing', 'bgm-ending', 'bgm-tactics', 'bgm-ending'] as const) {
      b.audio.beginScene(cue); await tick();
      expect(b.sources.filter(source => source.loop && source.disconnect.mock.calls.length === 0).length).toBeLessThanOrEqual(2);
    }
    b.audio.playSE('se-impact'); b.audio.playSE('se-victory'); b.audio.playSE('se-defeat'); b.audio.playSE('se-heal'); await tick();
    expect(b.sources.filter(source => !source.loop)).toHaveLength(3);
    expect(b.gains.at(-1)!.gain.setValueAtTime).toHaveBeenCalledWith(AUDIO_HEADROOM, 1);
    const musicIndex = b.sources.map((source, index) => source.loop ? index : -1).filter(index => index >= 0).at(-1)!;
    expect(b.gains[musicIndex].gain.linearRampToValueAtTime).toHaveBeenCalledWith(AUDIO_HEADROOM, 1.3);
    expect((2 * 0.32 + 3 * 0.5) * AUDIO_HEADROOM).toBeLessThan(0.75);
    expect(b.audio.status.bgm).toBe(1); expect(b.audio.status.se).toBe(1);
  });
  it('clamps categories, ignores nonfinite volumes, copies snapshot and disconnects/closes on disposal', async () => {
    const b = backend(); b.audio.setVolumes({ bgm: 2, se: -1 }); expect(b.audio.status.bgm).toBe(1); expect(b.audio.status.se).toBe(0);
    b.audio.setVolumes({ bgm: NaN }); expect(b.audio.status.bgm).toBe(1);
    const copy = b.audio.status; copy.enabled = true; expect(b.audio.status.enabled).toBe(false);
    await b.audio.enable(); b.audio.setCue('bgm-tactics'); b.audio.playSE('se-ui'); await tick();
    b.audio.setVolumes({ bgm: 0.25, se: 0.75 }); expect(b.gains[0].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.25 * AUDIO_HEADROOM, 1.03);
    b.audio.dispose(); b.audio.dispose(); expect(b.context.close).toHaveBeenCalledOnce();
    for (const source of b.sources) { expect(source.stop).toHaveBeenCalled(); expect(source.onended).toBeNull(); expect(source.disconnect).toHaveBeenCalledOnce(); }
    await b.audio.enable(); b.audio.playSE('se-ui'); expect(b.sources).toHaveLength(2);
  });
  it('does not claim ON when resume resolves but the real context stays suspended, and allows gesture retry', async () => {
    const b = backend(); b.context.state = 'suspended'; b.audio.setCue('bgm-briefing');
    await b.audio.enable(); await tick();
    expect(b.audio.status.enabled).toBe(false); expect(b.audio.status.contextState).toBe('suspended');
    expect(b.audio.status.error).toContain('suspended'); expect(b.fetcher).not.toHaveBeenCalled();
    b.context.resume.mockImplementationOnce(() => { b.context.state = 'running'; return Promise.resolve(); });
    await b.audio.enable(); await tick();
    expect(b.audio.status.enabled).toBe(true); expect(b.audio.status.activeCue).toBe('bgm-briefing');
  });
  it('observes interruption, stops old voices, blocks SE and resumes the selected BGM on a new user action', async () => {
    const b = backend(); b.audio.setCue('bgm-tactics'); await b.audio.enable(); await tick();
    b.context.state = 'interrupted'; b.context.onstatechange!();
    expect(b.audio.status.contextState).toBe('interrupted'); expect(b.audio.status.activeCue).toBeNull();
    expect(b.sources[0].stop).toHaveBeenCalled(); b.audio.playSE('se-impact'); await tick(); expect(b.sources).toHaveLength(1);
    b.context.resume.mockImplementationOnce(() => { b.context.state = 'running'; b.context.onstatechange!(); return Promise.resolve(); });
    await b.audio.enable(); await tick(); expect(b.sources).toHaveLength(2); expect(b.audio.status.activeCue).toBe('bgm-tactics');
    b.audio.dispose(); expect(b.context.onstatechange).toBeNull();
  });
  it('times out a never-resolving resume, permits retry and ignores the old late resolution', async () => {
    vi.useFakeTimers();
    try {
      const b = backend(); const pending = deferred<void>(); b.context.state = 'suspended'; b.context.resume.mockReturnValueOnce(pending.promise);
      b.audio.setCue('bgm-briefing'); const first = b.audio.enable();
      await vi.advanceTimersByTimeAsync(5001); await first;
      expect(b.audio.status.enabled).toBe(false); expect(b.audio.status.error).toContain('音の開始を待っています');
      b.context.state = 'running'; await b.audio.enable(); await tick();
      expect(b.audio.status.activeCue).toBe('bgm-briefing');
      pending.resolve(); await tick(); expect(b.sources).toHaveLength(1); b.audio.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('times out a stalled media request, clears loading state, aborts fetch and retries without late playback', async () => {
    vi.useFakeTimers();
    try {
      const b = backend(); const pending = deferred<Response>(); b.fetcher.mockReturnValueOnce(pending.promise);
      b.audio.setCue('bgm-tactics'); await b.audio.enable(); await tick();
      expect(b.audio.status.loadingCue).toBe('bgm-tactics');
      await vi.advanceTimersByTimeAsync(12001);
      expect(b.audio.status.loadingCue).toBeNull(); expect(b.audio.status.error).toContain('読み込みが完了しません');
      expect(b.fetcher.mock.calls[0][1].signal.aborted).toBe(true);
      await b.audio.enable(); await tick(); expect(b.sources).toHaveLength(1);
      pending.resolve({ ok: true, arrayBuffer: async () => waveHeader() } as Response); await tick();
      expect(b.sources).toHaveLength(1); b.audio.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('rejects a 200 HTML fallback before decode instead of reporting a loaded WAV', async () => {
    const b = backend(); b.fetcher.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new TextEncoder().encode('<html>fallback</html>').buffer });
    b.audio.setCue('bgm-briefing'); await b.audio.enable(); await tick();
    expect(b.audio.status.error).toContain('WAV'); expect(b.audio.status.activeCue).toBeNull();
    expect(b.context.decodeAudioData).not.toHaveBeenCalled(); expect(b.audio.status.loadingCue).toBeNull();
  });
  it('recreates a closed context on an explicit action and exposes current runtime/time for a stale-page check', async () => {
    const b = backend(); await b.audio.enable(); b.context.state = 'closed'; b.context.onstatechange!();
    const fresh = backend(); b.createContext.mockReturnValueOnce(fresh.context as unknown as AudioContext);
    b.audio.setCue('bgm-tactics'); await b.audio.enable(); await tick();
    expect(b.createContext).toHaveBeenCalledTimes(2); expect(b.audio.status.contextState).toBe('running');
    expect(b.audio.status.version).toBe('audio-v1-r2'); fresh.context.currentTime = 8.5;
    expect(b.audio.status.contextTime).toBe(8.5); expect(fresh.sources).toHaveLength(1); b.audio.dispose();
  });

});
