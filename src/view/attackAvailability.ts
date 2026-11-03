import { attackPreview, getUnit } from '../domain/engine';
import type { AttackPreview, BattleState } from '../domain/types';

export interface AvailableAttackTarget {
  targetId: string;
  preview: AttackPreview;
}

export interface AttackAvailability {
  enabled: boolean;
  /** Empty when enabled; suitable for the disabled button's adjacent explanation. */
  reason: string;
  targets: AvailableAttackTarget[];
}

/**
 * Player command availability, without changing battle state or caching a target.
 * attackPreview owns weapon/range/height/line-of-sight rules; the reducer owns
 * activation rules. Recompute after every render, move/undo and target cancel.
 * The caller separately gates transient UI states (dialogs/loading/animation).
 */
export function attackAvailability(state: BattleState): AttackAvailability {
  const unavailable = (reason: string): AttackAvailability => ({ enabled: false, reason, targets: [] });
  if (state.phase !== 'playing') return unavailable('戦闘は終了しています。');
  if (state.turn !== 'player') return unavailable('敵の手番です。');
  if (!state.activeId) return unavailable('先に行動する味方を選んでください。');
  const actor = getUnit(state, state.activeId);
  if (!actor || actor.hp <= 0 || actor.team !== 'player' || actor.acted) {
    return unavailable('未行動の味方を選んでください。');
  }
  if (actor.kind === 'escort') return unavailable('護送対象は攻撃できません。');
  if (state.activation.acted) return unavailable('この手番の行動は使用済みです。');
  const enemies = state.units.filter(unit => unit.team === 'enemy' && unit.hp > 0);
  const targets = enemies.map(unit => ({ targetId: unit.id, preview: attackPreview(state, actor.id, unit.id) }))
    .filter(target => target.preview.legal);
  if (targets.length) return { enabled: true, reason: '', targets };
  return unavailable(enemies.length === 0 ? '攻撃できる生存敵がいません。'
    : actor.weapon === 'bow' ? '弩の射程と射線を満たす敵がいません。'
      : '隣接・高さ差1以内に攻撃できる敵がいません。');
}
