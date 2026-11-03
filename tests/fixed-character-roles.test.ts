import { describe, expect, it, vi } from 'vitest';
import { createJobs, INITIAL_JOBS, applyJobs, applyCharacterRole, validJobs, type JobsState, type SkillId } from '../src/jobs';
import { BATTLE_IDS, CHARACTER_IDS, defaultParty, migrateLegacyGrowth, trainingPoints, validGrowth, type CharacterId } from '../src/progression';
import { createPreparedUnit, createPartyBattle } from '../src/party';
import { createEquipment, validEquipment, validLegacyEquipment, ownedEquipment, reconcileEquipmentRoles, applyEquipment } from '../src/equipment';
import { CAMPAIGN_KEY, createCampaign, completeBattle, readCampaign, writeCampaign, editPreparation, type Campaign } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import { equipmentSlotOptions } from '../src/view/equipmentView';
import type { BattleId } from '../src/domain/types';

function archivedPreparation() {
  const completed = BATTLE_IDS.slice(0, 6), growth = migrateLegacyGrowth(completed), jobs = createJobs();
  for (const id of CHARACTER_IDS) {
    growth.tutoring[id] += Math.max(0, 12 - trainingPoints(growth, id));
    jobs[id] = { main: INITIAL_JOBS[id] === 'warden' ? 'surveyor' : 'warden', learned: [`${INITIAL_JOBS[id]}-foundation` as SkillId], support: `${INITIAL_JOBS[id]}-foundation` as SkillId };
  }
  expect(validGrowth(growth, completed)).toBe(true); expect(validJobs(jobs, growth)).toBe(true);
  return { completed, growth, jobs };
}
const records: Record<BattleId, string[]> = { B01: ['A', 'B'], B02: ['O'], B03: ['M'], B04: ['C'], B05: ['D', 'T', 'S', 'K'], B06: ['W'], B07: ['V1', 'V2'], B08: ['P', 'C'], B09: ['J', 'H'], B10: ['C'], B11: ['W1', 'W2', 'A', 'B'], B12: ['U', 'V'] };
function through(count: number): Campaign {
  let campaign = createCampaign();
  for (const id of BATTLE_IDS.slice(0, count)) { const battle = createInitialState(id); battle.phase = 'won'; battle.records = records[id]; campaign = completeBattle(campaign, battle); }
  return campaign;
}
function memory(raw: string) {
  let value = raw;
  const storage = { getItem: vi.fn(() => value), setItem: vi.fn((_key: string, next: string) => { value = next; }), removeItem: vi.fn() };
  return { storage, raw: () => value };
}

describe('fixed character roles and archived preparation compatibility', () => {
  it.each(CHARACTER_IDS)('%s has the same initial capabilities with default, old transferred/support, or absent jobs', id => {
    const { jobs } = archivedPreparation(), before = structuredClone(jobs);
    const defaultUnit = createPreparedUnit(id, createJobs(), 3);
    expect(createPreparedUnit(id, jobs, 3)).toEqual(defaultUnit);
    expect(createPreparedUnit(id, undefined, 3)).toEqual(defaultUnit);
    expect(jobs).toEqual(before);
    const roleOnly = applyCharacterRole(createPreparedUnit(id, undefined, 1));
    expect(applyJobs(createPreparedUnit(id, undefined, 1), jobs)).toEqual(roleOnly);
  });

  it('retains distinct initial weapons, terrain cost, healing and innate commands', () => {
    const units = Object.fromEntries(CHARACTER_IDS.map(id => [id, createPreparedUnit(id, undefined, 1)])) as Record<CharacterId, ReturnType<typeof createPreparedUnit>>;
    expect(units['ally-lise']).toMatchObject({ role: '測量官', maxHp: 18, atk: 7, def: 1, jobCommand: 'survey', surveyCharges: 2 });
    expect(units['ally-garan']).toMatchObject({ role: '堤防衛士', maxHp: 24, atk: 7, def: 3, jobCommand: 'protect' });
    expect(units['ally-neia']).toMatchObject({ role: '水路斥候', weapon: 'bow', shallowCost: 1, maxHp: 16 });
    expect(units['ally-sena']).toMatchObject({ role: '救護師', maxHp: 16, atk: 4, healCharges: 2 });
    expect(units['ally-iva']).toMatchObject({ role: '水路保守係', maxHp: 20, jobCommand: 'plank', plankCharges: 2 });
    expect(units['ally-dani']).toMatchObject({ role: '記録官', maxHp: 18, atk: 5, jobCommand: 'readOrder', readCharges: 2 });
  });

  it('does not let archived main/support change fixed weapon suitability or equipment application', () => {
    const { completed, jobs } = archivedPreparation(), equipment = createEquipment(); equipment.acquired = ['chest:B04'];
    // A legitimate old Neia-as-warden close-combat allocation is readable history.
    equipment.loadouts['ally-neia'].weapon = 'chest:B04';
    expect(validLegacyEquipment(equipment, completed, jobs)).toBe(true);
    expect(validEquipment(equipment, completed, jobs)).toBe(false);
    const before = structuredClone(equipment), current = reconcileEquipmentRoles(equipment);
    expect(current.loadouts['ally-neia'].weapon).toBeNull();
    expect(current.acquired).toEqual(equipment.acquired); expect(ownedEquipment(completed, current.acquired)).toContainEqual(expect.objectContaining({ id: 'chest:B04' }));
    const options = equipmentSlotOptions(current, completed, jobs, 'ally-neia', 'weapon');
    expect(options.find(option => option.event.id === 'chest:B04')).toMatchObject({ disabled: true, reason: 'この人物は装備不可' });
    const standard = createPreparedUnit('ally-neia', undefined, 2);
    expect(createPreparedUnit('ally-neia', jobs, 2, equipment)).toEqual(standard);
    expect(applyEquipment(standard, equipment)).toEqual(standard);
    expect(equipment).toEqual(before);
  });

  it.each([2, 3, 4])('loads old v%s without writing, retains history and progress, and preserves returned weapon on the next save', version => {
    const old = through(6), archived = archivedPreparation();
    old.growth = archived.growth; old.jobs = archived.jobs;
    old.equipment!.acquired = ['chest:B04']; old.equipment!.loadouts['ally-neia'].weapon = 'chest:B04';
    const rawObject = { ...old, version } as Campaign;
    if (version === 2) delete rawObject.equipment;
    if (version !== 4) delete rawObject.combat;
    const raw = JSON.stringify(rawObject), m = memory(raw), loaded = readCampaign(m.storage);
    expect(loaded.writable).toBe(true); expect(m.raw()).toBe(raw); expect(m.storage.setItem).not.toHaveBeenCalled(); expect(m.storage.removeItem).not.toHaveBeenCalled();
    expect(loaded.campaign.jobs).toEqual(old.jobs); expect(loaded.campaign.growth).toEqual(old.growth); expect(loaded.campaign.evidence).toEqual(old.evidence);
    expect(loaded.campaign.completed).toEqual(old.completed); expect(loaded.campaign.parties).toEqual(old.parties);
    expect(loaded.warning).toContain('履歴として保持');
    if (version !== 2) { expect(loaded.campaign.equipment!.loadouts['ally-neia'].weapon).toBeNull(); expect(loaded.campaign.equipment!.acquired).toEqual(['chest:B04']); }
    const saved = writeCampaign(m.storage, loaded.campaign);
    expect(saved.ok).toBe(true); const reloaded = readCampaign(m.storage);
    expect(reloaded.writable).toBe(true); expect(reloaded.campaign.jobs).toEqual(old.jobs); expect(reloaded.campaign.growth).toEqual(old.growth);
    expect(reloaded.campaign.equipment!.loadouts['ally-neia'].weapon).toBeNull();
    if (version !== 2) expect(reloaded.campaign.equipment!.acquired).toEqual(['chest:B04']);
  });

  it('rejects new history edits while allowing equipment/party changes without consuming or converting training history', () => {
    const old = through(6), archived = archivedPreparation(); old.jobs = archived.jobs; old.growth = archived.growth;
    const m = memory(JSON.stringify(old)), current = readCampaign(m.storage).campaign, before = m.raw();
    const changedJobs = structuredClone(current.jobs!); changedJobs['ally-lise'] = createJobs()['ally-lise'];
    const changedGrowth = structuredClone(current.growth!); changedGrowth.tutoring['ally-dani'] = 0;
    expect(() => editPreparation(current, { jobs: changedJobs })).toThrow('履歴は変更できません');
    expect(() => editPreparation(current, { growth: changedGrowth })).toThrow('履歴は変更できません');
    const same = editPreparation(current, { jobs: structuredClone(current.jobs!), growth: structuredClone(current.growth!) });
    expect(writeCampaign(m.storage, same).ok).toBe(true);
    expect(readCampaign(m.storage).campaign.jobs).toEqual(old.jobs); expect(readCampaign(m.storage).campaign.growth).toEqual(old.growth);
    const fresh = readCampaign(m.storage).campaign; fresh.jobs = changedJobs;
    expect(writeCampaign(m.storage, fresh)).toMatchObject({ ok: false, error: expect.stringContaining('履歴は変更できない') });
    expect(JSON.parse(m.raw()).jobs).toEqual(JSON.parse(before).jobs);
  });

  it('does not extend old-save weapon acceptance into the current preparation edit API', () => {
    const old=through(6);old.jobs!['ally-neia'].main='warden';old.equipment!.acquired=['chest:B04'];
    const m=memory(JSON.stringify(old)),current=readCampaign(m.storage).campaign,invalid=structuredClone(current.equipment!);
    invalid.loadouts['ally-neia'].weapon='chest:B04';
    expect(validLegacyEquipment(invalid,current.completed,current.jobs!)).toBe(true);
    expect(()=>editPreparation(current,{equipment:invalid})).toThrow('装備できない武器');
    expect(current.equipment!.loadouts['ally-neia'].weapon).toBeNull();expect(m.storage.setItem).not.toHaveBeenCalled();
    expect(current.equipment!.acquired).toEqual(['chest:B04']);
  });

  it('keeps campaign deployment, enemies, objectives and level growth independent of archived roles', () => {
    const { jobs } = archivedPreparation();
    const current = createPartyBattle('B09', defaultParty('B09'), jobs, 3), standard = createPartyBattle('B09', defaultParty('B09'), createJobs(), 3);
    expect(current).toEqual(standard);
    const low = createPreparedUnit('ally-lise', jobs, 1), higher = createPreparedUnit('ally-lise', jobs, 3);
    expect(higher.maxHp - low.maxHp).toBe(4); expect(higher.atk - low.atk).toBe(2);
  });
});
