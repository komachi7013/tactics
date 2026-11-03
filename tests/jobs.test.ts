import { describe, it, expect } from 'vitest';
import { createJobs, validJobs, learnSkill, setMainJob, equipSupport, respec, availableTraining, SKILLS, applyJobs } from '../src/jobs';
import { createGrowth, awardFirstClear, defaultParty, CHARACTER_IDS, type Growth } from '../src/progression';
import { createPreparedUnit } from '../src/party';
import { createInitialState } from '../src/domain/engine';
import { learnSkill as historicalLearn, setMainJob as historicalJob, equipSupport as historicalSupport, tutor as historicalTutor } from './fixtures/legacy-preparation';
function earned(): Growth { let growth = createGrowth(); for (const id of ['B01','B02','B03'] as const) growth = awardFirstClear(growth,id,defaultParty(id)); return historicalTutor(growth,'ally-sena',['B01','B02','B03']); }

describe('fixed character roles and archived v2-v4 job allocations', () => {
  it('retains six initial identities and an empty historical allocation for fresh saves', () => {
    const jobs=createJobs(); expect(validJobs(jobs,createGrowth())).toBe(true);
    expect(Object.values(jobs).map(entry=>entry.main)).toEqual(['surveyor','warden','scout','healer','engineer','recorder']);
    expect(SKILLS).toHaveLength(12); // Retained only to validate old learned IDs/costs.
  });
  it('rejects the removed public learning/job/support/respec APIs without changing either ledger', () => {
    const growth=earned(),jobs=createJobs(),before=structuredClone({growth,jobs});
    for(const edit of [()=>learnSkill(jobs,growth,'ally-lise','surveyor-foundation','B04'),()=>setMainJob(jobs,'ally-lise','warden','B04'),()=>equipSupport(jobs,'ally-lise',null),()=>respec(jobs,'ally-lise')])expect(edit).toThrow();
    expect({growth,jobs}).toEqual(before);
  });
  it('still validates historically earned/spent points without converting them into live bonuses', () => {
    const growth=earned(),jobs=historicalLearn(createJobs(),growth,'ally-lise','surveyor-foundation','B04');
    expect(validJobs(jobs,growth)).toBe(true); expect(availableTraining(jobs,growth,'ally-lise')).toBe(4);
    expect(createPreparedUnit('ally-lise',jobs,1)).toEqual(createPreparedUnit('ally-lise',createJobs(),1));
    expect(jobs['ally-lise'].learned).toEqual(['surveyor-foundation']);
  });
  it('reads a valid old cross-job support shape but keeps Lise’s fixed role and command', () => {
    const growth=earned(); let jobs=historicalLearn(createJobs(),growth,'ally-lise','surveyor-foundation','B04');
    jobs=historicalSupport(historicalJob(jobs,'ally-lise','warden','B04'),'ally-lise','surveyor-foundation');
    const before=structuredClone(jobs); expect(validJobs(jobs,growth)).toBe(true);
    expect(createPreparedUnit('ally-lise',jobs,1)).toMatchObject({role:'測量官',maxHp:18,atk:7,def:1,jobCommand:'survey',surveyCharges:2});
    expect(jobs).toEqual(before);
  });
  it('keeps multiple old learned skills and one support as history, with no live move bonus', () => {
    const growth=earned(); let jobs=historicalLearn(createJobs(),growth,'ally-lise','surveyor-foundation','B04');
    jobs=historicalLearn(jobs,growth,'ally-lise','surveyor-practice','B04');
    jobs=historicalSupport(historicalJob(jobs,'ally-lise','warden','B04'),'ally-lise','surveyor-practice');
    expect(validJobs(jobs,growth)).toBe(true); expect(availableTraining(jobs,growth,'ally-lise')).toBe(0);
    expect(createPreparedUnit('ally-lise',jobs,1).move).toBe(4);
    expect(jobs['ally-lise'].learned).toHaveLength(2);
  });
  it('does not refund or erase archived allocations when the removed respec API is called', () => {
    const growth=earned(); let jobs=historicalLearn(createJobs(),growth,'ally-lise','surveyor-foundation','B04');
    jobs=historicalSupport(historicalJob(jobs,'ally-lise','warden','B04'),'ally-lise','surveyor-foundation');
    const before=structuredClone(jobs); expect(()=>respec(jobs,'ally-lise')).toThrow();
    expect(jobs).toEqual(before); expect(availableTraining(jobs,growth,'ally-lise')).toBe(4);
  });
  it('uses each character’s initial role even when old saved main fields differ', () => {
    for(const id of CHARACTER_IDS){const jobs=createJobs();jobs[id].main='warden';
      expect(createPreparedUnit(id,jobs,3)).toEqual(createPreparedUnit(id,createJobs(),3));}
    const neia=createPreparedUnit('ally-neia',createJobs(),1); expect(neia).toMatchObject({weapon:'bow',shallowCost:1});
  });
  it('continues rejecting malformed, inflated, sparse and duplicate historical job records', () => {
    const growth=earned();
    for(const mutate of [(jobs:ReturnType<typeof createJobs>)=>{jobs['ally-lise'].learned=['surveyor-foundation','surveyor-foundation'];},(jobs:ReturnType<typeof createJobs>)=>{jobs['ally-lise'].support='surveyor-foundation';},(jobs:ReturnType<typeof createJobs>)=>{jobs['ally-lise'].main='engineer';},(jobs:ReturnType<typeof createJobs>)=>{jobs['ally-lise'].learned=['fake' as never];},(jobs:ReturnType<typeof createJobs>)=>{jobs['ally-lise'].learned=new Array(2);},(jobs:ReturnType<typeof createJobs>)=>{jobs['ally-lise'].learned=['surveyor-foundation','surveyor-practice','warden-foundation'];}]){const jobs=createJobs();mutate(jobs);expect(validJobs(jobs,growth)).toBe(false);}
    expect(validJobs([],growth)).toBe(false);expect(validJobs({},growth)).toBe(false);
  });
  it('restores Sena’s own healer command and removes stale temporary effects independently of old role history', () => {
    const growth=earned(); let jobs=historicalLearn(createJobs(),growth,'ally-sena','healer-foundation','B04');
    jobs=historicalSupport(historicalJob(jobs,'ally-sena','warden','B04'),'ally-sena','healer-foundation');
    const unit=createInitialState('B03').units.find(value=>value.id==='ally-sena')!;
    unit.healCharges=0;unit.protection={sourceId:'ally-garan'};unit.surveyBonus=true;const before=structuredClone(unit);
    const fixed=applyJobs(unit,jobs),initial=applyJobs(unit,createJobs());
    expect(fixed).toEqual(initial);expect(fixed).toMatchObject({maxHp:16,atk:4,def:1,weapon:'melee',healCharges:2});
    expect(fixed.jobCommand).toBeUndefined();expect(fixed.protection).toBeUndefined();expect(fixed.surveyBonus).toBeUndefined();expect(unit).toEqual(before);
  });
});
