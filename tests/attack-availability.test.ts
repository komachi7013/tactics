import { describe, expect, it } from 'vitest';
import { attackPreview, createInitialState, getCell, getUnit, reduce } from '../src/domain/engine';
import type { BattleState, Command } from '../src/domain/types';
import { attackAvailability } from '../src/view/attackAvailability';

const apply = (state: BattleState, command: Command): BattleState => {
  const result = reduce(state, command);
  expect(result.error).toBeUndefined();
  return result.state;
};
const flat = (actorId = 'ally-lise'): BattleState => {
  const state = createInitialState();
  state.cells.forEach(cell => { cell.height = 0; cell.blocked = false; cell.shallow = false; });
  return apply(state, { type: 'start', unitId: actorId });
};
const oneEnemy = (state: BattleState): BattleState => {
  state.units = state.units.filter(unit => unit.team === 'player' || unit.id === 'enemy-melee-01');
  return state;
};

describe('player attack command availability', () => {
  it('requires an active player even when a theoretical attack is legal', () => {
    const state = createInitialState();
    getUnit(state, 'ally-lise')!.pos = { x: 4, y: 5 };
    expect(attackPreview(state, 'ally-lise', 'enemy-melee-01').legal).toBe(true);
    expect(attackAvailability(state)).toMatchObject({ enabled: false, targets: [], reason: '先に行動する味方を選んでください。' });
  });

  it('recomputes after a real move and undo instead of caching the old range', () => {
    const before = oneEnemy(flat());
    expect(attackAvailability(before).enabled).toBe(false);
    const moved = apply(before, { type: 'move', to: { x: 4, y: 5 } });
    expect(attackAvailability(moved).targets.map(target => target.targetId)).toEqual(['enemy-melee-01']);
    expect(attackAvailability(moved).enabled).toBe(true);
    const undone = apply(moved, { type: 'undoMove' });
    expect(attackAvailability(undone)).toMatchObject({ enabled: false, targets: [] });
    expect(getUnit(undone, 'ally-lise')!.pos).toEqual({ x: 0, y: 5 });
  });

  it('uses weapon range, including the bow minimum distance and high-ground extension', () => {
    const state = oneEnemy(flat('ally-neia'));
    getUnit(state, 'ally-neia')!.pos = { x: 1, y: 1 };
    const enemy = getUnit(state, 'enemy-melee-01')!;
    enemy.pos = { x: 2, y: 1 };
    expect(attackAvailability(state)).toMatchObject({ enabled: false, reason: '弩の射程と射線を満たす敵がいません。' });
    enemy.pos = { x: 3, y: 1 };
    expect(attackAvailability(state).enabled).toBe(true);
    enemy.pos = { x: 6, y: 1 };
    expect(attackAvailability(state).enabled).toBe(false);
    getCell(state, { x: 1, y: 1 })!.height = 1;
    expect(attackAvailability(state).targets.map(target => target.targetId)).toEqual([enemy.id]);
  });

  it('rejects an in-range bow target behind terrain and reevaluates when the ray clears', () => {
    const state = oneEnemy(flat('ally-neia'));
    getUnit(state, 'ally-neia')!.pos = { x: 1, y: 1 };
    getUnit(state, 'enemy-melee-01')!.pos = { x: 3, y: 1 };
    getCell(state, { x: 2, y: 1 })!.height = 2;
    expect(attackPreview(state, 'ally-neia', 'enemy-melee-01').reason).toBe('地形で射線が遮られています');
    expect(attackAvailability(state)).toMatchObject({ enabled: false, targets: [] });
    getCell(state, { x: 2, y: 1 })!.height = 0;
    expect(attackAvailability(state).enabled).toBe(true);
  });

  it('uses the melee height rule rather than adjacency alone', () => {
    const state = oneEnemy(flat());
    getUnit(state, 'ally-lise')!.pos = { x: 4, y: 5 };
    getCell(state, { x: 5, y: 5 })!.height = 2;
    expect(attackAvailability(state).enabled).toBe(false);
    getCell(state, { x: 5, y: 5 })!.height = 1;
    expect(attackAvailability(state).enabled).toBe(true);
  });

  it('excludes retreating enemies and friendly units without changing their state', () => {
    const state = oneEnemy(flat());
    getUnit(state, 'ally-lise')!.pos = { x: 4, y: 5 };
    getUnit(state, 'enemy-melee-01')!.hp = 0;
    getUnit(state, 'ally-garan')!.pos = { x: 3, y: 5 };
    const before = structuredClone(state);
    expect(attackAvailability(state)).toEqual({ enabled: false, reason: '攻撃できる生存敵がいません。', targets: [] });
    expect(state).toEqual(before);
  });

  it('disables after a real action even while attackPreview remains legal', () => {
    let state = oneEnemy(flat());
    getUnit(state, 'ally-lise')!.pos = { x: 4, y: 5 };
    state = apply(state, { type: 'defend' });
    expect(attackPreview(state, 'ally-lise', 'enemy-melee-01').legal).toBe(true);
    expect(attackAvailability(state)).toMatchObject({ enabled: false, targets: [], reason: 'この手番の行動は使用済みです。' });
  });

  it.each(['won', 'lost'] as const)('disables after the battle is %s', phase => {
    const state = oneEnemy(flat());
    getUnit(state, 'ally-lise')!.pos = { x: 4, y: 5 };
    state.phase = phase;
    expect(attackAvailability(state)).toMatchObject({ enabled: false, reason: '戦闘は終了しています。' });
  });

  it('does not enable player commands during an enemy turn', () => {
    const state = oneEnemy(flat());
    getUnit(state, 'ally-lise')!.pos = { x: 4, y: 5 };
    state.turn = 'enemy';
    expect(attackAvailability(state)).toMatchObject({ enabled: false, targets: [], reason: '敵の手番です。' });
  });

  it.each(['missing', 'retreated', 'finished', 'escort'] as const)('rejects a %s actor', condition => {
    const state = flat();
    const actor = getUnit(state, 'ally-lise')!;
    if (condition === 'missing') state.activeId = 'missing';
    if (condition === 'retreated') actor.hp = 0;
    if (condition === 'finished') actor.acted = true;
    if (condition === 'escort') actor.kind = 'escort';
    expect(attackAvailability(state)).toMatchObject({ enabled: false, targets: [] });
  });

  it('returns current legal previews unchanged on repeated reads after target cancellation', () => {
    const state = oneEnemy(flat());
    getUnit(state, 'ally-lise')!.pos = { x: 4, y: 5 };
    const before = structuredClone(state);
    const first = attackAvailability(state);
    expect(first).toEqual({ enabled: true, reason: '', targets: [{ targetId: 'enemy-melee-01', preview: attackPreview(state, 'ally-lise', 'enemy-melee-01') }] });
    // Opening/cancelling a target preview does not dispatch a domain command.
    expect(attackAvailability(state)).toEqual(first);
    expect(state).toEqual(before);
  });
});
