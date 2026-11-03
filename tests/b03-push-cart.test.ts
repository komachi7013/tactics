import { describe, expect, it } from 'vitest';
import { createInitialState, escortAdvancePreview, escortUnit, getCell, getUnit, pushCartPreview, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
import manualRoute from './fixtures/manual-cart-v1/b03-route.json';
import automaticRoute from './fixtures/defend-cooldown-v1/b03-route.json';

const step = (state: BattleState, command: Command) => {
  const result = reduce(state, command);
  expect(result.error, JSON.stringify(command)).toBeUndefined();
  return result.state;
};
function adjacent() {
  const state = createInitialState('B03');
  // Explicit domain fixture: remove combat pressure to isolate the push rule.
  for (const unit of state.units) if (unit.team === 'enemy') unit.hp = 0;
  getUnit(state, 'ally-lise')!.pos = { x: 8, y: 10 };
  return step(state, { type: 'start', unitId: 'ally-lise' });
}
function finishRound(state: BattleState) {
  if (state.activeId) state = step(state, { type: 'end', facing: 'N' });
  if (state.turn === 'player') state = step(state, { type: 'endPlayerTurn' });
  while (state.phase === 'playing' && state.turn === 'enemy') state = runEnemyActivation(state);
  return state;
}

describe('B03 manual cart push (other escort missions stay automatic)', () => {
  it('previews without mutation and advances exactly one route cell immediately for one action', () => {
    const state = adjacent(), before = structuredClone(state);
    expect(pushCartPreview(state)).toMatchObject({ legal: true, next: { x: 8, y: 8 } });
    expect(state).toEqual(before);
    const pushed = step(state, { type: 'pushCart' });
    expect(state).toEqual(before);
    expect(pushed.escort).toMatchObject({ index: 1, lastPushedRound: 1 });
    expect(escortUnit(pushed)!.pos).toEqual({ x: 8, y: 8 });
    expect(pushed.activation.acted).toBe(true);
    expect(pushed.activeId).toBe('ally-lise');
    expect(pushed.round).toBe(1);
    expect(pushed.units.map(u => [u.id, u.hp, u.facing])).toEqual(before.units.map(u => [u.id, u.hp, u.facing]));
    expect(pushed.cells).toEqual(before.cells);
    expect(pushed.records).toEqual(before.records);
    expect(pushed.log.at(-1)).toContain('リセが荷車を1セル押した');
  });

  it('never advances B03 merely by adjacency, waiting or crossing a round boundary', () => {
    const state = adjacent();
    expect(escortAdvancePreview(state).canAdvance).toBe(true);
    const next = finishRound(state);
    expect(next.round).toBe(2);
    expect(next.escort?.index).toBe(0);
    expect(escortUnit(next)!.pos).toEqual({ x: 8, y: 9 });
    expect(next.escort?.lastPushedRound).toBeUndefined();
  });

  it('uses a cart-wide once-per-round limit even after another combatant activates', () => {
    let state = step(adjacent(), { type: 'pushCart' });
    state = step(state, { type: 'end', facing: 'N' });
    state = step(state, { type: 'start', unitId: 'ally-garan' });
    state = step(state, { type: 'move', to: { x: 7, y: 8 } });
    const before = structuredClone(state), blocked = reduce(state, { type: 'pushCart' });
    expect(pushCartPreview(state).reason).toContain('1ラウンドに1回');
    expect(blocked.error).toContain('1ラウンドに1回');
    expect(blocked.state).toBe(state);
    expect(state).toEqual(before);
    expect(state.activation.acted).toBe(false);
  });

  it('permits the next round after JSON restoration without resetting the historical marker', () => {
    let state = step(adjacent(), { type: 'pushCart' });
    state = step(state, { type: 'move', to: { x: 8, y: 9 } });
    state = finishRound(state);
    expect(state.round).toBe(2);
    state = JSON.parse(JSON.stringify(state));
    expect(state.escort?.lastPushedRound).toBe(1);
    state = step(state, { type: 'start', unitId: 'ally-lise' });
    state = step(state, { type: 'pushCart' });
    expect(state.escort).toMatchObject({ index: 2, lastPushedRound: 2 });
    expect(escortUnit(state)!.pos).toEqual({ x: 8, y: 7 });
  });

  it('accepts legacy/start states with no lastPushedRound and does not add it on preview', () => {
    const state = adjacent(); delete state.escort!.lastPushedRound;
    const restored: BattleState = JSON.parse(JSON.stringify(state));
    expect(pushCartPreview(restored).legal).toBe(true);
    expect(restored.escort).not.toHaveProperty('lastPushedRound');
    expect(step(restored, { type: 'pushCart' }).escort?.lastPushedRound).toBe(1);
    expect(createInitialState('B03').escort).not.toHaveProperty('lastPushedRound');
  });

  it('spends the action, blocks a second action and blocks move cancellation after pushing', () => {
    let state = step(adjacent(), { type: 'pushCart' });
    expect(reduce(state, { type: 'defend' }).error).toBeTruthy();
    expect(reduce(state, { type: 'pushCart' }).error).toBeTruthy();
    state = step(state, { type: 'move', to: { x: 8, y: 9 } });
    const before = structuredClone(state), undo = reduce(state, { type: 'undoMove' });
    expect(undo.error).toBe('移動を取り消せません');
    expect(undo.state).toBe(state); expect(state).toEqual(before);
    expect(escortUnit(state)!.pos).toEqual({ x: 8, y: 8 });
  });

  it.each(['inactive', 'dead-actor', 'actor-ended', 'action-used', 'enemy-turn', 'enemy-actor', 'escort-actor', 'distant', 'diagonal', 'other-adjacent', 'finished', 'no-escort', 'broken-cart', 'arrived'] as const)
  ('rejects %s without mutation or action consumption', condition => {
    const state = adjacent(), actor = getUnit(state, 'ally-lise')!, cart = escortUnit(state)!;
    switch (condition) {
      case 'inactive': state.activeId = null; break;
      case 'dead-actor': actor.hp = 0; break;
      case 'actor-ended': actor.acted = true; break;
      case 'action-used': state.activation.acted = true; break;
      case 'enemy-turn': state.turn = 'enemy'; break;
      case 'enemy-actor': actor.team = 'enemy'; break;
      case 'escort-actor': state.activeId = cart.id; break;
      case 'distant': actor.pos = { x: 8, y: 12 }; break;
      case 'diagonal': actor.pos = { x: 7, y: 10 }; break;
      case 'other-adjacent': actor.pos = { x: 8, y: 12 }; getUnit(state, 'ally-garan')!.pos = { x: 7, y: 9 }; break;
      case 'finished': state.phase = 'won'; break;
      case 'no-escort': delete state.escort; break;
      case 'broken-cart': cart.hp = 0; break;
      case 'arrived': state.escort!.index = 5; cart.pos = { x: 8, y: 4 }; actor.pos = { x: 8, y: 5 }; break;
    }
    const before = structuredClone(state);
    expect(pushCartPreview(state).legal).toBe(false);
    const result = reduce(state, { type: 'pushCart' });
    expect(result.error).toBeTruthy(); expect(result.state).toBe(state); expect(state).toEqual(before);
  });

  it.each(['enemy-adjacent', 'occupied', 'blocked', 'height', 'outside'] as const)
  ('retains the existing escort advance restriction: %s', condition => {
    const state = adjacent(), next = state.escort!.route[1];
    if (condition === 'enemy-adjacent') { const enemy = getUnit(state, 'enemy-melee-01')!; enemy.hp = 14; enemy.pos = { x: 7, y: 9 }; }
    if (condition === 'occupied') getUnit(state, 'ally-garan')!.pos = { ...next };
    if (condition === 'blocked') getCell(state, next)!.blocked = true;
    if (condition === 'height') getCell(state, next)!.height = 2;
    if (condition === 'outside') state.escort!.route[1] = { x: -1, y: -1 };
    const before = structuredClone(state), physical = escortAdvancePreview(state);
    expect(physical.canAdvance).toBe(false);
    expect(pushCartPreview(state)).toEqual({ legal: false, next: physical.next, reason: physical.reason });
    expect(reduce(state, { type: 'pushCart' }).error).toBe(physical.reason);
    expect(state).toEqual(before);
  });

  it('wins on a final legal push within R12 and still requires the existing M record', () => {
    let state = adjacent(); state.round = 12;
    state.escort!.index = 4; escortUnit(state)!.pos = { x: 8, y: 5 }; getUnit(state, 'ally-lise')!.pos = { x: 8, y: 6 };
    const noRecord = step(state, { type: 'pushCart' });
    expect(noRecord.phase).toBe('playing');
    expect(finishRound(noRecord).phase).toBe('lost');
    state.records = ['M'];
    const won = step(state, { type: 'pushCart' });
    expect(won.phase).toBe('won'); expect(won.round).toBe(12);
    expect(won.escort?.index).toBe(5);
  });

  it.each(['B06', 'B09'] as const)('preserves %s automatic escort and rejects the cart-only command', id => {
    let state = createInitialState(id);
    for (const unit of state.units) if (unit.team === 'enemy') unit.hp = 0;
    if (id === 'B06') state.gate.drained = true;
    const target = escortUnit(state)!, actor = getUnit(state, 'ally-lise')!, next = state.escort!.route[1];
    const parking = state.cells.find(cell => !cell.blocked && Math.abs(cell.x-target.pos.x)+Math.abs(cell.y-target.pos.y)>2)!;
    for (const unit of state.units) if (unit.team==='player' && unit.kind!=='escort' && unit.id!==actor.id) unit.pos={x:parking.x,y:parking.y};
    const neighbor = state.cells.find(cell => !cell.blocked && Math.abs(cell.x-target.pos.x)+Math.abs(cell.y-target.pos.y)===1
      && !(cell.x===next.x && cell.y===next.y)
      && !state.units.some(unit => unit.hp>0 && unit.id!==actor.id && unit.pos.x===cell.x && unit.pos.y===cell.y))!;
    actor.pos = { x: neighbor.x, y: neighbor.y };
    state = step(state, { type: 'start', unitId: actor.id });
    const before = structuredClone(state);
    expect(pushCartPreview(state).legal).toBe(false);
    expect(reduce(state, { type: 'pushCart' }).error).toBeTruthy(); expect(state).toEqual(before);
    expect(escortAdvancePreview(state).canAdvance).toBe(true);
    state = finishRound(state);
    expect(state.escort?.index).toBe(1); expect(escortUnit(state)!.pos).toEqual(next);
    expect(state.escort).not.toHaveProperty('lastPushedRound');
  });

  it('replays a real B03 victory with exactly five manual pushes, normal AI and unchanged deadline/map/stats', () => {
    let state = createInitialState('B03'); const cells = structuredClone(state.cells), pushes: number[] = [];
    for (const command of manualRoute.commands as Command[]) {
      if (command.type === 'pushCart') { expect(pushCartPreview(state).legal).toBe(true); pushes.push(state.round); }
      state = step(state, command);
      while (state.phase === 'playing' && state.turn === 'enemy') state = runEnemyActivation(state);
    }
    expect(state.phase).toBe('won'); expect(state.round).toBe(8);
    expect(pushes).toEqual([4,5,6,7,8]); expect(state.escort?.index).toBe(5);
    expect(state.records).toEqual(['M']); expect(state.cells).toEqual(cells);
    expect(state.units.filter(unit => unit.team === 'player').every(unit => unit.hp > 0)).toBe(true);
    expect(automaticRoute.commands.some(command => command.type === 'pushCart')).toBe(false);
    // The old automatic fixture remains archived, not relabeled as a manual victory.
  });
});
