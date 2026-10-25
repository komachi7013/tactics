import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import { buildSixBattleCheckpoint } from '../src/qa/checkpoint';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';

const seven: Campaign = { version: 1, unlocked: ['B01','B02','B03','B04','B05','B06','B07'], completed: ['B01','B02','B03','B04','B05','B06','B07'],
  currentBattle: 'B07', evidence: ['B01:A','B01:B','B02:O','B03:M','B04:C','B05:D','B05:S','B05:T','B05:K','B06:W','B07:V1','B07:V2'] };
function memory(value: string) {
  const data = new Map([[CAMPAIGN_KEY, value], ['unrelated-user-state','preserve']]);
  const storage: StorageLike = { getItem: vi.fn(k => data.get(k) ?? null), setItem: vi.fn((k,v) => { data.set(k,v); }), removeItem: vi.fn(k => { data.delete(k); }) };
  return { data, storage };
}
describe('B08 v1 maintenance milestone and isolated preparation', () => {
  it('reads an old seven-win checkpoint without writes and unlocks only B08', () => {
    const raw = JSON.stringify(seven), m = memory(raw), loaded = readCampaign(m.storage);
    expect(loaded.warning).toBeNull(); expect(loaded.writable).toBe(true);
    expect(loaded.campaign.unlocked).toEqual([...seven.unlocked, 'B08']);
    expect(selectBattle(loaded.campaign,'B08').currentBattle).toBe('B08');
    expect(m.storage.setItem).not.toHaveBeenCalled(); expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
  });
  it('prepares six earned victories before B07 and touches only its new QA key', () => {
    const m = memory('ordinary-invalid-value-to-preserve');
    const otherKey = qaStorageKey('b07-chrome-20261018-a'); m.data.set(otherKey, 'prior-b07-qa');
    const qa = createQaStorage(m.storage, 'b08-chrome-20261018-a'), c = buildSixBattleCheckpoint();
    expect(c.completed).toEqual(['B01','B02','B03','B04','B05','B06']);
    expect(c.currentBattle).toBe('B07'); expect(c.evidence).toHaveLength(10);
    expect(c.unlocked).toContain('B07'); expect(c.unlocked).not.toContain('B08');
    expect(writeCampaign(qa,c).ok).toBe(true); expect(readCampaign(qa).campaign).toEqual(c);
    expect(m.storage.getItem).not.toHaveBeenCalledWith(CAMPAIGN_KEY);
    expect(m.data.get(CAMPAIGN_KEY)).toBe('ordinary-invalid-value-to-preserve'); expect(m.data.get(otherKey)).toBe('prior-b07-qa');
    expect(m.storage.setItem).toHaveBeenCalledExactlyOnceWith(qaStorageKey('b08-chrome-20261018-a'), JSON.stringify(c));
  });
  it.each([false,true])('saves P/C and retains K=%s, W and V1/V2 through stale and earlier replays', optional => {
    const prior = { ...seven, evidence: seven.evidence.filter(e => optional || e !== 'B05:K') };
    const m = memory(JSON.stringify(prior)), c = selectBattle(readCampaign(m.storage).campaign, 'B08');
    // Milestone serialization unit fixture only; normal-AI victory is tested separately.
    const state = createInitialState('B08'); state.phase = 'won'; state.records = ['P','C'];
    const done = completeBattle(c,state); expect(writeCampaign(m.storage,done).ok).toBe(true);
    expect(writeCampaign(m.storage,selectBattle(done,'B07')).ok).toBe(true);
    expect(writeCampaign(m.storage,createCampaign()).ok).toBe(true);
    const restored = readCampaign(m.storage).campaign;
    expect(restored.completed).toEqual([...seven.completed,'B08']);
    expect(restored.evidence).toEqual([...prior.evidence,'B08:P','B08:C']);
    expect(m.data.get('unrelated-user-state')).toBe('preserve');
  });
  it.each(['P','C'])('refuses a completed B08 checkpoint missing %s without rewriting it', missing => {
    const bad: Campaign = { ...seven, unlocked: [...seven.unlocked,'B08'], completed: [...seven.completed,'B08'], currentBattle: 'B08',
      evidence: [...seven.evidence, ...['P','C'].filter(id => id !== missing).map(id => `B08:${id}`)] };
    const raw = JSON.stringify(bad), m = memory(raw);
    expect(readCampaign(m.storage).writable).toBe(false); expect(writeCampaign(m.storage,createCampaign()).ok).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw); expect(m.storage.setItem).not.toHaveBeenCalled();
  });
  it('rejects premature B08 access and leaves completed progress unchanged on loss', () => {
    const c = buildSixBattleCheckpoint(); expect(selectBattle(c,'B08')).toBe(c);
    const lost = createInitialState('B08'); lost.phase = 'lost'; expect(completeBattle(c,lost)).toBe(c);
    const bad = { ...seven, completed: seven.completed.slice(0,6), unlocked: [...seven.unlocked,'B08'] };
    const raw = JSON.stringify(bad), m = memory(raw); expect(readCampaign(m.storage).writable).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
  });
});
