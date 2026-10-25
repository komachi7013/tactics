import type { BattleId, Unit } from './domain/types';
import { availableCharacters, trainingPoints, type CharacterId, type Growth } from './progression';

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
const copy=(state:JobsState):JobsState=>structuredClone(state);
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
export function learnSkill(state:JobsState,growth:Growth,id:CharacterId,skill:SkillId,battleId:BattleId):JobsState {
 if(!character(id)||!validJobs(state,growth))throw Error('職業データが不正です');
 const n=Number(battleId?.slice(1));if(!/^B(0[1-9]|1[0-2])$/.test(battleId))throw Error('戦闘が不正です');
 if(!availableCharacters(battleId).includes(id))throw Error('未加入・強制離脱中の人物です');
 const unlock=state[id].main==='healer'?3:state[id].main==='engineer'||state[id].main==='recorder'?4:1;
 if(n<unlock)throw Error('この職業はまだ登場していません');
 const entry=skillById(skill);if(!entry||entry.job!==state[id].main)throw Error('主職の支援だけを習得できます');
 if(state[id].learned.includes(skill))throw Error('習得済みです');
 if(availableTraining(state,growth,id)<entry.cost)throw Error('訓練ポイントが不足しています');
 const next=copy(state);next[id].learned.push(skill);return next;
}
export function setMainJob(state:JobsState,id:CharacterId,job:JobId,battleId:BattleId):JobsState {
 if(!character(id)||!JOB_IDS.includes(job))throw Error('職業が不正です');
 const n=Number(battleId.slice(1));if(!/^B(0[1-9]|1[0-2])$/.test(battleId)||!Number.isInteger(n)||n<1||n>12)throw Error('戦闘が不正です');
 if(!availableCharacters(battleId).includes(id))throw Error('未加入・強制離脱中の人物です');
 // The first playable increment permits switching to two jobs. Other initial jobs remain valid.
 if(job!==INITIAL_JOBS[id]&&job!=='surveyor'&&job!=='warden')throw Error('この職業への変更は未開放です');
 if((job==='healer'&&n<3)||((job==='engineer'||job==='recorder')&&n<4))throw Error('この職業はまだ登場していません');
 const next=copy(state);next[id].main=job;if(next[id].support&&skillById(next[id].support)?.job===job)next[id].support=null;return next;
}
export function equipSupport(state:JobsState,id:CharacterId,skill:SkillId|null):JobsState {
 if(!character(id))throw Error('人物が不正です');
 if(skill!==null&&(!state[id].learned.includes(skill)||!skillById(skill)||skillById(skill)!.job===state[id].main))throw Error('他職の習得済み支援を1つ選んでください');
 const next=copy(state);next[id].support=skill;return next;
}
export function respec(state:JobsState,id:CharacterId):JobsState { if(!character(id))throw Error('人物が不正です');const next=copy(state);next[id].learned=[];next[id].support=null;return next; }
export function applyJobs(unit:Unit,state:JobsState):Unit {
 if(!character(unit.id))return structuredClone(unit);
 const entry=state[unit.id],next=structuredClone(unit);
 // Active commands belong to the current main job, never to learned support.
 // Clear battle-local payloads before assigning a fresh deployment allowance.
 delete next.readCharges;delete next.plankReady;delete next.plankCharges;delete next.jobCommand;delete next.surveyCharges;delete next.surveyBonus;delete next.protection;delete next.healCharges;
 if(entry.main!==INITIAL_JOBS[unit.id]){
  if(entry.main!=='surveyor'&&entry.main!=='warden')throw Error('未対応の職業です');
  const ward=entry.main==='warden';next.role=JOB_NAMES[entry.main];next.hp=next.maxHp=ward?24:18;next.atk=7;next.def=ward?3:1;next.move=4;next.weapon='melee';next.shallowCost=2;delete next.healCharges;
 }
 if(entry.main==='surveyor'){next.jobCommand='survey';next.surveyCharges=2;}
 else if(entry.main==='warden')next.jobCommand='protect';
 else if(entry.main==='healer')next.healCharges=2;
 else if(entry.main==='engineer'){next.jobCommand='plank';next.plankCharges=2;}
 else if(entry.main==='recorder'){next.jobCommand='readOrder';next.readCharges=2;}
 if(entry.support){const support=skillById(entry.support);if(!support||support.job===entry.main||!entry.learned.includes(entry.support))throw Error('支援が不正です');switch(support.effect){case 'hp':next.maxHp+=support.amount;next.hp+=support.amount;break;case 'shallow':next.shallowCost=1;break;case 'atk':next.atk+=support.amount;break;case 'def':next.def+=support.amount;break;case 'move':next.move+=support.amount;break;}}
 return next;
}
