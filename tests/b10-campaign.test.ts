import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import { buildEightBattleCheckpoint } from '../src/qa/checkpoint';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';
const nine: Campaign = {version:1,unlocked:['B01','B02','B03','B04','B05','B06','B07','B08','B09'],completed:['B01','B02','B03','B04','B05','B06','B07','B08','B09'],currentBattle:'B09',
 evidence:['B01:A','B01:B','B02:O','B03:M','B04:C','B05:D','B05:T','B05:S','B05:K','B06:W','B07:V1','B07:V2','B08:P','B08:C','B09:J','B09:H']};
function memory(raw:string){
 const data=new Map([[CAMPAIGN_KEY,raw],['unrelated-user-state','preserve']]);
 const storage:StorageLike={getItem:vi.fn(k=>data.get(k)??null),setItem:vi.fn((k,v)=>{data.set(k,v);}),removeItem:vi.fn(k=>{data.delete(k);})};
 return {data,storage};
}
describe('B10 harbor v1 milestone and isolated preparation',()=>{
 it('reads an old nine-win v1 without writes and unlocks B10',()=>{
  const raw=JSON.stringify(nine),m=memory(raw),loaded=readCampaign(m.storage);
  expect(loaded.writable).toBe(true);expect(loaded.warning).toBeNull();
  expect(loaded.campaign.unlocked).toEqual([...nine.unlocked,'B10']);
  expect(selectBattle(loaded.campaign,'B10').currentBattle).toBe('B10');
  expect(m.storage.setItem).not.toHaveBeenCalled();expect(m.storage.removeItem).not.toHaveBeenCalled();expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
 });
 it('earns eight fixture victories before B09 and accesses only a fresh QA key',()=>{
  const m=memory('ordinary-invalid-value-preserved');
  const protectedKeys=['b06','b07','b08','b09'].map(id=>qaStorageKey(`${id}-chrome-20261018-a`));
  for(const key of protectedKeys)m.data.set(key,'prior-'+key);
  const qa=createQaStorage(m.storage,'b10-chrome-20261018-a'),c=buildEightBattleCheckpoint();
  expect(c.completed).toEqual(nine.completed.slice(0,8));expect(c.currentBattle).toBe('B09');expect(c.evidence).toHaveLength(14);
  expect(c.unlocked).toContain('B09');expect(c.unlocked).not.toContain('B10');
  expect(writeCampaign(qa,c).ok).toBe(true);expect(readCampaign(qa).campaign).toEqual(c);
  expect(m.data.get(CAMPAIGN_KEY)).toBe('ordinary-invalid-value-preserved');
  for(const key of protectedKeys)expect(m.data.get(key)).toBe('prior-'+key);
  for(const mock of [m.storage.getItem,m.storage.setItem,m.storage.removeItem])for(const call of vi.mocked(mock).mock.calls)expect(call[0]).toBe(qaStorageKey('b10-chrome-20261018-a'));
 });
 it.each([false,true])('saves C and preserves optional K=%s, prior evidence and stale sessions',optional=>{
  const prior={...nine,evidence:nine.evidence.filter(e=>optional||e!=='B05:K')};
  const m=memory(JSON.stringify(prior)),c=selectBattle(readCampaign(m.storage).campaign,'B10');
  // Serialization unit fixture only. Real unchanged-AI victory is tested independently.
  const state=createInitialState('B10');state.phase='won';state.records=['C'];
  const done=completeBattle(c,state);expect(writeCampaign(m.storage,done).ok).toBe(true);
  expect(writeCampaign(m.storage,selectBattle(done,'B09')).ok).toBe(true);expect(writeCampaign(m.storage,createCampaign()).ok).toBe(true);
  const restored=readCampaign(m.storage).campaign;
  expect(restored.completed).toEqual([...nine.completed,'B10']);expect(restored.evidence).toEqual([...prior.evidence,'B10:C']);expect(m.data.get('unrelated-user-state')).toBe('preserve');
 });
 it('protects a malformed completed B10 without its C record',()=>{
  const bad:Campaign={...nine,unlocked:[...nine.unlocked,'B10'],completed:[...nine.completed,'B10'],currentBattle:'B10'};
  const raw=JSON.stringify(bad),m=memory(raw);expect(readCampaign(m.storage).writable).toBe(false);expect(writeCampaign(m.storage,createCampaign()).ok).toBe(false);
  expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);expect(m.storage.setItem).not.toHaveBeenCalled();
 });
 it('refuses premature B10 access, playing or lost outcomes, and unauthorized won states',()=>{
  const c=buildEightBattleCheckpoint();expect(selectBattle(c,'B10')).toBe(c);
  const state=createInitialState('B10');expect(completeBattle(c,state)).toBe(c);
  state.phase='lost';expect(completeBattle(c,state)).toBe(c);state.phase='won';state.records=['C'];expect(completeBattle(c,state)).toBe(c);
  const bad={...nine,completed:nine.completed.slice(0,8),unlocked:[...nine.unlocked,'B10']};expect(readCampaign(memory(JSON.stringify(bad)).storage).writable).toBe(false);
 });
 it('does not write a purported B10 victory lacking its required evidence',()=>{
  const m=memory(JSON.stringify(nine)),c=selectBattle(readCampaign(m.storage).campaign,'B10');
  const state=createInitialState('B10');state.phase='won';
  expect(writeCampaign(m.storage,completeBattle(c,state)).ok).toBe(false);expect(m.storage.setItem).not.toHaveBeenCalled();expect(m.data.get(CAMPAIGN_KEY)).toBe(JSON.stringify(nine));
 });
});
