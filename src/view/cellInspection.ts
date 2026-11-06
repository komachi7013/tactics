import { getCell, movementObjectBlocked, isMovementBlocked } from '../domain/engine';
import { getBattleConfig } from '../domain/battles';
import type { BattleId, BattleState, Pos } from '../domain/types';
import { MAP_OBJECT_ASSETS, mapObjectPlacements, mapObjectDisplayName } from './mapObjectAssets';

interface InspectionValue { label: string; value: string }
export interface CellInspection {
 title: string;
 category: string;
 image?: string;
 description?: string;
 values: InspectionValue[];
 /** Also used by the short selected-cell announcement. */
 lines: string[];
}
const RECORD_CONTENT: Partial<Record<BattleId, Record<string, string>>> = {
 B01: {
  A: 'トルネ渡し場の杭に残る水位痕を測った記録。実際に水が達した高さと、公図に記された高さが食い違っている。',
  B: '渡し場の別の杭に残された水位の記録。もう一方の記録と照らし合わせると、公図との食い違いが一か所だけの測り間違いではないと分かる。',
 },
 B02: { O: '旧セラ堤の高さを測った記録。渡し場で得た水位の記録と共に、公図と現場の食い違いを確かめる手がかりになる。' },
 B03: { M: '救護倉で手当を受けた負傷者と、捜されている家族の名を残した名簿の写し。' },
 B05: {
  D: '二年前の薄明放流を命じた文書。貯水池の危険を理由に、放流を行うよう指示されている。',
  T: '放流指令に添えられた時刻表。命令が出された時刻と、住民に警告が届いた時刻を確かめる手がかりになる。',
  S: '高低図の再認証に関わる署名の記録。放流の判断に使われた図を、誰が確かめたのかをたどる手がかりになる。',
  K: '補償の手続きに関わる住民の名簿。村に残る名簿や証言と照らし合わせ、被害を受けた人々を調べる手がかりになる。',
 },
 B08: { P: '補助堰と貯水池の傷みを記した保守記録。現在の水位痕と合わせると、首府を守るために必要な作業が見えてくる。' },
};

export function cellInspection(state: BattleState, pos: Pos): CellInspection {
 const cell = getCell(state, pos);
 if (!cell) return { title: 'マスを選択', category: '地形', values: [], lines: [] };
 const objects = mapObjectPlacements(state).filter(row => row.pos.x === pos.x && row.pos.y === pos.y);
 if (objects.length) {
  const record = objects.find(row => row.kind === 'record'), object = record ?? objects[0];
  const title = objects.map(mapObjectDisplayName).join(' ／ ');
  const description = record ? RECORD_CONTENT[state.battleId]?.[record.id.replace('record:', '')] : undefined;
  return { title, category: record ? '記録' : 'オブジェクト', image: MAP_OBJECT_ASSETS[object.asset].path,
   description, values: [], lines: description ? [description] : [] };
 }
 const gathering = getBattleConfig(state.battleId).records.find(row => row.x === pos.x && row.y === pos.y && !state.records.includes(row.id));
 if (gathering && ['repair', 'evacuate'].includes(getBattleConfig(state.battleId).objective ?? '')) {
  return { title: gathering.name, category: '救出対象', values: [], lines: [] };
 }
 const blocked = isMovementBlocked(cell) || movementObjectBlocked(state, pos);
 const terrain = cell.bridge ? '石橋' : cell.water ? '深水' : cell.shallow ? '浅瀬' : '乾地';
 const values = [
  { label: '高さ', value: `${cell.height}` }, { label: '移動', value: blocked ? '不可' : '可' },
  { label: '移動費', value: blocked ? '—' : cell.shallow ? '2' : '1' },
 ];
 return { title: `${terrain}の床`, category: '地形', values, lines: values.map(row => `${row.label} ${row.value}`) };
}

export function renderCellInspection(root: HTMLElement, state: BattleState, pos: Pos): void {
 const info = cellInspection(state, pos);
 delete root.dataset.team;
 const label = document.createElement('p'); label.className = 'inspection-label'; label.textContent = `⌖ ${info.category}`;
 const title = document.createElement('h2');
 if (info.image) {
  const face = document.createElement('span'); face.className = 'inspection-face inspection-object-image'; face.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img'); image.src = info.image; image.alt = ''; image.draggable = false;
  image.onerror = () => { face.hidden = true; };
  face.append(image); title.append(face);
 }
 const name = document.createElement('span'); name.className = 'inspection-heading-text'; name.textContent = info.title; title.append(name);
 const details = document.createElement('div'); details.className = 'stats cell-inspection-details';
 if (info.values.length) {
  const values = document.createElement('div'); values.className = 'notebook-stat-values';
  for (const row of info.values) {
   const item = document.createElement('div'), label = document.createElement('span'), value = document.createElement('b');
   label.textContent = row.label; value.textContent = row.value; item.append(label, value); values.append(item);
  }
  details.append(values);
 }
 if (info.description) { const description = document.createElement('p'); description.className = 'inspection-description'; description.textContent = info.description; details.append(description); }
 root.replaceChildren(label, title, details);
}
