import { createInitialState } from './domain/engine';
import { faceNearestOpponents } from './domain/initialFacing';
import type { BattleId, BattleState, Unit } from './domain/types';
import { availableCharacters, type CharacterId } from './progression';
import { applyJobs, type JobsState } from './jobs';
import {applyEquipment,EQUIPMENT_EVENTS,type EquipmentState} from './equipment';
import { createBattleRandom, type CombatRandomConfig } from './domain/combatRandom';
export function validateParty(battleId:BattleId,party:unknown):party is CharacterId[] {
 const available=availableCharacters(battleId);
 return Array.isArray(party)&&Object.keys(party).length===party.length&&Array.from({length:party.length},(_,i)=>Object.hasOwn(party,i)).every(Boolean)&&party.length===Math.min(4,available.length)&&new Set(party).size===party.length&&party.includes('ally-lise')&&party.every(id=>available.includes(id));
}
export function createPreparedUnit(character:CharacterId,jobs:JobsState|undefined,level:number,equipment?:EquipmentState):Unit {
 if(!Number.isInteger(level)||level<1||level>5)throw Error('共通レベルが不正です');
 const templates=new Map<string,Unit>();
 for(const id of ['B01','B03','B04'] as const)for(const unit of createInitialState(id).units)if(unit.team==='player'&&unit.kind!=='escort'&&!templates.has(unit.id))templates.set(unit.id,unit);
 templates.set('ally-dani',{...structuredClone(templates.get('ally-sena')!),id:'ally-dani',name:'ダニ',role:'記録官',hp:18,maxHp:18,atk:5,def:1,weapon:'melee',healCharges:undefined});
 const template=templates.get(character);if(!template)throw Error('人物データがありません');
 const adjusted=jobs?applyJobs(structuredClone(template),jobs):structuredClone(template);
 adjusted.maxHp+=2*(level-1);adjusted.hp+=2*(level-1);adjusted.atk+=level-1;
 return equipment?applyEquipment(adjusted,equipment):adjusted;
}
/** Pass campaign combat in the runtime. Omission preserves explicit legacy test/oracle battles. */
export function createPartyBattle(battleId:BattleId,party:readonly CharacterId[],jobs?:JobsState,level=1,options?:{equipment?:EquipmentState;confirmedEquipmentEvents?:readonly string[];combat?:CombatRandomConfig}):BattleState {
 if(!Number.isInteger(level)||level<1||level>5)throw Error('共通レベルが不正です');
 if(!validateParty(battleId,party))throw Error('リセ必須・出撃可能な仲間を含む基本4人編成を選んでください');
 const state=createInitialState(battleId);
 if(options?.combat)state.combatRandom=createBattleRandom(options.combat,battleId);
 const slots=state.units.filter(u=>u.team==='player'&&u.kind!=='escort').map(u=>({...u.pos}));
 const players=party.map((id,i)=>({...createPreparedUnit(id,jobs,level,options?.equipment),pos:{...slots[i]}}));
 state.units=faceNearestOpponents([...players,...state.units.filter(u=>u.team!=='player'||u.kind==='escort')]);
 const chests=EQUIPMENT_EVENTS.filter(e=>e.source==='chest'&&e.battleId===battleId&&!options?.confirmedEquipmentEvents?.includes(e.id)).map(e=>({eventId:e.id,pos:{...e.pos!}}));
 if(chests.length)state.equipmentChests=chests;
 return state;
}
