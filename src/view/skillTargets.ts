import type { BattleState, Unit } from '../domain/types';
import { healPreview, jobCommandPreview } from '../domain/engine';
import { createInspectionFace } from './inspectionRoster';
import './attackTargets.css';

export type ActiveSkill = 'survey' | 'protect' | 'plank' | 'readOrder' | 'heal';
export const SKILL_EFFECTS: Record<ActiveSkill, { name: string; effect: string }> = {
  survey: { name: '測線', effect: '仲間の次の攻撃を強くします。離れすぎていたり、間に障害物があったりすると使えません。' },
  protect: { name: '護衛', effect: 'すぐ隣の仲間を守り、次に受けるダメージを減らします。' },
  plank: { name: '渡り板', effect: 'すぐ隣の仲間に渡り板を渡し、次の移動で水の浅い場所を歩きやすくします。' },
  readOrder: { name: '読令', effect: '敵が向かう場所や、狙っている相手を読みます。' },
  heal: { name: '手当', effect: 'すぐ隣の仲間のHPを6回復します。護送している人も手当できます。' },
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
  return state.units.filter(unit => unit.team === (skill === 'readOrder' ? 'enemy' : 'player') && (skill !== 'heal' || unit.id !== actor.id)).map(unit => {
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
  heading.textContent = `${SKILL_EFFECTS[skill].name}の対象`;
  root.append(heading);
  const list = document.createElement('div'); list.className = 'attack-target-list';
  for (const { unit, legal, detail } of skillTargetRows(state, actor, skill)) {
    const card = document.createElement('div'); card.className = 'attack-target-card';
    const control = document.createElement('button'); control.type = 'button'; control.className = 'attack-target-button';
    control.dataset.focusKey = `skill:${skill}:${unit.id}`; control.disabled = disabled || !legal;
    control.setAttribute('aria-haspopup', 'dialog'); control.setAttribute('aria-label', `${unit.name}、${detail}`);
    const text = document.createElement('span'); text.className = 'attack-target-text';
    const name = document.createElement('strong'); name.className = 'attack-target-name'; name.textContent = unit.name;
    const effect = document.createElement('span'); effect.className = legal ? 'attack-target-damage' : 'attack-target-unavailable'; effect.textContent = legal ? detail : '';
    text.append(name, effect); control.append(createInspectionFace(unit), text);
    control.onclick = () => { if (!control.disabled) select(unit.id); };
    card.append(control); list.append(card);
  }
  root.append(list); return root;
}
