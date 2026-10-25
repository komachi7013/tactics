import {createCombatRandomConfig} from '../src/domain/combatRandom';
import {createEquipment} from '../src/equipment';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import { createJobs } from '../src/jobs';

function memory(raw: string | null = null) {
  const data = new Map<string,string>(); if (raw !== null) data.set(CAMPAIGN_KEY, raw);
  const storage: StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k,v) => { data.set(k,v); }, removeItem: k => { data.delete(k); } };
  return { data, storage };
}
const previous: Campaign = { version:1, unlocked:['B01','B02'], completed:['B01','B02'], currentBattle:'B02', evidence:['B01:A','B01:B','B02:O'] };
describe('B03 compatible campaign extension', () => {
  it('reads a completed two-battle v1 checkpoint, adds B03 in memory, and never rewrites on read', () => {
    const raw=JSON.stringify(previous), {data,storage}=memory(raw), loaded=readCampaign(storage);
    expect(loaded.warning).toBeNull(); expect(loaded.writable).toBe(true);
    expect(loaded.campaign).toEqual({...previous,version:4,combat:createCombatRandomConfig(),equipment:createEquipment(),unlocked:['B01','B02','B03'],growth:{version:2,deployments:{B01:['ally-lise','ally-garan','ally-neia'],B02:['ally-lise','ally-garan','ally-neia']},compensated:[],tutoring:{'ally-lise':0,'ally-garan':0,'ally-neia':0,'ally-sena':0,'ally-iva':0,'ally-dani':0}},jobs:createJobs(),parties:{}});
    expect(data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(selectBattle(loaded.campaign,'B03').currentBattle).toBe('B03');
  });
  it('does not unlock B03 before B02 victory', () => {
    const c=createCampaign(); expect(selectBattle(c,'B03')).toBe(c);
    const b=createInitialState('B01'); b.phase='won'; b.records=['A','B'];
    const one=completeBattle(c,b); expect(one.unlocked).toEqual(['B01','B02']); expect(selectBattle(one,'B03')).toBe(one);
    const second=createInitialState('B02'); second.phase='lost'; expect(completeBattle(one,second)).toBe(one);
    second.phase='won'; second.records=['O']; expect(completeBattle(one,second).unlocked).toEqual(['B01','B02','B03']);
  });
  it('retains all evidence and completions when B03 is saved and B01 is replayed', () => {
    const {storage}=memory(JSON.stringify(previous));
    let c=selectBattle(readCampaign(storage).campaign,'B03'); const b=createInitialState('B03'); b.phase='won'; b.records=['M'];
    c=completeBattle(c,b); expect(writeCampaign(storage,c).ok).toBe(true);
    const loaded=readCampaign(storage).campaign; expect(loaded.completed).toEqual(['B01','B02','B03']);
    expect(loaded.evidence).toEqual(['B01:A','B01:B','B02:O','B03:M']);
    expect(writeCampaign(storage,selectBattle(loaded,'B01')).ok).toBe(true);
    expect(readCampaign(storage).campaign.completed).toEqual(loaded.completed);
  });
  it('merges a stale valid earlier session without dropping B03 completion', () => {
    const c:Campaign={...previous,unlocked:['B01','B02','B03'],completed:['B01','B02','B03'],currentBattle:'B03',evidence:[...previous.evidence,'B03:M']};
    const {storage}=memory(JSON.stringify(c)); expect(writeCampaign(storage,createCampaign()).ok).toBe(true);
    // The new next chapter unlocks from retained B03 completion, even for a stale v1 session.
    expect(readCampaign(storage).campaign).toMatchObject({completed:c.completed,unlocked:['B01','B02','B03','B04'],evidence:c.evidence});
  });
  it.each([
    {...previous,unlocked:['B01','B02','B03'],completed:['B01']},
    {...previous,unlocked:['B01','B02','B03'],completed:['B01','B02','B03']},
    {...previous,version:2},
  ])('preserves invalid or unknown checkpoints without implicit overwrite', bad => {
    const raw=JSON.stringify(bad),{storage,data}=memory(raw);
    expect(readCampaign(storage).writable).toBe(false); expect(writeCampaign(storage,createCampaign()).ok).toBe(false);
    expect(data.get(CAMPAIGN_KEY)).toBe(raw);
  });
});
