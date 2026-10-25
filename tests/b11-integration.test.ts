import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, resetCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { canCollect, createInitialState, evacuationPreview, getCell, repairPreview, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';
import { buildNineBattleCheckpoint } from '../src/qa/checkpoint';
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

const workers = [{id:'W1',x:4,y:6},{id:'W2',x:15,y:7}];
const sites = [{id:'A',x:6,y:4,worker:'W1'},{id:'B',x:17,y:5,worker:'W2'}];
const distance = (a:{x:number;y:number},b:{x:number;y:number}) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function actingAlly(state:BattleState) {
  const actor=state.units.find(u=>u.id===state.activeId);
  return state.phase==='playing' && actor && actor.hp>0 && actor.team==='player' && state.turn==='player'
    && actor.kind!=='escort' && !state.activation.acted ? actor : undefined;
}
function withinReach(state:BattleState,pos:{x:number;y:number}) {
  const actor=actingAlly(state);
  return !!actor && distance(actor.pos,pos)===1 && Math.abs(getCell(state,actor.pos)!.height-getCell(state,pos)!.height)<=1;
}
function rescueEligible(state:BattleState,worker:typeof workers[number]) {
  return !state.records.includes(worker.id) && withinReach(state,worker)
    && !state.units.some(u=>u.team==='enemy'&&u.hp>0&&distance(u.pos,worker)===1);
}
function repairEligible(state:BattleState,site:typeof sites[number]) {
  return state.records.includes(site.worker) && !state.repairs![site.id].completed
    && state.repairs![site.id].pendingRound===null && withinReach(state,site);
}
function victoryEligible(state:BattleState) {
  const lise=state.units.find(u=>u.id==='ally-lise')!;
  return lise.hp>0 && lise.pos.x===5 && lise.pos.y===14 && workers.every(w=>state.records.includes(w.id))
    && sites.every(site=>state.repairs![site.id].completed&&state.repairs![site.id].pendingRound===null);
}
function auditMaintenance(before:BattleState,after:BattleState,command?:Command) {
  expect(after.cells).toHaveLength(598); expect(after.round).toBeLessThanOrEqual(12);
  expect(after.gate).toEqual({drained:false,pendingRound:null});
  expect(after.capture).toBeUndefined(); expect(after.escort).toBeUndefined(); expect(after.sluices).toBeUndefined();
  expect(after.cells.some(c=>c.shallow||c.bridge)).toBe(false);
  const expectedCells=before.cells.map(c=>{
    const worker=workers.find(w=>w.x===c.x&&w.y===c.y);
    return worker&&after.records.includes(worker.id)?{...c,blocked:false}:c;
  });
  expect(after.cells).toEqual(expectedCells);
  for(const worker of workers) {
    const eligible=rescueEligible(after,worker);
    expect(evacuationPreview(after,worker.id).eligible).toBe(eligible);
    expect(canCollect(after,worker.id)).toBe(eligible);
    if(before.records.includes(worker.id)) expect(after.records).toContain(worker.id);
    if(!before.records.includes(worker.id)&&after.records.includes(worker.id)) {
      expect(command?.type).toBe('collect');
      expect(command&&'recordId' in command?command.recordId:undefined).toBe(worker.id);
      expect(rescueEligible(before,worker)).toBe(true);
      expect(after.activation.acted).toBe(true); expect(after.units).toEqual(before.units);
      expect(after.repairs).toEqual(before.repairs);
    }
  }
  for(const site of sites) {
    const old=before.repairs![site.id],next=after.repairs![site.id];
    let expected={...old};
    if(command?.type==='repair'&&command.siteId===site.id) expected={completed:false,pendingRound:before.round+1};
    if(after.round===before.round+1&&old.pendingRound===after.round) expected={completed:true,pendingRound:null};
    expect(next).toEqual(expected);
    expect(repairPreview(after,site.id).eligible).toBe(repairEligible(after,site));
    if(old.completed) expect(next).toEqual(old);
    if(!old.completed&&next.completed) {
      expect(after.round).toBe(before.round+1); expect(old.pendingRound).toBe(after.round);
      expect(next.pendingRound).toBeNull(); expect(after.records).toContain(site.worker);
    }
    if(old.pendingRound!==null&&after.round===before.round) expect(next).toEqual(old);
    if(old.pendingRound===null&&next.pendingRound!==null) {
      expect(command?.type).toBe('repair');
      expect(command&&'siteId' in command?command.siteId:undefined).toBe(site.id);
      expect(repairEligible(before,site)).toBe(true);
      expect(next).toEqual({completed:false,pendingRound:after.round+1});
      expect(after.activation.acted).toBe(true); expect(after.units).toEqual(before.units);
      expect(after.records).toEqual(before.records); expect(after.cells).toEqual(before.cells);
      for(const other of sites.filter(s=>s.id!==site.id)) expect(after.repairs![other.id]).toEqual(before.repairs![other.id]);
    }
  }
  if(victoryEligible(after)) expect(after.phase).toBe('won');
  if(after.phase==='won') {
    expect(victoryEligible(after)).toBe(true); expect(after.records.slice().sort()).toEqual(['A','B','W1','W2']);
  } else expect(after.records.every(id=>id==='W1'||id==='W2')).toBe(true);
  if(after.units.find(u=>u.id==='ally-lise')!.hp<=0) expect(after.phase).toBe('lost');
}
function play(id: BattleId, commands: Command[]): BattleState {
  let state = createInitialState(id);
  const observe = (next: BattleState, command?:Command) => { if (id === 'B11') auditMaintenance(state,next,command); state = next; };
  for (const command of commands) {
    expect(state.phase).toBe('playing'); expect(state.turn).toBe('player');
    const result = reduce(state, command);
    expect(result.error, `${id}: ${JSON.stringify(command)}`).toBeUndefined(); observe(result.state,command);
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      expect(++responses).toBeLessThanOrEqual(3); observe(runEnemyActivation(state));
    }
  }
  return state;
}
function tenBattleCampaign(): Campaign {
  let campaign = createCampaign();
  for (const [id, commands] of [
    ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands], ['B04', b04.commands],
    ['B05', b05.optional.commands], ['B06', b06.victory.commands], ['B07', b07.victory.commands],
    ['B08', b08.victory.commands], ['B09', b09.victory.commands], ['B10', b10.victory.commands],
  ] as [BattleId, Command[]][]) {
    expect(campaign.unlocked).toContain(id);
    const won = play(id, commands); expect(won.phase).toBe('won');
    campaign = completeBattle(selectBattle(campaign, id), won);
  }
  return campaign;
}
function memory(initial: [string,string][] = []) {
  const values = new Map(initial);
  const storage: StorageLike = {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key,value) => { values.set(key,value); }),
    removeItem: vi.fn(key => { values.delete(key); }),
  };
  return { values, storage };
}
const roster = (id: BattleId) => createInitialState(id).units.filter(u => u.team === 'player').map(u => u.id).sort();
function expectFreshMaintenance(state:BattleState) {
  expect(state.battleId).toBe('B11'); expect(state.phase).toBe('playing'); expect(state.round).toBe(1);
  expect(state.repairs).toEqual({A:{completed:false,pendingRound:null},B:{completed:false,pendingRound:null}});
  expect(state.records).toEqual([]); expect(state.gate).toEqual({drained:false,pendingRound:null});
  expect(state.capture).toBeUndefined(); expect(state.escort).toBeUndefined(); expect(state.sluices).toBeUndefined();
  expect(state.units.filter(u=>u.team==='player').map(u=>u.id).sort()).toEqual(['ally-garan','ally-iva','ally-lise','ally-neia']);
  expect(state.units.filter(u=>u.team==='player').map(u=>[u.id,u.pos.x,u.pos.y])).toEqual([
    ['ally-lise',8,14],['ally-garan',9,14],['ally-neia',8,13],['ally-iva',7,14],
  ]);
  expect(state.units.every(u=>u.hp===u.maxHp&&!u.acted)).toBe(true);
  expect(state.units.some(u=>(u.healCharges??0)>0)).toBe(false);
  for(const worker of workers) expect(getCell(state,worker)!.blocked).toBe(true);
  for(const site of sites) expect(getCell(state,site)!.blocked).toBe(true);
}

// Complete real ten-battle replays require a longer timeout under suite load.
describe('B11 independent campaign and QA integration', { timeout: 30_000 }, () => {
  it('earns ten victories, reads old v1 without writes, then wins B11 and restores twenty-one evidence', () => {
    const ten = tenBattleCampaign(); expect(ten.completed).toHaveLength(10); expect(ten.evidence).toHaveLength(17);
    const oldRaw = JSON.stringify({...ten,unlocked:ten.unlocked.filter(id => id !== 'B11')});
    const {storage,values} = memory([[CAMPAIGN_KEY,oldRaw]]);
    const loaded = readCampaign(storage);
    expect(loaded.writable).toBe(true); expect(loaded.warning).toBeNull(); expect(loaded.campaign.unlocked).toContain('B11');
    expect(values.get(CAMPAIGN_KEY)).toBe(oldRaw); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
    const won = play('B11',b11.victory.commands as Command[]);
    expect(won.phase).toBe('won'); expect(won.round).toBe(b11.victory.round);
    expect(writeCampaign(storage,completeBattle(selectBattle(loaded.campaign,'B11'),won)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toEqual(['B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11']);
    expect(restored.currentBattle).toBe('B11'); expect(restored.evidence).toHaveLength(21);
    expect(restored.evidence).toEqual(expect.arrayContaining(['B05:K','B06:W','B07:V1','B07:V2','B08:P','B08:C','B09:J','B09:H','B10:C','B11:W1','B11:W2','B11:A','B11:B']));
    expectFreshMaintenance(createInitialState(restored.currentBattle)); expect(values.size).toBe(1);
  });
  it('preserves progress on ordinary defeat and restores retries and previous chapter rosters', () => {
    const campaign = selectBattle(tenBattleCampaign(),'B11');
    const lost = play('B11',b11.defeat.commands as Command[]);
    expect(lost.phase).toBe('lost'); expect(lost.round).toBe(b11.defeat.round);
    expect(completeBattle(campaign,lost)).toEqual(campaign);
    const {storage} = memory(); expect(writeCampaign(storage,completeBattle(campaign,lost)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toHaveLength(10); expect(restored.evidence).toHaveLength(17);
    expectFreshMaintenance(createInitialState(restored.currentBattle));
    expect(roster('B10')).toEqual(['ally-garan','ally-iva','ally-lise','ally-neia']);
    expect(roster('B09')).toEqual(['ally-garan','ally-lise','ally-neia','ally-sena','escort-delegation']);
    expect(roster('B08')).toEqual(['ally-garan','ally-iva','ally-lise','ally-neia']);
    expect(roster('B07')).toEqual(['ally-garan','ally-lise','ally-neia','ally-sena']);
    expect(roster('B06')).toEqual(['ally-garan','ally-iva','ally-lise','ally-sena','escort-toma']);
  });
  it('earns B10 and B11 from nine-battle QA without get/set/remove on ordinary or earlier QA keys', () => {
    const protectedEntries: [string,string][] = [[CAMPAIGN_KEY,'{ordinary-save-byte-preserved'],
      ...['b06','b07','b08','b09','b10'].map(id => [qaStorageKey(`${id}-chrome-20261018-a`),`{existing-${id}-qa`] as [string,string])];
    const {storage,values} = memory(protectedEntries), session = 'b11-independent-qa-a', store = createQaStorage(storage,session);
    const checkpoint = buildNineBattleCheckpoint();
    expect(checkpoint.currentBattle).toBe('B10'); expect(checkpoint.completed).toHaveLength(9);
    expect(checkpoint.evidence).toHaveLength(16); expect(checkpoint.unlocked).toContain('B10');
    expect(checkpoint.completed).not.toContain('B10'); expect(checkpoint.unlocked).not.toContain('B11');
    expect(writeCampaign(store,checkpoint).ok).toBe(true);
    for (const [id,commands] of [['B10',b10.victory.commands],['B11',b11.victory.commands]] as [BattleId,Command[]][]) {
      const campaign = selectBattle(readCampaign(store).campaign,id); expect(campaign.currentBattle).toBe(id);
      const won = play(id,commands); expect(won.phase).toBe('won');
      expect(writeCampaign(store,completeBattle(campaign,won)).ok).toBe(true);
    }
    const restored = readCampaign(createQaStorage(storage,session)).campaign;
    expect(restored.completed).toHaveLength(11); expect(restored.evidence).toHaveLength(21);
    expectFreshMaintenance(createInitialState(restored.currentBattle));
    expect(resetCampaign(store).ok).toBe(true); expect(values.has(qaStorageKey(session))).toBe(false);
    for (const [key,value] of protectedEntries) expect(values.get(key)).toBe(value);
    for (const mock of [storage.getItem,storage.setItem,storage.removeItem])
      for (const call of vi.mocked(mock).mock.calls) expect(call[0]).toBe(qaStorageKey(session));
  });
});
