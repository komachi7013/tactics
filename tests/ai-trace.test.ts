import { describe, expect, it } from 'vitest';
import { runEnemyActivation, runEnemyActivationWithTrace } from '../src/domain/ai';
import { createInitialState, reduce } from '../src/domain/engine';
import type { BattleId, BattleState } from '../src/domain/types';
const battles: BattleId[] = ['B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12'];
describe('enemy activation trace preserves committed commands', () => {
 it('returns empty trace and original state for invalid activation contexts', () => {
  for (const mutation of [(s: BattleState) => s, (s: BattleState) => { s.phase = 'won'; return s; }, (s: BattleState) => { s.turn = 'enemy'; s.activeId = 'enemy-melee-01'; return s; }, (s: BattleState) => { s.turn = 'enemy'; s.units = []; return s; }]) {
   const state = mutation(createInitialState()), result = runEnemyActivationWithTrace(state);
   expect(result.state).toBe(state); expect(result.commands).toEqual([]);
  }
 });
 it.each(battles)('%s keeps AI wrapper/replayed trace identical over successive activations', battle => {
  let state = createInitialState(battle), checked = 0;
  for (let round = 0; round < 5 && state.phase === 'playing'; round++) {
   let guard = 0;
   while (state.turn === 'player' && state.phase === 'playing' && ++guard < 20) {
    const unit = state.units.find(u => u.team === 'player' && u.hp > 0 && !u.acted && u.kind !== 'escort');
    if (!unit) break;
    state = reduce(state, { type: 'start', unitId: unit.id }).state;
    state = reduce(state, { type: 'end', facing: unit.facing }).state;
   }
   guard = 0;
   while (state.turn === 'enemy' && state.phase === 'playing' && ++guard < 20) {
    const snapshot = structuredClone(state), result = runEnemyActivationWithTrace(state);
    expect(result.commands[0]?.type).toBe('start');
    expect(result.commands.filter(c => c.type === 'attack' || c.type === 'defend')).toHaveLength(1);
    let replay = state;
    for (const command of result.commands) { const next = reduce(replay, command); expect(next.error).toBeUndefined(); replay = next.state; }
    expect(replay).toEqual(result.state); expect(runEnemyActivation(state)).toEqual(result.state); expect(state).toEqual(snapshot);
    expect(result.state).not.toBe(state); state = result.state; checked++;
   }
  }
  expect(checked).toBeGreaterThan(0);
 });
 it('records terminal lethal attack without inventing an end command', () => {
  const state = createInitialState(); state.turn = 'enemy'; state.cells.forEach(c => { c.height = 0; });
  state.units = state.units.filter(u => u.id === 'ally-lise' || u.id === 'enemy-melee-01');
  const lise = state.units.find(u => u.id === 'ally-lise')!; lise.hp = 1; lise.pos = { x: 4, y: 5 };
  const result = runEnemyActivationWithTrace(state);
  expect(result.state.phase).toBe('lost'); expect(result.commands.at(-1)?.type).toBe('attack'); expect(result.commands.some(c => c.type === 'end')).toBe(false);
 });
});
