import type { BattleState } from '../domain/types';
import type { PresentationPlan } from './presentation';

/** Approved cardinal body actions, restricted to each actor’s standard role and weapon. */
export const ATTACK_BODIES = {
  'lise-melee-e': { actorId: 'ally-lise', role: '測量官', weapon: 'melee', direction: 'E', key: 'attack-lise-e', path: '/assets/attacks-v1/rise/attack-e.png', cell: 288, originY: 252 / 288, displaySize: 90, idleKey: 'cast-rise' },
  'neia-bow-e': { actorId: 'ally-neia', role: '水路斥候', weapon: 'bow', direction: 'E', key: 'attack-neia-e', path: '/assets/attacks-v1/neia/attack-e.png', cell: 288, originY: 274.19 / 288, displaySize: 90, idleKey: 'cast-neia' },
  'lise-melee-n': { actorId: 'ally-lise', role: '測量官', weapon: 'melee', direction: 'N', key: 'attack-lise-n', path: '/assets/attacks-v2/rise/attack-n.png', cell: 288, originY: 254 / 288, displaySize: 90, idleKey: 'cast-rise' },
  'lise-melee-s': { actorId: 'ally-lise', role: '測量官', weapon: 'melee', direction: 'S', key: 'attack-lise-s', path: '/assets/attacks-v2/rise/attack-s.png', cell: 288, originY: 254 / 288, displaySize: 90, idleKey: 'cast-rise' },
  'lise-melee-w': { actorId: 'ally-lise', role: '測量官', weapon: 'melee', direction: 'W', key: 'attack-lise-w', path: '/assets/attacks-v2/rise/attack-w.png', cell: 288, originY: 252 / 288, displaySize: 90, idleKey: 'cast-rise' },
  'neia-bow-n': { actorId: 'ally-neia', role: '水路斥候', weapon: 'bow', direction: 'N', key: 'attack-neia-n', path: '/assets/attacks-v2/neia/attack-n.png', cell: 288, originY: 272 / 288, displaySize: 90, idleKey: 'cast-neia' },
  'neia-bow-s': { actorId: 'ally-neia', role: '水路斥候', weapon: 'bow', direction: 'S', key: 'attack-neia-s', path: '/assets/attacks-v2/neia/attack-s.png', cell: 288, originY: 275 / 288, displaySize: 90, idleKey: 'cast-neia' },
  'neia-bow-w': { actorId: 'ally-neia', role: '水路斥候', weapon: 'bow', direction: 'W', key: 'attack-neia-w', path: '/assets/attacks-v2/neia/attack-w.png', cell: 288, originY: 272 / 288, displaySize: 90, idleKey: 'cast-neia' },
} as const;
export type AttackBodyId = keyof typeof ATTACK_BODIES;
export const DEDICATED_ATTACK_MS = 400;

/** Select once, before the gate starts, using committed positions and loaded view assets. */
export function withDedicatedAttack(plan: PresentationPlan | null, state: BattleState, ready: (id: AttackBodyId) => boolean): PresentationPlan | null {
  if (!plan?.attack) return plan;
  const actor = state.units.find(u => u.id === plan.attack!.actorId), target = plan.attack.targetBefore;
  if (!actor || actor.equipmentWeaponId) return plan; // Finite weapon silhouettes are not yet approved for dedicated bodies.
  const dx = target.pos.x - actor.pos.x, dy = target.pos.y - actor.pos.y;
  // Exact grid axes only: never approximate diagonals or a coincident target.
  const direction = dy === 0 && dx !== 0 ? dx > 0 ? 'E' : 'W' : dx === 0 && dy !== 0 ? dy > 0 ? 'S' : 'N' : null;
  if (!direction) return plan;
  const id = (Object.keys(ATTACK_BODIES) as AttackBodyId[]).find(id => {
    const body = ATTACK_BODIES[id];
    return body.direction === direction && actor.id === body.actorId && actor.role === body.role && actor.weapon === body.weapon && plan.attack!.weapon === body.weapon && ready(id);
  });
  if (!id) return plan;
  return { ...plan, attack: { ...plan.attack, bodyId: id }, attackDuration: DEDICATED_ATTACK_MS, durationMs: plan.moveDuration + DEDICATED_ATTACK_MS + (plan.afterMoveDuration ?? 0) };
}

export function dedicatedAttackFrame(progress: number | null): number | null {
  return progress === null || !Number.isFinite(progress) || progress < 0 || progress >= 1 ? null : Math.min(3, Math.floor(progress * 4));
}
