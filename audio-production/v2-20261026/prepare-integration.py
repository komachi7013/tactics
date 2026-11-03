from pathlib import Path
import difflib,json,hashlib
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[1]; OUT=HERE/'integration'
BASE=HERE/'integration-baseline'
FILES={}
def put(rel,text):
 p=OUT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);FILES[rel]=text
 if (ROOT/rel).exists():
  p=BASE/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/rel).read_bytes())
def change(text,old,new,count=1):
 assert text.count(old)==count,(old,text.count(old),count)
 return text.replace(old,new)
ids=['bgm-'+s for s in ['title','prologue','briefing']+[f'b{i:02}' for i in range(1,13)]+['ending']]
ses=['se-'+s for s in ['ui','cancel','invalid','sword','arrow','impact','miss','guard','skill','heal','chest','record','mechanism','exit','cart','turn','down','victory','defeat']]
put('src/audio-cues.ts',"import type { BattleId } from './domain/types';\n/** v2 original orchestral cues. SoundFont itself is not distributed. */\nexport const MUSIC_IDS = "+repr(ids)+" as const;\nexport const SOUND_IDS = "+repr(ses)+" as const;\nexport type MusicId = typeof MUSIC_IDS[number];\nexport type SoundId = typeof SOUND_IDS[number];\nexport type AudioCueId = MusicId | SoundId;\nexport const AUDIO_CATALOG = Object.fromEntries([...MUSIC_IDS, ...SOUND_IDS].map(id => [id, `/audio/v2/${id}.wav`])) as Record<AudioCueId, string>;\nexport const battleMusic = (id: BattleId): MusicId => `bgm-${id.toLowerCase()}` as MusicId;\nexport interface SoundEvent { id: SoundId; delayMs: number }\n")
put('src/audio-events.ts',"""import type { BattleState, Command } from './domain/types';
import type { SoundEvent } from './audio-cues';
import { committedAttackResolution } from './view/presentation';

/** Committed state only: no idle stepping, speculative hits, or repeated outcomes. */
export function soundsForTransition(before: BattleState, after: BattleState, command?: Command): SoundEvent[] {
  const event = (id: SoundEvent['id'], delayMs = 0): SoundEvent => ({ id, delayMs });
  if (before === after || before.phase !== 'playing') return [];
  if (after.phase === 'won' || after.phase === 'lost') return []; // result owns its one-shot cadence
  const result = committedAttackResolution(before, after, command?.type === 'attack' ? before.activeId ?? undefined : undefined, command?.type === 'attack' ? command.targetId : undefined);
  if (result) {
    const actor = before.units.find(u => u.id === result.actorId);
    const target = after.units.find(u => u.id === result.targetId);
    const bow = actor?.weapon === 'bow';
    const events = [event(bow ? 'se-arrow' : 'se-sword'), event(!result.hit ? 'se-miss' : target?.guard ? 'se-guard' : 'se-impact', bow ? 180 : 110)];
    // Nonlethal Vesk subdual also uses the restrained incapacity cue; no death implication.
    if (result.hit && target?.hp === 0) events.push(event('se-down', 340));
    return events;
  }
  if (command?.type === 'attack' && (before.combatRandom || after.combatRandom)) return [];
  if (!before.combatRandom && !after.combatRandom && after.units.some(u => u.hp < (before.units.find(old => old.id === u.id)?.hp ?? u.hp))) return [event('se-impact')];
  if (after.units.some(u => u.hp > (before.units.find(old => old.id === u.id)?.hp ?? u.hp))) return [event('se-heal')];
  if ((after.pendingEquipment ?? []).some(id => !before.pendingEquipment?.includes(id))) return [event('se-chest')];
  if (after.records.some(id => !before.records.includes(id))) return [event('se-record')];
  if (command && ['survey','protect','plank','readOrder'].includes(command.type)) return [event('se-skill')];
  if (command?.type === 'defend') return [event('se-guard')];
  if (command?.type === 'undoMove') return [event('se-cancel')];
  const mechanism = before.gate.drained !== after.gate.drained
    || Object.keys(after.sluices ?? {}).some(id => before.sluices?.[id]?.drained !== after.sluices?.[id]?.drained)
    || Object.keys(after.repairs ?? {}).some(id => before.repairs?.[id]?.completed !== after.repairs?.[id]?.completed);
  const cartBefore = before.units.find(u => u.id === 'escort-cart');
  const cartAfter = after.units.find(u => u.id === 'escort-cart');
  const cart = cartBefore && cartAfter && cartAfter.hp > 0 && (cartBefore.pos.x !== cartAfter.pos.x || cartBefore.pos.y !== cartAfter.pos.y);
  // Gate reservations acknowledge once; actual mechanical motion sounds only on application.
  if (command?.type === 'gate' || command?.type === 'repair') return [event('se-ui')];
  const events: SoundEvent[] = [];
  if (mechanism) events.push(event('se-mechanism'));
  if (cart) events.push(event('se-cart', mechanism ? 180 : 0));
  if (!events.length && (before.turn !== after.turn || before.round !== after.round)) events.push(event('se-turn'));
  if (!events.length && command?.type === 'start') events.push(event('se-ui'));
  return events; // ordinary movement and static/blocked/idle animation stay silent
}

export function resultSounds(battleId: BattleState['battleId'], won: boolean): SoundEvent[] {
  if (!won) return [{ id: 'se-defeat', delayMs: 0 }];
  return ['B01','B02','B03','B05','B06','B07','B09','B11'].includes(battleId)
    ? [{ id: 'se-exit', delayMs: 0 }, { id: 'se-victory', delayMs: 700 }]
    : [{ id: 'se-victory', delayMs: 0 }];
}
""")
a=(ROOT/'src/audio.ts').read_text()
a=change(a,"type SoundId }", "type SoundId, type SoundEvent }")
a=change(a,"import { AUDIO_CATALOG,","import { AUDIO_CATALOG, MUSIC_IDS,")
a=change(a,"      this.state.activeCue = cue;","      this.state.activeCue = cue;\n      // Sixteen long tracks: retain only the selected decoded BGM in the cache.\n      // Active/retiring source nodes retain their own buffers through the fade.\n      for (const id of this.buffers.keys()) if (id !== cue && MUSIC_IDS.includes(id as MusicId)) this.buffers.delete(id);")
a=change(a,"'audio-v1-r2'","'audio-v2-r1'")
a=change(a,'private start(voice: Voice) {\n    try { voice.source.start(); }','private start(voice: Voice, when?: number) {\n    try { if (when === undefined) voice.source.start(); else voice.source.start(when); }')
start=a.index('  playSE(id: SoundId) {');end=a.index('  private stopMusic',start)
a=a[:start]+"""  playSE(id: SoundId) { this.playSESequence([{ id, delayMs: 0 }]); }
  /** Decode together so release/hit never overtakes its attack; epoch cancels scheduled voices. */
  playSESequence(events: readonly SoundEvent[]) {
    if (!this.canPlay() || this.sounds.size >= 3) return;
    const now = (this.dependencies.now ?? (() => performance.now()))();
    const epoch = this.epoch;
    const selected = events.filter((event, index) => Number.isFinite(event.delayMs) && event.delayMs >= 0 && event.delayMs <= 2000
      && events.findIndex(e => e.id === event.id) === index
      && !this.pendingSounds.has(event.id) && now - (this.lastSound.get(event.id) ?? -Infinity) >= 80).slice(0, 3 - this.sounds.size);
    if (!selected.length) return;
    for (const { id } of selected) { this.pendingSounds.set(id, epoch); this.lastSound.set(id, now); }
    void Promise.all(selected.map(async event => ({ ...event, buffer: await this.load(event.id) }))).then(loaded => {
      if (!this.canPlay() || epoch !== this.epoch) return;
      const time = this.context!.currentTime;
      for (const event of loaded) {
        if (this.sounds.size >= 3) break;
        const voice = this.createVoice(event.buffer, false);
        voice.gain.gain.setValueAtTime(this.state.se * AUDIO_HEADROOM, time);
        this.sounds.add(voice);
        this.start(voice, time + event.delayMs / 1000);
      }
    }).catch(error => { if (epoch === this.epoch) this.fail(error); })
      .finally(() => { for (const { id } of selected) if (this.pendingSounds.get(id) === epoch) this.pendingSounds.delete(id); });
  }
"""+a[end:]
put('src/audio.ts',a)
m=(ROOT/'src/main.ts').read_text()
m=change(m,"import { soundForTransition } from './audio-events';", "import { soundsForTransition, resultSounds } from './audio-events';\nimport { battleMusic } from './audio-cues';")
m=change(m,"const effect = soundForTransition(previous, state, command);\n  if (effect && state.phase === 'playing') audio.playSE(effect);", "audio.playSESequence(soundsForTransition(previous, state, command));")
m=change(m,"const effect = soundForTransition(previous, state);\n  if (effect && state.phase === 'playing') audio.playSE(effect);", "audio.playSESequence(soundsForTransition(previous, state));")
m=change(m,"if (result.error) { say(result.error); return; }", "if (result.error) { audio.playSE('se-invalid'); say(result.error); return; }")
m=change(m,"clearBattleTimers(); screen = 'result';\n  audio.beginScene('bgm-briefing');", "clearBattleTimers(); screen = 'result';\n  audio.beginScene(null);")
m=change(m,"audio.playSE(won ? 'se-victory' : 'se-defeat');", "audio.playSESequence(resultSounds(state.battleId, won));")
m=change(m,"audio.beginScene('bgm-tactics');", "audio.beginScene(battleMusic(state.battleId));")
m=change(m,"function showOpeningContext(complete: () => void, replay = false) {", "function showOpeningContext(complete: () => void, replay = false) {\n  const returnCue = audio.status.cue;\n  audio.beginScene('bgm-prologue');")
m=change(m,"onComplete: () => { closeDialog(); complete(); } });", "onComplete: () => { closeDialog(); if (replay) audio.beginScene(returnCue); complete(); } });\n  mountSceneAudioControls('.prologue-panel');")
m=change(m,"screen = 'start'; dialogOpen = true;", "screen = 'start'; dialogOpen = true;\n  audio.beginScene('bgm-title');")
m=change(m,"    onNewGame: beginNewGame,", "    onNewGame: beginNewGame,") # assertion only
needle="""      intro(); guardDialogEntry($('overlay').querySelector<HTMLElement>('.story-shield')!);
    },
  });
}
function defeatSummary"""
m=change(m,needle,needle.replace("  });\n}","  });\n  mountSceneAudioControls('.start-copy');\n}"))
# Controls must remain keyboard accessible even when scene swallows Enter/Space.
m=change(m,"function audioControls(): HTMLDetailsElement {", "function mountSceneAudioControls(selector: string) {\n  const controls = audioControls();\n  controls.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); });\n  $('overlay').querySelector(selector)?.append(controls);\n  updateAudioControls(audio.status);\n}\nfunction audioControls(): HTMLDetailsElement {")
# UI feedback via existing button factory; committed command dialogs own their semantic effects.
m=change(m,"b.onclick = fn; return b;", "b.onclick = () => { if (!b.closest('.command-confirmation') || /キャンセル|閉じる/.test(label)) audio.playSE(/キャンセル|取消|閉じる/.test(label) ? 'se-cancel' : 'se-ui'); fn(); }; return b;")
put('src/main.ts',m)
# Adapt existing runtime regressions to new stable catalog and add group scheduling tests.
t=(ROOT/'tests/audio.test.ts').read_text().replace('bgm-tactics','bgm-b01').replace('se-move','se-cart')
t=t.replace('audio-v1-r2','audio-v2-r1')
t=t.replace('precisely three BGM and eight SE delivery URLs','sixteen BGM and nineteen SE delivery URLs').replace('MUSIC_IDS).toHaveLength(3)','MUSIC_IDS).toHaveLength(16)').replace('SOUND_IDS).toHaveLength(8)','SOUND_IDS).toHaveLength(19)').replace('/audio/v1/','/audio/v2/')
t+='''

describe('scheduled combat sequence', () => {
  it('schedules attacks then impact on the audio clock, respecting the three voice cap', async () => {
    const b = backend(); await b.audio.enable();
    b.audio.playSESequence([{id:'se-arrow',delayMs:0},{id:'se-impact',delayMs:180},{id:'se-down',delayMs:340},{id:'se-ui',delayMs:400}]);
    await tick(); expect(b.sources).toHaveLength(3);
    expect(b.sources[0].start).toHaveBeenCalledWith(1);
    expect(b.sources[1].start).toHaveBeenCalledWith(1.18);
    expect(b.sources[2].start).toHaveBeenCalledWith(1.34);
    b.audio.beginScene('bgm-b02'); for (const source of b.sources.slice(0,3)) expect(source.stop).toHaveBeenCalled();
  });
  it('rejects a delayed group after a scene boundary and rejects invalid delay', async () => {
    const b=backend(); await b.audio.enable(); const pending=deferred<AudioBuffer>(); b.context.decodeAudioData.mockReturnValue(pending.promise);
    b.audio.playSESequence([{id:'se-arrow',delayMs:0},{id:'se-impact',delayMs:180}]); await tick();
    b.audio.beginScene(null); pending.resolve({} as AudioBuffer); await tick(); expect(b.sources).toHaveLength(0);
    b.audio.playSESequence([{id:'se-ui',delayMs:NaN}]); await tick(); expect(b.sources).toHaveLength(0);
  });
});
'''
put('tests/audio.test.ts',t)
put('tests/audio-events.test.ts',"""import { describe,it,expect } from 'vitest';
import { soundsForTransition, resultSounds } from '../src/audio-events';
import { createInitialState, reduce } from '../src/domain/engine';
import { battleMusic, MUSIC_IDS } from '../src/audio-cues';
const ids=(...args: Parameters<typeof soundsForTransition>)=>soundsForTransition(...args).map(e=>e.id);
describe('committed v2 sound events',()=>{
 it('has distinct music for all twelve battles',()=>{for(let n=1;n<=12;n++)expect(MUSIC_IDS).toContain(battleMusic(`B${String(n).padStart(2,'0')}` as 'B01'));expect(new Set(MUSIC_IDS).size).toBe(16);});
 it('ordinary movement, unchanged states, and idle/blocked animation stay silent',()=>{const s=createInitialState('B03');expect(ids(s,s)).toEqual([]);const a=structuredClone(s);a.units[0].pos.x++;expect(ids(s,a,{type:'move',to:a.units[0].pos})).toEqual([]);expect(ids(s,structuredClone(s))).toEqual([]);});
 it('sounds cart only for real cart position change, never person escort or stationary cart',()=>{const s=createInitialState('B03'),a=structuredClone(s);a.units.find(u=>u.id==='escort-cart')!.pos.x++;expect(ids(s,a)).toEqual(['se-cart']);const p=createInitialState('B06'),q=structuredClone(p);q.units.find(u=>u.kind==='escort')!.pos.x++;expect(ids(p,q)).toEqual([]);});
 it('follows the actual manual pushCart reducer and stays silent on a rejected second push',()=>{let s=createInitialState('B03');s.units=s.units.filter(u=>u.team==='player');s.cells.forEach(c=>{c.height=0;c.blocked=false;});s.units.find(u=>u.id==='ally-lise')!.pos={x:1,y:5};s=reduce(s,{type:'start',unitId:'ally-lise'}).state;const r=reduce(s,{type:'pushCart'});expect(r.error).toBeUndefined();expect(ids(s,r.state,{type:'pushCart'})).toEqual(['se-cart']);const failed=reduce(r.state,{type:'pushCart'});expect(failed.error).toBeTruthy();expect(ids(r.state,failed.state,{type:'pushCart'})).toEqual([]);});
 it('distinguishes chest, record, skill, guard, cancellation and applied mechanisms',()=>{const s=createInitialState('B11');const a=structuredClone(s);a.pendingEquipment=['item'];expect(ids(s,a,{type:'loot',eventId:'item'})).toEqual(['se-chest']);a.pendingEquipment=[];a.records.push('W1');expect(ids(s,a)).toEqual(['se-record']);const b=structuredClone(s);b.repairs!.A.completed=true;expect(ids(s,b)).toEqual(['se-mechanism']);expect(ids(s,structuredClone(s),{type:'repair',siteId:'A'})).toEqual(['se-ui']);expect(ids(s,structuredClone(s),{type:'defend'})).toEqual(['se-guard']);expect(ids(s,structuredClone(s),{type:'undoMove'})).toEqual(['se-cancel']);expect(ids(s,structuredClone(s),{type:'survey',targetId:'e'})).toEqual(['se-skill']);});
 it('prioritizes outcome and leaves result jingles to the scene owner',()=>{const s=createInitialState('B01'),a=structuredClone(s);a.phase='won';a.records=['A','B'];expect(ids(s,a)).toEqual([]);expect(resultSounds('B01',true)).toEqual([{id:'se-exit',delayMs:0},{id:'se-victory',delayMs:700}]);expect(resultSounds('B12',true)).toEqual([{id:'se-victory',delayMs:0}]);expect(resultSounds('B12',false)).toEqual([{id:'se-defeat',delayMs:0}]);});
});
""")
# Keep combat-presentation assertions aligned with committed MISS and incapacity cues.
ct=(ROOT/'tests/combat-presentation.test.ts').read_text().replace('soundForTransition','soundsForTransition')
ct=ct.replace("expect(soundsForTransition(before,after,command)).toBeNull();", "expect(soundsForTransition(before,after,command).map(e=>e.id)).toEqual(['se-sword','se-miss']);")
ct=ct.replace("expect(soundsForTransition(after,later,command)).toBeNull();", "expect(soundsForTransition(after,later,command)).toEqual([]);")
ct=ct.replace("expect(soundsForTransition(after,later)).toBeNull();", "expect(soundsForTransition(after,later)).toEqual([]);")
ct=ct.replace("expect(soundsForTransition(before,after,command)).toBe('se-impact');", "expect(soundsForTransition(before,after,command).map(e=>e.id)).toContain('se-impact');")
ct=ct.replace("expect(soundsForTransition(before,won,command)).toBe('se-victory');", "expect(soundsForTransition(before,won,command)).toEqual([]);")
ct=ct.replace("expect(soundsForTransition(before,lost,command)).toBe('se-defeat');", "expect(soundsForTransition(before,lost,command)).toEqual([]);")
ct=ct.replace("expect(soundsForTransition(won,structuredClone(won),command)).toBeNull();", "expect(soundsForTransition(won,structuredClone(won),command)).toEqual([]);")
put('tests/combat-presentation.test.ts',ct)
patch=''
for rel,text in FILES.items():
 old=(BASE/rel).read_text() if (BASE/rel).exists() else ''
 patch+=''.join(difflib.unified_diff(old.splitlines(True),text.splitlines(True),fromfile='a/'+rel,tofile='b/'+rel))
(HERE/'integration.patch').write_text(patch)
(HERE/'integration-baseline-sha256.json').write_text(json.dumps({rel:hashlib.sha256((BASE/rel).read_bytes()).hexdigest() for rel in FILES if (BASE/rel).exists()},indent=2)+'\n')
print('Prepared unapplied patch',list(FILES))
