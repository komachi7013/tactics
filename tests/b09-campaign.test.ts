import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import { buildSevenBattleCheckpoint } from '../src/qa/checkpoint';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';

const eight: Campaign = { version: 1, unlocked: ['B01','B02','B03','B04','B05','B06','B07','B08'], completed: ['B01','B02','B03','B04','B05','B06','B07','B08'],
  currentBattle: 'B08', evidence: ['B01:A','B01:B','B02:O','B03:M','B04:C','B05:D','B05:S','B05:T','B05:K','B06:W','B07:V1','B07:V2','B08:P','B08:C'] };
function memory(value: string) {
  const data = new Map([[CAMPAIGN_KEY, value], ['unrelated-user-state','preserve']]);
  const storage: StorageLike = { getItem: vi.fn(k => data.get(k) ?? null), setItem: vi.fn((k,v) => { data.set(k,v); }), removeItem: vi.fn(k => { data.delete(k); }) };
  return { data, storage };
}
describe('B09 v1 delegation milestone and isolated preparation', () => {
  it('reads an old eight-win checkpoint without writes and unlocks only B09', () => {
    const raw = JSON.stringify(eight), m = memory(raw), loaded = readCampaign(m.storage);
    expect(loaded.warning).toBeNull(); expect(loaded.writable).toBe(true);
    expect(loaded.campaign.unlocked).toEqual([...eight.unlocked, 'B09']);
    expect(selectBattle(loaded.campaign,'B09').currentBattle).toBe('B09');
    expect(m.storage.setItem).not.toHaveBeenCalled(); expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
  });
  it('prepares seven earned victories before B08 and touches only its new QA key', () => {
    const m = memory('ordinary-invalid-value-to-preserve');
    const protectedKeys = ['b06-chrome-20261018-a','b07-chrome-20261018-a','b08-chrome-20261018-a'].map(qaStorageKey);
    for (const key of protectedKeys) m.data.set(key, 'prior-qa-'+key);
    const qa = createQaStorage(m.storage, 'b09-chrome-20261018-a'), c = buildSevenBattleCheckpoint();
    expect(c.completed).toEqual(['B01','B02','B03','B04','B05','B06','B07']);
    expect(c.currentBattle).toBe('B08'); expect(c.evidence).toHaveLength(12);
    expect(c.unlocked).toContain('B08'); expect(c.unlocked).not.toContain('B09');
    expect(writeCampaign(qa,c).ok).toBe(true); expect(readCampaign(qa).campaign).toEqual(c);
    expect(m.storage.getItem).not.toHaveBeenCalledWith(CAMPAIGN_KEY);
    expect(m.data.get(CAMPAIGN_KEY)).toBe('ordinary-invalid-value-to-preserve'); for (const key of protectedKeys) { expect(m.data.get(key)).toBe('prior-qa-'+key); expect(m.storage.getItem).not.toHaveBeenCalledWith(key); }
    expect(m.storage.setItem).toHaveBeenCalledExactlyOnceWith(qaStorageKey('b09-chrome-20261018-a'), JSON.stringify(c));
  });
  it.each([false,true])('saves J/H and retains K=%s, W and V1/V2 through stale and earlier replays', optional => {
    const prior = { ...eight, evidence: eight.evidence.filter(e => optional || e !== 'B05:K') };
    const m = memory(JSON.stringify(prior)), c = selectBattle(readCampaign(m.storage).campaign, 'B09');
    // Milestone serialization unit fixture only; normal-AI victory is tested separately.
    const state = createInitialState('B09'); state.phase = 'won'; state.records = ['J','H'];
    const done = completeBattle(c,state); expect(writeCampaign(m.storage,done).ok).toBe(true);
    expect(writeCampaign(m.storage,selectBattle(done,'B08')).ok).toBe(true);
    expect(writeCampaign(m.storage,createCampaign()).ok).toBe(true);
    const restored = readCampaign(m.storage).campaign;
    expect(restored.completed).toEqual([...eight.completed,'B09']);
    expect(restored.evidence).toEqual([...prior.evidence,'B09:J','B09:H']);
    expect(m.data.get('unrelated-user-state')).toBe('preserve');
  });
  it.each(['J','H'])('refuses a completed B09 checkpoint missing %s without rewriting it', missing => {
    const bad: Campaign = { ...eight, unlocked: [...eight.unlocked,'B09'], completed: [...eight.completed,'B09'], currentBattle: 'B09',
      evidence: [...eight.evidence, ...['J','H'].filter(id => id !== missing).map(id => `B09:${id}`)] };
    const raw = JSON.stringify(bad), m = memory(raw);
    expect(readCampaign(m.storage).writable).toBe(false); expect(writeCampaign(m.storage,createCampaign()).ok).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw); expect(m.storage.setItem).not.toHaveBeenCalled();
  });
  it('rejects premature B09 access and leaves completed progress unchanged on loss', () => {
    const c = buildSevenBattleCheckpoint(); expect(selectBattle(c,'B09')).toBe(c);
    const lost = createInitialState('B09'); lost.phase = 'lost'; expect(completeBattle(c,lost)).toBe(c);
    const bad = { ...eight, completed: eight.completed.slice(0,7), unlocked: [...eight.unlocked,'B09'] };
    const raw = JSON.stringify(bad), m = memory(raw); expect(readCampaign(m.storage).writable).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
  });
});
