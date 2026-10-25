import landscape from '../src/landscapes/b10.json';
import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, resetCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { canGate, capturePreview, createInitialState, gatePreview, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';
import { buildEightBattleCheckpoint } from '../src/qa/checkpoint';
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

// Read actual map/unit data instead of reusing the engine's eligibility verdict.
function holdingEligible(state: BattleState, gate = state.gate): boolean {
  return gate.drained && gate.pendingRound === null
    && state.units.some(u => u.team === 'player' && u.kind !== 'escort' && u.hp > 0 && u.pos.x === 11 && u.pos.y === 3)
    && !state.units.some(u => u.team === 'enemy' && u.hp > 0 && Math.abs(u.pos.x - 11) + Math.abs(u.pos.y - 3) === 1);
}
function auditHarbor(before: BattleState, after: BattleState) {
  expect(after.cells).toEqual(before.cells);
  expect(after.cells).toHaveLength(484);
  expect(after.cells).toEqual(landscape.cells);
  expect(after.cells.some(c => c.shallow)).toBe(false);
  expect(after.escort).toBeUndefined(); expect(after.sluices).toBeUndefined();
  expect(capturePreview(after).eligible).toBe(holdingEligible(after));
  expect(gatePreview(after).region).toEqual([]);
  expect(after.round).toBeLessThanOrEqual(12);
  if (before.gate.drained) {
    expect(after.gate.drained).toBe(true); expect(after.gate.pendingRound).toBeNull();
  }
  if (after.gate.drained) expect(canGate(after)).toBe(false);
  if (!before.gate.drained && after.gate.drained) {
    expect(after.round).toBe(before.round + 1);
    expect(before.gate.pendingRound).toBe(after.round);
    expect(after.gate.pendingRound).toBeNull();
  }
  if (before.gate.pendingRound !== null && after.round === before.round)
    expect(after.gate).toEqual(before.gate);
  if (before.gate.pendingRound === null && after.gate.pendingRound !== null) {
    expect(after.gate.pendingRound).toBe(after.round + 1);
    expect(after.gate.drained).toBe(false);
    expect(after.activation.acted).toBe(true);
    expect(after.units).toEqual(before.units);
  }
  // An enemy activation may contain several public reducer calls. For B10,
  // a living Lise's terminal result is holding completion or the R12 deadline.
  const liseAlive = after.units.find(u => u.id === 'ally-lise')!.hp > 0;
  const boundary = after.round > before.round || (after.phase !== 'playing' && liseAlive);
  if (boundary && liseAlive) {
    // Opening is applied AFTER the old round's holding evaluation.
    const eligibleAtEnd = holdingEligible(after, before.gate);
    expect(after.capture!.heldRounds).toBe(eligibleAtEnd ? before.capture!.heldRounds + 1 : 0);
  } else expect(after.capture!.heldRounds).toBe(before.capture!.heldRounds);
  if (!after.gate.drained || after.gate.pendingRound !== null) expect(after.capture!.heldRounds).toBe(0);
  if (!liseAlive) expect(after.phase).toBe('lost');
  if (after.phase === 'won') {
    expect(liseAlive).toBe(true); expect(after.capture!.heldRounds).toBe(2);
    expect(holdingEligible(after)).toBe(true); expect(after.records).toEqual(['C']);
  } else expect(after.records).toEqual([]);
}
function play(id: BattleId, commands: Command[]): BattleState {
  let state = createInitialState(id);
  const observe = (next: BattleState) => { if (id === 'B10') auditHarbor(state, next); state = next; };
  for (const command of commands) {
    expect(state.phase).toBe('playing'); expect(state.turn).toBe('player');
    const result = reduce(state, command);
    expect(result.error, `${id}: ${JSON.stringify(command)}`).toBeUndefined(); observe(result.state);
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      expect(++responses).toBeLessThanOrEqual(3); observe(runEnemyActivation(state));
    }
  }
  return state;
}
function nineBattleCampaign(): Campaign {
  let campaign = createCampaign();
  for (const [id, commands] of [
    ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands], ['B04', b04.commands],
    ['B05', b05.optional.commands], ['B06', b06.victory.commands], ['B07', b07.victory.commands],
    ['B08', b08.victory.commands], ['B09', b09.victory.commands],
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
function expectFreshHarbor(state: BattleState) {
  expect(state.battleId).toBe('B10'); expect(state.phase).toBe('playing'); expect(state.round).toBe(1);
  expect(state.gate).toEqual({drained:false,pendingRound:null}); expect(state.capture).toEqual({heldRounds:0});
  expect(state.records).toEqual([]); expect(state.escort).toBeUndefined(); expect(state.sluices).toBeUndefined();
  expect(state.units.filter(u => u.team === 'player').map(u => u.id).sort()).toEqual(['ally-garan','ally-iva','ally-lise','ally-neia']);
  expect(state.units.every(u => u.hp === u.maxHp && !u.acted)).toBe(true);
  expect(state.units.filter(u => u.team === 'player').some(u => (u.healCharges ?? 0) > 0)).toBe(false);
  expect(state.cells.some(c => c.shallow)).toBe(false);
}

// Complete real nine-battle replays require a longer timeout under suite load.
describe('B10 independent campaign and QA integration', { timeout: 30_000 }, () => {
  it('earns nine victories, reads old v1 without writes, then wins B10 and restores seventeen evidence', () => {
    const nine = nineBattleCampaign(); expect(nine.completed).toHaveLength(9); expect(nine.evidence).toHaveLength(16);
    const oldRaw = JSON.stringify({...nine,unlocked:nine.unlocked.filter(id => id !== 'B10')});
    const {storage,values} = memory([[CAMPAIGN_KEY,oldRaw]]);
    const loaded = readCampaign(storage);
    expect(loaded.writable).toBe(true); expect(loaded.warning).toBeNull(); expect(loaded.campaign.unlocked).toContain('B10');
    expect(values.get(CAMPAIGN_KEY)).toBe(oldRaw); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
    const won = play('B10',b10.victory.commands as Command[]);
    expect(won.phase).toBe('won'); expect(won.round).toBe(b10.victory.round);
    expect(writeCampaign(storage,completeBattle(selectBattle(loaded.campaign,'B10'),won)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toEqual(['B01','B02','B03','B04','B05','B06','B07','B08','B09','B10']);
    expect(restored.currentBattle).toBe('B10'); expect(restored.evidence).toHaveLength(17);
    expect(restored.evidence).toEqual(expect.arrayContaining(['B05:K','B06:W','B07:V1','B07:V2','B08:P','B08:C','B09:J','B09:H','B10:C']));
    expectFreshHarbor(createInitialState(restored.currentBattle)); expect(values.size).toBe(1);
  });
  it('preserves progress on ordinary defeat and restores retries and previous chapter rosters', () => {
    const campaign = selectBattle(nineBattleCampaign(),'B10');
    const lost = play('B10',b10.defeat.commands as Command[]);
    expect(lost.phase).toBe('lost'); expect(lost.round).toBe(b10.defeat.round);
    expect(completeBattle(campaign,lost)).toEqual(campaign);
    const {storage} = memory(); expect(writeCampaign(storage,completeBattle(campaign,lost)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toHaveLength(9); expect(restored.evidence).toHaveLength(16);
    expectFreshHarbor(createInitialState(restored.currentBattle));
    expect(roster('B09')).toEqual(['ally-garan','ally-lise','ally-neia','ally-sena','escort-delegation']);
    expect(roster('B08')).toEqual(['ally-garan','ally-iva','ally-lise','ally-neia']);
    expect(roster('B07')).toEqual(['ally-garan','ally-lise','ally-neia','ally-sena']);
    expect(roster('B06')).toEqual(['ally-garan','ally-iva','ally-lise','ally-sena','escort-toma']);
  });
  it('earns B09 and B10 from eight-battle QA without get/set/remove on ordinary or earlier QA keys', () => {
    const protectedEntries: [string,string][] = [[CAMPAIGN_KEY,'{ordinary-save-byte-preserved'],
      ...['b06','b07','b08','b09'].map(id => [qaStorageKey(`${id}-chrome-20261018-a`),`{existing-${id}-qa`] as [string,string])];
    const {storage,values} = memory(protectedEntries), session = 'b10-independent-qa-a', store = createQaStorage(storage,session);
    const checkpoint = buildEightBattleCheckpoint();
    expect(checkpoint.currentBattle).toBe('B09'); expect(checkpoint.completed).toHaveLength(8);
    expect(checkpoint.evidence).toHaveLength(14); expect(checkpoint.unlocked).toContain('B09');
    expect(checkpoint.completed).not.toContain('B09'); expect(checkpoint.unlocked).not.toContain('B10');
    expect(writeCampaign(store,checkpoint).ok).toBe(true);
    for (const [id,commands] of [['B09',b09.victory.commands],['B10',b10.victory.commands]] as [BattleId,Command[]][]) {
      const campaign = selectBattle(readCampaign(store).campaign,id); expect(campaign.currentBattle).toBe(id);
      const won = play(id,commands); expect(won.phase).toBe('won');
      expect(writeCampaign(store,completeBattle(campaign,won)).ok).toBe(true);
    }
    const restored = readCampaign(createQaStorage(storage,session)).campaign;
    expect(restored.completed).toHaveLength(10); expect(restored.evidence).toHaveLength(17);
    expectFreshHarbor(createInitialState(restored.currentBattle));
    expect(resetCampaign(store).ok).toBe(true); expect(values.has(qaStorageKey(session))).toBe(false);
    for (const [key,value] of protectedEntries) expect(values.get(key)).toBe(value);
    for (const mock of [storage.getItem,storage.setItem,storage.removeItem])
      for (const call of vi.mocked(mock).mock.calls) expect(call[0]).toBe(qaStorageKey(session));
  });
});
