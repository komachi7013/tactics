import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {},
  Geom: { Point: class { constructor(public x: number, public y: number) {} }, Polygon: Object.assign(class { constructor(_points: unknown) {} }, { Contains: () => true }) },
} }));
// Synthetic alpha-mask port: real bitmap contour/registration acceptance is a separate QA step.
const paintedMasks = vi.hoisted(() => [
  { battleId: 'B06', objectId: 'gate', name: 'b06-gate', bounds: [330, 125, 385, 190] },
  { battleId: 'B08', objectId: 'sluice:N', name: 'b08-n', bounds: [490, 190, 540, 240] },
  { battleId: 'B08', objectId: 'sluice:S', name: 'b08-s', bounds: [425, 370, 475, 420] },
  { battleId: 'B10', objectId: 'gate', name: 'b10-gate', bounds: [280, 520, 410, 600] },
  { battleId: 'B11', objectId: 'repair:A', name: 'b11-a', bounds: [860, 45, 940, 195] },
  { battleId: 'B11', objectId: 'repair:B', name: 'b11-b', bounds: [1370, 440, 1450, 590] },
  { battleId: 'B12', objectId: 'control:A', name: 'b12-a', bounds: [580, 180, 750, 275] },
  { battleId: 'B12', objectId: 'control:B', name: 'b12-b', bounds: [1180, 370, 1400, 505] },
].map(row => ({ ...row, key: 'painted-mask-' + row.name, path: '/assets/map-object-masks-v1/' + row.name + '.png' })));
vi.mock('../src/view/paintedObjectMasks', () => ({ PAINTED_OBJECT_MASKS: paintedMasks, PAINTED_MASK_ISSUES: [] }));
import {B01_MATERIALS} from '../src/view/b01Landscape';
import { BoardScene, type BoardRenderReport } from '../src/view/BoardScene';
import { MAP_OBJECT_ASSETS, mapObjectPlacements } from '../src/view/mapObjectAssets';
import { createInitialState } from '../src/domain/engine';
import { createPartyBattle } from '../src/party';
import { defaultParty } from '../src/progression';
import type { BattleId } from '../src/domain/types';
import { registeredLandscape } from '../src/view/registeredLandscape';
import { registeredProjection } from '../src/view/registeredProjection';

function harness(failure: 'canvas' | 'refresh' | 'draw' | null = null) {
  const reports: BoardRenderReport[] = [], images: string[] = [], labels: string[] = [];
  const paint: { kind: 'fill' | 'stroke'; style: number[]; points: { x: number; y: number }[]; depth: number }[] = [];
  const textStyles: { value: string; style: Record<string, any> }[] = [];
  const imageRecords: { key: string; x: number; y: number; alpha: number; depth: number; width: number; height: number; originX: number; originY: number }[] = [];
  let maskFailure: 'dimensions' | 'read' | null = null;
  const scene = new BoardScene(() => {}, r => reports.push(r),'B02');
  const textures = new Set(['dry','shallow','stone'].flatMap(k => [0,1].map(n => `tile-${k}-${n}`)));
  for(const m of B01_MATERIALS)textures.add(m.key);
  for (const [kind, asset] of Object.entries(MAP_OBJECT_ASSETS)) if (kind !== 'valve') textures.add(asset.key);
  textures.add('b12-adopted-landscape');textures.add('b11-adopted-landscape');textures.add('b11-adopted-landscape-worker');textures.add('b10-adopted-landscape');textures.add('b10-adopted-landscape-overlay-source-open-chain');textures.add('b09-adopted-landscape');textures.add('b08-adopted-landscape');textures.add('b08-adopted-landscape-water-source-shared');textures.add('b04-adopted-landscape');textures.add('b05-adopted-landscape');textures.add('b06-adopted-landscape');textures.add('b06-adopted-landscape-overlay-source-open-chain');textures.add('b04-adopted-landscape-water-source-channel');textures.add('b07-adopted-landscape');textures.add('b02-adopted-landscape');textures.add('b03-adopted-landscape');textures.add('b03-adopted-landscape-insert');
  const object = (): any => new Proxy({}, { get: (_t, key) => key === 'add' ? vi.fn(() => object()) : vi.fn(() => object()) });
  const graphics = (): any => {
    let fill: number[] = [], stroke: number[] = [], depth = 0;
    const result: any = new Proxy({}, { get: (_t, key) => (...args: any[]) => {
      if (key === 'fillStyle') fill = args;
      if (key === 'lineStyle') stroke = args;
      if (key === 'setDepth') depth = args[0];
      if (key === 'fillPoints' || key === 'strokePoints') paint.push({ kind: key === 'fillPoints' ? 'fill' : 'stroke',
        style: [...(key === 'fillPoints' ? fill : stroke)], points: args[0].map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })), depth });
      return result;
    } });
    return result;
  };
  const add = {
    container: vi.fn(object), graphics: vi.fn(graphics), zone: vi.fn(object),
    image: vi.fn((x: number, y: number, key: string) => {
      images.push(key); const record = { key, x, y, alpha: 1, depth: 0, width: 0, height: 0, originX: 0, originY: 0 }; imageRecords.push(record);
      const result: any = new Proxy({}, { get: (_t, method) => (...args: number[]) => {
        if (method === 'setAlpha') record.alpha = args[0];
        if (method === 'setDepth') record.depth = args[0];
        if (method === 'setOrigin') { record.originX = args[0]; record.originY = args[1]; }
        if (method === 'setDisplaySize') { record.width = args[0]; record.height = args[1]; }
        return result;
      } }); return result;
    }),
    text: vi.fn((_x: number, _y: number, value: string, style: Record<string, any>) => { if (failure === 'draw') throw new Error('text failed'); labels.push(value); textStyles.push({ value, style }); return object(); }),
  };
  let active = false;
  Object.assign(scene, { add,
    sys: { isActive: () => active }, scale: { width: 1000, height: 650, on: vi.fn(), off: vi.fn() },
    textures: { getTextureKeys:()=>[...textures],exists: (key: string) => textures.has(key), get: (key: string) => ({ getSourceImage: () => {
      const mask = paintedMasks.find(row => row.key === key);
      return mask ? { width: mask.bounds[2] - mask.bounds[0] + (maskFailure === 'dimensions' ? 1 : 0), height: mask.bounds[3] - mask.bounds[1] }
        : Object.values(MAP_OBJECT_ASSETS).some(asset => asset.key === key) ? { width: 16, height: 16 } : {};
    } }),
      remove: (key: string) => textures.delete(key),
      createCanvas: (key: string) => {
        if (failure === 'canvas'&&key.startsWith('tile-')) throw new Error('readback denied');
        textures.add(key); return { getContext: () => new Proxy({
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            if (maskFailure === 'read' && key.includes('painted-mask-')) throw new Error('mask readback denied');
            return { data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => i % 4 === 3 ? 255 : 0) };
          },
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        }, {get:(target,key)=>key in target ? target[key as keyof typeof target] : vi.fn()}),
          refresh: () => { if (failure === 'refresh'&&key.startsWith('tile-')) throw new Error('refresh failed'); } };
      } },
  });
  return { scene, reports, images, labels, textures, paint, textStyles, imageRecords, activate: () => { active = true; }, failMask: (failure: typeof maskFailure) => { maskFailure = failure; } };
}
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true })));

describe('readable board selection and clicked-cell object names', () => {
  it.each(['B01', 'B03'] as const)('%s distinguishes legal move cells from the cursor without covering their floor', id => {
    const h = harness(); h.activate(); const state = createInitialState(id), before = structuredClone(state);
    const reachable = { ...state.units[0].pos }, cursor = { ...state.units[1].pos };
    const display = (mode: string) => h.scene.display({ state, selected: state.units[0].id, cursor, reachable: [reachable], mode, enabled: true });
    display('move');
    const move = h.paint.filter(row => row.kind === 'fill' && row.style[0] === 0x087f88);
    const selection = h.paint.filter(row => row.kind === 'fill' && row.style[0] === 0xffcd52);
    expect(move).toHaveLength(1); expect(selection).toHaveLength(1);
    expect(move[0].points).toHaveLength(4); expect(selection[0].points).not.toEqual(move[0].points);
    expect(move[0].style[1]).toBeGreaterThan(.25); expect(move[0].style[1]).toBeLessThan(.5);
    expect(selection[0].style[1]).toBeGreaterThan(0); expect(selection[0].style[1]).toBeLessThan(.25);
    for (const polygon of [move[0], selection[0]]) {
      const edges = h.paint.filter(row => row.kind === 'stroke' && JSON.stringify(row.points) === JSON.stringify(polygon.points));
      expect(edges.filter(row => row.style[0] >= 1.5 && row.style[2] >= .95).length).toBeGreaterThanOrEqual(2);
      expect(edges.every(row => row.depth === polygon.depth)).toBe(true);
    }
    h.paint.length = 0; display('inspect');
    expect(h.paint.some(row => row.kind === 'fill' && row.style[0] === 0x087f88)).toBe(false);
    expect(h.paint.filter(row => row.kind === 'fill' && row.style[0] === 0xffcd52)).toHaveLength(1);
    expect(state).toEqual(before); expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
  });
  it('removes all constant object names while preserving display data for the clicked-cell panel', () => {
    const h = harness(); h.activate();
    for (let n = 1; n <= 12; n++) {
      const id = ('B' + String(n).padStart(2, '0')) as BattleId;
      const state = createPartyBattle(id, defaultParty(id)), before = structuredClone(state);
      const objects = mapObjectPlacements(state); h.labels.length = 0;
      h.scene.display({ state, selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: true });
      for (const object of objects) {
        expect(h.labels, `${id} ${object.id}`).not.toContain(object.label);
        expect(object.label.length).toBeGreaterThan(1); expect(object.instruction.length).toBeGreaterThan(10);
      }
      expect(state).toEqual(before); expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    }
  });
  it('keeps a prop and its alpha outline at the same anchor and fades both under an occupant', () => {
    const h = harness(); h.activate(); const state = createPartyBattle('B03', defaultParty('B03'));
    const chest = state.equipmentChests![0]; state.units.find(unit => unit.id === 'ally-lise')!.pos = { ...chest.pos };
    h.scene.display({ state, selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: true });
    const original = h.imageRecords.find(row => row.key === MAP_OBJECT_ASSETS.equipment.key)!;
    const outline = h.imageRecords.find(row => row.key.startsWith('map-prop-outline-v2-' + original.key))!;
    expect(outline).toBeDefined(); expect(outline.x).toBe(original.x); expect(outline.y).toBe(original.y);
    expect(original.alpha).toBe(.32); expect(outline.alpha).toBe(original.alpha);
    expect(outline.depth).toBeLessThan(original.depth); expect(original.depth).toBeLessThan(original.y + .4);
    expect(outline.width).toBeGreaterThan(original.width); expect(outline.height).toBeGreaterThan(original.height);
    expect(h.labels).not.toContain('装備箱'); expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
  });
  it('never outlines a substitute gate silhouette over the eight painted equipment targets', () => {
    const h = harness(); h.textures.add('gate'); h.activate();
    for (const id of ['B06', 'B08', 'B10', 'B11', 'B12'] as const) {
      h.images.length = 0;
      h.scene.display({ state: createInitialState(id), selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: true });
      expect(h.images).not.toContain('gate'); expect(h.images.some(key => key.startsWith('map-prop-outline-v2-gate-'))).toBe(false);
    }
    h.images.length = 0;
    h.scene.display({ state: createInitialState('B01'), selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: true });
    expect(h.images).toContain('gate'); expect(h.images.some(key => key.startsWith('map-prop-outline-v2-gate-'))).toBe(true);
  });
});
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
    expect(load.image.mock.calls.filter(c=>c[0]==='gate')).toHaveLength(1);
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
    expect(h.labels).not.toContain('壁'); expect(h.labels).not.toContain('リセの東出口');
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
    expect(h.labels).not.toContain('北水路 N 操作盤\n浅瀬'); expect(h.labels).not.toContain('南水路 S 操作盤\n浅瀬');
    expect(h.labels).not.toContain('補助堰の保守記録 P'); expect(h.labels).not.toContain('操作所 C・保持0/2R');
    expect(h.images).toContain(MAP_OBJECT_ASSETS.document.key); expect(h.images).toContain(MAP_OBJECT_ASSETS.capture.key);
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
    expect(h.labels).not.toContain('北水路 N 操作盤\n浅瀬 / R2排水予約');
    expect(h.labels).not.toContain('南水路 S 操作盤\n排水済み');
    expect(h.labels).not.toContain('⚙ 水門');
    h.labels.length = 0; state.sluices!.S.pendingRound = 2; state.sluices!.S.pendingDrained = false; display('inspect');
    expect(h.labels).not.toContain('北水路 N 操作盤\n浅瀬 / R2排水予約');
    expect(h.labels).not.toContain('南水路 S 操作盤\n排水済み / R2再入水予約');
    expect(h.labels.filter(label => label === 'N R2 排水')).toHaveLength(4);
    expect(h.labels.filter(label => label === 'S R2 入水')).toHaveLength(4);
  });
  it('hides N/S nameplates without the optional gate texture and preserves independent gate props', () => {
    const h = harness(); h.activate();
    h.scene.display({ state: createInitialState('B08'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.labels).not.toContain('北水路 N 操作盤\n浅瀬'); expect(h.labels).not.toContain('南水路 S 操作盤\n浅瀬');
    for (const id of ['B01','B04','B06'] as BattleId[]) {
      h.labels.length = 0; h.images.length = 0; h.textures.add('gate');
      h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'gate', enabled: true });
      expect(h.images.filter(key => key === 'gate')).toHaveLength(id==='B06'?0:1);
      expect(h.labels.some(label => /^(水門操作弁|鎖門操作盤)\n/.test(label))).toBe(false);
      expect(h.labels.some(label => label.includes('北水路 N 操作盤') || label.includes('南水路 S 操作盤'))).toBe(false);
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
    expect(h.labels).not.toContain('代表・証人の退出口');
    expect(h.labels.some(label => label.includes('壁') || label.includes('制圧') || label.includes('操作盤') || label.includes('▣'))).toBe(false);
    h.labels.length = 0; state.escort!.index = 18; state.units.find(u => u.id === 'escort-delegation')!.pos = {x:20,y:3};
    h.scene.display({ state, selected: null, cursor: {x:9,y:4}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.labels).not.toContain('次の護送先'); expect(h.labels).not.toContain('代表・証人の退出口');
  });
  it('keeps the party identifiable without its optional icon and preserves B03/B06 art and labels', () => {
    const h = harness(); h.activate();
    const display = (id: BattleId) => h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    display('B09'); expect(h.labels).toContain('代表・証人一行 [一行・共有HP]');
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    h.labels.length = 0; h.images.length = 0; h.textures.add('escort-cart'); display('B03');
    expect(h.images.filter(key => key === 'escort-cart')).toHaveLength(1);
    expect(h.labels).toContain('負傷者の荷車 [護送]'); expect(h.labels).not.toContain('荷車の搬出口');
    h.labels.length = 0; h.images.length = 0; h.textures.add('cast-toma'); display('B06');
    expect(h.images.filter(key => key === 'cast-toma')).toHaveLength(1);
    expect(h.images).not.toContain('escort-cart'); expect(h.labels).toContain('トマ [護送]');
    expect(h.labels).not.toContain('トマの保護地点'); expect(h.labels.some(label => label.includes('一行・共有HP'))).toBe(false);
  });
});


describe('B10 port signal and checkpoint markers', () => {
  it('uses the painted signal without duplicate gate prop, checkpoint holding and no escape or water markers', () => {
    const h = harness(); h.textures.add('gate'); h.activate();
    h.scene.display({ state: createInitialState('B10'), selected: null, cursor: {x:2,y:4}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.images.filter(key => key === 'gate')).toHaveLength(0);
    expect(h.labels).not.toContain('外港鎖門の信号盤\n未開通');
    expect(h.labels).not.toContain('検問 C・保持0/2R');
    expect(h.labels.some(label => /脱出|護送|水門|排水|入水|制圧 C|壁|深水/.test(label))).toBe(false);
  });
  it('keeps next-round opening, pending signal and completed holding distinguishable without a gate texture', () => {
    const h = harness(); h.activate(); const state = createInitialState('B10');
    const display = (mode: string) => h.scene.display({ state, selected: null, cursor: {x:2,y:4}, reachable: [], mode, enabled: true });
    display('gate'); expect(h.labels).toContain('R2 港門開通');
    expect(h.labels.some(label => /R2 乾|R2 入水/.test(label))).toBe(false);
    h.labels.length = 0; state.gate.pendingRound = 2; display('inspect');
    expect(h.labels).not.toContain('外港鎖門の信号盤\nR2開通予約'); expect(h.labels).toContain('R2 港門開通');
    h.labels.length = 0; state.gate.pendingRound = null; state.gate.drained = true; state.capture!.heldRounds = 2;
    display('inspect'); expect(h.labels).not.toContain('外港鎖門の信号盤\n開通済み'); expect(h.labels).not.toContain('検問 C・保持2/2R');
    expect(h.labels.some(label => /R2 港門開通|水門|排水|入水/.test(label))).toBe(false);
  });
  it('removes permanent B04/B06 names without substituting port names', () => {
    const h = harness(); h.activate();
    const display = (id: BattleId) => h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'gate', enabled: true });
    display('B04'); expect(h.labels).not.toContain('制圧点 C・保持0/2R'); expect(h.labels).not.toContain('水門操作弁\n乾地');
    expect(h.labels.some(label => /港門|検問|信号盤/.test(label))).toBe(false);
    h.labels.length = 0; display('B06'); expect(h.labels).not.toContain('鎖門操作盤\n未開通'); expect(h.labels).not.toContain('トマの保護地点');
    expect(h.labels.some(label => /港門|検問|信号盤/.test(label))).toBe(false);
  });
});


describe('B11 workers and independent repair valves', () => {
  it('keeps two workers and painted valves without permanent equipment and exit names', () => {
    const h = harness(); h.textures.add('evacuees'); h.textures.add('gate'); h.activate();
    h.scene.display({ state: createInitialState('B11'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.images.filter(key => key === 'b11-adopted-landscape-worker')).toHaveLength(2);
    expect(h.images.filter(key => key === 'gate')).toHaveLength(0);
    expect(h.labels).toContain('W1 北保守員'); expect(h.labels).toContain('W2 南保守員');
    expect(h.labels).not.toContain('北補助弁 A\n未復旧 / 要W1'); expect(h.labels).not.toContain('南補助弁 B\n未復旧 / 要W2');
    expect(h.labels).not.toContain('リセの西退去口');
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
    expect(h.labels).not.toContain('北補助弁 A\nR2復旧予約 / 要W1'); expect(h.labels).not.toContain('南補助弁 B\n未復旧 / 要W2');
    h.labels.length = 0; state.repairs!.A.pendingRound = null; state.repairs!.A.completed = true;
    display('inspect'); expect(h.labels).not.toContain('北補助弁 A\n復旧済み / 要W1');
    expect(h.labels).not.toContain('南補助弁 B\n未復旧 / 要W2'); expect(h.labels).not.toContain('A R2復旧');
  });
  it('retains workers and repair identities without optional textures and keeps B07 resident labels unchanged', () => {
    const h = harness(); h.activate();
    const display = (id: BattleId) => h.scene.display({ state: createInitialState(id), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    display('B11'); expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.labels).toContain('W1 北保守員'); expect(h.labels).not.toContain('北補助弁 A\n未復旧 / 要W1');
    h.labels.length = 0; display('B07');
    expect(h.labels).toContain('V1 住民集合点'); expect(h.labels).not.toContain('リセの東出口');
    expect(h.labels.some(label => /保守員|補助弁|復旧|西退去口/.test(label))).toBe(false);
  });
});

describe('B12 final control and living preservation markers', () => {
  it('shows two passable control points and commander identity without a false exit or equipment', () => {
    const h = harness(); h.textures.add('gate'); h.activate();
    h.scene.display({ state: createInitialState('B12'), selected: null, cursor: {x:0,y:5}, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', drawn: true, error: null });
    expect(h.labels).not.toContain('北分散操作台 A (5,9)\n空き / 共有保持0/2R');
    expect(h.labels).not.toContain('南分散操作台 B (15,7)\n空き / 共有保持0/2R');
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
    expect(h.labels).not.toContain('北分散操作台 A (5,9)\nネイア 占有中 / 共有保持1/2R');
    expect(h.labels).not.toContain('南分散操作台 B (15,7)\nガラン 占有中 / 共有保持1/2R');
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
    expect(h.labels.some(label => label.includes('分散操作台') || label.includes('保全対象'))).toBe(false);
    expect(h.labels).not.toContain('代表・証人の退出口');
  });
});

describe('painted equipment mask placement (synthetic contour port)', () => {
  it.each([[1000, 650], [360, 420]])('uses absolute crop coordinates at %ix%i instead of the gameplay-cell anchor', (width, height) => {
    const h = harness(); h.activate(); Object.assign(h.scene.scale, { width, height });
    for (const mask of paintedMasks) h.textures.add(mask.key);
    for (const id of ['B06', 'B08', 'B10', 'B11', 'B12'] as const) {
      h.imageRecords.length = 0; const state = createInitialState(id), before = structuredClone(state);
      h.scene.display({ state, selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: true });
      const camera = registeredProjection(width, height, registeredLandscape(id)!.registration);
      const masks = paintedMasks.filter(mask => mask.battleId === id);
      const edges = h.imageRecords.filter(row => row.key.startsWith('map-prop-outline-v2-painted-mask-'));
      expect(edges).toHaveLength(masks.length);
      for (const mask of masks) {
        const edge = edges.find(row => row.key.startsWith('map-prop-outline-v2-' + mask.key + '-'))!;
        const topLeft = camera.source({ x: mask.bounds[0], y: mask.bounds[1] });
        expect(edge.x).toBeCloseTo(topLeft.x); expect(edge.y).toBeCloseTo(topLeft.y);
        const padX = (edge.width - (mask.bounds[2] - mask.bounds[0]) * camera.scale) / 2;
        const padY = (edge.height - (mask.bounds[3] - mask.bounds[1]) * camera.scale) / 2;
        expect(edge.x - edge.originX * edge.width + padX).toBeCloseTo(topLeft.x);
        expect(edge.y - edge.originY * edge.height + padY).toBeCloseTo(topLeft.y);
        expect(edge.depth).toBe(-98); expect(edge.depth).toBeGreaterThan(-99);
        expect(h.images).not.toContain(mask.key); // The alpha-mask fill must never cover original scene RGB.
      }
      expect(h.images).not.toContain('gate'); expect(state).toEqual(before);
      expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    }
  });
  it('preserves pending/completed repair state and fades only its ring when occupied', () => {
    const h = harness(); h.activate(); const state = createInitialState('B11');
    for (const mask of paintedMasks) h.textures.add(mask.key);
    const alpha = () => {
      h.imageRecords.length = 0; const before = structuredClone(state);
      h.scene.display({ state, selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: true });
      expect(state).toEqual(before);
      return h.imageRecords.find(row => row.key.startsWith('map-prop-outline-v2-painted-mask-b11-a-'))!.alpha;
    };
    expect(alpha()).toBe(1); state.repairs!.A.pendingRound = 2; expect(alpha()).toBe(1);
    state.repairs!.A.pendingRound = null; state.repairs!.A.completed = true; expect(alpha()).toBe(.5);
    state.units[0].pos = { ...mapObjectPlacements(state).find(row => row.id === 'repair:A')!.pos }; expect(alpha()).toBe(.32);
    expect(h.imageRecords.find(row => row.key === 'b11-adopted-landscape')!.alpha).toBe(1);
  });
  it.each(['dimensions', 'read'] as const)('keeps the original background and actors drawable after a mask %s failure, without retry loops', failure => {
    const h = harness(); h.activate(); h.failMask(failure); const mask = paintedMasks[0]; h.textures.add(mask.key);
    const state = createInitialState('B06');
    const display = () => h.scene.display({ state, selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: true });
    display(); expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.images).toContain('b06-adopted-landscape'); expect(h.images.some(key => key.startsWith('map-prop-outline-v2-' + mask.key))).toBe(false);
    expect(h.textures.has(mask.key)).toBe(true);
    expect(h.reports.at(-1)!.warnings.filter(warning => warning.startsWith(mask.key + ' 輪郭:'))).toHaveLength(1);
    display(); expect(h.reports.at(-1)!.warnings.filter(warning => warning.startsWith(mask.key + ' 輪郭:'))).toHaveLength(1);
    expect((h.scene as any).actors.size).toBeGreaterThan(0);
  });
  it('loads all eight masks as optional images and continues drawing after a mask loaderror', () => {
    const h = harness(); h.activate(); const handlers = new Map<string, (file: { key: string }) => void>();
    const load = { image: vi.fn(), spritesheet: vi.fn(), on: vi.fn((event: string, fn: (file: { key: string }) => void) => handlers.set(event, fn)), off: vi.fn() };
    Object.assign(h.scene, { load }); h.scene.preload();
    for (const mask of paintedMasks) expect(load.image.mock.calls.filter(call => call[0] === mask.key)).toEqual([[mask.key, mask.path]]);
    handlers.get('loaderror')!({ key: paintedMasks[0].key });
    h.scene.display({ state: createInitialState('B06'), selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: true });
    expect(h.reports.at(-1)).toMatchObject({ stage: 'drawn', error: null });
    expect(h.reports.at(-1)!.warnings).toContain('素材読込: ' + paintedMasks[0].key);
  });
});
