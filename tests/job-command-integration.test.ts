import surveyRoute from './fixtures/progression-v2/b01-survey-route.json';
import {describe,it,expect} from 'vitest';
import {applyJobs,createJobs,setMainJob,learnSkill,equipSupport} from '../src/jobs';
import {createPartyBattle} from '../src/party';
import {createGrowth,awardFirstClear,defaultParty} from '../src/progression';
import {CAMPAIGN_KEY,createCampaign,readCampaign,writeCampaign,completeBattle,type StorageLike} from '../src/campaign';
import {attackPreview,reduce,reachable} from '../src/domain/engine';
import {runEnemyActivation} from '../src/domain/ai';
import type {BattleState,Command} from '../src/domain/types';
import route from './fixtures/progression-v2/b01-route.json';
function memory(raw?:string):StorageLike&{writes:number;raw:()=>string|null}{let value=raw??null;return {writes:0,getItem:()=>value,setItem(_key,v){value=v;this.writes++;},removeItem(){value=null;},raw:()=>value};}
function step(s:BattleState,c:Command):BattleState {const r=reduce(s,c);expect(r.error,JSON.stringify({c,units:s.units.map(u=>({id:u.id,pos:u.pos,hp:u.hp})),active:s.activeId})).toBeUndefined();return r.state;}
function originalVictory():BattleState {let s=createPartyBattle('B01',defaultParty('B01'),createJobs());for(const command of route.commands as Command[]){s=step(s,command);let guard=0;while(s.turn==='enemy'&&s.phase==='playing'){expect(++guard).toBeLessThan(10);s=runEnemyActivation(s);}}expect(s.phase).toBe('won');return s;}
function opening():BattleState {let s=createPartyBattle('B01',defaultParty('B01'),createJobs());s=step(s,{type:'start',unitId:'ally-lise'});return step(s,{type:'survey',targetId:'ally-neia'});}
function noTransientSave(raw:string|null):void {const value=JSON.parse(raw!);expect(Object.keys(value).sort()).toEqual(['version','unlocked','completed','currentBattle','evidence','growth','jobs','parties','equipment','combat'].sort());expect(raw).not.toMatch(/surveyCharges|surveyBonus|protection|jobCommand|healCharges/);}
describe('main-job deployment, battle effects and save compatibility',()=>{
 it.each([1,2] as const)('reads v%s without writing, preserves progress and assigns fresh commands on retry',version=>{
  const existing=completeBattle(createCampaign(),originalVictory());const raw=JSON.stringify(version===1?{version:1,unlocked:existing.unlocked,completed:existing.completed,currentBattle:existing.currentBattle,evidence:existing.evidence}:(()=>{const {equipment:_,combat:_combat,...v2}=existing;return {...v2,version:2}})());
  const store=memory(raw),loaded=readCampaign(store);expect(loaded.warning).toBeNull();expect(store.writes).toBe(0);expect(store.raw()).toBe(raw);expect(loaded.campaign.completed).toEqual(existing.completed);expect(loaded.campaign.evidence).toEqual(existing.evidence);
  const used=opening();expect(used.units.find(u=>u.id==='ally-lise')!.surveyCharges).toBe(1);expect(used.units.find(u=>u.id==='ally-neia')!.surveyBonus).toBe(true);
  expect(writeCampaign(store,loaded.campaign).ok).toBe(true);noTransientSave(store.raw());
  const restored=readCampaign(store).campaign;
  for(let attempt=0;attempt<2;attempt++){const fresh=createPartyBattle('B01',defaultParty('B01'),restored.jobs!);expect(fresh.units.find(u=>u.id==='ally-lise')).toMatchObject({jobCommand:'survey',surveyCharges:2});expect(fresh.units.every(u=>u.surveyBonus===undefined&&u.protection===undefined)).toBe(true);}
 });
 it('clears stale active powers and buffs when changing main while retaining learned cross-job support',()=>{
  let growth=createGrowth();for(const id of ['B01','B02','B03'] as const)growth=awardFirstClear(growth,id,defaultParty(id));
  let jobs=learnSkill(createJobs(),growth,'ally-lise','surveyor-practice','B04');jobs=setMainJob(jobs,'ally-lise','warden','B04');jobs=equipSupport(jobs,'ally-lise','surveyor-practice');
  const stale=opening().units.find(u=>u.id==='ally-lise')!;stale.surveyBonus=true;stale.protection={sourceId:'ally-garan'};stale.healCharges=99;const before=structuredClone(stale),ward=applyJobs(stale,jobs);
  expect(stale).toEqual(before);expect(ward).toMatchObject({jobCommand:'protect',move:5});expect(ward.surveyCharges).toBeUndefined();expect(ward.surveyBonus).toBeUndefined();expect(ward.protection).toBeUndefined();expect(ward.healCharges).toBeUndefined();
  jobs=setMainJob(jobs,'ally-lise','surveyor','B04');expect(applyJobs(ward,jobs)).toMatchObject({jobCommand:'survey',surveyCharges:2});
 });
 it('restores healer allowance only for healer main; learned healer support grants no active heal',()=>{
  const base=createPartyBattle('B03',defaultParty('B03'),createJobs()).units.find(u=>u.id==='ally-sena')!;
  const depleted={...base,healCharges:0,surveyBonus:true,jobCommand:'survey' as const,surveyCharges:1,protection:{sourceId:'ally-garan'}};
  let growth=createGrowth();for(const id of ['B01','B02','B03'] as const)growth=awardFirstClear(growth,id,defaultParty(id));
  let jobs=learnSkill(createJobs(),growth,'ally-sena','healer-foundation','B04');jobs=setMainJob(jobs,'ally-sena','warden','B04');jobs=equipSupport(jobs,'ally-sena','healer-foundation');
  expect(applyJobs(depleted,createJobs())).toMatchObject({healCharges:2});const ward=applyJobs(depleted,jobs);expect(ward).toMatchObject({jobCommand:'protect',maxHp:26});expect(ward.healCharges).toBeUndefined();
  expect(applyJobs(ward,createJobs()).healCharges).toBe(2);
 });
 it('lets an out-of-range surveyor support the next ranged attack without moving enemies or weakening AI',()=>{
  let s=opening();expect(s.units.filter(u=>u.team==='enemy'&&u.hp>0).every(u=>!attackPreview(s,'ally-lise',u.id).legal)).toBe(true);
  s=step(s,{type:'end',facing:'E'});s=runEnemyActivation(s);s=step(s,{type:'start',unitId:'ally-neia'});
  const shot=reachable(s,'ally-neia').flatMap(cell=>{const n=structuredClone(s);n.units.find(u=>u.id==='ally-neia')!.pos={x:cell.x,y:cell.y};return n.units.filter(u=>u.team==='enemy'&&attackPreview(n,'ally-neia',u.id).legal).map(u=>({cell,targetId:u.id}));})[0];expect(shot).toBeDefined();
  if(shot.cell.cost>0)s=step(s,{type:'move',to:{x:shot.cell.x,y:shot.cell.y}});const preview=attackPreview(s,'ally-neia',shot.targetId),bare=structuredClone(s);delete bare.units.find(u=>u.id==='ally-neia')!.surveyBonus;expect(preview.damage).toBe(attackPreview(bare,'ally-neia',shot.targetId).damage+2);
  const hp=s.units.find(u=>u.id===shot.targetId)!.hp;s=step(s,{type:'attack',targetId:shot.targetId});expect(s.units.find(u=>u.id===shot.targetId)!.hp).toBe(Math.max(0,hp-preview.damage));expect(s.units.find(u=>u.id==='ally-neia')!.surveyBonus).toBeUndefined();
 });
 it('uses survey then wins B01 with normal deterministic enemy AI and persists only campaign data',()=>{
  let s=createPartyBattle('B01',defaultParty('B01'),createJobs());expect(attackPreview(s,'ally-lise','enemy-melee-01').legal).toBe(false);
  const commands=structuredClone(surveyRoute.commands) as Command[];
  let boosted=false;
  for(const command of commands){
   if(command.type==='attack'&&s.activeId==='ally-neia'&&s.units.find(u=>u.id==='ally-neia')!.surveyBonus&&!boosted){const withBonus=attackPreview(s,'ally-neia',command.targetId);const bare=structuredClone(s);delete bare.units.find(u=>u.id==='ally-neia')!.surveyBonus;expect(withBonus.damage-attackPreview(bare,'ally-neia',command.targetId).damage).toBe(2);boosted=true;}
   s=step(s,command);let guard=0;while(s.turn==='enemy'&&s.phase==='playing'){expect(++guard).toBeLessThan(10);s=runEnemyActivation(s);}
  }
  expect(boosted).toBe(true);expect(s.phase).toBe('won');expect(s.records).toEqual(['A','B']);
  const store=memory(),campaign=completeBattle(createCampaign(),s);expect(writeCampaign(store,campaign).ok).toBe(true);noTransientSave(store.getItem(CAMPAIGN_KEY));expect(readCampaign(store).campaign.completed).toEqual(['B01']);
 });
});
