import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, editPreparation, getConfirmedEquipmentEvents, readCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import { createBattleRandom, createCombatRandomConfig, nextCombatRoll } from '../src/domain/combatRandom';
import type { BattleId } from '../src/domain/types';
import { BATTLE_IDS, tutor } from '../src/progression';
import { equipItem } from '../src/equipment';
import { equipSupport, learnSkill, setMainJob } from '../src/jobs';

const records: Record<BattleId, string[]> = { B01: ['A','B'], B02: ['O'], B03: ['M'], B04: ['C'], B05: ['D','T','S','K'], B06: ['W'], B07: ['V1','V2'], B08: ['P','C'], B09: ['J','H'], B10: ['C'], B11: ['W1','W2','A','B'], B12: ['U','V'] };
function memory() {
  const data = new Map<string, string>(); let fail = false;
  const storage: StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, raw) => { if (fail) throw Error('quota'); data.set(key, raw); }, removeItem: key => { data.delete(key); } };
  return { data, storage, fail: (value = true) => { fail = value; } };
}
// Synthetic victories exercise checkpoint contracts, not route/playtest acceptance.
function win(c: Campaign, id: BattleId, chest?: string) {
  const battle = createInitialState(id); battle.phase = 'won'; battle.records = records[id];
  if (chest) battle.pendingEquipment = [chest];
  return completeBattle(c, battle);
}
function through(count: number) { let c = createCampaign(); for (const id of BATTLE_IDS.slice(0, count)) c = win(c, id); return c; }
function legacy(c: Campaign, version: 1 | 2 | 3) {
  const { combat: _, ...base } = structuredClone(c);
  if (version === 3) return { ...base, version };
  const { equipment: _equipment, ...v2 } = base;
  if (version === 2) return { ...v2, version };
  return { version, unlocked: c.unlocked, completed: c.completed, currentBattle: c.currentBattle, evidence: c.evidence };
}
function rolls(c: Campaign) {
  let random = createBattleRandom(c.combat!, 'B04');
  return Array.from({ length: 16 }, () => { const next = nextCombatRoll(random); random = next.random; return next.roll; });
}

describe('Campaign v4 combat root and existing inventory/save boundaries', () => {
  it('uses the same deterministic root for fresh campaigns without attempting storage', () => {
    expect(createCampaign()).toMatchObject({ version: 4, combat: createCombatRandomConfig() });
    expect(rolls(createCampaign())).toEqual(rolls(createCampaign()));
  });
  it.each([1, 2, 3] as const)('reads v%s without writing, preserves completion/K/ending, then explicitly writes v4', version => {
    const m = memory(), original = through(12), raw = JSON.stringify(legacy(original, version)); m.data.set(CAMPAIGN_KEY, raw);
    const read = readCampaign(m.storage);
    expect(read.writable).toBe(true); expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(read.campaign).toMatchObject({ version: 4, completed: BATTLE_IDS, combat: createCombatRandomConfig() });
    expect(read.campaign.evidence).toContain('B05:K'); expect(read.campaign.evidence).toContain('B12:V');
    expect(getConfirmedEquipmentEvents(read.campaign)).toHaveLength(11);
    expect(writeCampaign(m.storage, read.campaign).ok).toBe(true);
    expect(JSON.parse(m.data.get(CAMPAIGN_KEY)!)).toMatchObject({ version: 4, combat: original.combat });
    expect(rolls(readCampaign(m.storage).campaign)).toEqual(rolls(read.campaign));
  });
  it('preserves nondefault v3 jobs/support/growth/party/acquired equipment and loadouts through every transition', () => {
    const m = memory(); let c = win(through(8), 'B08', 'chest:B08');
    const growth = tutor(c.growth!, 'ally-dani', c.completed);
    let jobs = learnSkill(c.jobs!, growth, 'ally-lise', 'surveyor-foundation', 'B09');
    jobs = setMainJob(jobs, 'ally-lise', 'warden', 'B09'); jobs = equipSupport(jobs, 'ally-lise', 'surveyor-foundation');
    c = editPreparation(c, { growth, jobs, parties: { B05: ['ally-lise','ally-garan','ally-iva','ally-dani'] }, equipment: equipItem(c.equipment!, c.completed, jobs, 'ally-neia', 'weapon', 'chest:B08') });
    const raw = JSON.stringify(legacy(c, 3)); m.data.set(CAMPAIGN_KEY, raw);
    const migrated = readCampaign(m.storage).campaign;
    for (const key of ['growth','jobs','parties','equipment'] as const) expect(migrated[key]).toEqual(c[key]);
    const selected = selectBattle(migrated, 'B09');
    const edited = editPreparation(selected, {});
    const won = win(edited, 'B09');
    expect(won.combat).toEqual(migrated.combat); expect(won.equipment).toEqual(c.equipment);
    expect(writeCampaign(m.storage, won).ok).toBe(true);
    const again = readCampaign(m.storage).campaign;
    expect(again.jobs).toEqual(c.jobs); expect(again.parties).toEqual(c.parties); expect(again.equipment).toEqual(c.equipment);
  });
  it('keeps the fallback series after quota failure, progress changes, successful recovery, and reload', () => {
    const m = memory(); m.data.set(CAMPAIGN_KEY, JSON.stringify(legacy(through(3), 3)));
    let c = readCampaign(m.storage).campaign; const expected = rolls(c), raw = m.data.get(CAMPAIGN_KEY);
    m.fail(); c = win(c, 'B04', 'chest:B04');
    expect(writeCampaign(m.storage, c).ok).toBe(false); expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(rolls(readCampaign(m.storage).campaign)).toEqual(expected); expect(rolls(c)).toEqual(expected);
    m.fail(false); const saved = writeCampaign(m.storage, c); expect(saved.ok).toBe(true);
    expect(getConfirmedEquipmentEvents(c)).toContain('chest:B04');
    expect(rolls(saved.campaign!)).toEqual(expected); expect(rolls(readCampaign(m.storage).campaign)).toEqual(expected);
    expect(selectBattle(saved.campaign!, 'B01').combat).toEqual(c.combat);
  });
  it('preserves a valid nondefault saved root and refuses changing it even through inherited state', () => {
    const m = memory(), fixture = { ...through(3), combat: { version: 1, rootSeed: 0 } }; m.data.set(CAMPAIGN_KEY, JSON.stringify(fixture));
    const c = readCampaign(m.storage).campaign;
    expect(c.combat!.rootSeed).toBe(0); expect(writeCampaign(m.storage, c).ok).toBe(true);
    expect(writeCampaign(m.storage, structuredClone(c)).ok).toBe(true);
    const raw = m.data.get(CAMPAIGN_KEY); c.combat!.rootSeed = 99;
    expect(writeCampaign(m.storage, win(c, 'B04')).ok).toBe(false); expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
  });
  it('rejects a stale tab root mismatch without overwriting storage or losing external progress', () => {
    const m = memory(); writeCampaign(m.storage, through(3));
    const stale = readCampaign(m.storage).campaign;
    const external = { ...through(4), combat: { version: 1, rootSeed: 123 } }; const raw = JSON.stringify(external); m.data.set(CAMPAIGN_KEY, raw);
    expect(writeCampaign(m.storage, win(stale, 'B04', 'chest:B04')).ok).toBe(false); expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(readCampaign(m.storage).campaign.completed).toContain('B04');
  });
  it('still unions acquired events and rejects conflicting whole-party allocations across tabs', () => {
    const m = memory(); writeCampaign(m.storage, through(6));
    const a = readCampaign(m.storage).campaign, b = readCampaign(m.storage).campaign;
    expect(writeCampaign(m.storage, win(a, 'B04', 'chest:B04')).ok).toBe(true);
    expect(writeCampaign(m.storage, win(b, 'B05', 'chest:B05')).campaign!.equipment!.acquired).toEqual(['chest:B04','chest:B05']);
    const x = readCampaign(m.storage).campaign, y = readCampaign(m.storage).campaign;
    expect(writeCampaign(m.storage, editPreparation(x, { equipment: equipItem(x.equipment!, x.completed, x.jobs!, 'ally-lise', 'head', 'clear:B01') })).ok).toBe(true);
    const raw = m.data.get(CAMPAIGN_KEY);
    expect(writeCampaign(m.storage, editPreparation(y, { equipment: equipItem(y.equipment!, y.completed, y.jobs!, 'ally-garan', 'head', 'clear:B01') })).ok).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
  });
  it.each(['missing','unknown','bad-version','negative','fractional','overflow','future','legacy-extra'] as const)('preserves invalid %s raw and refuses implicit overwrite', kind => {
    const m = memory(), bad: any = through(4);
    if (kind === 'missing') delete bad.combat;
    if (kind === 'unknown') bad.combat.future = 'keep';
    if (kind === 'bad-version') bad.combat.version = 2;
    if (kind === 'negative') bad.combat.rootSeed = -1;
    if (kind === 'fractional') bad.combat.rootSeed = .5;
    if (kind === 'overflow') bad.combat.rootSeed = 0x100000000;
    if (kind === 'future') bad.version = 5;
    if (kind === 'legacy-extra') bad.version = 3;
    const raw = JSON.stringify(bad); m.data.set(CAMPAIGN_KEY, raw);
    expect(readCampaign(m.storage).writable).toBe(false); expect(writeCampaign(m.storage, createCampaign()).ok).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
  });
});
