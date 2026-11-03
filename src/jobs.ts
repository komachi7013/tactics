import type { BattleId, Unit } from './domain/types';
import { trainingPoints, type CharacterId, type Growth } from './progression';

export const JOB_IDS = ['surveyor','warden','scout','healer','engineer','recorder'] as const;
export type JobId = typeof JOB_IDS[number];
export type SkillId = `${JobId}-${'foundation'|'practice'}`;
export interface Skill { id: SkillId; job: JobId; name: string; cost: number; effect: 'hp'|'def'|'atk'|'move'|'shallow'; amount: number }
export interface CharacterJobs { main: JobId; learned: SkillId[]; support: SkillId|null }
export type JobsState = Record<CharacterId, CharacterJobs>;
export const JOB_NAMES: Record<JobId,string> = {surveyor:'測量官',warden:'堤防衛士',scout:'水路斥候',healer:'施療士',engineer:'水工師',recorder:'記録官'};
export const INITIAL_JOBS: Record<CharacterId,JobId> = {'ally-lise':'surveyor','ally-garan':'warden','ally-neia':'scout','ally-sena':'healer','ally-iva':'engineer','ally-dani':'recorder'};
const definitions: [JobId,string,string,Skill['effect'],Skill['effect']][] = [
 ['surveyor','測量の備え','地形踏査','hp','move'],['warden','守りの基礎','盾の鍛錬','hp','def'],
 ['scout','浅瀬歩き','狙いの鍛錬','shallow','atk'],['healer','救護の備え','応急防護','hp','def'],
 ['engineer','水路歩き','保守の備え','shallow','hp'],['recorder','記録の備え','観察の鍛錬','hp','atk'],
];
export const SKILLS: readonly Skill[] = Object.freeze(definitions.flatMap(([job,a,b,e,f])=>[
 Object.freeze({id:`${job}-foundation` as SkillId,job,name:a,cost:2,effect:e,amount:e==='hp'?2:1}),
 Object.freeze({id:`${job}-practice` as SkillId,job,name:b,cost:4,effect:f,amount:f==='hp'?3:1}),
]));
export function createJobs(): JobsState { return Object.fromEntries(Object.entries(INITIAL_JOBS).map(([id,main])=>[id,{main,learned:[] as SkillId[],support:null} as CharacterJobs])) as JobsState; }
const skillById=(id:unknown)=>SKILLS.find(s=>s.id===id);
const character=(id:unknown):id is CharacterId=>typeof id==='string'&&Object.hasOwn(INITIAL_JOBS,id);
export function spentTraining(state:JobsState,id:CharacterId):number { return state[id].learned.reduce((sum,key)=>sum+(skillById(key)?.cost??0),0); }
export function availableTraining(state:JobsState,growth:Growth,id:CharacterId):number { return trainingPoints(growth,id)-spentTraining(state,id); }
export function validJobs(value:unknown,growth:Growth):value is JobsState {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const raw=value as Record<string,unknown>;
 if(Object.keys(raw).length!==6||Object.keys(raw).some(k=>!character(k)))return false;
 for(const id of Object.keys(INITIAL_JOBS) as CharacterId[]){
  const entry=raw[id];if(!entry||typeof entry!=='object'||Array.isArray(entry))return false;
  const e=entry as CharacterJobs;
  if(Object.keys(e).sort().join(',')!=='learned,main,support'||!JOB_IDS.includes(e.main)||(e.main!==INITIAL_JOBS[id]&&e.main!=='surveyor'&&e.main!=='warden')||!Array.isArray(e.learned)||Object.keys(e.learned).length!==e.learned.length||Array.from({length:e.learned.length},(_,i)=>Object.hasOwn(e.learned,i)).some(v=>!v)||new Set(e.learned).size!==e.learned.length||e.learned.some(k=>!skillById(k)))return false;
  if(e.support!==null&&(!e.learned.includes(e.support)||!skillById(e.support)||skillById(e.support)!.job===e.main))return false;
  if(e.learned.reduce((sum,k)=>sum+skillById(k)!.cost,0)>trainingPoints(growth,id))return false;
 }
 return true;
}
export const validateJobs=validJobs;
/** Compatibility signatures remain, but new job/training edits are disabled. */
const fixedRoleEdit = (): never => { throw Error('職業変更・他職の支援・訓練は現在利用できません。各人物の役割は固定です。'); };
export function learnSkill(_state:JobsState,_growth:Growth,_id:CharacterId,_skill:SkillId,_battleId:BattleId):JobsState { return fixedRoleEdit(); }
export function setMainJob(_state:JobsState,_id:CharacterId,_job:JobId,_battleId:BattleId):JobsState { return fixedRoleEdit(); }
export function equipSupport(_state:JobsState,_id:CharacterId,_skill:SkillId|null):JobsState { return fixedRoleEdit(); }
export function respec(_state:JobsState,_id:CharacterId):JobsState { return fixedRoleEdit(); }

const FIXED_CAPABILITIES: Record<CharacterId, { role:string; hp:number; atk:number; def:number; weapon:'melee'|'bow'; shallowCost:number }> = {
 'ally-lise': {role:'測量官',hp:18,atk:7,def:1,weapon:'melee',shallowCost:2},
 'ally-garan': {role:'堤防衛士',hp:24,atk:7,def:3,weapon:'melee',shallowCost:2},
 'ally-neia': {role:'水路斥候',hp:16,atk:6,def:1,weapon:'bow',shallowCost:1},
 'ally-sena': {role:'救護師',hp:16,atk:4,def:1,weapon:'melee',shallowCost:2},
 'ally-iva': {role:'水路保守係',hp:20,atk:6,def:2,weapon:'melee',shallowCost:2},
 'ally-dani': {role:'記録官',hp:18,atk:5,def:1,weapon:'melee',shallowCost:2},
};
/** Initial identity is effective; archived job/support choices never affect a unit. */
export function applyCharacterRole(unit:Unit):Unit {
 const next=structuredClone(unit);if(!character(unit.id))return next;
 const base=FIXED_CAPABILITIES[unit.id],role=INITIAL_JOBS[unit.id];
 next.role=base.role;next.maxHp=base.hp;next.hp=Math.min(unit.hp,base.hp);next.atk=base.atk;next.def=base.def;next.weapon=base.weapon;next.move=4;next.shallowCost=base.shallowCost;
 delete next.equipmentWeaponId;delete next.readCharges;delete next.plankReady;delete next.plankCharges;delete next.jobCommand;delete next.surveyCharges;delete next.surveyBonus;delete next.protection;delete next.healCharges;
 if(role==='surveyor'){next.jobCommand='survey';next.surveyCharges=2;}
 else if(role==='warden')next.jobCommand='protect';
 else if(role==='healer')next.healCharges=2;
 else if(role==='engineer'){next.jobCommand='plank';next.plankCharges=2;}
 else if(role==='recorder'){next.jobCommand='readOrder';next.readCharges=2;}
 return next;
}
/** Legacy API name; state is retained only for source/old-save compatibility. */
export function applyJobs(unit:Unit,_state:JobsState):Unit { return applyCharacterRole(unit); }
