import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, resetCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { attackPreview, createInitialState, finalControlPreview, healPreview, reachable, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';
import { buildTenBattleCheckpoint } from '../src/qa/checkpoint';
import type { BattleId, BattleState, Command } from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/b02-route.json';
import b03 from './fixtures/b03-route.json';
import b04 from './fixtures/b04-route.json';
import b05 from './fixtures/b05-route.json';
import b06 from './fixtures/b06-route.json';
import b07 from './fixtures/b07-route.json';
import b08 from './fixtures/b08-route.json';
import b09 from './fixtures/b09-route.json';
import b10 from './fixtures/b10-route.json';
import b11 from './fixtures/b11-route.json';
import b12 from './fixtures/b12-route.json';

const controls = [{id:'A',x:5,y:9},{id:'B',x:15,y:7}];
const same = (a:{x:number;y:number},b:{x:number;y:number}) => a.x===b.x&&a.y===b.y;
function occupants(s:BattleState) {
  return controls.map(p=>s.units.find(u=>u.hp>0&&u.team==='player'&&u.kind!=='escort'&&same(u.pos,p))?.id??null);
}
function occupied(s:BattleState) {
  const ids=occupants(s); return ids.every(id=>id!==null)&&new Set(ids).size===2;
}
function auditFinale(before:BattleState,after:BattleState,command?:Command) {
  let enteredPreservationCell=false;
  expect(after.round).toBeLessThanOrEqual(8); expect(after.cells).toEqual(before.cells);
  expect(after.cells.filter(c=>!c.blocked)).toHaveLength(63);expect(after.cells.every(c=>!c.shallow&&!c.water&&!c.bridge)).toBe(true);
  for(const key of ['capture','escort','repairs','sluices']) expect(Object.hasOwn(after,key)).toBe(false);
  expect(after.gate).toEqual({drained:false,pendingRound:null});
  const commander=after.units.find(u=>u.id==='enemy-vesk')!, old=before.units.find(u=>u.id==='enemy-vesk')!;
  expect(after.finalControl!.commanderSubdued).toBe(commander.hp===0);
  if(!before.finalControl!.commanderSubdued&&after.finalControl!.commanderSubdued) {
    expect(command).toEqual({type:'attack',targetId:'enemy-vesk'}); expect(old.hp).toBeGreaterThan(0);
    expect(commander.pos).toEqual(old.pos); expect(after.phase).toBe('playing');
  }
  const p=finalControlPreview(after);
  expect(p.points.map(p=>p.occupantId)).toEqual(occupants(after));
  expect(p.bothOccupied).toBe(occupied(after)); expect(p.eligible).toBe(occupied(after));
  expect(p.commanderSubdued).toBe(commander.hp===0&&after.finalControl!.commanderSubdued);
  // A round boundary requires every remaining living combatant to have ended;
  // enemy activation may kill another unit before ending, so use surviving IDs.
  const endedId=command?.type==='end'?before.activeId:
    !command?after.units.find(u=>u.team==='enemy'&&u.hp>0&&!before.units.find(v=>v.id===u.id)!.acted&&u.acted)?.id:null;
  const boundary=after.round===before.round+1 ||
    (endedId!==null&&endedId!==undefined&&after.units.filter(u=>u.hp>0&&u.kind!=='escort')
      .every(u=>u.id===endedId||before.units.find(v=>v.id===u.id)!.acted));
  const expected=boundary?(occupied(after)?before.finalControl!.heldRounds+1:0):before.finalControl!.heldRounds;
  expect(after.finalControl!.heldRounds).toBe(expected);
  if(after.phase==='won') {
    expect(boundary).toBe(true); expect(occupied(after)).toBe(true); expect(commander.hp).toBe(0);
    expect(after.finalControl).toMatchObject({commanderSubdued:true}); expect(expected).toBeGreaterThanOrEqual(2);
    expect(after.records).toEqual(['U','V']); expect(after.units.find(u=>u.id==='ally-lise')!.hp).toBeGreaterThan(0);
  } else expect(after.records).toEqual([]);
  if(after.units.find(u=>u.id==='ally-lise')!.hp===0) expect(after.phase).toBe('lost');
  if(old.hp===0) {
    expect(commander.hp).toBe(0); expect(commander.pos).toEqual(old.pos);
    expect(after.activeId).not.toBe(commander.id);
  }
  if(commander.hp===0) {
    expect(occupants(after)).not.toContain(commander.id);
    expect(reduce(after,{type:'start',unitId:commander.id}).error).toBeDefined();
    for(const ally of after.units.filter(u=>u.team==='player'&&u.hp>0)) {
      expect(attackPreview(after,ally.id,commander.id).legal).toBe(false);
      expect(healPreview(after,ally.id,commander.id).legal).toBe(false);
      if(after.phase==='playing'&&after.activeId===ally.id) {
        expect(reduce(after,{type:'attack',targetId:commander.id}).error).toBeDefined();
        expect(reduce(after,{type:'heal',targetId:commander.id}).error).toBeDefined();
        // Fork a genuine replay state and try entering the preserved marker cell.
        // This branch never substitutes for the winning route or changes HP/position directly.
        const cell=reachable(after,ally.id).find(p=>same(p,commander.pos));
        if(cell&&!after.activation.moved&&!same(ally.pos,commander.pos)) {
          const move=reduce(after,{type:'move',to:commander.pos});
          expect(move.error).toBeUndefined();
          expect(move.state.units.find(u=>u.id===ally.id)!.pos).toEqual(commander.pos);
          expect(move.state.units.find(u=>u.id===commander.id)!.hp).toBe(0);
          enteredPreservationCell=true;
        }
      }
    }
  }
  return enteredPreservationCell;
}
function play(id:BattleId,commands:Command[]) {
  let state=createInitialState(id),enteredPreservationCell=false;
  const observe=(next:BattleState,command?:Command)=>{if(id==='B12')enteredPreservationCell=auditFinale(state,next,command)||enteredPreservationCell;state=next;};
  for(const command of commands) {
    expect(state.phase).toBe('playing'); expect(state.turn).toBe('player');
    const result=reduce(state,command); expect(result.error,`${id}: ${JSON.stringify(command)}`).toBeUndefined();
    observe(result.state,command); let responses=0;
    while(state.phase==='playing'&&state.turn==='enemy') {expect(++responses).toBeLessThanOrEqual(3);observe(runEnemyActivation(state));}
  }
  if(id==='B12'&&state.phase==='won')expect(enteredPreservationCell).toBe(true);
  return state;
}
function elevenBattleCampaign() {
  let campaign=createCampaign();
  for(const [id,commands] of [
    ['B01',b01.gate.commands],['B02',b02.commands],['B03',b03.commands],['B04',b04.commands],
    ['B05',b05.optional.commands],['B06',b06.victory.commands],['B07',b07.victory.commands],
    ['B08',b08.victory.commands],['B09',b09.victory.commands],['B10',b10.victory.commands],['B11',b11.victory.commands],
  ] as [BattleId,Command[]][]) {
    expect(campaign.unlocked).toContain(id);const won=play(id,commands);expect(won.phase).toBe('won');
    campaign=completeBattle(selectBattle(campaign,id),won);
  }
  return campaign;
}
function memory(initial:[string,string][]=[]){
  const values=new Map(initial);
  const storage:StorageLike={getItem:vi.fn(k=>values.get(k)??null),setItem:vi.fn((k,v)=>{values.set(k,v);}),removeItem:vi.fn(k=>{values.delete(k);})};
  return {storage,values};
}
const roster=(id:BattleId)=>createInitialState(id).units.filter(u=>u.team==='player').map(u=>u.id).sort();
function fresh(s:BattleState) {
  expect(s.battleId).toBe('B12');expect(s.phase).toBe('playing');expect(s.round).toBe(1);
  expect(s.finalControl).toEqual({heldRounds:0,commanderSubdued:false});expect(s.records).toEqual([]);
  expect(s.units.every(u=>u.hp===u.maxHp&&!u.acted)).toBe(true);
  expect(s.units.filter(u=>u.team==='player').map(u=>[u.id,u.pos.x,u.pos.y])).toEqual([
    ['ally-lise',9,16],['ally-garan',9,15],['ally-neia',10,16],['ally-iva',11,16]]);
  expect(s.units.some(u=>(u.healCharges??0)>0)).toBe(false);
}
function endingEligible(c:Campaign){return c.completed.includes('B12')&&['B12:U','B12:V'].every(e=>c.evidence.includes(e));}

describe('B12 independent final campaign and isolated QA integration',{timeout:30_000},()=>{
  it('earns eleven real victories, unlocks old v1 without writes, wins B12 and restores all 23 evidence',()=>{
    const eleven=elevenBattleCampaign();expect(eleven.completed).toHaveLength(11);expect(eleven.evidence).toHaveLength(21);
    const raw=JSON.stringify({...eleven,unlocked:eleven.unlocked.filter(id=>id!=='B12')});
    const {storage,values}=memory([[CAMPAIGN_KEY,raw]]);const loaded=readCampaign(storage);
    expect(loaded.writable).toBe(true);expect(loaded.warning).toBeNull();expect(loaded.campaign.unlocked).toContain('B12');
    expect(values.get(CAMPAIGN_KEY)).toBe(raw);expect(storage.setItem).not.toHaveBeenCalled();expect(storage.removeItem).not.toHaveBeenCalled();
    expect(endingEligible(loaded.campaign)).toBe(false);
    const won=play('B12',b12.victory.commands as Command[]);expect(won.phase).toBe('won');expect(won.round).toBe(b12.victory.round);
    expect(won.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])).toEqual(b12.victory.playerHp);
    expect(writeCampaign(storage,completeBattle(selectBattle(loaded.campaign,'B12'),won)).ok).toBe(true);
    const restored=readCampaign(storage).campaign;
    expect(restored.completed).toEqual(['B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12']);
    expect(restored.evidence).toHaveLength(23);expect(restored.currentBattle).toBe('B12');expect(endingEligible(restored)).toBe(true);
    expect(restored.evidence).toEqual(expect.arrayContaining(['B05:K','B06:W','B07:V1','B07:V2','B08:P','B08:C','B09:J','B09:H','B11:W1','B11:W2','B11:A','B11:B','B12:U','B12:V']));
    // K remains optional: a valid completed v1 campaign without it still reaches the ending.
    const noK={...restored,evidence:restored.evidence.filter(e=>e!=='B05:K')};
    const alternate=memory([[CAMPAIGN_KEY,JSON.stringify(noK)]]);const withoutK=readCampaign(alternate.storage);
    expect(withoutK.writable).toBe(true);expect(endingEligible(withoutK.campaign)).toBe(true);
    expect(withoutK.campaign.evidence).toHaveLength(22);expect(alternate.storage.setItem).not.toHaveBeenCalled();
    fresh(createInitialState(restored.currentBattle));expect(values.size).toBe(1);
  });
  it('preserves progress on ordinary deadline defeat, resets retry, and restores earlier rosters',()=>{
    const c=selectBattle(elevenBattleCampaign(),'B12'),lost=play('B12',b12.defeat.commands as Command[]);
    expect(lost.phase).toBe('lost');expect(lost.round).toBe(b12.defeat.round);expect(completeBattle(c,lost)).toEqual(c);
    const {storage}=memory();expect(writeCampaign(storage,completeBattle(c,lost)).ok).toBe(true);
    const restored=readCampaign(storage).campaign;expect(restored.completed).toHaveLength(11);expect(restored.evidence).toHaveLength(21);
    expect(endingEligible(restored)).toBe(false);fresh(createInitialState(restored.currentBattle));
    for(const id of ['B12','B11','B10','B08'] as const)expect(roster(id)).toEqual(['ally-garan','ally-iva','ally-lise','ally-neia']);
    expect(roster('B09')).toEqual(['ally-garan','ally-lise','ally-neia','ally-sena','escort-delegation']);
    expect(roster('B07')).toEqual(['ally-garan','ally-lise','ally-neia','ally-sena']);
    expect(roster('B06')).toEqual(['ally-garan','ally-iva','ally-lise','ally-sena','escort-toma']);
  });
  it('earns B11/B12 from ten-battle QA without get/set/remove on ordinary or B06–B11 keys',()=>{
    const protectedEntries:[string,string][]=[[CAMPAIGN_KEY,'{ordinary-unchanged'],...['b06','b07','b08','b09','b10','b11'].map(id=>[qaStorageKey(`${id}-chrome-20261018-a`),`{existing-${id}`] as [string,string])];
    const {storage,values}=memory(protectedEntries),session='b12-independent-qa-a',store=createQaStorage(storage,session);
    const checkpoint=buildTenBattleCheckpoint();expect(checkpoint.completed).toHaveLength(10);expect(checkpoint.evidence).toHaveLength(17);
    expect(checkpoint.currentBattle).toBe('B11');expect(checkpoint.unlocked).toContain('B11');expect(checkpoint.completed).not.toContain('B11');expect(checkpoint.unlocked).not.toContain('B12');
    expect(writeCampaign(store,checkpoint).ok).toBe(true);
    for(const [id,commands] of [['B11',b11.victory.commands],['B12',b12.victory.commands]] as [BattleId,Command[]][]) {
      const c=selectBattle(readCampaign(store).campaign,id);expect(c.currentBattle).toBe(id);
      const won=play(id,commands);expect(won.phase).toBe('won');expect(writeCampaign(store,completeBattle(c,won)).ok).toBe(true);
    }
    const restored=readCampaign(createQaStorage(storage,session)).campaign;
    expect(restored.completed).toHaveLength(12);expect(restored.evidence).toHaveLength(23);expect(endingEligible(restored)).toBe(true);
    fresh(createInitialState(restored.currentBattle));expect(resetCampaign(store).ok).toBe(true);expect(values.has(qaStorageKey(session))).toBe(false);
    for(const [key,value]of protectedEntries)expect(values.get(key)).toBe(value);
    for(const mock of [storage.getItem,storage.setItem,storage.removeItem])for(const call of vi.mocked(mock).mock.calls)expect(call[0]).toBe(qaStorageKey(session));
  });
});
