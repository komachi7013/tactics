import b02 from './landscapes/b02.json';
import b03 from './landscapes/b03.json';
import b04 from './landscapes/b04.json';
import b05 from './landscapes/b05.json';
import b06 from './landscapes/b06.json';
import b07 from './landscapes/b07.json';
import b08 from './landscapes/b08.json';
import b09 from './landscapes/b09.json';
import b10 from './landscapes/b10.json';
import b11 from './landscapes/b11.json';
import type {BattleId,Pos,Unit} from './domain/types';
import {BATTLE_IDS,CHARACTER_IDS,type CharacterId} from './progression';
import type {JobsState} from './jobs';
export type EquipmentSlot='weapon'|'head'|'body'|'legs';
export interface EquipmentLoadout {weapon:string|null;head:string|null;body:string|null;legs:string|null}
export interface EquipmentState {acquired:string[];loadouts:Record<CharacterId,EquipmentLoadout>}
export interface EquipmentNumbers {hp:number;atk:number;def:number}
export interface EquipmentItem {id:string;name:string;slot:EquipmentSlot;bonus:EquipmentNumbers;weapon?:'melee'|'bow'}
export interface EquipmentEvent {id:string;battleId:BattleId;itemId:string;source:'clear'|'chest';pos?:Pos}
const item=(id:string,name:string,slot:EquipmentSlot,hp=0,atk=0,def=0,weapon?:'melee'|'bow'):EquipmentItem=>({id,name,slot,bonus:{hp,atk,def},...(weapon?{weapon}:{})});
export const EQUIPMENT_ITEMS:readonly EquipmentItem[]=[
 item('basic-soft-head','緩衝頭覆','head',1),item('basic-braced-head','支え頭帯','head',-1,0,1),item('basic-lined-body','裏当て上衣','body',1),item('basic-braced-body','補強作業胴','body',0,-1,1),item('basic-padded-legs','緩衝脚巻','legs',1),item('basic-strike-legs','踏込脚巻','legs',-1,1),
 item('balanced-kit','守備調整近接具','weapon',0,-1,1,'melee'),item('assault-kit','攻勢調整近接具','weapon',0,1,-1,'melee'),item('light-crossbow','軽量調整弩','weapon',0,1,-1,'bow'),item('aid-vest','救護胴衣','body',3,0,-1),item('reinforced-headband','補強頭帯','head',0,-1,2),item('stance-wrap','踏み込み脚帯','legs',0,2,-1),
];
const clears=['basic-soft-head','basic-lined-body','basic-padded-legs','basic-braced-head','basic-braced-body','basic-strike-legs','basic-soft-head','basic-lined-body','basic-padded-legs','basic-braced-head','basic-braced-body'];
const chests=['basic-braced-head','basic-braced-body','aid-vest','balanced-kit','assault-kit','reinforced-headband','basic-padded-legs','light-crossbow','basic-strike-legs','basic-soft-head','stance-wrap'];
// Positions are exercised by normal commands and real AI in equipment-routes.test.ts.
const positions:Pos[]=[{"x":6,"y":5},b02.points.chest,b03.points.chest,b04.points.chest,b05.points.chest,b06.points.chest,b07.points.chest,b08.points.chest,b09.points.chest,b10.points.chest,b11.points.chest];
export const EQUIPMENT_EVENTS:readonly EquipmentEvent[]=BATTLE_IDS.slice(0,11).flatMap((battleId,i)=>[{id:`clear:${battleId}`,battleId,itemId:clears[i],source:'clear' as const},{id:`chest:${battleId}`,battleId,itemId:chests[i],source:'chest' as const,pos:positions[i]}]);
const slots:readonly EquipmentSlot[]=['weapon','head','body','legs'];
const zero=():EquipmentNumbers=>({hp:0,atk:0,def:0});
const entry=(id:string)=>EQUIPMENT_EVENTS.find(e=>e.id===id);
const definition=(instance:string)=>{const event=entry(instance);return event&&EQUIPMENT_ITEMS.find(i=>i.id===event.itemId);};
export function createEquipment():EquipmentState {return {acquired:[],loadouts:Object.fromEntries(CHARACTER_IDS.map(id=>[id,{weapon:null,head:null,body:null,legs:null}])) as Record<CharacterId,EquipmentLoadout>};}
export function ownedEquipment(completed:readonly BattleId[],acquired:readonly string[]):EquipmentEvent[]{return EQUIPMENT_EVENTS.filter(e=>e.source==='clear'?completed.includes(e.battleId):acquired.includes(e.id));}
export function joinedEquipmentCharacters(completed:readonly BattleId[]):CharacterId[]{return CHARACTER_IDS.filter(id=>id==='ally-sena'?completed.includes('B02'):id==='ally-iva'?completed.includes('B03'):id==='ally-dani'?completed.includes('B04'):true);}
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const keys=(v:object,allowed:readonly string[])=>Object.keys(v).length===allowed.length&&allowed.every(k=>Object.hasOwn(v,k));
const dense=(v:unknown):v is unknown[]=>Array.isArray(v)&&Object.keys(v).length===v.length&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean);
function weaponFits(item:EquipmentItem,id:CharacterId,jobs:JobsState){return !item.weapon||item.weapon===(jobs[id].main==='scout'?'bow':'melee');}
export function validEquipment(value:unknown,completed:readonly BattleId[],jobs:JobsState):value is EquipmentState {
 if(!Array.isArray(completed)||completed.some((id,i)=>id!==BATTLE_IDS[i])||!jobs||CHARACTER_IDS.some(id=>!jobs[id]||!['surveyor','warden','scout','healer','engineer','recorder'].includes(jobs[id].main)))return false;
 if(!plain(value)||!keys(value,['acquired','loadouts'])||!dense(value.acquired)||!plain(value.loadouts)||!keys(value.loadouts,CHARACTER_IDS))return false;
 if(value.acquired.some(id=>typeof id!=='string'||entry(id)?.source!=='chest'||!completed.includes(entry(id)!.battleId))||new Set(value.acquired).size!==value.acquired.length)return false;
 const owned=new Set(ownedEquipment(completed,value.acquired as string[]).map(e=>e.id)),joined=joinedEquipmentCharacters(completed),used=new Set<string>();
 for(const id of CHARACTER_IDS){const loadout=value.loadouts[id];if(!plain(loadout)||!keys(loadout,slots))return false;
 for(const slot of slots){const instance=loadout[slot];if(instance===null)continue;if(typeof instance!=='string'||!owned.has(instance)||used.has(instance)||!joined.includes(id))return false;const item=definition(instance);if(!item||item.slot!==slot||!weaponFits(item,id,jobs))return false;used.add(instance);}}
 return true;
}
export function equipItem(equipment:EquipmentState,completed:readonly BattleId[],jobs:JobsState,character:CharacterId,slot:EquipmentSlot,instanceId:string|null,battleId?:BattleId):EquipmentState {
 if(!validEquipment(equipment,completed,jobs)||!CHARACTER_IDS.includes(character)||!slots.includes(slot)||!joinedEquipmentCharacters(completed).includes(character))throw Error('装備データまたは加入状態が不正です');
 if(battleId==='B06'&&character==='ally-neia')throw Error('離脱中の装備は変更できません');
 const next=structuredClone(equipment);next.loadouts[character][slot]=instanceId;if(!validEquipment(next,completed,jobs))throw Error('未所持・部位不適合・職不適合・重複装備です');return next;
}
export function reconcileEquipmentJobs(equipment:EquipmentState,jobs:JobsState):EquipmentState {
 const next=structuredClone(equipment);for(const id of CHARACTER_IDS){const instance=next.loadouts[id].weapon;if(instance){const item=definition(instance);if(item&&!weaponFits(item,id,jobs))next.loadouts[id].weapon=null;}}return next;
}
export function equipmentBonus(loadout:EquipmentLoadout){
 const positive=zero(),negative=zero(),weapon=zero(),cap={hp:3,def:2,atk:2};
 for(const slot of slots){const instance=loadout[slot];if(!instance)continue;const item=definition(instance);if(!item||item.slot!==slot)throw Error('装備個体が不正です');for(const key of ['hp','atk','def'] as const){const n=item.bonus[key];if(slot==='weapon')weapon[key]+=n;else if(n>0)positive[key]+=n;else negative[key]+=n;}}
 const capped=zero(),capLoss=zero(),total=zero();for(const key of ['hp','atk','def'] as const){capped[key]=Math.min(positive[key],cap[key]);capLoss[key]=positive[key]-capped[key];total[key]=weapon[key]+capped[key]+negative[key];}
 return {...total,armorPositive:positive,armorNegative:negative,armorCapped:capped,capLoss,weapon};
}
export function applyEquipment(unit:Unit,equipment:EquipmentState):Unit {
 const next=structuredClone(unit);delete next.equipmentWeaponId;if(!CHARACTER_IDS.includes(unit.id as CharacterId)||unit.team!=='player'||unit.kind==='escort')return next;
 const loadout=equipment.loadouts[unit.id as CharacterId],bonus=equipmentBonus(loadout);next.maxHp=Math.max(1,next.maxHp+bonus.hp);next.hp=unit.hp>0?Math.max(1,Math.min(next.maxHp,unit.hp+bonus.hp)):0;next.atk=Math.max(0,next.atk+bonus.atk);next.def=Math.max(0,next.def+bonus.def);if(loadout.weapon)next.equipmentWeaponId=definition(loadout.weapon)!.id;return next;
}
