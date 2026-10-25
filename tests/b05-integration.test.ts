import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type StorageLike } from '../src/campaign';
import { createInitialState, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleId, BattleState, Command } from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/b02-route.json';
import b03 from './fixtures/b03-route.json';
import b04 from './fixtures/b04-route.json';
import b05 from './fixtures/b05-route.json';

function memory(raw?: string) {
  const data = new Map<string, string>([['unrelated-user-state', 'keep']]);
  if (raw !== undefined) data.set(CAMPAIGN_KEY, raw);
  let writes = 0;
  const storage: StorageLike = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { writes++; data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
  return { data, storage, writes: () => writes };
}

// Public commands and unchanged normal AI only: no forced phase, positions or stats.
function step(state: BattleState, command: Command) {
  expect(state.phase).toBe('playing');
  expect(state.turn).toBe('player');
  const result = reduce(state, command);
  expect(result.error, `${state.battleId} ${JSON.stringify(command)}`).toBeUndefined();
  state = result.state;
  let responses = 0;
  while (state.phase === 'playing' && state.turn === 'enemy') {
    expect(++responses).toBeLessThanOrEqual(3);
    state = runEnemyActivation(state);
  }
  return state;
}
function replay(id: BattleId, commands: Command[]) {
  let state = createInitialState(id);
  for (const command of commands) state = step(state, command);
  expect(state.phase).toBe('won');
  return state;
}
function fourBattles() {
  let campaign = createCampaign();
  for (const [id, commands] of [
    ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands], ['B04', b04.commands],
  ] as [BattleId, Command[]][]) {
    expect(selectBattle(campaign, 'B05')).toBe(campaign);
    campaign = completeBattle(campaign, replay(id, commands));
  }
  return campaign;
}
const priorEvidence = ['B01:A', 'B01:B', 'B02:O', 'B03:M', 'B04:C'];

describe('Independent B05 normal-AI campaign integration', () => {
  it.each(['required', 'optional'] as const)('plays five battles, restores %s evidence, and resets battle resources on replay', key => {
    const { storage, data } = memory();
    const before = fourBattles();
    expect(before.unlocked).toEqual(['B01', 'B02', 'B03', 'B04', 'B05']);
    expect(before.completed).toEqual(['B01', 'B02', 'B03', 'B04']);
    expect(writeCampaign(storage, selectBattle(before, 'B05')).ok).toBe(true);
    const loaded = readCampaign(storage);
    expect(loaded.warning).toBeNull();
    expect(loaded.campaign.currentBattle).toBe('B05');
    const state = replay(loaded.campaign.currentBattle, b05[key].commands as Command[]);
    expect(state.round).toBe(b05[key].round);
    expect(state.records).toEqual(b05[key].records);
    expect(state.records.includes('K')).toBe(key === 'optional');
    expect(state.units.filter(u => u.team === 'player').map(u => [u.id, u.hp])).toEqual(b05[key].playerHp);
    expect(writeCampaign(storage, completeBattle(loaded.campaign, state)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toEqual(['B01', 'B02', 'B03', 'B04', 'B05']);
    expect(restored.evidence).toEqual([...priorEvidence, ...state.records.map(id => `B05:${id}`)]);
    const raw = data.get(CAMPAIGN_KEY);
    const fresh = createInitialState(restored.currentBattle);
    expect(fresh).toEqual(createInitialState('B05'));
    expect(fresh).toMatchObject({ phase: 'playing', round: 1, records: [] });
    expect(fresh.units.every(u => u.hp === u.maxHp && !u.acted && !u.guard)).toBe(true);
    expect(data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(data.get('unrelated-user-state')).toBe('keep');
  });

  it('unlocks an actual legacy four-win v1 save in memory without rewriting it, then saves optional evidence', () => {
    const earned = fourBattles();
    const raw = JSON.stringify({ ...earned, unlocked: earned.unlocked.filter(id => id !== 'B05') });
    const m = memory(raw);
    const loaded = readCampaign(m.storage);
    expect(loaded.writable).toBe(true);
    expect(loaded.warning).toBeNull();
    const selected = selectBattle(loaded.campaign, 'B05');
    expect(selected.currentBattle).toBe('B05');
    expect(m.writes()).toBe(0);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    const won = replay('B05', b05.optional.commands as Command[]);
    expect(writeCampaign(m.storage, completeBattle(selected, won)).ok).toBe(true);
    expect(readCampaign(m.storage).campaign.evidence).toContain('B05:K');
  });

  it('retains K after required-only and earlier-battle replays and a stale-session write', () => {
    const m = memory();
    const before = selectBattle(fourBattles(), 'B05');
    const optional = completeBattle(before, replay('B05', b05.optional.commands as Command[]));
    expect(writeCampaign(m.storage, optional).ok).toBe(true);
    const required = completeBattle(readCampaign(m.storage).campaign, replay('B05', b05.required.commands as Command[]));
    expect(writeCampaign(m.storage, required).ok).toBe(true);
    const earlier = completeBattle(selectBattle(required, 'B01'), replay('B01', b01.gate.commands as Command[]));
    expect(writeCampaign(m.storage, earlier).ok).toBe(true);
    expect(writeCampaign(m.storage, before).ok).toBe(true);
    const restored = readCampaign(m.storage).campaign;
    expect(restored.completed).toEqual(optional.completed);
    expect(new Set(restored.evidence)).toEqual(new Set([...priorEvidence, 'B05:D', 'B05:T', 'B05:S', 'B05:K']));
    expect(m.data.get('unrelated-user-state')).toBe('keep');
  });

  it('loses under normal stationary defense, preserves progress, and wins a fresh retry', () => {
    const m = memory();
    const before = selectBattle(fourBattles(), 'B05');
    expect(writeCampaign(m.storage, before).ok).toBe(true);
    const raw = m.data.get(CAMPAIGN_KEY);
    let state = createInitialState('B05');
    let activations = 0;
    while (state.phase === 'playing') {
      const unit = state.units.find(u => u.team === 'player' && u.hp > 0 && !u.acted);
      expect(unit).toBeDefined();
      for (const command of [{ type: 'start', unitId: unit!.id }, { type: 'defend' }, { type: 'end', facing: 'E' }] as Command[])
        state = step(state, command);
      expect(++activations).toBeLessThanOrEqual(40);
    }
    expect(state).toMatchObject({ phase: 'lost', round: 10, records: [] });
    expect(state.units.find(u => u.id === 'ally-lise')?.hp).toBe(18);
    expect(completeBattle(before, state)).toBe(before);
    const fresh = createInitialState(readCampaign(m.storage).campaign.currentBattle);
    expect(fresh).toEqual(createInitialState('B05'));
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    const won = replay(fresh.battleId, b05.required.commands as Command[]);
    expect(writeCampaign(m.storage, completeBattle(before, won)).ok).toBe(true);
    expect(readCampaign(m.storage).campaign.completed).toContain('B05');
    expect(readCampaign(m.storage).campaign.evidence).not.toContain('B05:K');
  });

  it('protects an unknown-version save even after a legitimate five-battle victory', () => {
    const raw = '{"version":999,"external":"preserve me"}';
    const m = memory(raw);
    const earned = completeBattle(selectBattle(fourBattles(), 'B05'), replay('B05', b05.optional.commands as Command[]));
    expect(readCampaign(m.storage).writable).toBe(false);
    expect(writeCampaign(m.storage, earned).ok).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(m.writes()).toBe(0);
    expect(m.data.get('unrelated-user-state')).toBe('keep');
  });
});
