import type { BattleState, Facing } from '../domain/types';
import { castIdentity, type CastId } from './castIdentity';
import { CAST_IDLE } from './castMotion';
import type { PresentationPlan } from './presentation';

/** Approved cardinal body actions, restricted to each actor’s standard role and weapon. */
const ORIGINAL_ATTACK_BODIES = {
  'lise-melee-e': { actorId: 'ally-lise', role: '測量官', weapon: 'melee', direction: 'E', key: 'attack-lise-e', path: '/assets/characters/attacks/rise/attack-e.png', cell: 288, originY: 252 / 288, displaySize: 90, idleKey: 'cast-rise' },
  'neia-bow-e': { actorId: 'ally-neia', role: '水路斥候', weapon: 'bow', direction: 'E', key: 'attack-neia-e', path: '/assets/characters/attacks/neia/attack-e.png', cell: 288, originY: 274.19 / 288, displaySize: 90, idleKey: 'cast-neia' },
  'lise-melee-n': { actorId: 'ally-lise', role: '測量官', weapon: 'melee', direction: 'N', key: 'attack-lise-n', path: '/assets/characters/attacks/rise/attack-n.png', cell: 288, originY: 254 / 288, displaySize: 90, idleKey: 'cast-rise' },
  'lise-melee-s': { actorId: 'ally-lise', role: '測量官', weapon: 'melee', direction: 'S', key: 'attack-lise-s', path: '/assets/characters/attacks/rise/attack-s.png', cell: 288, originY: 254 / 288, displaySize: 90, idleKey: 'cast-rise' },
  'lise-melee-w': { actorId: 'ally-lise', role: '測量官', weapon: 'melee', direction: 'W', key: 'attack-lise-w', path: '/assets/characters/attacks/rise/attack-w.png', cell: 288, originY: 252 / 288, displaySize: 90, idleKey: 'cast-rise' },
  'neia-bow-n': { actorId: 'ally-neia', role: '水路斥候', weapon: 'bow', direction: 'N', key: 'attack-neia-n', path: '/assets/characters/attacks/neia/attack-n.png', cell: 288, originY: 272 / 288, displaySize: 90, idleKey: 'cast-neia' },
  'neia-bow-s': { actorId: 'ally-neia', role: '水路斥候', weapon: 'bow', direction: 'S', key: 'attack-neia-s', path: '/assets/characters/attacks/neia/attack-s.png', cell: 288, originY: 275 / 288, displaySize: 90, idleKey: 'cast-neia' },
  'neia-bow-w': { actorId: 'ally-neia', role: '水路斥候', weapon: 'bow', direction: 'W', key: 'attack-neia-w', path: '/assets/characters/attacks/neia/attack-w.png', cell: 288, originY: 272 / 288, displaySize: 90, idleKey: 'cast-neia' },
} as const;
const ATTACK_CAST = {
  garan: { role: '堤防衛士', weapon: 'melee' },
  sena: { role: '救護師', weapon: 'melee' },
  iva: { role: '水路保守係', weapon: 'melee' },
  dani: { role: '記録官', weapon: 'melee' },
  guard: { role: null, weapon: 'melee' },
  archer: { role: null, weapon: 'bow' },
  vesk: { role: null, weapon: 'melee' },
} as const satisfies Partial<Record<CastId, { role: string | null; weapon: 'melee' | 'bow' }>>;

type AttackCast = keyof typeof ATTACK_CAST;
type CastAttackId = `${AttackCast}-${'melee' | 'bow'}-${Lowercase<Facing>}`;
interface CastAttackBody {
  castId: AttackCast;
  role: string | null;
  weapon: 'melee' | 'bow';
  direction: Facing;
  key: string;
  path: string;
  cell: number;
  originY: number;
  referenceHeight: number;
  idleKey: string;
}

const directions = ['N', 'E', 'S', 'W'] as const;
const castBodies = Object.fromEntries((Object.keys(ATTACK_CAST) as AttackCast[]).flatMap(castId =>
  directions.map(direction => {
    const { role, weapon } = ATTACK_CAST[castId];
    const suffix = direction.toLowerCase();
    const id = `${castId}-${weapon}-${suffix}`;
    return [id, {
      castId, role, weapon, direction, key: 'attack-' + id,
      path: `/assets/characters/attacks/${castId}/attack-${suffix}.png`,
      cell: 288, originY: 252 / 288, referenceHeight: 179, idleKey: CAST_IDLE[castId][direction].key,
    } satisfies CastAttackBody] as const;
  }),
)) as Record<CastAttackId, CastAttackBody>;

export const ATTACK_BODIES = { ...ORIGINAL_ATTACK_BODIES, ...castBodies };
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
  const castId = castIdentity(actor);
  const id = (Object.keys(ATTACK_BODIES) as AttackBodyId[]).find(id => {
    const body = ATTACK_BODIES[id];
    const matchesActor = 'castId' in body
      ? castId === body.castId && (body.role === null ? actor.team === 'enemy' : actor.role === body.role)
      : actor.id === body.actorId && actor.role === body.role;
    return matchesActor && body.direction === direction && actor.weapon === body.weapon && plan.attack!.weapon === body.weapon && ready(id);
  });
  if (!id) return plan;
  return { ...plan, attack: { ...plan.attack, bodyId: id }, attackDuration: DEDICATED_ATTACK_MS, durationMs: plan.moveDuration + DEDICATED_ATTACK_MS + (plan.afterMoveDuration ?? 0) };
}

export function dedicatedAttackFrame(progress: number | null): number | null {
  return progress === null || !Number.isFinite(progress) || progress < 0 || progress >= 1 ? null : Math.min(3, Math.floor(progress * 4));
}
