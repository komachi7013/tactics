import type { Facing, Pos } from './types';

export interface AttackDirection {
  sector: 'front' | 'side' | 'rear';
  hitChance: 90 | 95 | 100;
}
const forwardVectors: Record<Facing, Pos> = {
  N: { x: 0, y: -1 }, E: { x: 1, y: 0 },
  S: { x: 0, y: 1 }, W: { x: -1, y: 0 },
};
const validPos = (value: unknown): value is Pos => !!value && typeof value === 'object'
  && Number.isSafeInteger((value as Pos).x) && Number.isSafeInteger((value as Pos).y);

/** Direction relative to the defender in logical grid coordinates, never
 * projected screen coordinates. Exact front/rear diagonals belong to those
 * sectors. Teams and weapons do not change the classification.
 *
 * This is geometry only: it does not validate range, line of sight, occupancy,
 * height or attack eligibility. Reject invalid/coincident grid positions so a
 * caller cannot accidentally give an illegal attack a valid-looking chance.
 */
export function getAttackDirection(attacker: Pos, defender: Pos, defenderFacing: Facing): AttackDirection {
  if (!validPos(attacker) || !validPos(defender) || !(['N', 'E', 'S', 'W'] as unknown[]).includes(defenderFacing)) {
    throw new Error('攻撃方向には整数の論理座標と有効な対象の向きが必要です。');
  }
  const dx = attacker.x - defender.x, dy = attacker.y - defender.y;
  if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy) || (dx === 0 && dy === 0)) {
    throw new Error('同じセルまたは不正な相対位置から攻撃方向を求められません。');
  }
  const vector = forwardVectors[defenderFacing];
  const forward = dx * vector.x + dy * vector.y;
  const lateral = -dx * vector.y + dy * vector.x;
  if (forward >= Math.abs(lateral)) return { sector: 'front', hitChance: 90 };
  if (-forward >= Math.abs(lateral)) return { sector: 'rear', hitChance: 100 };
  return { sector: 'side', hitChance: 95 };
}
