import { describe, expect, it } from 'vitest';
import { createInitialState, getUnit, reachable, reduce } from '../src/domain/engine';
import { createPresentation, samplePresentation, type PresentationPlan } from '../src/view/presentation';
import { runEnemyActivationWithTrace } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
const apply = (s: BattleState, c: Command) => { const result = reduce(s, c); expect(result.error).toBeUndefined(); return result.state; };
function moveSetup() {
 const before = apply(createInitialState(), { type: 'start', unitId: 'ally-lise' });
 const command: Command = { type: 'move', to: { x: 0, y: 2 } };
 const after = apply(before, command); return { before, after, command };
}
describe('disposable movement and attack plans', () => {
 it('uses exact weighted domain route without mutation or shared positions', () => {
  const { before, after, command } = moveSetup(), frozen = structuredClone({ before, after });
  const plan = createPresentation(before, after, [command])!;
  expect(plan.moves[0].path).toEqual([getUnit(before, 'ally-lise')!.pos, ...reachable(before, 'ally-lise').find(p => p.x === 0 && p.y === 2)!.path]);
  expect(plan.moveDuration).toBe(330); expect(plan.attackDuration).toBe(0);
  const sample = samplePresentation(plan, 55); expect(sample.positions['ally-lise'].t).toBe(.5);
  sample.positions['ally-lise'].from.x = 99; plan.moves[0].path[0].x = 77;
  expect({ before, after }).toEqual(frozen);
 });
 it('interpolates stair cells rather than cutting high terrain', () => {
  let before = createInitialState(); getUnit(before, 'ally-lise')!.pos = { x: 6, y: 0 };
  before = apply(before, { type: 'start', unitId: 'ally-lise' }); const command: Command = { type: 'move', to: { x: 6, y: 1 } };
  const plan = createPresentation(before, apply(before, command), [command])!;
  expect(plan.moves[0].path).toEqual([{ x: 6, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 6, y: 1 }]);
 });
 it('represents undo from current to actual original location', () => {
  const { before, after } = moveSetup(), restored = apply(after, { type: 'undoMove' });
  const plan = createPresentation(after, restored, [{ type: 'undoMove' }])!;
  expect(plan.moves[0].path[0]).toEqual(getUnit(after, 'ally-lise')!.pos);
  expect(plan.moves[0].path.at(-1)).toEqual(getUnit(before, 'ally-lise')!.pos);
 });
 it('undo retraces a wall detour when entering shallow origin exceeds reverse move budget', () => {
  let original = createInitialState(); original.units = original.units.filter(u => u.id === 'ally-lise');
  const route = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }];
  original.cells.forEach(c => { c.height = 0; c.shallow = c.x === 0 && c.y === 0; c.blocked = !route.some(p => p.x === c.x && p.y === c.y); });
  const actor = getUnit(original, 'ally-lise')!; actor.pos = { ...route[0] }; actor.move = 4; actor.shallowCost = 2;
  original = apply(original, { type: 'start', unitId: actor.id });
  const moved = apply(original, { type: 'move', to: route.at(-1)! }), snapshot = structuredClone(moved);
  expect(reachable(moved, actor.id).some(p => p.x === 0 && p.y === 0)).toBe(false);
  const restored = apply(moved, { type: 'undoMove' });
  const plan = createPresentation(moved, restored, [{ type: 'undoMove' }])!;
  expect(plan.moves[0].path).toEqual([...route].reverse());
  expect(plan.moves[0].path.some(p => p.x === 1 && p.y === 0)).toBe(false);
  expect(samplePresentation(plan, 110).positions[actor.id]).toEqual({ from: route[3], to: route[2], t: 0 });
  expect(moved).toEqual(snapshot);
 });
 it('returns null for unchanged invalid moves and nonvisual actions', () => {
  const { before } = moveSetup(), invalid: Command = { type: 'move', to: { x: -1, y: 5 } };
  expect(createPresentation(before, reduce(before, invalid).state, [invalid])).toBeNull();
  expect(createPresentation(before, apply(before, { type: 'defend' }), [{ type: 'defend' }])).toBeNull();
 });
 it('retains lethal target snapshot for melee and bow independently', () => {
  for (const weapon of ['melee', 'bow'] as const) {
   let before = createInitialState(); before.cells.forEach(c => { c.height = 0; });
   const actor = getUnit(before, 'ally-lise')!, target = getUnit(before, 'enemy-melee-01')!;
   actor.weapon = weapon; actor.pos = { x: 4, y: 5 }; target.pos = weapon === 'melee' ? { x: 5, y: 5 } : { x: 6, y: 5 }; target.hp = 1;
   before = apply(before, { type: 'start', unitId: actor.id }); const command: Command = { type: 'attack', targetId: target.id };
   const after = apply(before, command), plan = createPresentation(before, after, [command])!;
   expect(plan.attack?.weapon).toBe(weapon); expect(plan.attack?.targetBefore.hp).toBe(1); expect(getUnit(after, target.id)!.hp).toBe(0);
   expect(plan.attack?.targetBefore).not.toBe(getUnit(before, target.id)); expect(samplePresentation(plan, 110).attackProgress).toBe(.5);
  }
 });
 it('orders AI movement before attack with exact trace path', () => {
  const before = createInitialState(); before.turn = 'enemy'; before.cells.forEach(c => { c.height = 0; }); before.units = before.units.filter(u => u.id === 'ally-lise' || u.id === 'enemy-melee-01'); getUnit(before, 'ally-lise')!.pos = { x: 2, y: 5 };
  const trace = runEnemyActivationWithTrace(before), plan = createPresentation(before, trace.state, trace.commands)!;
  expect(trace.commands.some(c => c.type === 'move')).toBe(true); expect(plan.attack).toBeDefined();
  expect(samplePresentation(plan, plan.moveDuration - 1).attackProgress).toBeNull();
  expect(samplePresentation(plan, plan.moveDuration).attackProgress).toBe(0);
  const done = samplePresentation(plan, 1e9); expect(done.complete).toBe(true); expect(done.attackProgress).toBe(1);
  for (const move of plan.moves) expect(done.positions[move.unitId]).toEqual({ from: move.path.at(-1), to: move.path.at(-1), t: 1 });
 });
 it('caps long movement, samples every mover and clamps negative/NaN time', () => {
  const plan: PresentationPlan = { moves: [{ unitId: 'a', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, { unitId: 'b', path: [{ x: 2, y: 0 }, { x: 2, y: 1 }] }], moveDuration: 110, attackDuration: 0, durationMs: 110 };
  for (const time of [-1, NaN]) expect(samplePresentation(plan, time).positions.a.t).toBe(0);
  expect(Object.keys(samplePresentation(plan, 200).positions)).toEqual(['a', 'b']); expect(samplePresentation(plan, Infinity).complete).toBe(true);
  let before = createInitialState(); before.units = before.units.filter(u => u.id === 'ally-lise'); before.cells.forEach(c => { c.height = 0; c.blocked = false; c.shallow = false; }); getUnit(before, 'ally-lise')!.move = 20;
  before = apply(before, { type: 'start', unitId: 'ally-lise' }); const command: Command = { type: 'move', to: { x: 9, y: 0 } };
  expect(createPresentation(before, apply(before, command), [command])!.moveDuration).toBe(660);
 });
 it('uses actual escort route and stays separate from input snapshots', () => {
  const before = createInitialState('B06'), after = structuredClone(before), cart = before.units.find(u => u.kind === 'escort')!;
  after.escort!.index = 1; getUnit(after, cart.id)!.pos = { ...before.escort!.route[1] };
  const plan = createPresentation(before, after, [{ type: 'end', facing: 'E' }])!;
  expect(plan.moves).toEqual([{ unitId: cart.id, path: before.escort!.route.slice(0, 2) }]);
 });
 it('moves escorts only after the attack that ended the round', () => {
  let before = createInitialState('B06'); before.cells.forEach(c => { c.height = 0; });
  const actor = getUnit(before, 'ally-lise')!, target = before.units.find(u => u.team === 'enemy')!;
  actor.pos = { x: 4, y: 5 }; target.pos = { x: 5, y: 5 };
  before = apply(before, { type: 'start', unitId: actor.id });
  const attack: Command = { type: 'attack', targetId: target.id };
  const after = apply(before, attack), cart = before.units.find(u => u.kind === 'escort')!;
  after.escort!.index = 1; getUnit(after, cart.id)!.pos = { ...before.escort!.route[1] };
  const plan = createPresentation(before, after, [attack, { type: 'end', facing: 'E' }])!;
  expect(plan.moves[0].afterAttack).toBe(true); expect(plan.moveDuration).toBe(0); expect(plan.afterMoveDuration).toBe(110); expect(plan.durationMs).toBe(330);
  expect(samplePresentation(plan, 110).positions[cart.id].t).toBe(0);
  expect(samplePresentation(plan, 275).positions[cart.id].t).toBe(.5);
  expect(samplePresentation(plan, 330).positions[cart.id].to).toEqual(after.escort!.route[1]);
 });

});
