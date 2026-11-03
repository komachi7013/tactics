import type { BattleState, Unit } from '../domain/types';
import { healPreview, jobCommandPreview } from '../domain/engine';
import { createInspectionFace } from './inspectionRoster';
import './attackTargets.css';

export type ActiveSkill = 'survey' | 'protect' | 'plank' | 'readOrder' | 'heal';
export const SKILL_EFFECTS: Record<ActiveSkill, { name: string; effect: string }> = {
  survey: { name: '測線', effect: '次の通常攻撃ダメージ＋2。距離1〜3・射線が必要。外れても消費。' },
  protect: { name: '護衛', effect: '次の被ダメージ−2。隣接・高さ差1以内。護衛者の次の行動開始か退避まで。防御と重複しません。' },
  plank: { name: '渡り板', effect: '次の移動だけ浅瀬の移動費1。隣接・高さ差1以内。乾地だけの移動でも消費。' },
  readOrder: { name: '読令', effect: '敵の移動先・経路・攻撃対象などの候補を表示。盤面全体から選択。対象の次の行動終了まで更新されます。' },
  heal: { name: '手当', effect: 'HPを6回復（最大HPまで）。隣接・高さ差1以内。護送対象にも使用できます。退避者の復帰はできません。' },
};
export function unitSkill(unit: Unit): ActiveSkill | undefined {
  return unit.jobCommand ?? (unit.healCharges !== undefined ? 'heal' : undefined);
}
export function skillUses(unit: Unit, skill: ActiveSkill): string {
  if (skill === 'protect') return '回数制限なし';
  const count = skill === 'heal' ? unit.healCharges : skill === 'survey' ? unit.surveyCharges : skill === 'plank' ? unit.plankCharges : unit.readCharges;
  return `残り${count ?? 0}回 / 1戦闘2回`;
}
export function skillTargetRows(state: BattleState, actor: Unit, skill: ActiveSkill) {
  return state.units.filter(unit => unit.team === (skill === 'readOrder' ? 'enemy' : 'player')).map(unit => {
    const preview = skill === 'heal' ? healPreview(state, actor.id, unit.id) : jobCommandPreview(state, actor.id, unit.id, skill);
    const ready = state.phase === 'playing' && state.turn === 'player' && state.activeId === actor.id && !actor.acted && !state.activation.acted;
    const legal = ready && preview.legal;
    const effect = skill === 'heal' ? `HP ${unit.hp} → ${Math.min(unit.maxHp, unit.hp + (skill === 'heal' ? healPreview(state, actor.id, unit.id).amount : 0))}`
      : skill === 'survey' ? '次の通常攻撃＋2' : skill === 'protect' ? '次の被ダメージ−2' : skill === 'plank' ? '次の移動・浅瀬費用1' : '現在盤面の行動候補を読む';
    return { unit, legal, detail: legal ? effect : !ready ? 'この手番の行動を使用できません' : preview.reason };
  });
}
/** Same portraits and card layout as attack selection; selecting only opens confirmation. */
export function createSkillTargets(state: BattleState, actor: Unit, skill: ActiveSkill, disabled: boolean, select: (id: string) => void): HTMLElement {
  const root = document.createElement('section'); root.className = 'attack-targets skill-targets'; root.dataset.skillTargets = '';
  root.setAttribute('role', 'group'); root.setAttribute('aria-label', `${SKILL_EFFECTS[skill].name}の対象`);
  const heading = document.createElement('p'); heading.className = 'attack-targets-reason';
  heading.textContent = `${SKILL_EFFECTS[skill].name}：${SKILL_EFFECTS[skill].effect} 1行動。${skillUses(actor, skill)}。顔を選んで効果を確認します。`;
  root.append(heading);
  const list = document.createElement('div'); list.className = 'attack-target-list';
  for (const { unit, legal, detail } of skillTargetRows(state, actor, skill)) {
    const card = document.createElement('div'); card.className = 'attack-target-card';
    const control = document.createElement('button'); control.type = 'button'; control.className = 'attack-target-button';
    control.dataset.focusKey = `skill:${skill}:${unit.id}`; control.disabled = disabled || !legal;
    control.setAttribute('aria-haspopup', 'dialog'); control.setAttribute('aria-label', `${unit.name}、${detail}`);
    const text = document.createElement('span'); text.className = 'attack-target-text';
    const name = document.createElement('strong'); name.className = 'attack-target-name'; name.textContent = unit.name;
    const effect = document.createElement('span'); effect.className = legal ? 'attack-target-damage' : 'attack-target-unavailable'; effect.textContent = detail;
    text.append(name, effect); control.append(createInspectionFace(unit), text);
    control.onclick = () => { if (!control.disabled) select(unit.id); };
    card.append(control); list.append(card);
  }
  root.append(list); return root;
}
