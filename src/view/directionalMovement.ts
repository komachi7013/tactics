import type { Facing, Pos } from '../domain/types';
import { presentationMoveTiming, type PresentationPlan } from './presentation';

/** Read-only visual facing for the active path segment; never changes combat state or save data. */
export function movementFacing(plan: PresentationPlan, unitId: string, elapsed: number): Facing | null {
  if (!Number.isFinite(elapsed)) return null;
  const move = plan.moves.find(m => m.unitId === unitId);
  if (!move || move.path.length < 2) return null;
  const {start,duration} = presentationMoveTiming(plan,move);
  if (duration <= 0 || elapsed < start || elapsed >= start + duration) return null;
  const index = Math.min(move.path.length - 2,Math.floor((elapsed-start)/duration*(move.path.length-1)));
  return cardinalSegment(move.path[index],move.path[index+1]);
}
export function cardinalSegment(from: Pos, to: Pos): Facing | null {
  const dx=to.x-from.x,dy=to.y-from.y;
  if (!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)+Math.abs(dy)!==1) return null;
  return dx===1?'E':dx===-1?'W':dy===1?'S':'N';
}
