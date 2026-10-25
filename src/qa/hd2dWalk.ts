import type { PresentationPlan } from '../view/presentation';

/** User-saved local six-frame GIF trial; file QC verified, gait NOT accepted. */
export const HD2D_WALK = {
  key: 'qa-lise-user-gif-east', path: '/assets/qa/lise-user-gif-local-20261023/lise-user-gif-east.png',
  sha256: 'da121cb105d965bbc0b260f9fffd0370ea60720f66f3c74b3ecc627c1bdbae2d',
  cell: 128, frames: 6, frameMs: 140, originX: 64 / 128, originY: 120 / 128,
} as const;
export interface WalkQaCandidate { verified: true; visibleHeight: number; mode?: 'continuous' }
// Local image bytes and bounds inspected. This flag does not certify anatomical gait quality.
export const VERIFIED_HD2D_CANDIDATE: WalkQaCandidate | null = { verified: true, visibleHeight: 108 };

export function hd2dWalkTrial(dev: boolean, qaSession: string | null, search: string,
  candidate: WalkQaCandidate | null = VERIFIED_HD2D_CANDIDATE): WalkQaCandidate | null {
  const query = new URLSearchParams(search);
  const configured=query.get('qaWalkMode')==='continuous'?{...candidate,mode:'continuous'} as WalkQaCandidate:candidate;
  return dev && qaSession !== null && /^[a-z0-9][a-z0-9-]{7,63}$/.test(qaSession)
    && query.getAll('qaSession').length === 1 && query.get('qaSession') === qaSession
    && query.getAll('qaWalk').length === 1 && query.get('qaWalk') === 'lise-user-gif-local-20261023'
    && candidate?.verified === true && Number.isFinite(candidate.visibleHeight)
    && candidate.visibleHeight > 0 && candidate.visibleHeight <= HD2D_WALK.cell ? configured : null;
}

/** Original 140ms frames, original move duration; exact +x grid segments only. */
export function hd2dWalkFrame(plan: PresentationPlan, unitId: string, elapsed: number): number | null {
  if (unitId !== 'ally-lise' || !Number.isFinite(elapsed)) return null;
  const move = plan.moves.find(m => m.unitId === unitId);
  if (!move || move.path.length < 2) return null;
  const start = move.afterAttack ? plan.moveDuration + plan.attackDuration : 0;
  const duration = move.afterAttack ? plan.afterMoveDuration ?? 0 : plan.moveDuration;
  if (duration <= 0 || elapsed < start || elapsed >= start + duration) return null;
  const segment = Math.floor((elapsed - start) / duration * (move.path.length - 1));
  const from = move.path[segment], to = move.path[segment + 1];
  if (to.x - from.x !== 1 || to.y !== from.y) return null;
  return Math.floor((elapsed - start) / HD2D_WALK.frameMs) % HD2D_WALK.frames;
}
