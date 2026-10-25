// Animation unit fixtures supply their own ready material port; asynchronous stage IO is tested separately.
vi.mock('../src/view/landscapeAssets',()=>({landscapeMaterials:()=>[],prepareLandscape:()=>{},releaseLandscape:()=>{}}));
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {},
  Geom: { Point: class { constructor(public x: number, public y: number) {} }, Polygon: Object.assign(class {}, { Contains: () => true }) },
} }));
import { BoardScene, type BoardRenderReport } from '../src/view/BoardScene';
import { PlaybackGate } from '../src/view/playbackGate';
import { ATTACK_BODIES } from '../src/view/dedicatedAttack';
import { HD2D_WALK } from '../src/qa/hd2dWalk';
import { createInitialState } from '../src/domain/engine';
import type { BattleState } from '../src/domain/types';
import type { PresentationPlan } from '../src/view/presentation';

class ObjectStub {
  x = 0; y = 0; alpha = 1; visible = true; destroyed = false; children: ObjectStub[] = [];
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  add(child: ObjectStub) { this.children.push(child); return this; }
  destroy(recursive?: boolean) { this.destroyed = true; if (recursive) this.children.forEach(c => c.destroy(true)); }
  depth=0;setDepth(n:number){this.depth=n;return this;}sort(key:'depth'){this.children.sort((a,b)=>a[key]-b[key]);return this;}
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setAlpha(a: number) { this.alpha = a; return this; }
  setVisible(v: boolean) { this.visible = v; return this; }
  textureKey = ''; frame: number | undefined; originX = 0; originY = 0; size = 0;
  setTexture(key: string, frame?: number) { this.textureKey = key; this.frame = frame; return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; } setDisplaySize(size: number) { this.size = size; return this; } setInteractive() { return this; }
  setRotation() { return this; } setScale() { return this; } on() { return this; }
  fillStyle() { return this; } fillPoints() { return this; } lineStyle() { return this; }
  rectangles: number[][] = []; ellipseStrokes = 0;
  strokePoints() { return this; } lineBetween() { return this; } fillRect(...args: number[]) { this.rectangles.push(args); return this; }
  fillRoundedRect() { return this; } fillCircle() { return this; }
  fillEllipse() { return this; } strokeEllipse() { this.ellipseStrokes++; return this; }
}
function harness(walk = false) {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  let failDraw = false, active = true;
  const reports: BoardRenderReport[] = [];
  const loaded = new Set<string>(['b03-adopted-landscape','b03-adopted-landscape-insert','b12-adopted-landscape']), missingFrames = new Set<string>();
  const labels: string[] = [], containers: ObjectStub[] = [];
  const listeners = new Map<string, () => void>();
  const lifecycle = new Map<string, () => void>();
  const scene = new BoardScene(vi.fn(), report => reports.push(report), 'B01', walk ? { verified: true, visibleHeight: 112 } : null);
  const scale = { width: 1000, height: 650, on: vi.fn((event: string, fn: () => void) => listeners.set(event, fn)), off: vi.fn((event: string, fn: () => void) => { if (listeners.get(event) === fn) listeners.delete(event); }) };
  Object.assign(scene, {
    add: {
      container: (x: number, y: number) => { const c = new ObjectStub(x, y); containers.push(c); return c; },
      image: (x: number, y: number, key: string, frame?: number) => new ObjectStub(x, y).setTexture(key, frame), graphics: () => new ObjectStub(), zone: () => new ObjectStub(),
      text: (x: number, y: number, value: string) => { if (failDraw) throw new Error('injected draw failure'); labels.push(value); return new ObjectStub(x, y); },
    }, scale, textures: { exists: (key: string) => loaded.has(key), createCanvas:(key:string)=>{loaded.add(key);return {getContext:()=>new Proxy({},{get:()=>vi.fn()}),refresh:()=>{}}}, get: (key: string) => ({ getSourceImage:()=>({}),has: (frame: string | number) => Number(frame) >= 0 && Number(frame) < (key === HD2D_WALK.key ? 6 : 4) && !missingFrames.has(`${key}:${frame}`) }) }, sys: { isActive: () => active },
    events: { once: (event: string, fn: () => void) => lifecycle.set(event, fn) },
  });
  const display = (state: BattleState) => scene.display({ state, selected: null, cursor: { x: 0, y: 5 }, reachable: [], mode: 'inspect', enabled: false });
  const actors = () => (scene as unknown as { actors: Map<string, { group: ObjectStub }> }).actors;
  return { loaded, missingFrames, scene, display, actors, labels, containers, scale, listeners, lifecycle, reports, failDraw: (value: boolean) => { failDraw = value; }, activate: (value: boolean) => { active = value; }, time: (value: number) => { now = value; scene.update(); } };
}
afterEach(() => vi.restoreAllMocks());
describe('plan-driven board presentation', () => {
  it('uses each route cell elevation and preserves elapsed time across HUD redraw and resize', () => {
    const h = harness(), state = createInitialState('B01'), unit = state.units[0];
    const path = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 4 }];
    unit.pos = path[2]; state.cells.find(c => c.x === 1 && c.y === 5)!.height = 3;
    const frozen = JSON.stringify(state);
    h.display(state); h.scene.create();
    const final = { x: h.actors().get(unit.id)!.group.x, y: h.actors().get(unit.id)!.group.y };
    const plan: PresentationPlan = { moves: [{ unitId: unit.id, path }], moveDuration: 220, attackDuration: 0, durationMs: 220 };
    h.scene.playPresentation(plan); const origin = h.actors().get(unit.id)!.group;
    h.time(110); const middle = { x: origin.x, y: origin.y };
    expect(middle).not.toEqual(final); expect(middle.y).toBeLessThan(final.y - 30);
    h.display(state); expect(origin.destroyed).toBe(true);
    const redraw = h.actors().get(unit.id)!.group; expect({ x: redraw.x, y: redraw.y }).toEqual(middle);
    h.listeners.get('resize')!(); expect(redraw.destroyed).toBe(false);
    expect({ x: h.actors().get(unit.id)!.group.x, y: h.actors().get(unit.id)!.group.y }).toEqual(middle);
    h.time(5000); expect({ x: h.actors().get(unit.id)!.group.x, y: h.actors().get(unit.id)!.group.y }).toEqual(final);
    expect(JSON.stringify(state)).toBe(frozen);
    const count = h.containers.length; h.time(6000); expect(h.containers).toHaveLength(count);
  });
  it('moves actor and escort concurrently and clears to authoritative final positions', () => {
    const h = harness(), state = createInitialState('B03'), actor = state.units[0], escort = state.units.find(u => u.kind === 'escort')!;
    const origins = [actor, escort].map(u => ({ ...u.pos }));
    actor.pos = { x: 9, y: 12 }; escort.pos = { x: 8, y: 8 };
    h.display(state); const final = [actor, escort].map(u => ({ x: h.actors().get(u.id)!.group.x, y: h.actors().get(u.id)!.group.y }));
    h.scene.playPresentation({ moves: [actor, escort].map((u, i) => ({ unitId: u.id, path: [origins[i], u.pos] })), moveDuration: 110, attackDuration: 0, durationMs: 110 });
    h.time(55); [actor, escort].forEach((u, i) => expect({ x: h.actors().get(u.id)!.group.x, y: h.actors().get(u.id)!.group.y }).not.toEqual(final[i]));
    h.scene.clearPresentation(); [actor, escort].forEach((u, i) => expect({ x: h.actors().get(u.id)!.group.x, y: h.actors().get(u.id)!.group.y }).toEqual(final[i]));
  });
  it.each(['melee', 'bow'] as const)('poses %s attack, temporarily shows a downed snapshot and removes it on clear', weapon => {
    const h = harness(), state = createInitialState('B12'), actor = state.units[0], target = state.units.find(u => u.id === 'enemy-vesk')!;
    const before = structuredClone(target); target.hp = 0; state.finalControl!.commanderSubdued = true;
    h.display(state); const final = { x: h.actors().get(actor.id)!.group.x, y: h.actors().get(actor.id)!.group.y };
    const frozen = JSON.stringify(state);
    h.scene.playPresentation({ moves: [], attack: { actorId: actor.id, targetId: target.id, weapon, targetBefore: before }, moveDuration: 0, attackDuration: 220, durationMs: 220 });
    h.time(110); const posed = h.actors().get(actor.id)!.group;
    expect({ x: posed.x, y: posed.y }).not.toEqual(final);
    const ghost = h.actors().get(target.id)!.group; expect(ghost.visible).toBe(true); expect(ghost.alpha).toBeLessThan(1);
    h.time(3000); expect(ghost.visible).toBe(false); expect({ x: posed.x, y: posed.y }).toEqual(final);
    h.labels.length = 0; h.scene.clearPresentation(); expect(ghost.destroyed).toBe(true); expect(h.actors().has(target.id)).toBe(false);
    expect(h.labels.some(label => label.includes('制圧済み・保全対象'))).toBe(true); expect(JSON.stringify(state)).toBe(frozen);
  });
  it('hides the attack ghost before a following escort movement completes', () => {
    const h = harness(), state = createInitialState('B12'), actor = state.units[0], target = state.units.find(u => u.id === 'enemy-vesk')!;
    const targetBefore = structuredClone(target), following = state.units[1], origin = { ...following.pos };
    following.pos = { x: 1, y: 4 }; target.hp = 0;
    h.display(state);
    const final = { x: h.actors().get(following.id)!.group.x, y: h.actors().get(following.id)!.group.y };
    h.scene.playPresentation({ moves: [{ unitId: following.id, path: [origin, following.pos], afterAttack: true }], attack: { actorId: actor.id, targetId: target.id, weapon: 'melee', targetBefore }, moveDuration: 0, attackDuration: 220, afterMoveDuration: 110, durationMs: 330 });
    h.time(110); const ghost = h.actors().get(target.id)!.group; expect(ghost.visible).toBe(true);
    h.time(275); expect(ghost.visible).toBe(false);
    expect({ x: h.actors().get(following.id)!.group.x, y: h.actors().get(following.id)!.group.y }).not.toEqual(final);
    h.time(330); expect(ghost.visible).toBe(false);
    expect({ x: h.actors().get(following.id)!.group.x, y: h.actors().get(following.id)!.group.y }).toEqual(final);
  });
  it('keeps a lethal target snapshot visible during approach, then hides it after the hit before following movement', () => {
    const h = harness(), state = createInitialState('B12'), actor = state.units[0], target = state.units.find(u => u.id === 'enemy-vesk')!;
    const targetBefore = structuredClone(target), approach = { ...actor.pos }, following = state.units[1], origin = { ...following.pos };
    actor.pos = { x: 1, y: 5 }; following.pos = { x: 1, y: 4 }; target.hp = 0;
    const frozen = JSON.stringify(state); h.display(state);
    h.scene.playPresentation({ moves: [{ unitId: actor.id, path: [approach, actor.pos] }, { unitId: following.id, path: [origin, following.pos], afterAttack: true }], attack: { actorId: actor.id, targetId: target.id, weapon: 'melee', targetBefore }, moveDuration: 110, attackDuration: 220, afterMoveDuration: 110, durationMs: 440 });
    const ghost = h.actors().get(target.id)!.group;
    expect(ghost.visible).toBe(true);
    h.time(55); expect(ghost.visible).toBe(true); expect(ghost.alpha).toBe(1);
    h.time(220); expect(ghost.visible).toBe(true); expect(ghost.alpha).toBeLessThan(1);
    h.time(330); expect(ghost.visible).toBe(false);
    h.time(385); expect(ghost.visible).toBe(false);
    h.time(440); expect(ghost.visible).toBe(false); expect(JSON.stringify(state)).toBe(frozen);
    h.scene.clearPresentation(); expect(ghost.destroyed).toBe(true); expect(h.actors().has(target.id)).toBe(false);
  });
  it('discards plans and references on battle switch, backwards round, shutdown and restart', () => {
    const h = harness(), state = createInitialState('B01'); h.display(state); h.scene.create();
    const plan: PresentationPlan = { moves: [{ unitId: state.units[0].id, path: [{ x: 0, y: 5 }, { x: 1, y: 5 }] }], moveDuration: 110, attackDuration: 0, durationMs: 110 };
    h.scene.playPresentation(plan); h.display(createInitialState('B02')); h.time(55);
    expect((h.scene as any).presentation).toBeUndefined();
    state.round = 3; h.display(state); h.scene.playPresentation(plan); state.round = 1; h.display(state);
    expect((h.scene as any).presentation).toBeUndefined();
    h.scene.playPresentation(plan); const old = h.actors().get(state.units[0].id)!.group;
    h.lifecycle.get('shutdown')!(); expect(old.destroyed).toBe(true); expect(h.actors().size).toBe(0); expect(h.listeners.has('resize')).toBe(false);
    h.time(5000); h.scene.clearPresentation(); h.scene.create(); h.display(createInitialState('B01'));
    expect((h.scene as any).presentation).toBeUndefined(); expect(h.actors().size).toBeGreaterThan(0);
    h.lifecycle.get('destroy')!(); expect(h.actors().size).toBe(0);
  });
});


describe('generated cardinal bodies on the actual BoardScene adapter', () => {
 it.each(Object.keys(ATTACK_BODIES) as (keyof typeof ATTACK_BODIES)[])('draws %s without positional pulse and restores original texture/origin', id => {
  const body=ATTACK_BODIES[id],h=harness(),state=createInitialState('B01');
  const actor=state.units.find(u=>u.id===body.actorId)!,target=state.units.find(u=>u.team==='enemy')!;
  actor.pos={x:2,y:5};actor.facing='N';const [dx,dy]=({N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]} as const)[body.direction];target.pos={x:2+dx*2,y:5+dy*2};const frozen=JSON.stringify(state);
  h.loaded.add(body.key);h.loaded.add(body.idleKey);h.display(state);h.scene.create();
  const plan:PresentationPlan={moves:[],attack:{actorId:actor.id,targetId:target.id,weapon:body.weapon,targetBefore:structuredClone(target)},moveDuration:0,attackDuration:220,durationMs:220};
  const prepared=h.scene.preparePresentation(plan,state)!;expect(prepared.attackDuration).toBe(400);
  const refs=()=>h.actors().get(actor.id)! as any,final={x:refs().group.x,y:refs().group.y};
  h.scene.playPresentation(prepared);
  for(const [time,frame] of [[0,0],[100,1],[200,2],[399,3]] as const){h.time(time);expect(refs().body.image.textureKey).toBe(body.key);expect(refs().body.image.frame).toBe(frame);expect({x:refs().group.x,y:refs().group.y}).toEqual(final);expect(refs().body.image.originY).toBe(body.originY);}
  h.display(state);h.time(200);expect(refs().body.image.frame).toBe(2);h.listeners.get('resize')!();expect(refs().body.image.frame).toBe(2);
  h.time(10000);expect(refs().body.image.textureKey).toBe(body.idleKey);expect(refs().body.image.frame).toBe(0);expect(refs().body.image.originY).toBe(237/256);
  h.scene.playPresentation(prepared);h.time(10050);h.scene.clearPresentation();expect(refs().body.image.textureKey).toBe(body.idleKey);expect(refs().body.image.frame).toBe(0);expect(JSON.stringify(state)).toBe(frozen);
 });
 it('falls back220 on missing texture and restores safely on a texture lost during400 playback',()=>{
  const h=harness(),state=createInitialState('B01'),actor=state.units[0],target=state.units.find(u=>u.team==='enemy')!;
  actor.pos={x:2,y:5};target.pos={x:3,y:5};h.loaded.add('cast-rise');h.display(state);
  const p:PresentationPlan={moves:[],attack:{actorId:actor.id,targetId:target.id,weapon:'melee',targetBefore:structuredClone(target)},moveDuration:0,attackDuration:220,durationMs:220};
  expect(h.scene.preparePresentation(p,state)).toBe(p);const start=h.actors().get(actor.id)!.group.x;
  h.scene.playPresentation(p);h.time(110);expect(h.actors().get(actor.id)!.group.x).not.toBe(start);
  h.scene.clearPresentation();h.loaded.add('attack-lise-e');h.scene.playPresentation(h.scene.preparePresentation(p,state)!);h.time(210);h.loaded.delete('attack-lise-e');h.time(220);
  const ref=h.actors().get(actor.id)! as any;expect(ref.body.image.textureKey).toBe('cast-rise');expect(ref.body.image.originY).toBe(237/256);expect(ref.group.x).toBe(start);
 });
});


describe('dedicated body and shared input gate lifetime',()=>{
 it.each(['shorten/hidden/reduced-motion','cancel/retry/HMR'] as const)('restores original view with %s and cannot complete twice',mode=>{
  const h=harness(),state=createInitialState('B01'),actor=state.units[0],target=state.units.find(u=>u.team==='enemy')!;
  actor.pos={x:2,y:5};target.pos={x:3,y:5};h.loaded.add('cast-rise');h.loaded.add('attack-lise-e');h.display(state);
  const plan=h.scene.preparePresentation({moves:[],attack:{actorId:actor.id,targetId:target.id,weapon:'melee',targetBefore:structuredClone(target)},moveDuration:0,attackDuration:220,durationMs:220},state)!;
  let callback=()=>{},duration=0,completed=0;const gate=new PlaybackGate({setTimeout:(fn,ms)=>{callback=fn;duration=ms;return 1;},clearTimeout:()=>{}});
  gate.start(plan.durationMs,()=>{h.scene.clearPresentation();completed++;});h.scene.playPresentation(plan);h.time(150);
  expect(duration).toBe(400);expect(gate.busy).toBe(true);const late=callback;
  if(mode==='shorten/hidden/reduced-motion')gate.finishNow();else{gate.cancel();h.scene.clearPresentation();}
  late();late();expect(gate.busy).toBe(false);expect(completed).toBe(mode==='shorten/hidden/reduced-motion'?1:0);
  const ref=h.actors().get(actor.id)! as any;expect(ref.body.image.textureKey).toBe('cast-rise');expect(ref.body.image.originY).toBe(237/256);
 });
});

it('ends dedicated lethal ghost at400ms before subsequent escort movement, restoring idle',()=>{
 const h=harness(),state=createInitialState('B12'),actor=state.units[0],target=state.units.find(u=>u.id==='enemy-vesk')!,following=state.units[1];
 actor.pos={x:2,y:5};target.pos={x:3,y:5};const targetBefore=structuredClone(target);target.hp=0;
 h.loaded.add('cast-rise');h.loaded.add('attack-lise-e');h.display(state);const frozen=JSON.stringify(state);
 const p=h.scene.preparePresentation({moves:[{unitId:following.id,path:[{x:1,y:5},following.pos],afterAttack:true}],attack:{actorId:actor.id,targetId:target.id,weapon:'melee',targetBefore},moveDuration:0,attackDuration:220,afterMoveDuration:110,durationMs:330},state)!;
 expect(p.attackDuration).toBe(400);expect(p.afterMoveDuration).toBe(180);expect(p.durationMs).toBe(580);h.scene.playPresentation(p);const ghost=h.actors().get(target.id)!.group;
 h.time(399);expect(ghost.visible).toBe(true);h.time(400);expect(ghost.visible).toBe(false);
 const ref=h.actors().get(actor.id)! as any;expect(ref.body.image.textureKey).toBe('cast-rise');h.time(20000);expect(JSON.stringify(state)).toBe(frozen);
});


it.each(Object.keys(ATTACK_BODIES) as (keyof typeof ATTACK_BODIES)[])('falls back when a single frame of %s is absent, and restores idle if lost in playback', id => {
 const body=ATTACK_BODIES[id], h=harness(),state=createInitialState('B01'),actor=state.units.find(u=>u.id===body.actorId)!,target=state.units.find(u=>u.team==='enemy')!;
 actor.pos={x:2,y:5};actor.facing='W';const [dx,dy]=({N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]} as const)[body.direction];target.pos={x:2+dx,y:5+dy};
 h.loaded.add(body.key);h.loaded.add(body.idleKey);h.display(state);
 const p:PresentationPlan={moves:[],attack:{actorId:actor.id,targetId:target.id,weapon:body.weapon,targetBefore:structuredClone(target)},moveDuration:0,attackDuration:220,durationMs:220};
 h.missingFrames.add(`${body.key}:2`);expect(h.scene.preparePresentation(p,state)).toBe(p);
 h.missingFrames.clear();const ready=h.scene.preparePresentation(p,state)!;expect(ready.attack!.bodyId).toBe(id);
 h.scene.playPresentation(ready);h.time(100);const ref=h.actors().get(actor.id)! as any;expect(ref.body.image.textureKey).toBe(body.key);
 h.missingFrames.add(`${body.key}:2`);h.time(200);expect(ref.body.image.textureKey).toBe(body.idleKey);expect(ref.body.image.frame).toBe(3);expect(ref.body.image.originY).toBe(237/256);
 h.time(10000);expect(ref.body.image.textureKey).toBe(body.idleKey);
});


describe('redundant resize redraw guard', () => {
  it('reuses the successful layer for repeated equal sizes but reprojects changed width or height', () => {
    const h = harness(), state = createInitialState('B01'), unit = state.units[0];
    h.display(state); h.scene.create();
    const current = h.actors().get(unit.id)!.group, count = h.containers.length;
    const original = { x: current.x, y: current.y };
    for (let index = 0; index < 8; index++) h.listeners.get('resize')!();
    expect(h.containers).toHaveLength(count); expect(current.destroyed).toBe(false);
    h.scale.width += 100; h.listeners.get('resize')!();
    const wider = h.actors().get(unit.id)!.group;
    expect(current.destroyed).toBe(true); expect(wider.x).not.toBe(original.x);
    const widerPosition = { x: wider.x, y: wider.y };
    h.scale.height += 100; h.listeners.get('resize')!();
    const taller = h.actors().get(unit.id)!.group;
    expect(wider.destroyed).toBe(true); expect({ x: taller.x, y: taller.y }).not.toEqual(widerPosition);
    const after = h.containers.length; h.listeners.get('resize')!(); expect(h.containers).toHaveLength(after);
  });
  it('never suppresses explicit displays for selection, HP, weapon or targeting changes at the same size', () => {
    const h = harness(), state = createInitialState('B01'), unit = state.units[0];
    h.loaded.add('cast-rise'); h.loaded.add('archer-irrelevant');
    h.display(state); h.scene.create();
    let previous = h.actors().get(unit.id)!.group;
    const views = [
      { selected: unit.id, mode: 'inspect', cursor: { ...unit.pos } },
      { selected: null, mode: 'attack', cursor: { x: 3, y: 4 } },
      { selected: unit.id, mode: 'move', cursor: { x: 0, y: 4 } },
    ];
    for (const view of views) {
      unit.hp -= 1; unit.weapon = unit.weapon === 'bow' ? 'melee' : 'bow';
      h.scene.display({ state, ...view, reachable: [{ x: 0, y: 4 }], enabled: true });
      expect(previous.destroyed).toBe(true);
      previous = h.actors().get(unit.id)!.group; expect(previous.destroyed).toBe(false);
      const ring = previous.children[0];
      expect(ring.rectangles.at(-1)![2] / ring.rectangles.at(-2)![2]).toBeCloseTo(unit.hp / unit.maxHp);
      expect(ring.ellipseStrokes).toBe(view.selected === unit.id ? 1 : 0);
      const count = h.containers.length; h.listeners.get('resize')!(); expect(h.containers).toHaveLength(count);
    }
  });
  it('continues a presentation without allocating on equal-size events and reprojects actual size changes without restarting', () => {
    const h = harness(), state = createInitialState('B01'), unit = state.units[0];
    const path = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 4 }]; unit.pos = path[2];
    h.display(state); h.scene.create();
    const plan: PresentationPlan = { moves: [{ unitId: unit.id, path }], moveDuration: 220, attackDuration: 0, durationMs: 220 };
    h.scene.playPresentation(plan); const group = h.actors().get(unit.id)!.group, count = h.containers.length;
    h.time(55); const first = { x: group.x, y: group.y }; h.listeners.get('resize')!();
    expect(h.containers).toHaveLength(count); expect(group.destroyed).toBe(false);
    h.time(110); expect({ x: group.x, y: group.y }).not.toEqual(first);
    h.scale.width += 120; h.listeners.get('resize')!(); expect(group.destroyed).toBe(true);
    const projected = h.actors().get(unit.id)!.group, midpoint = { x: projected.x, y: projected.y };
    h.time(220); expect({ x: projected.x, y: projected.y }).not.toEqual(midpoint);
    h.scene.clearPresentation(); expect(projected.destroyed).toBe(true);
  });
  it('allows delayed first draw and redraw after an invalid size returns to the last successful dimensions', () => {
    const h = harness(), state = createInitialState('B01');
    h.activate(false); h.scale.width = 0; h.display(state); h.scene.create();
    expect(h.actors().size).toBe(0); expect(h.reports.at(-1)?.stage).toBe('waiting-for-size');
    h.activate(true); h.scale.width = 1000; h.listeners.get('resize')!();
    const original = h.actors().get(state.units[0].id)!.group;
    for (const invalid of [0, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      h.scale.height = invalid; h.listeners.get('resize')!();
      expect(h.reports.at(-1)?.stage).toBe('waiting-for-size');
      h.scale.height = 650; h.listeners.get('resize')!();
      expect(h.reports.at(-1)?.stage).toBe('drawn');
    }
    expect(original.destroyed).toBe(true);
  });
  it('retries equal dimensions after a failed explicit draw and after shutdown/restart', () => {
    const h = harness(), state = createInitialState('B01'); h.display(state); h.scene.create();
    h.failDraw(true); h.display(state); expect(h.reports.at(-1)?.stage).toBe('draw-failed');
    h.failDraw(false); h.listeners.get('resize')!(); expect(h.reports.at(-1)?.stage).toBe('drawn');
    const beforeShutdown = h.actors().get(state.units[0].id)!.group;
    h.lifecycle.get('shutdown')!(); expect(beforeShutdown.destroyed).toBe(true); expect(h.listeners.has('resize')).toBe(false);
    h.activate(false); h.display(state); h.activate(true); h.scene.create();
    expect(h.reports.at(-1)?.stage).toBe('drawn'); expect(h.actors().size).toBeGreaterThan(0);
    const count = h.containers.length; h.listeners.get('resize')!(); expect(h.containers).toHaveLength(count);
  });
});

describe('isolated optional headfixed walk renderer (synthetic texture port, not asset acceptance)',()=>{
 it('uses original 140ms frames only while moving, restores idle on turn/clear/end and preserves committed state',()=>{
  const h=harness(true),s=createInitialState(),u=s.units[0];u.pos={x:4,y:5};u.facing='N';
  h.loaded.add('cast-rise');h.loaded.add(HD2D_WALK.key);h.display(s);h.scene.create();
  const ref=()=>h.actors().get(u.id)! as any, idle={key:ref().body.image.textureKey,frame:ref().body.image.frame,origin:ref().body.image.originY,size:ref().body.image.size};const initialScale=(h.scene as any).unitScale;const frozen=JSON.stringify(s);
  const p:PresentationPlan={moves:[{unitId:u.id,path:[0,1,2,3,4].map(x=>({x,y:5}))}],moveDuration:440,attackDuration:0,durationMs:440};
  h.scene.playPresentation(p);for(const [t,f] of [[0,0],[140,1],[280,2],[420,3]]){h.time(t);expect(ref().body.image.textureKey).toBe(HD2D_WALK.key);expect(ref().body.image.frame).toBe(f);expect(ref().body.image.originY).toBe(120/128);}
  expect(ref().body.image.originX).toBe(.5);
  expect(ref().body.image.size*112/128/(h.scene as any).unitScale).toBeCloseTo(68);
  h.display(s);expect(ref().body.image.frame).toBe(3);
  h.scale.width++;h.listeners.get('resize')!();expect(ref().body.image.frame).toBe(3);h.time(440);
  expect({key:ref().body.image.textureKey,frame:ref().body.image.frame,origin:ref().body.image.originY}).toEqual({key:idle.key,frame:idle.frame,origin:idle.origin});
  expect(ref().body.image.size/(h.scene as any).unitScale).toBeCloseTo(idle.size/initialScale);
  h.scene.playPresentation(p);h.time(500);h.scene.clearPresentation();expect(ref().body.image.textureKey).toBe(idle.key);
  h.scene.playPresentation({...p,moves:[{unitId:u.id,path:[{x:0,y:5},{x:1,y:5},{x:1,y:4}]}],moveDuration:220,durationMs:220});
  h.time(610);expect(ref().body.image.textureKey).toBe(idle.key);expect(JSON.stringify(s)).toBe(frozen);
 });
 it.each([false,true])('keeps idle without flag or full ready frames (flag=%s)',enabled=>{
  const h=harness(enabled),s=createInitialState();s.units[0].pos={x:1,y:5};h.loaded.add('cast-rise');h.loaded.add(HD2D_WALK.key);if(enabled)h.missingFrames.add(HD2D_WALK.key+':5');h.display(s);h.scene.create();
  h.scene.playPresentation({moves:[{unitId:s.units[0].id,path:[{x:0,y:5},{x:1,y:5}]}],moveDuration:110,attackDuration:0,durationMs:110});
  h.time(50);expect((h.actors().get(s.units[0].id) as any).body.image.textureKey).toBe('cast-rise');
 });
});

describe('headfixed trial interruption ownership',()=>{
 it('gives attack priority after motion and restores from a lost walking texture without changing root timing',()=>{
  const h=harness(true),s=createInitialState(),u=s.units[0],target=s.units.find(x=>x.team==='enemy')!;
  u.pos={x:2,y:5};target.pos={x:3,y:5};h.loaded.add('cast-rise');h.loaded.add(HD2D_WALK.key);h.loaded.add('attack-lise-e');h.display(s);h.scene.create();
  const ref=()=>h.actors().get(u.id)! as any;
  const p=h.scene.preparePresentation({moves:[{unitId:u.id,path:[{x:0,y:5},{x:1,y:5},{x:2,y:5}]}],attack:{actorId:u.id,targetId:target.id,weapon:'melee',targetBefore:structuredClone(target)},moveDuration:220,attackDuration:220,durationMs:440},s)!;
  expect(p.moveDuration).toBe(220);expect(p.attackDuration).toBe(400);
  h.scene.playPresentation(p);h.time(140);expect(ref().body.image.textureKey).toBe(HD2D_WALK.key);
  h.loaded.delete(HD2D_WALK.key);h.time(150);expect(ref().body.image.textureKey).toBe('cast-rise');
  h.loaded.add(HD2D_WALK.key);h.time(200);expect(ref().body.image.textureKey).toBe(HD2D_WALK.key);
  h.time(220);expect(ref().body.image.textureKey).toBe('attack-lise-e');expect(ref().body.walking).toBe(false);
  h.time(620);expect(ref().body.image.textureKey).toBe('cast-rise');
 });
 it('clears walking through the existing playback gate once and cannot resume from stale completion',()=>{
  const h=harness(true),s=createInitialState(),u=s.units[0];u.pos={x:4,y:5};h.loaded.add('cast-rise');h.loaded.add(HD2D_WALK.key);h.display(s);h.scene.create();
  const p:PresentationPlan={moves:[{unitId:u.id,path:[0,1,2,3,4].map(x=>({x,y:5}))}],moveDuration:440,attackDuration:0,durationMs:440};
  let complete=()=>{},clears=0;const gate=new PlaybackGate({setTimeout:fn=>{complete=fn;return 1;},clearTimeout:()=>{}});
  gate.start(p.durationMs,()=>{clears++;h.scene.clearPresentation();});h.scene.playPresentation(p);h.time(140);
  expect((h.actors().get(u.id) as any).body.image.textureKey).toBe(HD2D_WALK.key);
  gate.finishNow();complete();complete();h.time(400);
  expect(clears).toBe(1);expect((h.actors().get(u.id) as any).body.image.textureKey).toBe('cast-rise');expect(gate.busy).toBe(false);
 });
});

describe('production four-pose materials on BoardScene adapter',()=>{
 it('plays four-pose distance phase and restores grounded same-direction idle without mutating state',()=>{
  const h=harness(),s=createInitialState(),u=s.units[0];u.facing='E';u.pos={x:2,y:5};h.loaded.add('motion-idle-lise-E');h.loaded.add('motion-walk-lise-E');h.display(s);h.scene.create();
  const ref=()=>h.actors().get(u.id)! as any;expect(ref().body.image.textureKey).toBe('motion-idle-lise-E');const frozen=JSON.stringify(s);
  const p=h.scene.preparePresentation({moves:[{unitId:u.id,path:[{x:0,y:5},{x:1,y:5},{x:2,y:5}]}],moveDuration:220,attackDuration:0,durationMs:220},s)!;expect(p.durationMs).toBe(360);h.scene.playPresentation(p);
  for(const [t,f] of [[0,0],[90,1],[180,2],[270,3]]){h.time(t);expect(ref().body.image.textureKey).toBe('motion-walk-lise-E');expect(ref().body.image.frame).toBe(f);}
  h.time(360);expect(ref().body.image.textureKey).toBe('motion-idle-lise-E');expect(JSON.stringify(s)).toBe(frozen);h.scene.clearPresentation();expect(ref().body.image.textureKey).toBe('motion-idle-lise-E');
 });
 it('keeps grounded static if a required walking frame is missing',()=>{
  const h=harness(),s=createInitialState(),u=s.units[0];u.facing='E';u.pos={x:1,y:5};h.loaded.add('motion-idle-lise-E');h.loaded.add('motion-walk-lise-E');h.missingFrames.add('motion-walk-lise-E:2');h.display(s);h.scene.playPresentation({moves:[{unitId:u.id,path:[{x:0,y:5},{x:1,y:5}]}],moveDuration:180,attackDuration:0,durationMs:180});h.time(90);expect((h.actors().get(u.id)! as any).body.image.textureKey).toBe('motion-idle-lise-E');
 });
 it('freezes cart phase while enemy moves and after its own movement ends',()=>{
  const h=harness(),s=createInitialState('B03'),cart=s.units.find(u=>u.kind==='escort')!;h.loaded.add('motion-cart-wheel');h.display(s);const ref=()=>h.actors().get(cart.id)! as any;const from={...cart.pos},to={x:from.x+1,y:from.y};cart.pos=to;
  const p:PresentationPlan={moves:[{unitId:cart.id,path:[from,to],afterAttack:true,durationMs:180}],moveDuration:720,attackDuration:0,afterMoveDuration:180,durationMs:900};h.scene.playPresentation(p);h.time(600);expect(ref().body.image.frame).toBe(0);h.time(900);const end=ref().body.image.frame;h.time(1200);expect(ref().body.image.frame).toBe(end);
 });
});

describe('escort natural idle direction is visual only',()=>{
 it.each(['N','S','W'] as const)('holds prior idle before queued movement and restores %s idle after its own move',direction=>{
  const h=harness(),s=createInitialState('B06'),u=s.units.find(x=>x.id==='escort-toma')!,end={x:direction==='W'?10:11,y:direction==='N'?15:direction==='S'?17:16};u.pos=end;u.facing='E';s.escort={unitId:u.id,index:2,route:[{x:10,y:16},{x:11,y:16},end]};
  h.loaded.add('b06-adopted-landscape');for(const d of ['N','E','S','W']){h.loaded.add('motion-idle-toma-'+d);h.loaded.add('motion-walk-toma-'+d);}h.display(s);h.scene.create();const ref=()=>h.actors().get(u.id)! as any;const frozen=JSON.stringify(s);
  const plan:PresentationPlan={moves:[{unitId:u.id,path:[{x:11,y:16},end],afterAttack:true,durationMs:180}],moveDuration:360,attackDuration:220,afterMoveDuration:180,durationMs:760};h.scene.playPresentation(plan);
  h.time(100);expect(ref().body.image.textureKey).toBe('motion-idle-toma-E');h.time(600);expect(ref().body.image.textureKey).toBe('motion-walk-toma-'+direction);h.time(760);expect(ref().body.image.textureKey).toBe('motion-idle-toma-'+direction);h.scene.clearPresentation();expect(ref().body.image.textureKey).toBe('motion-idle-toma-'+direction);expect(JSON.stringify(s)).toBe(frozen);
  // A fresh renderer re-derives the direction from save data, without persistent view state.
  const fresh=harness();fresh.loaded.add('b06-adopted-landscape');fresh.loaded.add('motion-idle-toma-'+direction);fresh.display(JSON.parse(frozen));fresh.scene.create();expect((fresh.actors().get(u.id)! as any).body.image.textureKey).toBe('motion-idle-toma-'+direction);
 });
});
