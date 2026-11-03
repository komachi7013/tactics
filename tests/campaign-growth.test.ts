import { tutor, learnSkill, setMainJob, legacyPreparation } from './fixtures/legacy-preparation';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, editPreparation, readCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import {defaultParty, trainingPoints} from '../src/progression';

import type { BattleId } from '../src/domain/types';
const records: Record<BattleId,string[]> = { B01:['A','B'],B02:['O'],B03:['M'],B04:['C'],B05:['D','T','S'],B06:['W'],B07:['V1','V2'],B08:['P','C'],B09:['J','H'],B10:['C'],B11:['W1','W2','A','B'],B12:['U','V'] };
const ids = Object.keys(records) as BattleId[];
function memory() { const data = new Map<string,string>(); const storage: StorageLike = { getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);} }; return {data,storage}; }
function win(c:Campaign,id:BattleId):Campaign { const b=createInitialState(id);b.phase='won';b.records=records[id];return completeBattle(c,b); }
function through(count:number):Campaign { let c=createCampaign();for(const id of ids.slice(0,count))c=win(selectBattle(c,id),id);return c; }
function legacy(c:Campaign):Campaign { const {growth:_,jobs:__,parties:___,equipment:____,combat:_____,...rest}=c;return {...rest,version:1}; }
describe('Campaign v2 growth and legacy checkpoint preservation',()=>{
 it('creates a v4 campaign without automatically giving reserves training',()=>{ const c=createCampaign();expect(c.version).toBe(4);expect(c.parties).toEqual({});expect(trainingPoints(c.growth!,'ally-dani')).toBe(0); });
 it('reads valid legacy progress in memory only, retaining all evidence and fixed first-clear rosters',()=>{
  const {data,storage}=memory();const old=legacy(through(6));old.evidence.push('B05:K');const raw=JSON.stringify(old);data.set(CAMPAIGN_KEY,raw);
  const loaded=readCampaign(storage);expect(loaded.writable).toBe(true);expect(data.get(CAMPAIGN_KEY)).toBe(raw);
  expect(loaded.campaign).toMatchObject({version:4,completed:old.completed,evidence:old.evidence,parties:{}});
  for(const id of old.completed)expect(loaded.campaign.growth!.deployments[id]).toEqual(defaultParty(id));
  expect(loaded.campaign.growth!.compensated).toEqual(['B06']);expect(loaded.campaign.unlocked).toContain('B07');
  expect(writeCampaign(storage,loaded.campaign).ok).toBe(true);expect(JSON.parse(data.get(CAMPAIGN_KEY)!).version).toBe(4);
 });
 it('canonicalizes valid unordered legacy clear lists without losing progress',()=>{ const {data,storage}=memory();const old=legacy(through(3));old.completed.reverse();data.set(CAMPAIGN_KEY,JSON.stringify(old));expect(readCampaign(storage).campaign.completed).toEqual(ids.slice(0,3)); });
 it('accepts a valid old in-memory fixture for an explicit save',()=>{const {storage}=memory();expect(writeCampaign(storage,legacy(through(2))).ok).toBe(true);expect(readCampaign(storage).campaign.version).toBe(4);});
 it('includes downed player combatants in deployment and excludes escorted witnesses',()=>{
  const c=selectBattle(through(4),'B05'),b=createInitialState('B05');b.phase='won';b.records=records.B05;b.units.find(u=>u.id==='ally-garan')!.hp=0;
  const next=completeBattle(c,b);expect(next.growth!.deployments.B05).toContain('ally-garan');expect(next.growth!.deployments.B05).not.toContain('ally-tom');
 });
 it('keeps the first-clear roster and reward when replayed with another valid party',()=>{
  const c=through(4),b=createInitialState('B04');b.phase='won';b.records=records.B04;
  const iva=b.units.find(u=>u.id==='ally-iva')!;iva.id='ally-dani';const replay=completeBattle(c,b);
  expect(replay.growth).toEqual(c.growth);expect(trainingPoints(replay.growth!,'ally-dani')).toBe(0);
 });
 it('compensates forced B06 absence exactly once on B07 selection, never voluntary reserves',()=>{
  let c=through(6);expect(c.growth!.compensated).toEqual([]);const before=trainingPoints(c.growth!,'ally-neia');
  c=selectBattle(c,'B07');expect(trainingPoints(c.growth!,'ally-neia')).toBe(before+2);expect(trainingPoints(c.growth!,'ally-dani')).toBe(0);
  c=selectBattle(selectBattle(c,'B01'),'B07');expect(c.growth!.compensated).toEqual(['B06']);expect(trainingPoints(c.growth!,'ally-neia')).toBe(before+2);
  const {storage}=memory();expect(writeCampaign(storage,c).ok).toBe(true);expect(trainingPoints(readCampaign(storage).campaign.growth!,'ally-neia')).toBe(before+2);
 });
 it('preserves historical catch-up, party choices and learned support input without re-enabling them',()=>{
  let c=selectBattle(through(4),'B05');const growth=tutor(c.growth!,'ally-dani',c.completed);
  const jobs=learnSkill(c.jobs!,growth,'ally-lise','surveyor-foundation','B04');const party=['ally-lise','ally-garan','ally-neia','ally-dani'] as const;
  c=legacyPreparation(c,{growth,jobs,parties:{B05:[...party]}});const {storage,data}=memory();data.set(CAMPAIGN_KEY,JSON.stringify(c));const migrated=readCampaign(storage);expect(migrated.writable).toBe(true);expect(writeCampaign(storage,migrated.campaign).ok).toBe(true);
  const loaded=readCampaign(storage).campaign;expect(loaded).toEqual(c);expect(trainingPoints(loaded.growth!,'ally-dani')).toBe(6);expect(loaded.evidence).toEqual(c.evidence);
 });
 it.each(['growth','jobs','parties'] as const)('protects malformed v2 %s instead of silently migrating it',field=>{
  const {data,storage}=memory();const raw=JSON.stringify({...through(1),[field]:{}});data.set(CAMPAIGN_KEY,field==='parties'?JSON.stringify({...through(1),parties:{B06:['ally-neia']}}):raw);
  const original=data.get(CAMPAIGN_KEY);expect(readCampaign(storage).writable).toBe(false);expect(writeCampaign(storage,createCampaign()).ok).toBe(false);expect(data.get(CAMPAIGN_KEY)).toBe(original);
 });
 it('rejects extra v2 fields and unknown versions without overwriting them',()=>{ const {data,storage}=memory();for(const bad of [{...createCampaign(),future:true},{...createCampaign(),version:5}]){const raw=JSON.stringify(bad);data.set(CAMPAIGN_KEY,raw);expect(readCampaign(storage).writable).toBe(false);expect(data.get(CAMPAIGN_KEY)).toBe(raw);} });
});
describe('Campaign v2 multiple-session conflict safety',()=>{
 it('merges a stale checkpoint without erasing later deployments, compensation or evidence',()=>{
  const {storage}=memory();const stale=createCampaign();let latest=selectBattle(through(6),'B07');expect(writeCampaign(storage,latest).ok).toBe(true);
  const result=writeCampaign(storage,stale);expect(result.ok).toBe(true);expect(result.campaign!.completed).toEqual(latest.completed);expect(result.campaign!.growth).toEqual(latest.growth);
 });
 it('rejects conflicting first-clear rosters and preserves original bytes',()=>{
  const {storage,data}=memory();writeCampaign(storage,through(3));const a=readCampaign(storage).campaign,b=readCampaign(storage).campaign;
  const first=win(selectBattle(a,'B04'),'B04');expect(writeCampaign(storage,first).ok).toBe(true);
  const battle=createInitialState('B04');battle.phase='won';battle.records=records.B04;battle.units.find(u=>u.id==='ally-iva')!.id='ally-sena';const other=completeBattle(selectBattle(b,'B04'),battle);
  const raw=data.get(CAMPAIGN_KEY);expect(writeCampaign(storage,other)).toMatchObject({ok:false});expect(data.get(CAMPAIGN_KEY)).toBe(raw);
 });
 it('rejects new job-history edits through preparation and preserves an externally supplied old save',()=>{
  const {storage,data}=memory();writeCampaign(storage,through(3));const a=readCampaign(storage).campaign,b=readCampaign(storage).campaign;
  const archived=legacyPreparation(a,{jobs:learnSkill(a.jobs!,a.growth!,'ally-lise','surveyor-foundation','B04')});
  data.set(CAMPAIGN_KEY,JSON.stringify(archived));const raw=data.get(CAMPAIGN_KEY);
  expect(()=>editPreparation(b,{jobs:setMainJob(b.jobs!,'ally-lise','warden','B04')})).toThrow();
  expect(data.get(CAMPAIGN_KEY)).toBe(raw);expect(readCampaign(storage).campaign.jobs).toEqual(archived.jobs);
 });
 it('allows sequential party preparation edits after saving, while archived role data stays unchanged',()=>{
  const {storage}=memory();let c=through(3);expect(writeCampaign(storage,c).ok).toBe(true);const jobs=structuredClone(c.jobs);
  c=editPreparation(c,{parties:{B04:['ally-lise','ally-garan','ally-neia','ally-sena']}});const saved=writeCampaign(storage,c);expect(saved.ok).toBe(true);
  c=editPreparation(saved.campaign!,{parties:{B04:['ally-lise','ally-garan','ally-sena','ally-iva']}});expect(writeCampaign(storage,c).ok).toBe(true);
  expect(readCampaign(storage).campaign.parties!.B04).toEqual(['ally-lise','ally-garan','ally-sena','ally-iva']);expect(readCampaign(storage).campaign.jobs).toEqual(jobs);
 });
 it('preserves a newer archived role ledger when stale progress is saved without editing that ledger',()=>{
  const {storage,data}=memory();writeCampaign(storage,through(3));const stale=readCampaign(storage).campaign,current=readCampaign(storage).campaign;
  const archived=legacyPreparation(current,{jobs:learnSkill(current.jobs!,current.growth!,'ally-lise','surveyor-foundation','B04')});data.set(CAMPAIGN_KEY,JSON.stringify(archived));
  const result=writeCampaign(storage,win(selectBattle(stale,'B04'),'B04'));expect(result.ok).toBe(true);expect(result.campaign!.jobs!['ally-lise'].learned).toEqual(['surveyor-foundation']);expect(result.campaign!.completed).toContain('B04');
 });
 it('rejects stale conflicting preparation parties rather than replacing another window choice',()=>{
  const {storage,data}=memory();writeCampaign(storage,through(3));const a=readCampaign(storage).campaign,b=readCampaign(storage).campaign;
  const one=editPreparation(a,{parties:{B04:['ally-lise','ally-garan','ally-neia','ally-sena']}});const two=editPreparation(b,{parties:{B04:['ally-lise','ally-garan','ally-sena','ally-iva']}});
  expect(writeCampaign(storage,one).ok).toBe(true);const raw=data.get(CAMPAIGN_KEY);expect(writeCampaign(storage,two).ok).toBe(false);expect(data.get(CAMPAIGN_KEY)).toBe(raw);
 });
});
