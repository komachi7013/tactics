import { describe, expect, it } from 'vitest';
import { createInitialState, getUnit, reachable, reduce } from '../src/domain/engine';
import type { BattleState, Command, Pos } from '../src/domain/types';
import { createPresentation, samplePresentation } from '../src/view/presentation';

function apply(state: BattleState, command: Command): BattleState {
  const result = reduce(state, command);
  expect(result.error).toBeUndefined();
  return result.state;
}
const route: Pos[] = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }];
function corridor(plank: boolean) {
  let state = createInitialState('B01');
  state.units = state.units.filter(u => u.id === 'ally-lise');
  for (const cell of state.cells) {
    cell.height = 0; cell.water = false; cell.bridge = false;
    cell.blocked = !route.some(p => p.x === cell.x && p.y === cell.y);
    cell.shallow = cell.x === 0 && cell.y === 1 || cell.x === 1 && cell.y === 1;
  }
  const actor = getUnit(state, 'ally-lise')!;
  actor.pos = { ...route[0] }; actor.move = 4; actor.shallowCost = 2;
  if (plank) actor.plankReady = true;
  state = apply(state, { type: 'start', unitId: actor.id });
  return state;
}
describe('plank movement presentation', () => {
  it('uses the legal extended shallow route, consumes effect in domain, and retraces that route after undo restores it', () => {
    const before = corridor(true), move: Command = { type: 'move', to: route.at(-1)! };
    expect(reachable(before, 'ally-lise').find(p => p.x === 2 && p.y === 0)?.cost).toBe(4);
    expect(reachable(corridor(false), 'ally-lise').some(p => p.x === 2 && p.y === 0)).toBe(false);
    const beforeSnapshot = structuredClone(before), after = apply(before, move), afterSnapshot = structuredClone(after);
    expect(getUnit(after, 'ally-lise')!.plankReady).toBeUndefined();
    const outward = createPresentation(before, after, [move])!;
    expect(outward.moves).toEqual([{ unitId: 'ally-lise', path: route }]);
    const undo: Command = { type: 'undoMove' }, restored = apply(after, undo), restoredSnapshot = structuredClone(restored);
    expect(getUnit(restored, 'ally-lise')!.plankReady).toBe(true);
    const returning = createPresentation(after, restored, [undo])!;
    expect(returning.moves).toEqual([{ unitId: 'ally-lise', path: [...route].reverse() }]);
    expect(returning.durationMs).toBe(outward.durationMs);
    expect(samplePresentation(returning, 110).positions['ally-lise']).toEqual({ from: route[3], to: route[2], t: 0 });
    expect(samplePresentation(returning, 9999)).toMatchObject({ complete: true, positions: { 'ally-lise': { from: route[0], to: route[0], t: 1 } } });
    expect(before).toEqual(beforeSnapshot); expect(after).toEqual(afterSnapshot); expect(restored).toEqual(restoredSnapshot);
    returning.moves[0].path[0].x = 99;
    expect(after).toEqual(afterSnapshot); expect(outward.moves[0].path).toEqual(route);
  });
  it('restores and consumes again on a second move without changing the visual route', () => {
    const before = corridor(true), command: Command = { type: 'move', to: route.at(-1)! };
    const after = apply(before, command), restored = apply(after, { type: 'undoMove' }), again = apply(restored, command);
    expect(createPresentation(restored, again, [command])!.moves).toEqual(createPresentation(before, after, [command])!.moves);
    expect(getUnit(again, 'ally-lise')!.plankReady).toBeUndefined();
  });
  it('retains ordinary weighted movement and reverse path without generating a new effect', () => {
    const before = corridor(false), move: Command = { type: 'move', to: route[2] };
    const after = apply(before, move), restored = apply(after, { type: 'undoMove' });
    const outbound = createPresentation(before, after, [move])!, inbound = createPresentation(after, restored, [{ type: 'undoMove' }])!;
    expect(outbound.moves[0].path).toEqual(route.slice(0, 3));
    expect(inbound.moves[0].path).toEqual([...route.slice(0, 3)].reverse());
    expect(getUnit(restored, 'ally-lise')!.plankReady).toBeUndefined();
  });
  it('uses no plan for a confirmed plank grant and leaves its state transition to domain', () => {
    let before = createInitialState('B01');
    const source = getUnit(before, 'ally-lise')!, target = getUnit(before, 'ally-garan')!;
    source.jobCommand = 'plank'; source.plankCharges = 2; source.pos = { x: 0, y: 5 };
    target.pos = { x: 1, y: 5 }; target.shallowCost = 2;
    before = apply(before, { type: 'start', unitId: source.id });
    const snapshot = structuredClone(before), command: Command = { type: 'plank', targetId: target.id };
    const after = apply(before, command), afterSnapshot = structuredClone(after);
    expect(createPresentation(before, after, [command])).toBeNull();
    expect(getUnit(after, source.id)!.plankCharges).toBe(1);
    expect(getUnit(after, target.id)!.plankReady).toBe(true);
    expect(before).toEqual(snapshot); expect(after).toEqual(afterSnapshot);
  });
  it('does not animate or consume an effect for an invalid move', () => {
    const before = corridor(true), command: Command = { type: 'move', to: { x: -1, y: 0 } }, snapshot = structuredClone(before);
    const result = reduce(before, command); expect(result.error).toBeDefined();
    expect(createPresentation(before, result.state, [command])).toBeNull(); expect(before).toEqual(snapshot);
  });
});
