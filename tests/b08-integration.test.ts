import b08Landscape from '../src/landscapes/b08.json';
import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, resetCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState, getCell, reduce } from '../src/domain/engine';
import { getBattleConfig } from '../src/domain/battles';
import { runEnemyActivation } from '../src/domain/ai';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';
import { buildSixBattleCheckpoint } from '../src/qa/checkpoint';
import type { BattleId, BattleState, Command } from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/b02-route.json';
import b03 from './fixtures/b03-route.json';
import b04 from './fixtures/b04-route.json';
import b05 from './fixtures/b05-route.json';
import b06 from './fixtures/b06-route.json';
import b07 from './fixtures/b07-route.json';
import b08 from './fixtures/b08-route.json';

function checkSluices(before: BattleState, after: BattleState, command?: Command) {
  expect(after.gate).toEqual({ drained: false, pendingRound: null });
  for (const gate of getBattleConfig('B08').sluiceGates!) {
    const previous = before.sluices![gate.id], water = after.sluices![gate.id];
    for (const pos of gate.region) expect(getCell(after, pos)?.shallow).toBe(!water.drained);
    if (before.round === after.round) expect(water.drained).toBe(previous.drained);
    else if (previous.pendingRound === after.round) {
      expect(water.drained).toBe(previous.pendingDrained);
      expect(water.pendingRound).toBeNull();
    }
    if (command?.type === 'gate') {
      if (command.gateId !== gate.id) expect(water).toEqual(previous);
      else {
        expect(water.pendingRound).toBe(before.round + 1);
        expect(water.pendingDrained).toBe(!previous.drained);
      }
    }
  }
  if (after.capture!.heldRounds > 0) {
    expect(after.records).toContain('P');
    expect(Object.values(after.sluices!).every(w => w.drained && w.pendingRound === null)).toBe(true);
  }
  if (after.phase !== 'won') expect(after.records).not.toContain('C');
}
function play(id: BattleId, commands: Command[], operations?: { id: string | undefined; round: number; drained: boolean }[]): BattleState {
  let state = createInitialState(id);
  const check = (next: BattleState, command?: Command) => {
    if (id === 'B08') checkSluices(state, next, command);
    state = next;
  };
  for (const command of commands) {
    expect(state.phase).toBe('playing'); expect(state.turn).toBe('player');
    const result = reduce(state, command);
    expect(result.error, `${id}: ${JSON.stringify(command)}`).toBeUndefined();
    if (id === 'B08' && command.type === 'gate') operations?.push({ id: command.gateId, round: state.round, drained: result.state.sluices![command.gateId!].pendingDrained! });
    check(result.state, command);
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      expect(++responses).toBeLessThanOrEqual(3);
      check(runEnemyActivation(state));
    }
  }
  return state;
}
function sevenBattleCampaign(): Campaign {
  let campaign = createCampaign();
  for (const [id, commands] of [
    ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands],
    ['B04', b04.commands], ['B05', b05.optional.commands], ['B06', b06.victory.commands],
    ['B07', b07.victory.commands],
  ] as [BattleId, Command[]][]) {
    expect(campaign.unlocked).toContain(id);
    const won = play(id, commands); expect(won.phase).toBe('won');
    campaign = completeBattle(selectBattle(campaign, id), won);
  }
  return campaign;
}
function memory(initial: [string, string][] = []) {
  const values = new Map(initial);
  const storage: StorageLike = {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => { values.set(key, value); }),
    removeItem: vi.fn(key => { values.delete(key); }),
  };
  return { values, storage };
}
function expectFreshB08(state: BattleState) {
  expect(state.phase).toBe('playing'); expect(state.round).toBe(1);
  expect(state.records).toEqual([]); expect(state.capture).toEqual({ heldRounds: 0 });
  expect(state.sluices).toEqual({ N: { drained: false, pendingRound: null }, S: { drained: false, pendingRound: null } });
  expect(state.units.filter(u => u.team === 'player').map(u => u.id).sort()).toEqual(['ally-garan', 'ally-iva', 'ally-lise', 'ally-neia']);
  expect(state.units.every(u => u.hp === u.maxHp && !u.acted)).toBe(true);
  expect(state.cells.filter(c => c.shallow)).toHaveLength(8);
  expect(state.cells).toEqual(b08Landscape.cells);expect(state.cells.filter(c=>!c.blocked)).toHaveLength(40);
}

// Each case replays six or seven complete battles with real AI; allow contention
// from the full-suite workers without relaxing command or outcome assertions.
describe('B08 independent campaign and QA integration', { timeout: 30_000 }, () => {
  it('reads an earned old seven-battle v1 save without writing, wins B08 and restores fourteen evidence', () => {
    const seven = sevenBattleCampaign();
    expect(seven.completed).toHaveLength(7); expect(seven.evidence).toHaveLength(12);
    // Only the serialized compatibility fixture omits the newly introduced unlock.
    const oldRaw = JSON.stringify({ ...seven, unlocked: seven.unlocked.filter(id => id !== 'B08') });
    const { storage, values } = memory([[CAMPAIGN_KEY, oldRaw]]);
    const loaded = readCampaign(storage);
    expect(loaded.writable).toBe(true); expect(loaded.warning).toBeNull();
    expect(loaded.campaign.unlocked).toContain('B08');
    expect(values.get(CAMPAIGN_KEY)).toBe(oldRaw);
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
    const operations: { id: string | undefined; round: number; drained: boolean }[] = [];
    const won = play('B08', b08.victory.commands as Command[], operations);
    expect(won.phase).toBe('won'); expect(won.round).toBeLessThanOrEqual(12);
    expect(won.round).toBe(b08.victory.round);
    expect(operations).toEqual([{"id":"S","round":1,"drained":true},{"id":"N","round":2,"drained":true},{"id":"N","round":3,"drained":false},{"id":"N","round":4,"drained":true}]);
    expect(won.records.slice().sort()).toEqual(['C', 'P']); expect(won.capture?.heldRounds).toBe(2);
    expect(writeCampaign(storage, completeBattle(selectBattle(loaded.campaign, 'B08'), won)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08']);
    expect(restored.currentBattle).toBe('B08'); expect(restored.evidence).toHaveLength(14);
    expect(restored.evidence).toEqual(expect.arrayContaining(['B05:K', 'B06:W', 'B07:V1', 'B07:V2', 'B08:P', 'B08:C']));
    expectFreshB08(createInitialState(restored.currentBattle));
    expect(values.size).toBe(1);
  });

  it('keeps earned progress on normal defeat and resets P, holding, water and roster on retry', () => {
    const campaign = selectBattle(sevenBattleCampaign(), 'B08');
    const lost = play('B08', b08.defeat.commands as Command[]);
    expect(lost.phase).toBe('lost'); expect(lost.round).toBe(b08.defeat.round);
    expect(completeBattle(campaign, lost)).toEqual(campaign);
    const { storage } = memory(); expect(writeCampaign(storage, campaign).ok).toBe(true);
    expect(writeCampaign(storage, completeBattle(campaign, lost)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toHaveLength(7); expect(restored.evidence).toHaveLength(12);
    expectFreshB08(createInitialState(restored.currentBattle));
    expect(createInitialState('B07').units.filter(u => u.team === 'player').map(u => u.id).sort())
      .toEqual(['ally-garan', 'ally-lise', 'ally-neia', 'ally-sena']);
    expect(createInitialState('B06').units.filter(u => u.team === 'player').map(u => u.id).sort())
      .toEqual(['ally-garan', 'ally-iva', 'ally-lise', 'ally-sena', 'escort-toma']);
  });

  it('earns B07 then B08 from the six-battle checkpoint without accessing normal or older QA keys', () => {
    const protectedEntries: [string, string][] = [
      [CAMPAIGN_KEY, '{ordinary-save-byte-preserved'],
      [qaStorageKey('b06-chrome-20261018-a'), '{existing-b06-qa'],
      [qaStorageKey('b07-chrome-20261018-a'), '{existing-b07-qa'],
    ];
    const { storage, values } = memory(protectedEntries);
    const id = 'b08-independent-qa-a', store = createQaStorage(storage, id);
    const checkpoint = buildSixBattleCheckpoint();
    expect(checkpoint.currentBattle).toBe('B07');
    expect(checkpoint.completed).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06']);
    expect(checkpoint.evidence).toHaveLength(10); expect(checkpoint.evidence).toContain('B06:W');
    expect(checkpoint.unlocked).toContain('B07'); expect(checkpoint.unlocked).not.toContain('B08');
    expect(writeCampaign(store, checkpoint).ok).toBe(true);
    for (const [id, commands] of [['B07', b07.victory.commands], ['B08', b08.victory.commands]] as [BattleId, Command[]][]) {
      const campaign = selectBattle(readCampaign(store).campaign, id);
      expect(campaign.currentBattle).toBe(id);
      const won = play(id, commands); expect(won.phase).toBe('won');
      expect(writeCampaign(store, completeBattle(campaign, won)).ok).toBe(true);
    }
    const restored = readCampaign(createQaStorage(storage, id)).campaign;
    expect(restored.completed).toHaveLength(8); expect(restored.evidence).toHaveLength(14);
    expect(restored.currentBattle).toBe('B08'); expectFreshB08(createInitialState(restored.currentBattle));
    expect(resetCampaign(store).ok).toBe(true); expect(values.has(qaStorageKey(id))).toBe(false);
    for (const [key, value] of protectedEntries) expect(values.get(key)).toBe(value);
    for (const mock of [storage.getItem, storage.setItem, storage.removeItem]) {
      for (const call of vi.mocked(mock).mock.calls) expect(call[0]).toBe(qaStorageKey(id));
    }
  });
});
