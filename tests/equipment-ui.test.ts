import { describe, expect, it } from 'vitest';
import { BATTLE_IDS } from '../src/progression';
import { createJobs } from '../src/jobs';
import { createEquipment, equipItem, reconcileEquipmentJobs } from '../src/equipment';
import { createPartyBattle, createPreparedUnit } from '../src/party';
import { reduce } from '../src/domain/engine';
import { createPresentation } from '../src/view/presentation';
import { withDedicatedAttack } from '../src/view/dedicatedAttack';
import { equipmentCapText, equipmentCollectionRows, equipmentEffectText, equipmentOwner, equipmentSlotOptions } from '../src/view/equipmentView';

const completed = BATTLE_IDS.slice(0, 11);
describe('equipment preparation and acquisition views', () => {
  it('formats small bonuses, penalties and zero without hiding a penalty', () => {
    expect(equipmentEffectText({ hp: 0, atk: 0, def: 0 })).toBe('補正0');
    expect(equipmentEffectText({ hp: 3, atk: -1, def: -1 })).toBe('HP+3・攻撃−1・防御−1');
  });
  it('distinguishes uncollected, pending, won-unsaved and confirmed chest and clear events', () => {
    const equipment = createEquipment(); equipment.acquired = ['chest:B03'];
    const rows = equipmentCollectionRows(completed.slice(0, 3), equipment, ['clear:B01'], ['chest:B02']);
    expect(rows.find(row => row.event.id === 'chest:B01')!.status).toBe('未回収');
    expect(rows.find(row => row.event.id === 'chest:B02')!.status).toBe('仮回収・勝利で持帰り');
    expect(rows.find(row => row.event.id === 'chest:B03')!.status).toBe('勝利未保存');
    expect(rows.find(row => row.event.id === 'clear:B01')!.status).toBe('保存済み');
    expect(rows.find(row => row.event.id === 'clear:B02')!.status).toBe('勝利未保存');
    expect(rows.find(row => row.event.id === 'clear:B04')!.status).toBe('未達成');
    expect(equipmentCollectionRows(completed, equipment, ['chest:B03']).find(row => row.event.id === 'chest:B03')!.status).toBe('保存済み');
  });
  it('lists exactly the 22 finite events through B11, with no B12 prize or standard fallback counted', () => {
    const rows = equipmentCollectionRows([], createEquipment(), []);
    expect(rows).toHaveLength(22); expect(rows.filter(row => row.event.source === 'clear')).toHaveLength(11);
    expect(rows.every(row => row.event.battleId !== 'B12')).toBe(true);
  });
  it('reports the holder of a finite item and makes that exact instance unavailable to another person', () => {
    const jobs = createJobs(); let equipment = createEquipment(); equipment = equipItem(equipment, completed, jobs, 'ally-neia', 'head', 'clear:B01');
    expect(equipmentOwner(equipment, 'clear:B01')).toBe('ally-neia');
    const other = equipmentSlotOptions(equipment, completed, jobs, 'ally-lise', 'head').find(choice => choice.event.id === 'clear:B01')!;
    expect(other.disabled).toBe(true); expect(other.reason).toBe('他人物が装着中');
    expect(equipmentSlotOptions(equipment, completed, jobs, 'ally-neia', 'head').find(choice => choice.event.id === 'clear:B01')!.disabled).toBe(false);
    // B06 absence changes editing eligibility, never the shared owner visible in the list.
    expect(() => equipItem(equipment, completed, jobs, 'ally-neia', 'head', null, 'B06')).toThrow('離脱');
    expect(equipmentOwner(equipment, 'clear:B01')).toBe('ally-neia');
  });
  it('shows an owned incompatible weapon as unavailable while preserving its identity', () => {
    const equipment = createEquipment(); equipment.acquired = ['chest:B08']; const jobs = createJobs();
    const lise = equipmentSlotOptions(equipment, completed, jobs, 'ally-lise', 'weapon');
    expect(lise[0].event.id).toBe('chest:B08'); expect(lise[0].reason).toBe('主職不適合'); expect(lise[0].disabled).toBe(true);
    expect(equipmentSlotOptions(equipment, completed, jobs, 'ally-neia', 'weapon')[0].disabled).toBe(false);
  });
  it('provides cap-loss text consistent with the shared next-deployment factory, without mutating equipment', () => {
    const jobs = createJobs(); let equipment = createEquipment(); equipment.acquired = ['chest:B06'];
    equipment = equipItem(equipment, completed, jobs, 'ally-lise', 'head', 'chest:B06');
    equipment = equipItem(equipment, completed, jobs, 'ally-lise', 'body', 'clear:B05');
    const before = JSON.stringify(equipment), baseline = createPreparedUnit('ally-lise', jobs, 3), next = createPreparedUnit('ally-lise', jobs, 3, equipment);
    expect(equipmentCapText(equipment, 'ally-lise')).toContain('上限超過で非適用: 防御+1');
    expect(next.def).toBe(baseline.def + 2); expect(next.atk).toBe(baseline.atk - 2);
    equipmentSlotOptions(equipment, completed, jobs, 'ally-lise', 'body'); equipmentCollectionRows(completed, equipment, []);
    expect(JSON.stringify(equipment)).toBe(before);
  });
  it('prepares a weapon-return candidate atomically and leaves the original available for cancellation', () => {
    const jobs = createJobs(); let equipment = createEquipment(); equipment.acquired = ['chest:B08'];
    equipment = equipItem(equipment, completed, jobs, 'ally-neia', 'weapon', 'chest:B08');
    const before = JSON.stringify({ equipment, jobs }), changed = structuredClone(jobs); changed['ally-neia'].main = 'warden';
    const candidate = reconcileEquipmentJobs(equipment, changed);
    expect(candidate.loadouts['ally-neia'].weapon).toBeNull(); expect(equipment.loadouts['ally-neia'].weapon).toBe('chest:B08');
    expect(JSON.stringify({ equipment, jobs })).toBe(before);
  });
  it('keeps later-joined loadouts visible and legal while preparing an old battle', () => {
    const jobs = createJobs(); let equipment = createEquipment(); equipment = equipItem(equipment, completed, jobs, 'ally-dani', 'head', 'clear:B01', 'B01');
    expect(equipmentSlotOptions(equipment, completed, jobs, 'ally-dani', 'head').find(choice => choice.event.id === 'clear:B01')!.owner).toBe('ally-dani');
    expect(createPreparedUnit('ally-dani', jobs, 3, equipment).maxHp).toBe(createPreparedUnit('ally-dani', jobs, 3).maxHp + 1);
  });
  it.each([['ally-lise', 'chest:B04'], ['ally-neia', 'chest:B08']] as const)('uses generic animation for unreviewed finite weapon on %s, and retains the standard body', (id, event) => {
    const jobs = createJobs(); let equipment = createEquipment(); equipment.acquired = [event]; equipment = equipItem(equipment, completed, jobs, id, 'weapon', event);
    for (const finite of [false, true]) {
      let state = createPartyBattle('B08', ['ally-lise', 'ally-garan', 'ally-neia', 'ally-iva'], jobs, 3, finite ? { equipment } : undefined);
      const actor = state.units.find(unit => unit.id === id)!, target = state.units.find(unit => unit.team === 'enemy')!;
      actor.pos = { x: 2, y: 5 }; target.pos = { x: id === 'ally-lise' ? 3 : 4, y: 5 };
      state = reduce(state, { type: 'start', unitId: id }).state;
      const command = { type: 'attack' as const, targetId: target.id }, result = reduce(state, command);
      expect(result.error).toBeUndefined(); const plan = createPresentation(state, result.state, [command])!;
      const shown = withDedicatedAttack(plan, result.state, () => true)!;
      if (finite) { expect(shown).toBe(plan); expect(shown.attack?.bodyId).toBeUndefined(); }
      else expect(shown.attack?.bodyId).toBeDefined();
    }
  });
});
