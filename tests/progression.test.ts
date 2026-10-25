import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/domain/engine';
import { BATTLE_IDS, CHARACTER_IDS, availableCharacters, defaultParty, validParty, createGrowth, validGrowth, awardFirstClear, returnFromAbsence, trainingPoints, tutor, commonLevel, migrateLegacyGrowth } from '../src/progression';
import type { BattleId } from '../src/domain/types';
const upto = (n: number) => BATTLE_IDS.slice(0,n);
const lise = 'ally-lise', neia = 'ally-neia', dani = 'ally-dani';

describe('deployment-based growth', () => {
  it('starts with no individual awards and chapter level one', () => {
    const g=createGrowth(); expect(validGrowth(g,[])).toBe(true); expect(commonLevel([])).toBe(1);
    CHARACTER_IDS.forEach(id=>expect(trainingPoints(g,id)).toBe(0));
  });
  it.each(BATTLE_IDS.map(id=>({id})))('migrates actual historical combatants at $id', ({id}) => {
    const actual=createInitialState(id).units.filter(u=>u.team==='player' && u.kind!=='escort').map(u=>u.id);
    expect(defaultParty(id)).toEqual(actual);
  });
  it('respects joining dates and story absence', () => {
    expect(availableCharacters('B02')).toEqual([lise,'ally-garan',neia]);
    expect(availableCharacters('B03')).toContain('ally-sena');
    expect(availableCharacters('B04')).toContain('ally-iva');
    expect(availableCharacters('B04')).not.toContain(dani);
    expect(availableCharacters('B05')).toContain(dani);
    expect(availableCharacters('B06')).not.toContain(neia);
    expect(availableCharacters('B07')).toContain(neia);
  });
  it('requires protagonist and exactly four except the first two battles', () => {
    expect(validParty('B01',defaultParty('B01'))).toBe(true);
    expect(validParty('B03',[lise,'ally-garan',neia])).toBe(false);
    expect(validParty('B05',['ally-garan',neia,'ally-sena',dani])).toBe(false);
    expect(validParty('B05',[lise,lise,'ally-sena',dani])).toBe(false);
    expect(validParty('B04',[lise,'ally-garan',neia,dani])).toBe(false);
    expect(validParty('B06',[lise,'ally-garan',neia,'ally-sena'])).toBe(false);
  });
  it('awards only actual first-clear party members, including incapacitated combatants in the recorded party', () => {
    const g=migrateLegacyGrowth(upto(4));
    expect(trainingPoints(g,lise)).toBe(8); expect(trainingPoints(g,'ally-sena')).toBe(2);
    expect(trainingPoints(g,'ally-iva')).toBe(2); expect(trainingPoints(g,dani)).toBe(0);
    expect(g.deployments.B04).not.toContain('ally-sena');
  });
  it('repeated clears cannot add points or replace initial deployment', () => {
    const g=migrateLegacyGrowth(upto(5)), before=structuredClone(g);
    expect(awardFirstClear(g,'B05',[...defaultParty('B05')].reverse())).toEqual(g);
    expect(()=>awardFirstClear(g,'B05',[lise,'ally-garan',neia,dani])).toThrow();
    expect(g).toEqual(before);
  });
  it('rejects skipped battles and forged growth before recording a clear', () => {
    expect(()=>awardFirstClear(createGrowth(),'B02',defaultParty('B02'))).toThrow();
    const g=createGrowth(); g.tutoring[lise]=1;
    expect(()=>awardFirstClear(g,'B01',defaultParty('B01'))).toThrow();
  });
  it('compensates only forced Neia absence, exactly once on eligible return', () => {
    let g=createGrowth(); for(const id of upto(6)) g=awardFirstClear(g,id,defaultParty(id));
    const before=structuredClone(g);
    expect(trainingPoints(g,neia)).toBe(10);
    expect(returnFromAbsence(g,'B06')).toEqual(g);
    const returned=returnFromAbsence(g,'B07');
    expect(trainingPoints(returned,neia)).toBe(12); expect(returned.compensated).toEqual(['B06']);
    expect(trainingPoints(returned,'ally-sena')).toBe(4);
    expect(returnFromAbsence(returned,'B07')).toEqual(returned); expect(g).toEqual(before);
    expect(returnFromAbsence(migrateLegacyGrowth(upto(5)),'B07').compensated).toEqual([]);
  });
  it('manual tutoring fills a bounded chapter deficit without grind or automatic reserve awards', () => {
    const g=migrateLegacyGrowth(upto(4)), before=structuredClone(g);
    expect(trainingPoints(g,'ally-sena')).toBe(2);
    const trained=tutor(g,'ally-sena',upto(4)); expect(trainingPoints(trained,'ally-sena')).toBe(6);
    expect(trained.tutoring['ally-sena']).toBe(4); expect(tutor(trained,'ally-sena',upto(4))).toEqual(trained);
    expect(tutor(g,lise,upto(4))).toEqual(g); expect(g).toEqual(before);
  });
  it('settles return compensation before tutoring to prevent duplicate catch-up', () => {
    let g=createGrowth(); for(const id of upto(6)) g=awardFirstClear(g,id,defaultParty(id));
    const trained=tutor(g,neia,upto(6));
    expect(trainingPoints(trained,neia)).toBe(12); expect(trained.tutoring[neia]).toBe(0);
    expect(trained.compensated).toEqual(['B06']); expect(returnFromAbsence(trained,'B07')).toEqual(trained);
    expect(validGrowth({...trained,tutoring:{...trained.tutoring,[neia]:2}},upto(6))).toBe(false);
  });
  it('raises tutoring ceiling only on chapter clear and keeps earlier tutoring after later deployments', () => {
    let g=tutor(migrateLegacyGrowth(upto(4)),'ally-sena',upto(4));
    g=awardFirstClear(g,'B05',defaultParty('B05'));
    expect(tutor(g,'ally-sena',upto(5))).toEqual(g);
    g=awardFirstClear(g,'B06',defaultParty('B06')); g=returnFromAbsence(g,'B07');
    expect(validGrowth(g,upto(6))).toBe(true);
    const trained=tutor(g,'ally-sena',upto(6)); expect(trainingPoints(trained,'ally-sena')).toBe(12);
  });
  it('cannot tutor unjoined or currently forced-absent characters or mismatched progress', () => {
    expect(()=>tutor(createGrowth(),'ally-sena',[])).toThrow();
    expect(()=>tutor(migrateLegacyGrowth(upto(3)),dani,upto(3))).toThrow();
    expect(()=>tutor(migrateLegacyGrowth(upto(5)),neia,upto(5))).toThrow();
    expect(()=>tutor(migrateLegacyGrowth(upto(4)),lise,upto(3))).toThrow();
  });
  it.each(Array.from({length:13},(_,n)=>({n})))('preserves legacy prefix at $n clears without fictitious reserve awards', ({n})=>{
    const completed=upto(n), g=migrateLegacyGrowth(completed);
    expect(validGrowth(g,completed)).toBe(true); expect(Object.keys(g.deployments)).toEqual(completed);
    expect(commonLevel(completed)).toBe(1+Math.floor(n/3));
    expect(g.compensated).toEqual(n>=6?['B06']:[]); expect(trainingPoints(g,dani)).toBe(0);
    expect(Object.values(g.tutoring)).toEqual([0,0,0,0,0,0]);
  });
  it('strictly rejects malformed or inflated persisted growth', ()=>{
    const completed=upto(6), base=migrateLegacyGrowth(completed);
    const cases:unknown[]=[null,[],{...base,version:1},{...base,extra:true}, {...base,compensated:['B06','B06']},
      {...base,compensated:['B05']},{...base,deployments:{...base.deployments,B12:defaultParty('B12')}},
      {...base,tutoring:{...base.tutoring,unknown:0}}, {...base,tutoring:{...base.tutoring,[lise]:1}},
      {...base,tutoring:{...base.tutoring,[dani]:-1}},{...base,tutoring:{...base.tutoring,[dani]:1.5}},
      {...base,tutoring:{...base.tutoring,[dani]:Infinity}}, {...base,tutoring:{...base.tutoring,[dani]:13}}];
    cases.push({...base,tutoring:{...base.tutoring,[dani]:1}}, {...base,tutoring:{...base.tutoring,[dani]:2}});
    for(const c of cases) expect(validGrowth(c,completed)).toBe(false);
    const missing=structuredClone(base); delete missing.deployments.B02; expect(validGrowth(missing,completed)).toBe(false);
    const sparse=structuredClone(base); delete sparse.deployments.B01![1]; expect(validGrowth(sparse,completed)).toBe(false);
    const noTutor=structuredClone(base); delete (noTutor.tutoring as Partial<typeof noTutor.tutoring>)[dani]; expect(validGrowth(noTutor,completed)).toBe(false);
    expect(validGrowth({...createGrowth(),compensated:['B06']},[])).toBe(false);
    expect(validGrowth(base,['B01','B03'])).toBe(false);
  });
  it('rejects invalid migration and does not alias mutable outputs', ()=>{
    expect(()=>migrateLegacyGrowth(['B02'])).toThrow();
    expect(()=>commonLevel(['B01','B01'])).toThrow();
    const g=migrateLegacyGrowth(upto(1)), copy=awardFirstClear(g,'B01',defaultParty('B01'));
    copy.deployments.B01!.reverse(); expect(g.deployments.B01).toEqual(defaultParty('B01'));
    const party=defaultParty('B01'); party.reverse(); expect(defaultParty('B01')[0]).toBe(lise);
  });
});
