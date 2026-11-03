/** Historical v2-v4 fixture builders only. Never import from production.
 * They describe valid old saved allocations; runtime APIs now reject these edits. */
import type { BattleId } from '../../src/domain/types';
import type { Campaign } from '../../src/campaign';
import { JOB_IDS, SKILLS, INITIAL_JOBS, validJobs, availableTraining, type JobsState, type JobId, type SkillId } from '../../src/jobs';
import { availableCharacters, validGrowth, returnFromAbsence, BATTLE_IDS, trainingPoints, type CharacterId, type Growth } from '../../src/progression';
const skillById=(id:unknown)=>SKILLS.find(s=>s.id===id);
const character=(id:unknown):id is CharacterId=>typeof id==='string'&&Object.hasOwn(INITIAL_JOBS,id);
const copy=(state:JobsState):JobsState=>structuredClone(state);
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
export function tutor(growth: Growth, character: CharacterId, completed: readonly BattleId[]): Growth {
  if (!validGrowth(growth,completed)) throw new Error('育成とクリア履歴が一致しません。');
  const frontier = BATTLE_IDS[Math.min(completed.length,11)];
  if (!availableCharacters(frontier).includes(character)) throw new Error('未加入または強制離脱中の人物は補習できません。');
  // Settle mandatory return compensation first so its pending state cannot be
  // used to claim catch-up for the same missing reward twice.
  const next = returnFromAbsence(growth,frontier);
  next.tutoring[character] += Math.max(0, Math.floor(completed.length / 3) * 6 - trainingPoints(next,character));
  return next;
}

/** Old saved document shape; does not call current preparation or storage APIs. */
export function legacyPreparation(campaign: Campaign, changes: Partial<Campaign>): Campaign {
 return { ...structuredClone(campaign), ...structuredClone(changes) };
}
