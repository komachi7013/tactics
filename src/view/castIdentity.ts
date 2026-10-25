import type { Unit } from '../domain/types';

/** One identity contract shared by the board, inspection, and authored speakers. */
export const CAST_IDS = ['lise','garan','neia','sena','iva','dani','guard','archer','vesk','toma','worker','delegation'] as const;
export type CastId = typeof CAST_IDS[number];
const identities: Record<string, CastId> = {
  'ally-lise':'lise','ally-garan':'garan','ally-neia':'neia','ally-sena':'sena','ally-iva':'iva','ally-dani':'dani',
  'enemy-vesk':'vesk','escort-toma':'toma','escort-delegation':'delegation',
  'npc-worker':'worker','npc-worker-north':'worker','npc-worker-south':'worker',
};
export function castIdentity(unit: Pick<Unit,'id'|'weapon'>): CastId | undefined {
  return identities[unit.id] ?? (unit.id.startsWith('enemy-') ? unit.weapon === 'bow' ? 'archer' : 'guard' : undefined);
}
export function castPortraitPath(unit: Pick<Unit,'id'|'weapon'>): string | undefined {
  const id = castIdentity(unit);
  return id ? `/assets/motion-v1/portraits/${id}.png` : undefined;
}
