import {describe,expect,it} from 'vitest';
import {CAMPAIGN_KEY,completeBattle,createCampaign,readCampaign,selectBattle,writeCampaign,type Campaign,type StorageLike} from '../src/campaign';
import {createInitialState} from '../src/domain/engine';

const legacy:Campaign={version:1,unlocked:['B01','B02','B03','B04'],completed:['B01','B02','B03','B04'],currentBattle:'B04',evidence:['B01:A','B01:B','B02:O','B03:M','B04:C']};
function memory(raw:string){const data=new Map([[CAMPAIGN_KEY,raw],['other-save','keep']]);let writes=0;const storage:StorageLike={getItem:k=>data.get(k)??null,setItem:(k,v)=>{writes++;data.set(k,v);},removeItem:k=>{data.delete(k);}};return{data,storage,writes:()=>writes};}

describe('B05 optional evidence and legacy four-battle v1',()=>{
 it('unlocks B05 in memory from an unchanged old four-battle save',()=>{
  const raw=JSON.stringify(legacy),m=memory(raw),loaded=readCampaign(m.storage);
  expect(loaded.writable).toBe(true);expect(loaded.warning).toBeNull();expect(loaded.campaign.unlocked).toEqual([...legacy.unlocked,'B05']);
  expect(loaded.campaign.currentBattle).toBe('B04');expect(selectBattle(loaded.campaign,'B05').currentBattle).toBe('B05');
  expect(m.writes()).toBe(0);expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
 });
 it('does not unlock B05 on B04 defeat, and retains prior evidence on victory',()=>{
  const before:Campaign={...legacy,completed:['B01','B02','B03'],evidence:legacy.evidence.slice(0,4)};
  const b=createInitialState('B04');b.phase='lost';expect(completeBattle(before,b)).toBe(before);expect(selectBattle(before,'B05')).toBe(before);
  b.phase='won';b.records=['C'];const c=completeBattle(before,b);expect(c.unlocked).toContain('B05');expect(c.evidence).toEqual(legacy.evidence);
 });
 it.each([false,true])('saves required evidence with optional K=%s and retains it across earlier replays',optional=>{
  const m=memory(JSON.stringify(legacy)),c=selectBattle(readCampaign(m.storage).campaign,'B05'),b=createInitialState('B05');
  b.phase='won';b.records=optional?['D','T','S','K']:['D','T','S'];const done=completeBattle(c,b);
  expect(writeCampaign(m.storage,done).ok).toBe(true);expect(writeCampaign(m.storage,selectBattle(done,'B01')).ok).toBe(true);
  const loaded=readCampaign(m.storage).campaign;expect(loaded.completed).toEqual(['B01','B02','B03','B04','B05']);
  expect(loaded.evidence).toEqual([...legacy.evidence,...b.records.map(r=>'B05:'+r)]);expect(m.data.get('other-save')).toBe('keep');
  expect(writeCampaign(m.storage,createCampaign()).ok).toBe(true);expect(readCampaign(m.storage).campaign.evidence).toEqual(loaded.evidence);
 });
 it.each(['D','T','S'])('rejects B05 completion missing required %s, even with optional K',missing=>{
  const bad={...legacy,unlocked:[...legacy.unlocked,'B05'],completed:[...legacy.completed,'B05'],currentBattle:'B05',evidence:[...legacy.evidence,...['D','T','S','K'].filter(r=>r!==missing).map(r=>'B05:'+r)]};
  const raw=JSON.stringify(bad),m=memory(raw);expect(readCampaign(m.storage).writable).toBe(false);expect(writeCampaign(m.storage,createCampaign()).ok).toBe(false);expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);expect(m.writes()).toBe(0);
 });
 it.each([{...legacy,version:9},{...legacy,completed:['B01','B02','B03'],unlocked:['B01','B02','B03','B04','B05']}])('protects unknown or prematurely unlocked data without overwriting it',bad=>{
  const raw=JSON.stringify(bad),m=memory(raw);expect(readCampaign(m.storage).writable).toBe(false);expect(writeCampaign(m.storage,createCampaign()).ok).toBe(false);expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);expect(m.writes()).toBe(0);
 });
});
