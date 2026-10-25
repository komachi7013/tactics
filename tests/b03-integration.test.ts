import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type StorageLike } from '../src/campaign';
import { createInitialState, getUnit, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleId, BattleState, Command } from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/b02-route.json';
import b03 from './fixtures/b03-route.json';

function memory(raw?: string) {
  const data = new Map<string, string>(raw ? [[CAMPAIGN_KEY, raw]] : []);
  let writes = 0;
  const storage: StorageLike = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { writes++; data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
  return { data, storage, writes: () => writes };
}

/** Only public commands and normal enemy activations; no state/stat edits. */
function replay(id: BattleId, commands: Command[]) {
  let state = createInitialState(id);
  for (const command of commands) {
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe('player');
    const result = reduce(state, command);
    expect(result.error, `${id}: ${JSON.stringify(command)}`).toBeUndefined();
    state = result.state;
    let turns = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      expect(++turns).toBeLessThanOrEqual(3);
      state = runEnemyActivation(state);
    }
  }
  expect(state.phase).toBe('won');
  return state;
}

function expectFreshB03(state: BattleState) {
  expect(state.battleId).toBe('B03');
  expect(state.phase).toBe('playing');
  expect(state.round).toBe(1);
  expect(state.records).toEqual([]);
  expect(state.escort?.index).toBe(0);
  expect(getUnit(state, 'escort-cart')?.pos).toEqual({ x: 8, y: 9 });
  expect(getUnit(state, 'ally-sena')?.healCharges).toBe(2);
  expect(state.units.every(unit => unit.hp === unit.maxHp && !unit.acted)).toBe(true);
}

describe('Independent three-battle campaign integration', () => {
  it('carries actual B01/B02 victories into B03, reloads its checkpoint, and retains evidence on retry', () => {
    const { storage, data } = memory();
    data.set('unrelated-user-state', 'keep');
    let campaign = createCampaign();
    campaign = completeBattle(campaign, replay('B01', b01.gate.commands as Command[]));
    expect(selectBattle(campaign, 'B03')).toBe(campaign);
    campaign = completeBattle(campaign, replay('B02', b02.commands as Command[]));
    campaign = selectBattle(campaign, 'B03');
    expect(writeCampaign(storage, campaign).ok).toBe(true);

    const restored = readCampaign(storage);
    expect(restored.warning).toBeNull();
    expect(restored.campaign.currentBattle).toBe('B03');
    expectFreshB03(createInitialState(restored.campaign.currentBattle));
    const victory = replay(restored.campaign.currentBattle, b03.commands as Command[]);
    expect(victory.round).toBe(b03.round);
    expect(victory.units.filter(unit => unit.team === 'player').every(unit => unit.hp > 0)).toBe(true);
    expect(getUnit(victory, 'ally-sena')?.healCharges).toBe(0);
    expect(victory.log.join('\n')).toContain('公的補給');
    expect(writeCampaign(storage, completeBattle(restored.campaign, victory)).ok).toBe(true);
    const completed = readCampaign(storage).campaign;
    expect(completed.completed).toEqual(['B01', 'B02', 'B03']);
    expect(completed.evidence).toEqual(['B01:A', 'B01:B', 'B02:O', 'B03:M']);

    // UI retry uses the stage factory: resources reset, milestone storage does not.
    const rawBeforeRetry = data.get(CAMPAIGN_KEY);
    expectFreshB03(createInitialState(completed.currentBattle));
    expect(data.get(CAMPAIGN_KEY)).toBe(rawBeforeRetry);
    expect(data.get('unrelated-user-state')).toBe('keep');
  });

  it('opens B03 from a legacy two-battle v1 checkpoint without a read or selection write', () => {
    const raw = '{"version":1,"unlocked":["B01","B02"],"completed":["B01","B02"],"currentBattle":"B02","evidence":["B01:A","B01:B","B02:O"]}';
    const { storage, data, writes } = memory(raw);
    const loaded = readCampaign(storage);
    const selected = selectBattle(loaded.campaign, 'B03');
    expect(loaded.writable).toBe(true);
    expect(selected.currentBattle).toBe('B03');
    expectFreshB03(createInitialState(selected.currentBattle));
    expect(data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(writes()).toBe(0);
  });
});
