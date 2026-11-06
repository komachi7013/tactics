import {describe,it,expect} from 'vitest';
import {createPartyBattle} from '../src/party';
import {defaultParty} from '../src/progression';
import {getUnit,reduce} from '../src/domain/engine';
import {getBattleConfig} from '../src/domain/battles';
import {arrivalInteraction} from '../src/view/arrivalInteraction';
import {selectionCommandState} from '../src/view/selectionCommands';
import type {BattleState,Command} from '../src/domain/types';
function commit(s:BattleState,c:Command){const result=reduce(s,c);expect(result.error).toBeUndefined();return result.state;}
const orders=['map','mpa','amp','apm','pma','pam'];
describe('independent movement, combat and pickup allowances',()=>{
 it.each(orders)('allows move, attack and record pickup once in order %s',order=>{
  let s=createPartyBattle('B01',defaultParty('B01'));
  s.cells.forEach(c=>{c.height=0;c.blocked=false;c.shallow=false;});
  s.units=s.units.filter(u=>u.team==='player'||u.id==='enemy-melee-01');
  const actor=getUnit(s,'ally-neia')!,record=getBattleConfig('B01').records[0],away={x:2,y:4};
  const pickupFirst=order.indexOf('p')<order.indexOf('m');actor.pos=pickupFirst?{x:record.x,y:record.y}:away;
  getUnit(s,'enemy-melee-01')!.pos={x:4,y:3};
  s=commit(s,{type:'start',unitId:actor.id});
  for(const step of order){
   if(step==='p')expect(arrivalInteraction(s)?.command).toEqual({type:'collect',recordId:record.id});
   const command:Command=step==='m'?{type:'move',to:pickupFirst?away:{x:record.x,y:record.y}}:step==='a'?{type:'attack',targetId:'enemy-melee-01'}:{type:'collect',recordId:record.id};
   s=commit(s,command);
  }
  expect(s.activation).toMatchObject({moved:true,acted:true,collected:true});
  expect(s.records).toContain(record.id);expect(reduce(s,{type:'attack',targetId:'enemy-melee-01'}).error).toBeTruthy();
  expect(reduce(s,{type:'move',to:{x:3,y:2}}).error).toBeTruthy();
 });
 it.each([true,false])('shares one pickup between treasure and records, treasure first=%s',treasureFirst=>{
  let s=createPartyBattle('B02',defaultParty('B02'));
  const record=getBattleConfig('B02').records[0],chest=s.equipmentChests![0];
  const first=treasureFirst?chest.pos:record,second=treasureFirst?record:chest.pos;
  getUnit(s,'ally-lise')!.pos={x:first.x,y:first.y};s=commit(s,{type:'start',unitId:'ally-lise'});
  s=commit(s,treasureFirst?{type:'loot',eventId:chest.eventId}:{type:'collect',recordId:record.id});
  expect(s.activation.acted).toBe(false);s=commit(s,{type:'move',to:{x:second.x,y:second.y}});
  expect(reduce(s,treasureFirst?{type:'collect',recordId:record.id}:{type:'loot',eventId:chest.eventId}).error).toBeTruthy();
  s=commit(s,{type:'undoMove'});expect(s.activation.collected).toBe(true);
  expect(reduce(s,{type:'start',unitId:'ally-garan'}).error).toBeTruthy();
  expect(selectionCommandState(s,'ally-garan').activeId).toBe('ally-lise');
 });
 it.each([true,false])('allows a skill and pickup in either order, pickup first=%s',pickupFirst=>{
  let s=createPartyBattle('B01',defaultParty('B01'));const record=getBattleConfig('B01').records[0];
  getUnit(s,'ally-lise')!.pos={x:record.x,y:record.y};getUnit(s,'ally-garan')!.pos={x:record.x+1,y:record.y};
  s=commit(s,{type:'start',unitId:'ally-lise'});
  const commands:Command[]=[{type:'collect',recordId:record.id},{type:'survey',targetId:'ally-garan'}];
  for(const c of pickupFirst?commands:commands.reverse())s=commit(s,c);
  expect(s.activation).toMatchObject({acted:true,collected:true});
  expect(reduce(s,{type:'survey',targetId:'ally-garan'}).error).toBeTruthy();
 });
});
