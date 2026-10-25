import route01Loot from './fixtures/progression-v2/b01-loot-route.json';
import route02Loot from './fixtures/progression-v2/b02-loot-route.json';
import route11Loot from './fixtures/progression-v2/b11-loot-route.json';
import route10Loot from './fixtures/progression-v2/b10-loot-route.json';
import route09Loot from './fixtures/progression-v2/b09-loot-route.json';
import route08Loot from './fixtures/progression-v2/b08-loot-route.json';
import route06Loot from './fixtures/progression-v2/b06-loot-route.json';
import route05Loot from './fixtures/progression-v2/b05-loot-route.json';
import route04Loot from './fixtures/progression-v2/b04-loot-route.json';
import {describe,it,expect} from 'vitest';
import route01 from './fixtures/progression-v2/b01-route.json';
import route02 from './fixtures/progression-v2/b02-route.json';
import route03 from './fixtures/progression-v2/b03-route.json';
import route03Loot from './fixtures/progression-v2/b03-loot-route.json';
import route04 from './fixtures/progression-v2/b04-route.json';
import route05 from './fixtures/progression-v2/b05-route.json';
import route06 from './fixtures/progression-v2/b06-route.json';
import route07 from './fixtures/progression-v2/b07-route.json';
import route07Loot from './fixtures/progression-v2/b07-loot-route.json';
import route08 from './fixtures/progression-v2/b08-route.json';
import route09 from './fixtures/progression-v2/b09-route.json';
import route10 from './fixtures/progression-v2/b10-route.json';
import route11 from './fixtures/progression-v2/b11-route.json';
import route12 from './fixtures/progression-v2/b12-route.json';
import {createPartyBattle} from '../src/party';
import {defaultParty,BATTLE_IDS} from '../src/progression';
import {createJobs} from '../src/jobs';
import {createEquipment,EQUIPMENT_EVENTS} from '../src/equipment';
import {reduce,equipmentPickupPreview} from '../src/domain/engine';
import {runEnemyActivation} from '../src/domain/ai';
import {getBattleConfig} from '../src/domain/battles';
import type {BattleId,BattleState,Command} from '../src/domain/types';
interface Route {level:number;commands:Command[];round:number;records:string[];playerHp:[string,number][]}
const routes=[route01,route02,route03,route04,route05,route06,route07,route08,route09,route10,route11,route12] as unknown as Route[];
// Index refers to the unchanged progression-v2 fixture. Replace a defend or insert before a free end/move.
const pickupEdits=[{index:25,replace:false},{index:45,replace:true},{index:58,replace:true},{index:28,replace:true},{index:38,replace:true},{index:55,replace:true},{index:30,replace:false},{index:42,replace:false},{index:30,replace:false},{index:30,replace:false},{index:45,replace:false}];
function initial(id:BattleId,route:Route){return createPartyBattle(id,defaultParty(id),createJobs(),route.level,{equipment:createEquipment(),confirmedEquipmentEvents:[]});}
function replay(state:BattleState,commands:Command[]):BattleState {
 let s=state;
 for(const [index,command] of commands.entries()){
  expect(s.phase,`${s.battleId} command ${index}`).toBe('playing');expect(s.turn).toBe('player');
  if(command.type==='loot')expect(equipmentPickupPreview(s,command.eventId),`${s.battleId} loot ${index}`).toMatchObject({eligible:true,legal:true});
  const before=s;const result=reduce(s,command);expect(result.error,`${s.battleId} command ${index} ${JSON.stringify(command)}`).toBeUndefined();s=result.state;
  if(command.type==='loot'){expect(s.activation.acted).toBe(true);expect(s.units).toEqual(before.units);expect(s.records).toEqual(before.records);expect(s.pendingEquipment).toEqual([command.eventId]);}
  let guard=0;while(s.phase==='playing'&&s.turn==='enemy'){expect(++guard).toBeLessThanOrEqual(10);s=runEnemyActivation(s);}
 }
 expect(s.phase).toBe('won');expect(s.round).toBeLessThanOrEqual(getBattleConfig(s.battleId).roundLimit);return s;
}
describe('equipment normal-AI campaign routes (no ability, AI or deadline overrides)',()=>{
 for(const [index,id] of BATTLE_IDS.entries())it(`${id}: ignores every chest and preserves the exact accepted standard-equipment outcome`,()=>{
  const route=routes[index],state=initial(id,route),won=replay(state,route.commands);
  expect(state.equipmentChests?.length??0).toBe(id==='B12'?0:1);expect(won.pendingEquipment??[]).toEqual([]);
  expect(won.round).toBe(route.round);expect(won.records).toEqual(route.records);expect(won.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])).toEqual(route.playerHp);
 });
 for(const [index,id] of BATTLE_IDS.slice(0,11).entries())it(`${id}: spends one legal action on its real chest and still wins within the configured deadline`,()=>{
  const route=routes[index],lootRoutes=[route01Loot,route02Loot,route03Loot,route04Loot,route05Loot,route06Loot,route07Loot,route08Loot,route09Loot,route10Loot,route11Loot],lootRoute=lootRoutes[index],commands=structuredClone(lootRoute.commands) as Command[],eventId=`chest:${id}`;
  expect(commands.filter(c=>c.type==='loot')).toEqual([{type:'loot',eventId}]);
  const state=initial(id,route),event=EQUIPMENT_EVENTS.find(e=>e.id===eventId)!;
  expect(state.equipmentChests).toEqual([{eventId,pos:event.pos}]);
  const won=replay(state,commands);expect(won.pendingEquipment).toEqual([eventId]);expect(won.records).toEqual(route.records);
  expect(won.round).toBe(lootRoute.round);
  expect(won.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])).toEqual(lootRoute.playerHp);
 });
});
