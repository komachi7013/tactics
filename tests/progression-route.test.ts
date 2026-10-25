import route01 from './fixtures/progression-v2/b01-route.json';
import route02 from './fixtures/progression-v2/b02-route.json';
import route03 from './fixtures/progression-v2/b03-route.json';
import route04 from './fixtures/progression-v2/b04-route.json';
import route05 from './fixtures/progression-v2/b05-route.json';
import route06 from './fixtures/progression-v2/b06-route.json';
import route07 from './fixtures/progression-v2/b07-route.json';
import route08 from './fixtures/progression-v2/b08-route.json';
import route09 from './fixtures/progression-v2/b09-route.json';
import route10 from './fixtures/progression-v2/b10-route.json';
import route11 from './fixtures/progression-v2/b11-route.json';
import route12 from './fixtures/progression-v2/b12-route.json';
import custom09 from './fixtures/progression-v2/b09-custom-route.json';
import {describe,it,expect} from 'vitest';
import {createPartyBattle} from '../src/party';
import {BATTLE_IDS,defaultParty,commonLevel,trainingPoints,type CharacterId} from '../src/progression';
import {createJobs,learnSkill,setMainJob,equipSupport} from '../src/jobs';
import {reduce} from '../src/domain/engine';
import {runEnemyActivation} from '../src/domain/ai';
import {createCampaign,completeBattle,readCampaign,writeCampaign,selectBattle,editPreparation,type Campaign,type StorageLike} from '../src/campaign';
import type {BattleId,BattleState,Command} from '../src/domain/types';
interface Route {level:number;commands:Command[];round:number;records:string[];playerHp:[string,number][]}
const routes:Record<BattleId,unknown>={B01:route01,B02:route02,B03:route03,B04:route04,B05:route05,B06:route06,B07:route07,B08:route08,B09:route09,B10:route10,B11:route11,B12:route12};
function fixture(id:BattleId,custom=false):Route {return (custom?custom09:routes[id]) as Route;}
function storage():StorageLike {const data=new Map<string,string>();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);},removeItem:key=>{data.delete(key);}};}
function replay(state:BattleState,route:Route):BattleState {
 let s=state;expect(route.commands.length).toBeGreaterThan(0);
 for(const [index,command] of route.commands.entries()){
  expect(s.phase,`${s.battleId} command ${index} remains in playing phase`).toBe('playing');expect(s.turn).toBe('player');
  const result=reduce(s,command);expect(result.error,`${s.battleId} command ${index}: ${JSON.stringify(command)}`).toBeUndefined();s=result.state;
  let guard=0;while(s.turn==='enemy'&&s.phase==='playing'){expect(++guard).toBeLessThanOrEqual(10);s=runEnemyActivation(s);}
 }
 expect(s.phase).toBe('won');expect(s.round).toBe(route.round);expect(s.records).toEqual(route.records);expect(s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])).toEqual(route.playerHp);return s;
}
function saved(store:StorageLike,c:Campaign):Campaign {const result=writeCampaign(store,c);expect(result.ok,result.error).toBe(true);const read=readCampaign(store);expect(read.warning).toBeNull();expect(read.writable).toBe(true);expect(read.campaign.completed).toEqual(c.completed);expect(read.campaign.growth).toEqual(c.growth);expect(read.campaign.jobs).toEqual(c.jobs);return read.campaign;}
function campaignThrough(count:number,store:StorageLike):Campaign {
 let campaign=saved(store,createCampaign());
 for(const [index,id] of BATTLE_IDS.slice(0,count).entries()){
  campaign=selectBattle(campaign,id);const route=fixture(id),level=commonLevel(campaign.completed);expect(level).toBe(1+Math.floor(index/3));expect(route.level).toBe(level);
  const party=defaultParty(id);const won=replay(createPartyBattle(id,party,campaign.jobs!,level),route);
  campaign=completeBattle(campaign,won);expect(campaign.completed).toEqual(BATTLE_IDS.slice(0,index+1));expect(campaign.growth!.deployments[id]).toEqual(party);
  const repeat=completeBattle(campaign,won);expect(repeat.growth).toEqual(campaign.growth);campaign=saved(store,campaign);
  expect(commonLevel(campaign.completed)).toBe(1+Math.floor((index+1)/3));
 }
 return campaign;
}
describe('live progression routes with normal deterministic AI and persistent growth',()=>{
 it('wins B01 through B12 with common chapter growth, records first-clear rosters and survives every save/reload',()=>{
  const campaign=campaignThrough(12,storage());expect(commonLevel(campaign.completed)).toBe(5);expect(campaign.completed).toEqual(BATTLE_IDS);expect(campaign.evidence).toContain('B12:U');expect(campaign.evidence).toContain('B12:V');expect(campaign.growth!.compensated).toEqual(['B06']);expect(trainingPoints(campaign.growth!,'ally-neia')).toBe(24);expect(trainingPoints(campaign.growth!,'ally-dani')).toBe(0);expect(campaign.jobs).toEqual(createJobs());
 });
 it('wins and persists B09 with Dani replacing the optional reserve and a switched main job plus one learned cross-job support',()=>{
  const store=storage();let campaign=campaignThrough(8,store);campaign=selectBattle(campaign,'B09');
  const party:CharacterId[]=['ally-lise','ally-garan','ally-neia','ally-dani'];
  let jobs=learnSkill(campaign.jobs!,campaign.growth!,'ally-lise','surveyor-foundation','B09');jobs=setMainJob(jobs,'ally-lise','warden','B09');jobs=equipSupport(jobs,'ally-lise','surveyor-foundation');
  campaign=editPreparation(campaign,{jobs,parties:{...campaign.parties,B09:party}});campaign=saved(store,campaign);
  const beforeSena=trainingPoints(campaign.growth!,'ally-sena'),beforeDani=trainingPoints(campaign.growth!,'ally-dani');
  const start=createPartyBattle('B09',party,campaign.jobs!,commonLevel(campaign.completed));expect(start.units.find(u=>u.id==='ally-lise')).toMatchObject({role:'堤防衛士',maxHp:30,atk:9,def:3});
  const won=replay(start,fixture('B09',true));campaign=saved(store,completeBattle(campaign,won));
  expect(campaign.growth!.deployments.B09).toEqual(party);expect(campaign.parties!.B09).toEqual(party);expect(campaign.jobs!['ally-lise']).toEqual({main:'warden',learned:['surveyor-foundation'],support:'surveyor-foundation'});expect(trainingPoints(campaign.growth!,'ally-dani')).toBe(beforeDani+2);expect(trainingPoints(campaign.growth!,'ally-sena')).toBe(beforeSena);expect(campaign.unlocked).toContain('B10');
 });
});
