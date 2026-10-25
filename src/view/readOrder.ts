import type { BattleState, Pos } from '../domain/types';
import type { EnemyIntent } from '../domain/ai';
import { attackPreview } from '../domain/engine';

export interface ReadOrderRow { id: string; name: string; detail: string; relation: string; signature: string }
export interface ReadOrderSnapshot { byActor: Record<string, EnemyIntent>; next: EnemyIntent | undefined }
const coordinate = (pos: Pos) => `(${pos.x},${pos.y})`;
/** Formats only marked enemies; never exposes the identity or plan of an unread enemy. */
export function readOrderRows(state: BattleState, snapshot: ReadOrderSnapshot): ReadOrderRow[] {
  return (state.readOrders ?? []).flatMap(id => {
    const actor = state.units.find(u => u.id === id && u.team === 'enemy' && u.hp > 0);
    if (!actor) return [];
    const intent = snapshot.byActor[id];
    const relation = actor.acted ? '今R行動済・全体選出対象外（次R以降の仮候補）'
      : snapshot.next?.actorId === id ? '今敵が応手するなら、この敵が選出候補'
      : snapshot.next ? '今の全体評価では別の敵が先候補' : '現在の全体評価に選出候補なし';
    let detail = '現在の盤面に合法な候補なし';
    if (intent) {
      const route = intent.path.map(coordinate).join(' → ');
      const movement = intent.moveCost > 0 ? `${coordinate(intent.destination)}へ移動（費用${intent.moveCost}）` : `${coordinate(intent.destination)}で移動なし`;
      const target = state.units.find(u => u.id === intent.targetId);
      let action = intent.action === 'attack' ? `${target?.name ?? '対象不明'}を攻撃・現在の予測 ${intent.damage ?? 0} ダメージ` : '防御';
      if (state.combatRandom && intent.action === 'attack' && target) {
        const projected = { ...state, units: state.units.map(unit => unit.id === id ? { ...unit, pos: { ...intent.destination } } : unit) };
        const preview = attackPreview(projected, id, target.id);
        action = preview.legal ? `${target.name}を攻撃・命中率${preview.hitChance}%・命中時${preview.damage}ダメージ（外れ時0）` : `${target.name}への攻撃条件が変化: ${preview.reason}`;
      }
      detail = `${movement} → ${action}。経路: ${route || coordinate(actor.pos)}`;
    }
    return [{ id, name: actor.name, detail, relation, signature: JSON.stringify([detail, relation]) }];
  });
}
/** Suspended renders do not replace the last settled candidate or trigger repeated announcements. */
export class ReadOrderUpdates {
  private previous = new Map<string, string>();
  private revision = 0;
  observe(rows: readonly ReadOrderRow[]): string {
    const changed = rows.filter(row => this.previous.has(row.id) && this.previous.get(row.id) !== row.signature);
    this.previous = new Map(rows.map(row => [row.id, row.signature]));
    return changed.length ? `読令の候補更新 ${++this.revision}: ${changed.map(row => row.name).join('・')}` : '';
  }
  clear(): void { this.previous.clear(); this.revision = 0; }
}
