import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, resetCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState, getCell, getUnit, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';
import { buildFiveBattleCheckpoint } from '../src/qa/checkpoint';
import type { BattleId, BattleState, Command } from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/b02-route.json';
import b03 from './fixtures/b03-route.json';
import b04 from './fixtures/b04-route.json';
import b05 from './fixtures/b05-route.json';
import b06 from './fixtures/b06-route.json';
import b07 from './fixtures/b07-route.json';

function play(id: BattleId, commands: Command[]): BattleState {
  let state = createInitialState(id);
  for (const command of commands) {
    expect(state.phase).toBe('playing'); expect(state.turn).toBe('player');
    const result = reduce(state, command);
    expect(result.error, `${id}: ${JSON.stringify(command)}`).toBeUndefined();
    state = result.state;
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      expect(++responses).toBeLessThanOrEqual(3);
      state = runEnemyActivation(state);
    }
  }
  return state;
}
function sixBattleCampaign(): Campaign {
  let campaign = createCampaign();
  for (const [id, commands] of [
    ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands],
    ['B04', b04.commands], ['B05', b05.optional.commands], ['B06', b06.victory.commands],
  ] as [BattleId, Command[]][]) {
    expect(campaign.unlocked).toContain(id);
    const state = play(id, commands); expect(state.phase).toBe('won');
    campaign = completeBattle(selectBattle(campaign, id), state);
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
function expectFreshB07(state: BattleState) {
  expect(state.phase).toBe('playing'); expect(state.round).toBe(1); expect(state.records).toEqual([]);
  expect(state.units.filter(u => u.team === 'player').map(u => u.id).sort()).toEqual(['ally-garan', 'ally-lise', 'ally-neia', 'ally-sena']);
  expect(state.units.every(u => u.hp === u.maxHp && !u.acted)).toBe(true);
  expect(getUnit(state, 'ally-sena')?.healCharges).toBe(2);
  for (const pos of [{ x: 4, y: 4 }, { x: 13, y: 12 }]) expect(getCell(state, pos)?.blocked).toBe(true);
}

describe('B07 independent campaign and QA integration', () => {
  it('unlocks B07 from an old six-battle v1 save without rewriting it, then earns and restores all twelve evidence', () => {
    const six = sixBattleCampaign();
    // Serialize the pre-B07 schema from earned victories, not an unlocked runtime state.
    const oldRaw = JSON.stringify({ ...six, unlocked: six.unlocked.filter(id => id !== 'B07') });
    const { storage, values } = memory([[CAMPAIGN_KEY, oldRaw]]);
    const loaded = readCampaign(storage);
    expect(loaded.writable).toBe(true); expect(loaded.warning).toBeNull();
    expect(loaded.campaign.unlocked).toContain('B07');
    expect(loaded.campaign.evidence).toHaveLength(10);
    expect(values.get(CAMPAIGN_KEY)).toBe(oldRaw); expect(storage.setItem).not.toHaveBeenCalled();
    const won = play('B07', b07.victory.commands as Command[]);
    expect(won.phase).toBe('won'); expect(won.round).toBeLessThanOrEqual(10);
    expect(won.records.slice().sort()).toEqual(['V1', 'V2']);
    expect(getUnit(won, 'ally-lise')?.pos).toEqual({ x: 19, y: 11 });
    for (const pos of [{ x: 4, y: 4 }, { x: 13, y: 12 }]) expect(getCell(won, pos)?.blocked).toBe(false);
    const completed = completeBattle(selectBattle(loaded.campaign, 'B07'), won);
    expect(writeCampaign(storage, completed).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07']);
    expect(restored.evidence).toHaveLength(12);
    expect(restored.evidence).toEqual(expect.arrayContaining(['B05:K', 'B06:W', 'B07:V1', 'B07:V2']));
    expect(restored.currentBattle).toBe('B07');
    expectFreshB07(createInitialState(restored.currentBattle));
    expect(createInitialState('B06').units.filter(u => u.team === 'player').map(u => u.id).sort())
      .toEqual(['ally-garan', 'ally-iva', 'ally-lise', 'ally-sena', 'escort-toma']);
  });

  it('loses through normal defense and retries without carrying evacuation, damage or spent healing', () => {
    const lost = play('B07', b07.defeat.commands as Command[]);
    expect(lost.phase).toBe('lost');
    expectFreshB07(createInitialState('B07'));
    const c = selectBattle(sixBattleCampaign(), 'B07');
    expect(completeBattle(c, lost)).toEqual(c);
  });

  it('prepares before B06 and earns B06/B07 in a new QA namespace while preserving normal and B06 QA saves', () => {
    const ordinary = '{ordinary-user-data-must-remain-byte-identical';
    const b06Key = qaStorageKey('b06-chrome-20261018-a'), previousB06 = '{existing-b06-qa-data';
    const { storage, values } = memory([[CAMPAIGN_KEY, ordinary], [b06Key, previousB06]]);
    const id = 'b07-independent-qa-a', store = createQaStorage(storage, id);
    const checkpoint = buildFiveBattleCheckpoint();
    expect(checkpoint.currentBattle).toBe('B06');
    expect(checkpoint.completed).toEqual(['B01', 'B02', 'B03', 'B04', 'B05']);
    expect(checkpoint.unlocked).not.toContain('B07'); expect(checkpoint.evidence).toHaveLength(9);
    expect(writeCampaign(store, checkpoint).ok).toBe(true);
    for (const [battle, commands] of [['B06', b06.victory.commands], ['B07', b07.victory.commands]] as [BattleId, Command[]][]) {
      const campaign = selectBattle(readCampaign(store).campaign, battle);
      expect(campaign.currentBattle).toBe(battle);
      const won = play(battle, commands); expect(won.phase).toBe('won');
      expect(writeCampaign(store, completeBattle(campaign, won)).ok).toBe(true);
    }
    const restored = readCampaign(createQaStorage(storage, id)).campaign;
    expect(restored.evidence).toHaveLength(12); expect(restored.currentBattle).toBe('B07');
    expect(resetCampaign(store).ok).toBe(true); expect(values.has(qaStorageKey(id))).toBe(false);
    expect(values.get(CAMPAIGN_KEY)).toBe(ordinary); expect(values.get(b06Key)).toBe(previousB06);
    for (const mock of [storage.getItem, storage.setItem, storage.removeItem]) {
      for (const call of vi.mocked(mock).mock.calls) expect(call[0]).toBe(qaStorageKey(id));
    }
  });
});
