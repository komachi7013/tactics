import { describe, expect, it } from 'vitest';
import { getAttackDirection } from '../src/domain/combatDirection';
import { attackPreview, createInitialState } from '../src/domain/engine';
import type { Facing, Pos, Team, Unit } from '../src/domain/types';

const facings: Facing[] = ['N', 'E', 'S', 'W'];
// Explicit logical-coordinate expectations, independent of isometric rendering.
const diagonals: Record<Facing, { front: Pos[]; rear: Pos[] }> = {
  N: { front: [{ x: -2, y: -2 }, { x: 2, y: -2 }], rear: [{ x: -2, y: 2 }, { x: 2, y: 2 }] },
  E: { front: [{ x: 2, y: -2 }, { x: 2, y: 2 }], rear: [{ x: -2, y: -2 }, { x: -2, y: 2 }] },
  S: { front: [{ x: -2, y: 2 }, { x: 2, y: 2 }], rear: [{ x: -2, y: -2 }, { x: 2, y: -2 }] },
  W: { front: [{ x: -2, y: -2 }, { x: -2, y: 2 }], rear: [{ x: 2, y: -2 }, { x: 2, y: 2 }] },
};
describe('defender-relative direction contract (not connected to runtime chance)', () => {
  it.each(facings)('includes both exact forward/rear diagonals for a %s-facing target', facing => {
    const defender = Object.freeze({ x: 4, y: 4 });
    for (const delta of diagonals[facing].front) expect(getAttackDirection({ x: 4 + delta.x, y: 4 + delta.y }, defender, facing)).toEqual({ sector: 'front', hitChance: 90 });
    for (const delta of diagonals[facing].rear) expect(getAttackDirection({ x: 4 + delta.x, y: 4 + delta.y }, defender, facing)).toEqual({ sector: 'rear', hitChance: 100 });
  });
  it('separates exact boundaries from either adjacent side and is translation/scale invariant', () => {
    const origin = Object.freeze({ x: 0, y: 0 });
    for (const x of [-1, 1]) {
      expect(getAttackDirection({ x, y: -2 }, origin, 'N')).toEqual({ sector: 'front', hitChance: 90 });
      expect(getAttackDirection({ x: 2 * x, y: -1 }, origin, 'N')).toEqual({ sector: 'side', hitChance: 95 });
      expect(getAttackDirection({ x: 2 * x, y: 0 }, origin, 'N')).toEqual({ sector: 'side', hitChance: 95 });
      expect(getAttackDirection({ x: 2 * x, y: 1 }, origin, 'N')).toEqual({ sector: 'side', hitChance: 95 });
      expect(getAttackDirection({ x, y: 2 }, origin, 'N')).toEqual({ sector: 'rear', hitChance: 100 });
    }
    expect(getAttackDirection({ x: -80, y: 120 }, { x: -100, y: 100 }, 'S')).toEqual({ sector: 'front', hitChance: 90 });
  });
  it.each(['player', 'enemy'] as Team[])('matches existing straight-adjacent melee rear +2 for %s attacks in all facings', team => {
    const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    for (const facing of facings) for (const offset of offsets) {
      const state = createInitialState('B01');
      state.cells = state.cells.map(cell => ({ ...cell, height: 0, blocked: false, water: false }));
      const attacker: Unit = { ...structuredClone(state.units[0]), id: 'attacker', team, pos: { x: 4 + offset.x, y: 4 + offset.y }, atk: 7, weapon: 'melee', surveyBonus: false };
      const target: Unit = { ...structuredClone(state.units[0]), id: 'target', team: team === 'player' ? 'enemy' : 'player', pos: { x: 4, y: 4 }, def: 1, facing, guard: false, protection: undefined };
      state.units = [attacker, target];
      const before = structuredClone(state), current = attackPreview(state, attacker.id, target.id);
      const direction = getAttackDirection(attacker.pos, target.pos, facing);
      expect(current.legal).toBe(true); expect(direction.sector === 'rear').toBe(current.rear);
      expect(current.damage).toBe(direction.sector === 'rear' ? 8 : 6);
      expect(state).toEqual(before);
    }
  });
  it.each(['player', 'enemy'] as Team[])('classifies legal diagonal bow attacks for %s without adding melee rear damage', team => {
    for (const facing of facings) for (const sector of ['front','rear'] as const) for (const delta of diagonals[facing][sector]) {
      const state = createInitialState('B01');
      state.cells = state.cells.map(cell => ({ ...cell, height: 0, blocked: false, water: false }));
      const attacker: Unit = { ...structuredClone(state.units[0]), id: 'attacker', team, pos: { x: 4 + delta.x, y: 4 + delta.y }, atk: 7, weapon: 'bow', surveyBonus: false };
      const target: Unit = { ...structuredClone(state.units[0]), id: 'target', team: team === 'player' ? 'enemy' : 'player', pos: { x: 4, y: 4 }, def: 1, facing, guard: false, protection: undefined };
      state.units = [attacker, target];
      expect(attackPreview(state, attacker.id, target.id)).toMatchObject({ legal: true, damage: 6, rear: false });
      expect(getAttackDirection(attacker.pos, target.pos, facing)).toEqual({ sector, hitChance: sector === 'front' ? 90 : 100 });
    }
  });
  it('rejects coincident, non-grid, non-finite and overflowing positions or invalid facings', () => {
    const target = { x: 0, y: 0 };
    for (const pos of [target, { x: NaN, y: 1 }, { x: Infinity, y: 1 }, { x: .5, y: 1 }, { x: '1', y: 1 }, null, {}]) {
      expect(() => getAttackDirection(pos as Pos, target, 'N')).toThrow();
    }
    expect(() => getAttackDirection({ x: 1, y: 0 }, { x: 0, y: NaN }, 'N')).toThrow();
    expect(() => getAttackDirection({ x: Number.MAX_SAFE_INTEGER, y: 0 }, { x: Number.MIN_SAFE_INTEGER, y: 0 }, 'N')).toThrow();
    for (const facing of ['NE', '__proto__', null]) expect(() => getAttackDirection({ x: 1, y: 0 }, target, facing as Facing)).toThrow();
  });
});
