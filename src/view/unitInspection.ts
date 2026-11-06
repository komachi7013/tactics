import { effectiveShallowCost, getUnit } from '../domain/engine';
import type { BattleState, Unit } from '../domain/types';
import { createInspectionFace, inspectionUnitStatus } from './inspectionRoster';

/** Each statistic appears once; enemies do not expose player action availability. */
export function renderUnitInspection(root: HTMLElement, state: BattleState, unit: Unit, enemyForce: string): void {
 root.dataset.team = unit.team;
 const label = document.createElement('p'); label.className = 'inspection-label'; label.textContent = `⌖ 閲覧中の${unit.team === 'player' ? '味方' : '敵'}`;
 const title = document.createElement('h2'), text = document.createElement('span'); text.className = 'inspection-heading-text';
 const name = document.createElement('span'); name.textContent = unit.name;
 const role = document.createElement('small'); role.textContent = `${unit.role} / ${unit.team === 'player' ? '流域調査隊' : enemyForce}`;
 text.append(name, role); title.append(createInspectionFace(unit), text);
 const stats = document.createElement('div'); stats.className = 'stats';
 const hp = document.createElement('span'); hp.className = 'notebook-inspection-hp'; hp.textContent = 'HP ';
 const hpValue = document.createElement('b'); hpValue.textContent = `${unit.hp}/${unit.maxHp}`; hp.append(hpValue);
 const meter = document.createElement('div'); meter.className = 'notebook-hp-meter';
 meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-label', `${unit.name}の現在HP`);
 meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', String(unit.maxHp)); meter.setAttribute('aria-valuenow', String(unit.hp));
 const fill = document.createElement('i'); fill.style.width = `${Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100))}%`; meter.append(fill);
 const values = document.createElement('div'); values.className = 'notebook-stat-values';
 for (const [label, value] of [['攻撃', unit.atk], ['防御', unit.def], ['移動', unit.move]] as const) {
  const item = document.createElement('div'), caption = document.createElement('span'), number = document.createElement('b');
  caption.textContent = label; number.textContent = String(value); item.append(caption, number); values.append(item);
 }
 stats.append(hp, meter);
 if (unit.team === 'player' || unit.hp <= 0) {
  const condition = document.createElement('p'); condition.className = 'inspection-condition'; condition.textContent = inspectionUnitStatus(unit); stats.append(condition);
 }
 const details = document.createElement('div'); details.className = 'inspection-details';
 const metadata = document.createElement('div'); metadata.className = 'notebook-inspection-meta';
 const rows = [`向き ${unit.facing}`, `武器 ${unit.weapon === 'bow' ? '弩' : '近接'}`, `浅瀬の移動費 ${effectiveShallowCost(unit)}`];
 if (unit.guard) rows.push('防御中');
 if (unit.protection) rows.push(`護衛中：${getUnit(state, unit.protection.sourceId)?.name ?? '味方'}`);
 if (unit.surveyBonus) rows.push('測線：次の通常攻撃 +2');
 if (unit.plankReady) rows.push('渡り板：次の移動は浅瀬の移動費1');
 if (unit.jobCommand === 'readOrder') rows.push(`読令 ${unit.readCharges ?? 0}/2 回`);
 if (unit.jobCommand === 'survey') rows.push(`測線 ${unit.surveyCharges ?? 0}/2 回`);
 if (unit.jobCommand === 'protect') rows.push('固有技：護衛');
 if (unit.jobCommand === 'plank') rows.push(`渡り板 ${unit.plankCharges ?? 0}/2 回`);
 if (unit.healCharges !== undefined) rows.push(`手当 ${unit.healCharges}/2 回`);
 for (const text of rows) { const row = document.createElement('span'); row.textContent = text; metadata.append(row); }
 details.append(values, metadata); stats.append(details); root.replaceChildren(label, title, stats);
}
