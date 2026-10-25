import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, resetCampaign, selectBattle, writeCampaign, type StorageLike } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';

function memory() {
  const data = new Map<string, string>();
  const storage: StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } };
  return { data, storage };
}
function b01Win() { const b = createInitialState(); b.phase = 'won'; b.records = ['A', 'B']; return b; }
describe('Campaign checkpoint v1', () => {
  it('starts at B01 and cannot select locked B02', () => { const c = createCampaign(); expect(selectBattle(c, 'B02')).toBe(c); expect(c.completed).toEqual([]); });
  it('only victory unlocks B02, preserving evidence independently of next battle resources', () => {
    const c = createCampaign(), b = createInitialState();
    expect(completeBattle(c, b)).toBe(c); b.phase = 'lost'; expect(completeBattle(c, b)).toBe(c);
    const next = selectBattle(completeBattle(c, b01Win()), 'B02');
    expect(next).toMatchObject({ currentBattle: 'B02', unlocked: ['B01', 'B02'], completed: ['B01'], evidence: ['B01:A', 'B01:B'] });
    const stage = createInitialState('B02'); expect(stage.records).toEqual([]); expect(stage.units.every(u => u.hp === u.maxHp && !u.acted)).toBe(true);
    expect(c).toEqual(createCampaign());
  });
  it('roundtrips a stage checkpoint and preserves both results when replaying B01', () => {
    const { storage } = memory(); let c = selectBattle(completeBattle(createCampaign(), b01Win()), 'B02');
    const b = createInitialState('B02'); b.phase = 'won'; b.records = ['O']; c = completeBattle(c, b);
    expect(writeCampaign(storage, c).ok).toBe(true);
    const loaded = readCampaign(storage); expect(loaded.warning).toBeNull(); expect(loaded.campaign).toEqual(c);
    expect(writeCampaign(storage, selectBattle(completeBattle(c, b01Win()), 'B01')).ok).toBe(true);
    expect(readCampaign(storage).campaign.completed).toEqual(['B01', 'B02']);
  });
  it.each(['{"version":2,"private":"keep"}', '{broken', '{"version":1,"unlocked":["B02"],"completed":[],"currentBattle":"B02","evidence":[]}'])('preserves unreadable data and refuses implicit overwrite: %s', raw => {
    const { storage, data } = memory(); data.set(CAMPAIGN_KEY, raw);
    expect(readCampaign(storage).writable).toBe(false);
    expect(writeCampaign(storage, createCampaign()).ok).toBe(false); expect(data.get(CAMPAIGN_KEY)).toBe(raw);
  });
  it('reset removes only its dedicated key, and a new game can then save', () => {
    const { storage, data } = memory(); data.set('other-game', 'keep'); data.set(CAMPAIGN_KEY, '{unknown}');
    expect(resetCampaign(storage).ok).toBe(true); expect(data.get('other-game')).toBe('keep'); expect(data.has(CAMPAIGN_KEY)).toBe(false);
    expect(writeCampaign(storage, createCampaign()).ok).toBe(true);
  });
  it('reports unavailable storage and quota failures without claiming success', () => {
    const denied: StorageLike = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); }, removeItem: () => { throw Error('denied'); } };
    expect(readCampaign(denied).writable).toBe(false); expect(writeCampaign(denied, createCampaign()).ok).toBe(false); expect(resetCampaign(denied).ok).toBe(false);
    const quota: StorageLike = { getItem: () => null, setItem: () => { throw Error('quota'); }, removeItem: () => {} };
    expect(writeCampaign(quota, createCampaign())).toMatchObject({ ok: false });
  });
  it('does not erase a valid later milestone written by another session', () => {
    const { storage } = memory(); writeCampaign(storage, selectBattle(completeBattle(createCampaign(), b01Win()), 'B02'));
    expect(writeCampaign(storage, createCampaign()).ok).toBe(true);
    expect(readCampaign(storage).campaign.completed).toEqual(['B01']);
  });
});
