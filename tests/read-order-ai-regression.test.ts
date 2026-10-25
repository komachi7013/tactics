import {describe,it,expect} from 'vitest';
import {createPartyBattle} from '../src/party';
import {createJobs} from '../src/jobs';
import {BATTLE_IDS,defaultParty} from '../src/progression';
import {reduce,createInitialState,getUnit} from '../src/domain/engine';
import {runEnemyActivationWithTrace,getEnemyDecisionSnapshot} from '../src/domain/ai';
import {legacyEnemyActivationWithTrace} from './helpers/legacyEnemyAi';
import type {BattleState,Command,BattleId} from '../src/domain/types';
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
const routes:Record<BattleId,unknown>={B01:route01,B02:route02,B03:route03,B04:route04,B05:route05,B06:route06,B07:route07,B08:route08,B09:route09,B10:route10,B11:route11,B12:route12};
function compare(state:BattleState){
 const before=structuredClone(state),actual=runEnemyActivationWithTrace(state),old=legacyEnemyActivationWithTrace(state);
 expect(actual.commands).toEqual(old.commands);expect(actual.state).toEqual(old.state);expect(state).toEqual(before);
 if(actual.commands.length){
  const prediction=getEnemyDecisionSnapshot(state).next!;
  expect(actual.commands[0]).toEqual({type:'start',unitId:prediction.actorId});
  const move=actual.commands.find(c=>c.type==='move');
  if(move?.type==='move')expect(move.to).toMatchObject(prediction.destination);else expect(prediction.moveCost).toBe(0);
  expect(actual.commands.find(c=>c.type==='attack'||c.type==='defend')).toEqual(prediction.action==='attack'?{type:'attack',targetId:prediction.targetId}:{type:'defend'});
 }
 return actual;
}
describe('frozen pre-read-order AI oracle',()=>{
 it.each(BATTLE_IDS)('%s preserves every enemy command and full committed state on the earned progression route',id=>{
  const route=routes[id] as {level:number;commands:Command[];round:number};
  let s=createPartyBattle(id,defaultParty(id),createJobs(),route.level),checked=0;
  for(const command of route.commands){const result=reduce(s,command);expect(result.error,JSON.stringify(command)).toBeUndefined();s=result.state;let guard=0;
   while(s.turn==='enemy'&&s.phase==='playing'){expect(++guard).toBeLessThanOrEqual(10);s=compare(s).state;checked++;}
  }
  expect(s.phase).toBe('won');expect(s.round).toBe(route.round);expect(checked).toBeGreaterThan(0);
 });
 it.each(BATTLE_IDS)('%s ignores read metadata in decisions and uses one snapshot per immutable state',id=>{
  const s=createInitialState(id);s.turn='enemy';s.readOrders=s.units.filter(u=>u.team==='enemy').slice(0,2).map(u=>u.id);
  const one=getEnemyDecisionSnapshot(s);expect(getEnemyDecisionSnapshot(s)).toBe(one);compare(s);
  const clone=structuredClone(s);expect(getEnemyDecisionSnapshot(clone)).not.toBe(one);expect(getEnemyDecisionSnapshot(clone)).toEqual(one);
 });
 it.each(['equal damage/cost','all unreachable','occupied guard goal','acted enemy','retired target','guard/protection','terminal'] as const)('keeps legacy behavior: %s',kind=>{
  const s=createInitialState('B09');s.turn='enemy';
  if(kind==='equal damage/cost'){for(const c of s.cells){c.height=0;c.shallow=false;c.blocked=false;}for(const u of s.units){u.move=1;u.atk=6;u.def=1;}}
  if(kind==='all unreachable'){for(const c of s.cells)c.blocked=true;for(const e of s.units.filter(u=>u.team==='enemy'))e.guardGoal={x:9,y:7};}
  if(kind==='occupied guard goal')for(const e of s.units.filter(u=>u.team==='enemy'))e.guardGoal={...getUnit(s,'escort-delegation')!.pos};
  if(kind==='acted enemy')s.units.find(u=>u.team==='enemy')!.acted=true;
  if(kind==='retired target')getUnit(s,'ally-neia')!.hp=0;
  if(kind==='guard/protection'){const u=getUnit(s,'ally-lise')!;u.guard=true;u.protection={sourceId:'ally-garan'};u.facing='W';}
  if(kind==='terminal')s.phase='lost';
  compare(s);
 });
});
