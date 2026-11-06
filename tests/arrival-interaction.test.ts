import { describe, it, expect } from 'vitest';
import { createPartyBattle } from '../src/party';
import { BATTLE_IDS, defaultParty } from '../src/progression';
import { getBattleConfig } from '../src/domain/battles';
import { getCell, getUnit, reachable, reduce } from '../src/domain/engine';
import { arrivalInteraction } from '../src/view/arrivalInteraction';
import type { BattleState, Command, Pos } from '../src/domain/types';

function commit(state:BattleState,command:Command){const result=reduce(state,command);expect(result.error).toBeUndefined();return result.state;}
function approach(state:BattleState,pos:Pos){
 state.units=state.units.filter(unit=>unit.id==='ally-lise'||unit.kind==='escort');
 const cell=getCell(state,pos)!;
 const neighbor=state.cells.find(row=>Math.abs(row.x-pos.x)+Math.abs(row.y-pos.y)===1&&!row.blocked&&Math.abs(row.height-cell.height)<=1&&!state.units.some(u=>u.kind==='escort'&&u.pos.x===row.x&&u.pos.y===row.y))!;
 expect(neighbor).toBeDefined(); getUnit(state,'ally-lise')!.pos={x:neighbor.x,y:neighbor.y};
 return commit(state,{type:'start',unitId:'ally-lise'});
}
describe('arrival-only object interaction',()=>{
 it.each(BATTLE_IDS)('%s permits landing and confirms only from the object square',id=>{
  const config=getBattleConfig(id),initial=createPartyBattle(id,defaultParty(id));
  const actions:{pos:Pos;command:Command}[]=[
   ...config.records.map(record=>({pos:record,command:{type:'collect',recordId:record.id} as Command})),
   ...(initial.equipmentChests??[]).map(chest=>({pos:chest.pos,command:{type:'loot',eventId:chest.eventId} as Command})),
   ...(config.gate?[{pos:config.gate,command:{type:'gate'} as Command}]:[]),
   ...(config.sluiceGates??[]).map(gate=>({pos:gate.panel,command:{type:'gate',gateId:gate.id} as Command})),
   ...(config.repairSites??[]).map(site=>({pos:site.pos,command:{type:'repair',siteId:site.id} as Command})),
  ];
  for(const {pos,command} of actions){
   let state=structuredClone(initial);
   if(command.type==='repair')state.records.push(config.repairSites!.find(site=>site.id===command.siteId)!.workerRecordId);
   state=approach(state,pos);
   expect(getCell(state,pos)!.blocked).toBe(false);
   expect(reduce(state,command).error).toBeTruthy();
   expect(reachable(state,'ally-lise').some(row=>row.x===pos.x&&row.y===pos.y)).toBe(true);
   const beforeMove=structuredClone(state);
   state=commit(state,{type:'move',to:{x:pos.x,y:pos.y}});
   const before=structuredClone(state),popup=arrivalInteraction(state);
   expect(popup?.command.type).toBe(command.type);
   expect(popup?.body).not.toMatch(/1行動|行動を1回|座標|セル/);
   expect(state).toEqual(before); expect(state.activation.acted).toBe(false);
   // Cancelling leaves this exact state; it can be reopened or movement can be undone.
   expect(arrivalInteraction(state)).toEqual(popup);
   expect(reduce(state,{type:'undoMove'}).error).toBeUndefined();
   const confirmed=commit(state,popup!.command);
   const pickup=command.type==='loot'||command.type==='collect'&&!['evacuate','repair'].includes(config.objective??'');
   expect(confirmed.activation.acted).toBe(!pickup);if(pickup)expect(confirmed.activation.collected).toBe(true);
   const restored=commit(confirmed,{type:'undoMove'});
   expect(restored).toEqual({...beforeMove,activation:{...beforeMove.activation,moveCancelled:true}});
   expect(arrivalInteraction(confirmed)).toBeNull();
  }
 });
 it('never triggers an object while passing through it toward a different destination',()=>{
  const state=createPartyBattle('B01',defaultParty('B01'));
  getUnit(state,'ally-lise')!.pos={x:2,y:3};
  const started=commit(state,{type:'start',unitId:'ally-lise'});
  const moved=commit(started,{type:'move',to:{x:2,y:5}});
  expect(arrivalInteraction(moved)).toBeNull();expect(moved.gate.drained).toBe(false);
 });
});
