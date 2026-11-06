import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, getUnit } from '../src/domain/engine';
import { createPartyBattle } from '../src/party';
import { defaultParty } from '../src/progression';
import { getBattleConfig } from '../src/domain/battles';
import { cellInspection, renderCellInspection } from '../src/view/cellInspection';
import { renderUnitInspection } from '../src/view/unitInspection';
import { MAP_OBJECT_ASSETS } from '../src/view/mapObjectAssets';
import { InspectionDocument } from './helpers/inspectionDom';

afterEach(() => vi.unstubAllGlobals());
function setup() { const doc = new InspectionDocument(); vi.stubGlobal('document', doc); return doc.createElement('section'); }

describe('selected terrain and object cards', () => {
 it('shows terrain attributes in the same stat layout as people, without coordinates or instructions', () => {
  const root = setup(), state = createInitialState(), before = structuredClone(state);
  renderCellInspection(root as unknown as HTMLElement, state, { x: 0, y: 4 });
  expect(root.all().find(node => node.className === 'notebook-stat-values')?.textContent).toBe('高さ0移動可移動費1');
  expect(root.textContent).not.toMatch(/座標|\(0,\s*4\)|H0|すぐ隣|マーカー/);
  expect(state).toEqual(before);
 });
 it.each(['equipment', 'gate', 'exit'] as const)('shows only the %s name and existing illustration', kind => {
  const root = setup(), state = createPartyBattle('B01', defaultParty('B01'));
  const pos = kind === 'equipment' ? state.equipmentChests![0].pos : kind === 'gate' ? getBattleConfig('B01').gate! : getBattleConfig('B01').exit;
  const info = cellInspection(state, pos);
  renderCellInspection(root as unknown as HTMLElement, state, pos);
  expect(root.textContent).toBe('⌖ オブジェクト' + info.title);
  expect(info.values).toEqual([]); expect(info.description).toBeUndefined();
  expect(root.all().find(node => node.tagName === 'IMG')?.src).toBe(MAP_OBJECT_ASSETS[kind === 'gate' ? 'valve' : kind].path);
  expect(info.title).toBe(kind === 'equipment' ? '宝箱' : kind === 'gate' ? '水門弁' : 'リセの脱出地点');
 });
 it('describes what the two water records establish, without revealing later events or gameplay help', () => {
  const state = createInitialState();
  for (const record of getBattleConfig('B01').records) {
   const root = setup(); renderCellInspection(root as unknown as HTMLElement, state, record);
   expect(root.textContent).toContain('公図'); expect(root.textContent).toContain('記録');
   expect(root.textContent).not.toMatch(/すぐ隣|採取.*選|調べ終え|マーカー|署名|ヴェスク|座標/);
   expect(root.all().some(node => node.tagName === 'IMG')).toBe(true);
  }
 });
 it('keeps the name and description if the decorative object image fails', () => {
  const root = setup(), state = createInitialState(); renderCellInspection(root as unknown as HTMLElement, state, getBattleConfig('B01').records[0]);
  root.all().find(node => node.tagName === 'IMG')!.onerror!();
  expect(root.textContent).toContain('水位記録'); expect(root.textContent).toContain('公図');
 });
});

describe('person details without duplicate stats', () => {
 it.each(['ally-lise', 'enemy-melee-01'])('shows %s movement and facing once; enemies have no action-status label', id => {
  const root = setup(), state = createInitialState(), unit = getUnit(state, id)!;
  renderUnitInspection(root as unknown as HTMLElement, state, unit, '中央警備隊');
  expect(root.all().filter(node => node.tagName === 'SPAN' && node.textContent === '移動')).toHaveLength(1);
  expect(root.all().filter(node => node.tagName === 'SPAN' && node.textContent.startsWith('向き '))).toHaveLength(1);
  expect(root.textContent.includes('未行動')).toBe(unit.team === 'player');
  expect(root.all().find(node => node.className === 'notebook-inspection-hp')?.textContent).toBe(`HP ${unit.hp}/${unit.maxHp}`);
 });
});
