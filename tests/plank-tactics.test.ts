import {describe,it,expect} from 'vitest';
import {createPartyBattle} from '../src/party';
import {createJobs} from '../src/jobs';
import {defaultParty} from '../src/progression';
import {reduce,reachable,attackPreview,canCollect,getUnit} from '../src/domain/engine';
import {runEnemyActivationWithTrace} from '../src/domain/ai';
import type {BattleState,Command,BattleId} from '../src/domain/types';
function step(s:BattleState,c:Command):BattleState {const r=reduce(s,c);expect(r.error,JSON.stringify(c)).toBeUndefined();return r.state;}
function opening(id:BattleId,plank:boolean){let s=createPartyBattle(id,defaultParty(id),createJobs(),2);s=step(s,{type:'start',unitId:'ally-iva'});if(id==='B08')s=step(s,{type:'move',to:{x:9,y:11}});s=step(s,plank?{type:'plank',targetId:'ally-lise'}:{type:'defend'});s=step(s,{type:'end',facing:'E'});const ai=runEnemyActivationWithTrace(s);return {state:step(ai.state,{type:'start',unitId:'ally-lise'}),enemyCommands:ai.commands};}
describe('plank on unchanged campaign terrain with actual deterministic AI',()=>{
 it.each(['B05','B08'] as BattleId[])('compares movement support and a dry control on %s',id=>{
  const aided=opening(id,true),bare=opening(id,false);
  const range=reachable(aided.state,'ally-lise'),old=reachable(bare.state,'ally-lise');
  const extra=range.filter(p=>!old.some(q=>q.x===p.x&&q.y===p.y)).map(p=>{
   const moved=step(aided.state,{type:'move',to:{x:p.x,y:p.y}});
   return {x:p.x,y:p.y,cost:p.cost,path:p.path,attacks:moved.units.filter(u=>u.team==='enemy'&&attackPreview(moved,'ally-lise',u.id).legal).map(u=>u.id),records:['D','T','S','K','P'].filter(r=>canCollect(moved,r))};
  });
  expect(aided.enemyCommands).toEqual(bare.enemyCommands);
  expect(getUnit(aided.state,'ally-iva')!.plankCharges).toBe(1);
  if(id==='B05'){
   // This opening has no shallow tiles in range. Casting consumes an action
   // without making the dry board cheaper: do not invent a tactical benefit.
   expect(range).toEqual(old);expect(extra).toEqual([]);
   const moved=step(aided.state,{type:'move',to:{x:10,y:20}});
   expect(getUnit(moved,'ally-lise')!.plankReady).toBeUndefined();
  }else{
   expect(extra.map(p=>({x:p.x,y:p.y,cost:p.cost}))).toEqual([{x:13,y:10,cost:4}]);
   const before=structuredClone(aided.state),destination={x:13,y:10};
   expect(reduce(bare.state,{type:'move',to:destination}).error).toBeDefined();
   const moved=step(aided.state,{type:'move',to:destination});
   expect(getUnit(moved,'ally-lise')!.pos).toEqual(destination);
   expect(getUnit(moved,'ally-lise')!.plankReady).toBeUndefined();
   const undone=step(moved,{type:'undoMove'});
   expect(getUnit(undone,'ally-lise')!.pos).toEqual({x:10,y:11});
   expect(getUnit(undone,'ally-lise')!.plankReady).toBe(true);
   expect(getUnit(undone,'ally-iva')!.plankCharges).toBe(1);
   expect(reachable(undone,'ally-lise')).toEqual(range);
   expect(aided.state).toEqual(before);
  }
 });
});
