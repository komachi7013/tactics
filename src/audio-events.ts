import type { BattleState, Command } from './domain/types';
import type { SoundId } from './audio-cues';
import { committedAttackResolution } from './view/presentation';

/** Audio follows committed state changes; it never decides a battle outcome. */
export function soundForTransition(before: BattleState, after: BattleState, command?: Command): SoundId | null {
  if (before === after || before.phase !== 'playing') return null;
  if (after.phase === 'won') return 'se-victory';
  if (after.phase === 'lost') return 'se-defeat';
  const result = committedAttackResolution(before, after, command?.type === 'attack' ? before.activeId ?? undefined : undefined, command?.type === 'attack' ? command.targetId : undefined);
  // A miss has visible/logged feedback but no impact sound or newly invented cue.
  if (result?.hit && result.damage > 0) return 'se-impact';
  if (command?.type === 'attack' && (before.combatRandom || after.combatRandom)) return null;
  if (!before.combatRandom && !after.combatRandom && after.units.some(u => u.hp < (before.units.find(old => old.id === u.id)?.hp ?? u.hp))) return 'se-impact';
  if (after.units.some(u => u.hp > (before.units.find(old => old.id === u.id)?.hp ?? u.hp))) return 'se-heal';
  if (after.records.some(id => !before.records.includes(id))) return 'se-record';
  if (command?.type === 'gate' || command?.type === 'repair') return 'se-mechanism';
  if (command?.type === 'undoMove') return 'se-ui';
  if (after.units.some(u => {
    const old = before.units.find(candidate => candidate.id === u.id);
    return u.hp > 0 && old && (u.pos.x !== old.pos.x || u.pos.y !== old.pos.y);
  })) return 'se-move';
  if (before.gate.drained !== after.gate.drained
    || Object.keys(after.sluices ?? {}).some(id => before.sluices?.[id]?.drained !== after.sluices?.[id]?.drained)
    || Object.keys(after.repairs ?? {}).some(id => before.repairs?.[id]?.completed !== after.repairs?.[id]?.completed)) return 'se-mechanism';
  if (command && ['start', 'defend', 'end'].includes(command.type)) return 'se-ui';
  return null;
}
