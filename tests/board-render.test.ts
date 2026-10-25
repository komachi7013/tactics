import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {},
  Geom: { Point: class { constructor(public x: number, public y: number) {} }, Polygon: Object.assign(class { constructor(_points: unknown) {} }, { Contains: () => true }) },
} }));
import {B01_MATERIALS} from '../src/view/b01Landscape';
import { BoardScene, type BoardRenderReport } from '../src/view/BoardScene';
import { createInitialState } from '../src/domain/engine';
import type { BattleId } from '../src/domain/types';

function harness(failure: 'canvas' | 'refresh' | 'draw' | null = null) {
  const reports: BoardRenderReport[] = [], images: string[] = [], labels: string[] = [];
  const scene = new BoardScene(() => {}, r => reports.push(r),'B02');
  const textures = new Set(['dry','shallow','stone'].flatMap(k => [0,1].map(n => `tile-${k}-${n}`)));
  for(const m of B01_MATERIALS)textures.add(m.key);
  textures.add('b12-adopted-landscape');textures.add('b11-adopted-landscape');textures.add('b11-adopted-landscape-worker');textures.add('b10-adopted-landscape');textures.add('b10-adopted-landscape-overlay-source-open-chain');textures.add('b09-adopted-landscape');textures.add('b08-adopted-landscape');textures.add('b08-adopted-landscape-water-source-shared');textures.add('b04-adopted-landscape');textures.add('b05-adopted-landscape');textures.add('b06-adopted-landscape');textures.add('b06-adopted-landscape-overlay-source-open-chain');textures.add('b04-adopted-landscape-water-source-channel');textures.add('b07-adopted-landscape');textures.add('b02-adopted-landscape');textures.add('b03-adopted-landscape');textures.add('b03-adopted-landscape-insert');
  const object = (): any => new Proxy({}, { get: (_t, key) => key === 'add' ? vi.fn(() => object()) : vi.fn(() => object()) });
  const add = {
    container: vi.fn(object), graphics: vi.fn(object), zone: vi.fn(object),
    image: vi.fn((_x: number, _y: number, key: string) => { images.push(key); return object(); }),
    text: vi.fn((_x: number, _y: number, value: string) => { if (failure === 'draw') throw new Error('text failed'); labels.push(value); return object(); }),
  };
  let active = false;
  Object.assign(scene, { add,
    sys: { isActive: () => active }, scale: { width: 1000, height: 650, on: vi.fn(), off: vi.fn() },
    textures: { getTextureKeys:()=>[...textures],exists: (key: string) => textures.has(key), get: () => ({ getSourceImage: () => ({}) }),
      remove: (key: string) => textures.delete(key),
      createCanvas: (key: string) => {
        if (failure === 'canvas'&&key.startsWith('tile-')) throw new Error('readback denied');
        textures.add(key); return { getContext: () => new Proxy({}, {get:()=>vi.fn()}),
          refresh: () => { if (failure === 'refresh'&&key.startsWith('tile-')) throw new Error('refresh failed'); } };
      } },
  });
  return { scene, reports, images, labels, textures, activate: () => { active = true; } };
}
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true })));
describe('Board Scene initialization failures', () => {
  it('renders every initial logical facing with its matching idle frame on all twelve scenes, without tracking on redraw',()=>{
    const h=harness();for(const asset of ['rise','garan','neia','sena','iva','toma','guard','archer'])h.textures.add('cast-'+asset);h.textures.add('escort-cart');h.activate();
    for(let n=1;n<=12;n++){
      const state=createInitialState(('B'+String(n).padStart(2,'0')) as BattleId);
      const display=()=>h.scene.display({state,selected:null,cursor:{x:0,y:0},reachable:[],mode:'inspect',enabled:true});
      display();
      for(const u of state.units){const body=(h.scene as any).actors.get(u.id)?.body;expect(body).toBeDefined();expect(body.frame).toBe(u.id==='escort-cart'?undefined:{N:0,E:1,S:2,W:3}[u.facing]);}
      state.units[0].facing='W';display();expect((h.scene as any).actors.get(state.units[0].id).body.frame).toBe(3);expect(state.units[0].facing).toBe('W');
    }
  });
  it('reports failed assets without requeuing the adopted landscape', () => {
    const h=harness();h.textures.delete('b02-adopted-landscape');const handlers=new Map<string,(file:{key:string})=>void>();
    const load={image:vi.fn(),spritesheet:vi.fn(),on:vi.fn((event:string,fn:(file:{key:string})=>void)=>handlers.set(event,fn))};
    Object.assign(h.scene,{load});h.scene.preload();const initialCalls=load.image.mock.calls.length;
    handlers.get('loaderror')!({key:'tile-dry-0'});handlers.get('loaderror')!({key:'b02-adopted-landscape'});
    expect(load.image.mock.calls).toHaveLength(initialCalls);expect(load.image.mock.calls.filter(c=>c[0]==='b02-adopted-landscape')).toHaveLength(1);
    expect(h.reports.at(-1)!.warnings).toContain('素材読込: b02-adopted-landscape');
  });

  it('preserves a failed restart preload until one explicit retry',async()=>{
    const h=harness(),lifecycle=new Map<string,()=>void>(),handlers=new Map<string,(...a:any[])=>void>();
    Object.assign(h.scene,{events:{off:()=>{},once:(e:string,f:()=>void)=>lifecycle.set(e,f)}});h.activate();const display=()=>h.scene.display({state:createInitialState('B02'),selected:null,cursor:{x:0,y:0},reachable:[],mode:'inspect',enabled:false});display();h.scene.create();expect(h.reports.at(-1)?.stage).toBe('drawn');lifecycle.get('shutdown')!();
    const load={maxRetries:3,image:vi.fn(),spritesheet:vi.fn(),on:(e:string,f:(...a:any[])=>void)=>handlers.set(e,f),off:(e:string,f:(...a:any[])=>void)=>{if(handlers.get(e)===f)handlers.delete(e)},once:(e:string,f:(...a:any[])=>void)=>handlers.set(e,f),start:vi.fn()};Object.assign(h.scene,{load});h.scene.preload();handlers.get('loaderror')!({key:'b02-adopted-landscape'});h.scene.create();display();await new Promise(r=>setTimeout(r,0));expect(h.reports.at(-1)?.stage).toBe('landscape-failed');expect(load.start).not.toHaveBeenCalled();expect(load.image.mock.calls.filter(c=>c[0]==='b02-adopted-landscape')).toHaveLength(1);
    h.scene.retryLandscape();await new Promise(r=>setTimeout(r,0));expect(load.start).toHaveBeenCalledTimes(1);expect(load.image.mock.calls.filter(c=>c[0]==='b02-adopted-landscape')).toHaveLength(2);h.textures.add('b02-adopted-landscape');handlers.get('complete')!();await new Promise(r=>setTimeout(r,0));expect(h.reports.at(-1)?.stage).toBe('drawn');
  });
  it.each(['canvas','refresh'] as const)('keeps all twelve fields drawable when optional %s terrain conversion fails', failure => {
    const h = harness(failure);
    for (const id of ['B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12'] as BattleId[]) {
      h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
      if (id === 'B01') expect(() => h.scene.create()).not.toThrow();
      h.activate(); h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
      expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', drawn: true, error: null });
      if(id==='B02'||id==='B03'||id==='B04'||id==='B05'||id==='B06'||id==='B07'||id==='B08'||id==='B09'||id==='B10'||id==='B11'||id==='B12')expect(h.images).toContain(id.toLowerCase()+'-adopted-landscape');else if(id==='B01')expect(h.images).toContain('b01-scene-base');else expect(h.labels.some(v => v.startsWith(id+'  /'))).toBe(true);
    }
    expect(h.reports.at(-1)!.warnings).toHaveLength(6);
    expect(h.images).toContain('b12-adopted-landscape');
  });
  it('draws the view supplied before asynchronous Scene creation without requiring a click', () => {
    const h = harness();
    h.scene.display({ state: createInitialState('B06'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.labels).toHaveLength(0); h.scene.create();
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', drawn: true });
    expect(h.images).toContain('b06-adopted-landscape');
  });
  it('reports a drawing exception instead of leaving a silent blank field', () => {
    const h = harness('draw');
    h.scene.display({ state: createInitialState('B06'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(() => h.scene.create()).not.toThrow();
    expect(h.reports.at(-1)).toMatchObject({ stage: 'draw-failed', drawn: false, error: 'text failed' });
  });
});

describe('B07 evacuation markers', () => {
  it('draws residents at both gathering points without wall labels and removes only the evacuated group', () => {
    const h = harness(); h.textures.add('evacuees'); h.activate();
    const state = createInitialState('B07');
    const display = () => h.scene.display({ state, selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    display();
    expect(h.images.filter(v => v === 'evacuees')).toHaveLength(2);
    expect(h.labels).toContain('V1 住民集合点'); expect(h.labels).toContain('V2 住民集合点');
    expect(h.labels).not.toContain('壁'); expect(h.labels).toContain('⇢ 東出口（リセ）');
    h.images.length = 0; h.labels.length = 0;
    state.records.push('V1'); state.cells.find(c => c.x === 2 && c.y === 2)!.blocked = false;
    display();
    expect(h.images.filter(v => v === 'evacuees')).toHaveLength(1);
    expect(h.labels).toContain('V1 案内済み'); expect(h.labels).toContain('V2 住民集合点');
    expect(h.labels).not.toContain('V1 住民集合点');
  });
  it('keeps both evacuation targets visible when the optional residents texture is unavailable', () => {
    const h = harness(); h.activate();
    h.scene.display({ state: createInitialState('B07'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', drawn: true, error: null });
    expect(h.labels).toContain('V1 住民集合点'); expect(h.labels).toContain('V2 住民集合点');
    expect(h.images).not.toContain('evacuees');
  });
});


describe('B08 independent sluice markers', () => {
  it('uses the two painted capstans with P and C, without duplicate gate props or an escape marker', () => {
    const h = harness(); h.textures.add('gate'); h.activate();
    h.scene.display({ state: createInitialState('B08'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.images.filter(key => key === 'gate')).toHaveLength(0);
    expect(h.labels).toContain('N 操作盤\n浅瀬'); expect(h.labels).toContain('S 操作盤\n浅瀬');
    expect(h.labels).toContain('▣ P'); expect(h.labels).toContain('制圧 C 0/2');
    expect(h.labels).not.toContain('壁'); expect(h.labels.some(label => label.includes('脱出'))).toBe(false);
  });
  it('highlights only the chosen four cells and keeps the other pending region independently visible', () => {
    const h = harness(); h.activate(); const state = createInitialState('B08');
    const display = (mode: string) => h.scene.display({ state, selected: null, cursor: {x:0,y:5}, reachable: [], mode, enabled: true });
    display('gate:N');
    expect(h.labels.filter(label => label === 'N R2 排水')).toHaveLength(4);
    expect(h.labels.filter(label => label === 'S R2 排水')).toHaveLength(0);
    h.labels.length = 0; state.sluices!.N.pendingRound = 2; state.sluices!.N.pendingDrained = true;
    state.sluices!.S.drained = true; display('gate:S');
    expect(h.labels.filter(label => label === 'N R2 排水')).toHaveLength(4);
    expect(h.labels.filter(label => label === 'S R2 入水')).toHaveLength(4);
    expect(h.labels).toContain('N 操作盤\n浅瀬 / R2排水');
    expect(h.labels).toContain('S 操作盤\n排水済み');
    expect(h.labels).not.toContain('⚙ 水門');
  });
  it('keeps N/S readable without the optional original gate texture and preserves legacy gate markers', () => {
    const h = harness(); h.activate();
    h.scene.display({ state: createInitialState('B08'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.labels).toContain('N 操作盤\n浅瀬'); expect(h.labels).toContain('S 操作盤\n浅瀬');
    for (const id of ['B01','B04','B06'] as BattleId[]) {
      h.labels.length = 0; h.images.length = 0; h.textures.add('gate');
      h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'gate', enabled: true });
      expect(h.images.filter(key => key === 'gate')).toHaveLength(id==='B06'?0:1);
      expect(h.labels.some(label => label.startsWith('⚙'))).toBe(true);
      expect(h.labels.some(label => label.includes('N 操作盤') || label.includes('S 操作盤'))).toBe(false);
    }
  });
});


describe('B09 delegation escort markers', () => {
  it('uses the existing Toma icon with a shared-party label, next route cell and own exit', () => {
    const h = harness(); h.textures.add('cast-toma'); h.activate();
    const state = createInitialState('B09');
    h.scene.display({ state, selected: 'escort-delegation', cursor: {x:2,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', drawn: true, error: null });
    expect(h.images.filter(key => key === 'cast-toma')).toHaveLength(1);
    expect(h.images).not.toContain('escort-cart'); expect(h.images).not.toContain('gate');
    expect(h.labels).toContain('代表・証人一行 [一行・共有HP]');
    expect(h.labels.filter(label => label === '次の護送先')).toHaveLength(1);
    expect(h.labels).toContain('⇢ 退出口（一行）');
    expect(h.labels.some(label => label.includes('壁') || label.includes('制圧') || label.includes('操作盤') || label.includes('▣'))).toBe(false);
    h.labels.length = 0; state.escort!.index = 18; state.units.find(u => u.id === 'escort-delegation')!.pos = {x:20,y:3};
    h.scene.display({ state, selected: null, cursor: {x:9,y:4}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.labels).not.toContain('次の護送先'); expect(h.labels).toContain('⇢ 退出口（一行）');
  });
  it('keeps the party identifiable without its optional icon and preserves B03/B06 art and labels', () => {
    const h = harness(); h.activate();
    const display = (id: BattleId) => h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    display('B09'); expect(h.labels).toContain('代表・証人一行 [一行・共有HP]');
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    h.labels.length = 0; h.images.length = 0; h.textures.add('escort-cart'); display('B03');
    expect(h.images.filter(key => key === 'escort-cart')).toHaveLength(1);
    expect(h.labels).toContain('負傷者の荷車 [護送]'); expect(h.labels).toContain('⇢ 搬出');
    h.labels.length = 0; h.images.length = 0; h.textures.add('cast-toma'); display('B06');
    expect(h.images.filter(key => key === 'cast-toma')).toHaveLength(1);
    expect(h.images).not.toContain('escort-cart'); expect(h.labels).toContain('トマ [護送]');
    expect(h.labels).toContain('⇢ 保護地点'); expect(h.labels.some(label => label.includes('一行・共有HP'))).toBe(false);
  });
});


describe('B10 port signal and checkpoint markers', () => {
  it('uses the painted signal without duplicate gate prop, checkpoint holding and no escape or water markers', () => {
    const h = harness(); h.textures.add('gate'); h.activate();
    h.scene.display({ state: createInitialState('B10'), selected: null, cursor: {x:2,y:4}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.images.filter(key => key === 'gate')).toHaveLength(0);
    expect(h.labels).toContain('⚙ 港門 未開通');
    expect(h.labels).toContain('検問 C 0/2');
    expect(h.labels.some(label => /脱出|護送|水門|排水|入水|制圧 C|壁|深水/.test(label))).toBe(false);
  });
  it('keeps next-round opening, pending signal and completed holding distinguishable without a gate texture', () => {
    const h = harness(); h.activate(); const state = createInitialState('B10');
    const display = (mode: string) => h.scene.display({ state, selected: null, cursor: {x:2,y:4}, reachable: [], mode, enabled: true });
    display('gate'); expect(h.labels).toContain('R2 港門開通');
    expect(h.labels.some(label => /R2 乾|R2 入水/.test(label))).toBe(false);
    h.labels.length = 0; state.gate.pendingRound = 2; display('inspect');
    expect(h.labels).toContain('⚙ R2港門開通'); expect(h.labels).toContain('R2 港門開通');
    h.labels.length = 0; state.gate.pendingRound = null; state.gate.drained = true; state.capture!.heldRounds = 2;
    display('inspect'); expect(h.labels).toContain('⚙ 港門 開通'); expect(h.labels).toContain('検問 C 2/2');
    expect(h.labels.some(label => /R2 港門開通|水門|排水|入水/.test(label))).toBe(false);
  });
  it('preserves the B04 capture and B06 chain-escort labels while adding the port labels', () => {
    const h = harness(); h.activate();
    const display = (id: BattleId) => h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'gate', enabled: true });
    display('B04'); expect(h.labels).toContain('制圧 C 0/2'); expect(h.labels).toContain('⚙ 乾地');
    expect(h.labels.some(label => /港門|検問|信号盤/.test(label))).toBe(false);
    h.labels.length = 0; display('B06'); expect(h.labels).toContain('⚙ 鎖門 未開通'); expect(h.labels).toContain('⇢ 保護地点');
    expect(h.labels.some(label => /港門|検問|信号盤/.test(label))).toBe(false);
  });
});


describe('B11 workers and independent repair valves', () => {
  it('shows two workers and two existing valve icons with a west retreat instead of water or holding objectives', () => {
    const h = harness(); h.textures.add('evacuees'); h.textures.add('gate'); h.activate();
    h.scene.display({ state: createInitialState('B11'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.images.filter(key => key === 'b11-adopted-landscape-worker')).toHaveLength(2);
    expect(h.images.filter(key => key === 'gate')).toHaveLength(0);
    expect(h.labels).toContain('W1 北保守員'); expect(h.labels).toContain('W2 南保守員');
    expect(h.labels).toContain('A 北補助弁\n未復旧 / 要W1'); expect(h.labels).toContain('B 南補助弁\n未復旧 / 要W2');
    expect(h.labels).toContain('⇠ 西退去口（リセ）');
    expect(h.labels.some(label => /港門|制圧|検問|東出口|住民|護送|▣|⚙ 水門/.test(label))).toBe(false);
  });
  it('removes only the rescued worker image and keeps each valve pending or completed independently', () => {
    const h = harness(); h.textures.add('evacuees'); h.textures.add('gate'); h.activate(); const state = createInitialState('B11');
    state.records.push('W1'); state.cells.find(c => c.x === 4 && c.y === 6)!.blocked = false;
    state.repairs!.A.pendingRound = 2;
    const display = (mode: string) => h.scene.display({ state, selected: null, cursor: {x:0,y:5}, reachable: [], mode, enabled: true });
    display('repair:B');
    expect(h.images.filter(key => key === 'b11-adopted-landscape-worker')).toHaveLength(1);
    expect(h.labels).toContain('W1 救出済み'); expect(h.labels).toContain('W2 南保守員');
    expect(h.labels).toContain('A R2復旧'); expect(h.labels).toContain('B R2復旧');
    expect(h.labels).toContain('A 北補助弁\nR2復旧予約 / 要W1'); expect(h.labels).toContain('B 南補助弁\n未復旧 / 要W2');
    h.labels.length = 0; state.repairs!.A.pendingRound = null; state.repairs!.A.completed = true;
    display('inspect'); expect(h.labels).toContain('A 北補助弁\n復旧済み / 要W1');
    expect(h.labels).toContain('B 南補助弁\n未復旧 / 要W2'); expect(h.labels).not.toContain('A R2復旧');
  });
  it('retains workers and repair identities without optional textures and keeps B07 resident labels unchanged', () => {
    const h = harness(); h.activate();
    const display = (id: BattleId) => h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    display('B11'); expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.labels).toContain('W1 北保守員'); expect(h.labels).toContain('A 北補助弁\n未復旧 / 要W1');
    h.labels.length = 0; display('B07');
    expect(h.labels).toContain('V1 住民集合点'); expect(h.labels).toContain('⇢ 東出口（リセ）');
    expect(h.labels.some(label => /保守員|補助弁|復旧|西退去口/.test(label))).toBe(false);
  });
});

describe('B12 final control and living preservation markers', () => {
  it('shows two passable control points and commander identity without a false exit or equipment', () => {
    const h = harness(); h.activate();
    h.scene.display({ state: createInitialState('B12'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', drawn: true, error: null });
    expect(h.labels).toContain('A 操作点 (5,9)\n空き / 共有保持0/2R');
    expect(h.labels).toContain('B 操作点 (15,7)\n空き / 共有保持0/2R');
    expect(h.labels).toContain('オルダ・ヴェスク [指揮官・非致死制圧対象]');
    expect(h.labels.some(label => /脱出|退去口|退出口|住民集合点/.test(label))).toBe(false);
    expect(h.images).not.toContain('gate'); expect(h.images).not.toContain('evacuees');
  });
  it('keeps the subdued commander as a text preservation marker when a living ally occupies his released cell', () => {
    const h = harness(); h.activate();
    const state = createInitialState('B12'), commander = state.units.find(unit => unit.id === 'enemy-vesk')!;
    commander.hp = 0; state.finalControl!.commanderSubdued = true; state.finalControl!.heldRounds = 1;
    state.units.find(unit => unit.id === 'ally-lise')!.pos = { ...commander.pos };
    state.units.find(unit => unit.id === 'ally-neia')!.pos = {x:5,y:9};
    state.units.find(unit => unit.id === 'ally-garan')!.pos = {x:15,y:7};
    h.scene.display({ state, selected: 'ally-lise', cursor: {...commander.pos}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.labels).toContain('A 操作点 (5,9)\nネイア 占有中 / 共有保持1/2R');
    expect(h.labels).toContain('B 操作点 (15,7)\nガラン 占有中 / 共有保持1/2R');
    expect(h.labels).toContain('ヴェスク 制圧済み・保全対象\n非致死 / セル占有なし / 戦後首府警備隊が拘束');
    expect(h.labels).toContain('リセ');
    expect(h.labels).not.toContain('オルダ・ヴェスク [指揮官・非致死制圧対象]');
    expect(h.labels.some(label => /ヴェスク.*(死亡|逃亡|退避)/.test(label))).toBe(false);
  });
  it('hides B12 markers after switching to an older battle', () => {
    const h = harness(); h.activate();
    h.scene.display({ state: createInitialState('B12'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    h.labels.length = 0;
    h.scene.display({ state: createInitialState('B09'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.labels.some(label => label.includes('操作点') || label.includes('保全対象'))).toBe(false);
    expect(h.labels).toContain('⇢ 退出口（一行）');
  });
});
