import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import { createQaStorage } from '../src/qa/storage';
import { buildFiveBattleCheckpoint } from '../src/qa/checkpoint';

const six: Campaign = { version: 1, unlocked: ['B01','B02','B03','B04','B05','B06'], completed: ['B01','B02','B03','B04','B05','B06'],
  currentBattle: 'B06', evidence: ['B01:A','B01:B','B02:O','B03:M','B04:C','B05:D','B05:S','B05:T','B05:K','B06:W'] };
function memory(raw: string) {
  const data = new Map([[CAMPAIGN_KEY, raw], ['other-user-save', 'keep']]); let writes = 0;
  const storage: StorageLike = { getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { writes++; data.set(k, v); }, removeItem: k => { data.delete(k); } };
  return { storage, data, writes: () => writes };
}
describe('B07 v1 evacuation milestone', () => {
  it('prepares only five earned fixture battles in a new QA namespace and leaves B07 locked', () => {
    const m = memory('ordinary-user-value-to-preserve'), qa = createQaStorage(m.storage, 'b07-chrome-20261018-a');
    const before = buildFiveBattleCheckpoint();
    expect(before.completed).toEqual(['B01','B02','B03','B04','B05']);
    expect(before.unlocked).toEqual(['B01','B02','B03','B04','B05','B06']);
    expect(before.currentBattle).toBe('B06'); expect(before.evidence).toHaveLength(9); expect(before.evidence).toContain('B05:K');
    expect(writeCampaign(qa, before).ok).toBe(true);
    expect(readCampaign(qa).campaign.unlocked).not.toContain('B07');
    expect(m.data.get(CAMPAIGN_KEY)).toBe('ordinary-user-value-to-preserve');
  });
  it('unlocks B07 from the earned six-battle v1 in memory without rewriting it', () => {
    const raw = JSON.stringify(six), m = memory(raw), loaded = readCampaign(m.storage);
    expect(loaded.writable).toBe(true); expect(loaded.warning).toBeNull();
    expect(loaded.campaign.unlocked).toEqual([...six.unlocked, 'B07']);
    expect(selectBattle(loaded.campaign, 'B07').currentBattle).toBe('B07');
    expect(m.writes()).toBe(0); expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
  });
  it.each([false, true])('saves V1/V2 and retains previous W with optional K=%s after old battle replays', optional => {
    const prior = { ...six, evidence: six.evidence.filter(e => optional || e !== 'B05:K') };
    const m = memory(JSON.stringify(prior)), c = selectBattle(readCampaign(m.storage).campaign, 'B07');
    const state = createInitialState('B07'); state.phase = 'won'; state.records = ['V1','V2'];
    const done = completeBattle(c, state); expect(writeCampaign(m.storage, done).ok).toBe(true);
    expect(writeCampaign(m.storage, selectBattle(done, 'B06')).ok).toBe(true);
    expect(writeCampaign(m.storage, createCampaign()).ok).toBe(true);
    const restored = readCampaign(m.storage).campaign;
    expect(restored.completed).toEqual([...six.completed, 'B07']);
    expect(restored.evidence).toEqual([...prior.evidence, 'B07:V1','B07:V2']);
    expect(m.data.get('other-user-save')).toBe('keep');
  });
  it.each(['V1','V2'])('refuses a completed B07 save without evacuation %s', missing => {
    const bad: Campaign = { ...six, unlocked: [...six.unlocked,'B07'], completed: [...six.completed,'B07'], currentBattle: 'B07',
      evidence: [...six.evidence, ...['V1','V2'].filter(id => id !== missing).map(id => `B07:${id}`)] };
    const raw = JSON.stringify(bad), m = memory(raw);
    expect(readCampaign(m.storage).writable).toBe(false); expect(writeCampaign(m.storage, createCampaign()).ok).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw); expect(m.writes()).toBe(0);
  });
  it('rejects premature B07 unlocking and keeps an unrelated QA session untouched', () => {
    const bad = { ...six, completed: six.completed.slice(0,5), unlocked: [...six.unlocked,'B07'] };
    const raw = JSON.stringify(bad), m = memory(raw);
    expect(readCampaign(m.storage).writable).toBe(false); expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    const qa = createQaStorage(m.storage, 'b07-chrome-20261018-a');
    expect(writeCampaign(qa, six).ok).toBe(true); expect(readCampaign(qa).campaign.unlocked).toContain('B07');
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw); expect(m.data.get('other-user-save')).toBe('keep');
  });
});
