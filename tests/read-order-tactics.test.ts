import {describe,it,expect} from 'vitest';
import {createPartyBattle} from '../src/party';
import {createJobs} from '../src/jobs';
import {reduce,getUnit,attackPreview} from '../src/domain/engine';
import {getEnemyDecisionSnapshot,runEnemyActivationWithTrace} from '../src/domain/ai';
import type {BattleState,Command,Facing} from '../src/domain/types';
function step(s:BattleState,c:Command){const r=reduce(s,c);expect(r.error,JSON.stringify(c)).toBeUndefined();return r.state;}
function opening(){let s=createPartyBattle('B07',['ally-lise','ally-garan','ally-neia','ally-dani'],createJobs(),3);s=step(s,{type:'start',unitId:'ally-dani'});s=step(s,{type:'move',to:{x:11,y:13}});return s;}
function respond(s:BattleState,facing:Facing){const end=step(step(s,{type:'end',facing}),{type:'endPlayerTurn'}),forecast=getEnemyDecisionSnapshot(end).next!,actual=runEnemyActivationWithTrace(end);expect(actual.commands[0]).toEqual({type:'start',unitId:forecast.actorId});return {end,forecast,...actual};}
describe('read-order defensive decision on an expanded adopted campaign board',()=>{
 it('reveals a nonadjacent melee approach and supports facing east instead of exposing the rear: 7 to 5 actual damage',()=>{
  const start=opening();expect(attackPreview(start,'enemy-melee-02','ally-dani').legal).toBe(false);
  const marked=step(start,{type:'readOrder',targetId:'enemy-melee-02'}),snapshot=getEnemyDecisionSnapshot(marked),intent=snapshot.byActor['enemy-melee-02'];
  expect(intent).toMatchObject({actorId:'enemy-melee-02',destination:{x:12,y:13},targetId:'ally-dani',action:'attack',damage:5});
  expect(snapshot.next?.actorId).toBe('enemy-melee-02');
  const exposed=respond(marked,'W'),faced=respond(marked,'E');
  for(const r of [exposed,faced]){expect(r.forecast.actorId).toBe('enemy-melee-02');expect(r.commands.find(c=>c.type==='attack')).toEqual({type:'attack',targetId:'ally-dani'});expect(r.state.readOrders).toBeUndefined();}
  expect(exposed.forecast.damage).toBe(7);expect(faced.forecast.damage).toBe(5);
  expect(getUnit(exposed.state,'ally-dani')!.hp).toBe(15);expect(getUnit(faced.state,'ally-dani')!.hp).toBe(17);
  expect(getUnit(marked,'ally-dani')!.readCharges).toBe(1);expect(marked.activation.acted).toBe(true);
  // Read-order information never increases defense or rewrites enemy decisions.
  const withoutRead=respond(start,'E');expect(withoutRead.commands).toEqual(faced.commands);expect(getUnit(withoutRead.state,'ally-dani')!.hp).toBe(17);
  console.log('READ_ORDER_TACTICAL_PROOF '+JSON.stringify({battle:'B07',party:['L','G','N','D'],level:3,commands:[{type:'start',unitId:'ally-dani'},{type:'move',to:{x:11,y:13}},{type:'readOrder',targetId:'enemy-melee-02'}],intent,exposed:{facing:'W',damage:7,hp:15,commands:exposed.commands},faced:{facing:'E',damage:5,hp:17,commands:faced.commands},limits:'local one-response counterfactual; not clear-turn/balance/first-time usability proof'}));
 });
 it('retains a negative control: a distant guard defender has the same local defend intent after facing changes',()=>{
  const marked=step(opening(),{type:'readOrder',targetId:'enemy-melee-01'});
  const north=step(marked,{type:'end',facing:'N'}),south=step(marked,{type:'end',facing:'S'});
  const a=getEnemyDecisionSnapshot(north).byActor['enemy-melee-01'],b=getEnemyDecisionSnapshot(south).byActor['enemy-melee-01'];
  expect(a.action).toBe('defend');expect(b).toEqual(a);expect(getEnemyDecisionSnapshot(marked).next?.actorId).not.toBe('enemy-melee-01');
 });
});
