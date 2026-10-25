import type { Unit } from './types';

/** Battle setup only: use grid Manhattan distance, then ordinal unit ID.
 * Axis ties follow the existing end-of-AI-turn convention (X before Y).
 * Never call during movement, rendering or save restoration.
 */
export function faceNearestOpponents(units: readonly Unit[]): Unit[] {
 return units.map(unit => {
  if (unit.hp <= 0) return unit;
  const opponents = units.filter(other => other.hp > 0 && other.team !== unit.team);
  const distance = (other: Unit) => Math.abs(other.pos.x-unit.pos.x)+Math.abs(other.pos.y-unit.pos.y);
  opponents.sort((a,b) => distance(a)-distance(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const target = opponents[0];
  if (!target) return unit;
  const dx=target.pos.x-unit.pos.x, dy=target.pos.y-unit.pos.y;
  if (dx === 0 && dy === 0) return unit;
  const facing = Math.abs(dx)>=Math.abs(dy) ? (dx>=0?'E':'W') : (dy>=0?'S':'N');
  return {...unit,facing};
 });
}
