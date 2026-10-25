import {describe,it,expect} from 'vitest';
import {createPartyBattle} from '../src/party';
import {createJobs} from '../src/jobs';
import {createInitialState,reduce,getUnit} from '../src/domain/engine';
import {getEnemyDecisionSnapshot,createEnemyDecisionSnapshotReader,runEnemyActivationWithTrace} from '../src/domain/ai';
import type {BattleState,Command,BattleId} from '../src/domain/types';
import b08 from './fixtures/progression-v2/b08-route.json';
import b09 from './fixtures/progression-v2/b09-route.json';
import {defaultParty} from '../src/progression';
function step(s:BattleState,c:Command){const r=reduce(s,c);expect(r.error,JSON.stringify(c)).toBeUndefined();expect(r.state).not.toBe(s);return r.state;}
function checked(s:BattleState){const before=structuredClone(s),cached=getEnemyDecisionSnapshot(s),fresh=createEnemyDecisionSnapshotReader()(s);expect(cached).toEqual(fresh);expect(getEnemyDecisionSnapshot(s)).toBe(cached);expect(s).toEqual(before);return cached;}
describe('read order recomputation across committed board changes',()=>{
 it.each([['B08',b08],['B09',b09]] as const)('%s refreshes along legal water/capture or escort/HP/retirement progression', (id,route)=>{
  let s=createPartyBattle(id as BattleId,defaultParty(id),createJobs(),route.level),changes=0,water=false,escort=false;
  for(const c of route.commands as Command[]){const previous=s,before=checked(s);s=step(s,c);const after=checked(s);expect(after).not.toBe(before);if(JSON.stringify(before)!==JSON.stringify(after))changes++;
   while(s.phase==='playing'&&s.turn==='enemy'){const prior=s,ai=runEnemyActivationWithTrace(s);expect(ai.commands.length).toBeGreaterThan(0);s=ai.state;checked(s);if(s.round!==prior.round){if(id==='B08'&&s.cells.some((cell,i)=>cell.shallow!==prior.cells[i].shallow))water=true;if(id==='B09'&&s.escort!.index!==prior.escort!.index)escort=true;}}
   if(s.round!==previous.round){if(id==='B08'&&s.cells.some((cell,i)=>cell.shallow!==previous.cells[i].shallow))water=true;if(id==='B09'&&s.escort!.index!==previous.escort!.index)escort=true;}
  }
  expect(s.phase).toBe('won');expect(changes).toBeGreaterThan(0);expect(id==='B08'?water:escort).toBe(true);expect(checked(s)).toEqual({byActor:{},next:undefined});
 } ,30000);
 it('restores the original prediction after legal move/undo without spending a charge',()=>{
  let s=createPartyBattle('B07',['ally-lise','ally-garan','ally-neia','ally-dani'],createJobs(),3);s=step(s,{type:'start',unitId:'ally-dani'});const before=checked(s);const moved=step(s,{type:'move',to:{x:11,y:13}});checked(moved);const undone=step(moved,{type:'undoMove'});expect(checked(undone)).toEqual(before);expect(getUnit(undone,'ally-dani')!.readCharges).toBe(2);
 });
 it('recomputes actual protection and expiry while an HP-only heal leaves the current damage score unchanged',()=>{
  // Synthetic small combat fixture for state transitions, not a tactical/campaign result.
  let s=createPartyBattle('B09',['ally-lise','ally-garan','ally-sena','ally-dani'],createJobs(),3);
  s.cells.forEach(c=>{c.height=0;c.shallow=false;c.blocked=false;});s.units.filter(u=>u.team==='enemy').forEach(u=>{u.move=0;if(u.id!=='enemy-melee-01')u.hp=0;});
  getUnit(s,'enemy-melee-01')!.pos={x:2,y:4};getUnit(s,'ally-dani')!.pos={x:1,y:4};getUnit(s,'ally-dani')!.facing='W';getUnit(s,'ally-dani')!.hp=10;getUnit(s,'ally-garan')!.pos={x:1,y:5};getUnit(s,'ally-sena')!.pos={x:0,y:4};
  s=step(s,{type:'start',unitId:'ally-sena'});const before=checked(s);s=step(s,{type:'heal',targetId:'ally-dani'});expect(getUnit(s,'ally-dani')!.hp).toBe(16);expect(checked(s)).toEqual(before);
  // Avoid unrelated AI execution so this fixture isolates the domain protection transition.
  s=structuredClone(s);s.activeId=null;s.turn='player';s.activation={moved:false,acted:false,moveOrigin:null};
  s=step(s,{type:'start',unitId:'ally-garan'});expect(checked(s).byActor['enemy-melee-01'].damage).toBe(7);s=step(s,{type:'protect',targetId:'ally-dani'});expect(checked(s).byActor['enemy-melee-01'].damage).toBe(5);
  s=structuredClone(s);s.activeId=null;s.turn='player';getUnit(s,'ally-garan')!.acted=false;s=step(s,{type:'start',unitId:'ally-garan'});expect(checked(s).byActor['enemy-melee-01'].damage).toBe(7);
 });
});
