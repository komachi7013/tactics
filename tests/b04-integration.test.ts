import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type StorageLike } from '../src/campaign';
import { createInitialState, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleId, BattleState, Command } from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/b02-route.json';
import b03 from './fixtures/b03-route.json';
import b04 from './fixtures/b04-route.json';

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

// The exact public commands used in the UI, plus normal AI. No state/stat edits.
function replay(id: BattleId, commands: Command[]) {
  let state = createInitialState(id);
  const reservations: boolean[] = [];
  const boundaries: BattleState[] = [];
  for (const command of commands) {
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe('player');
    const round = state.round;
    const result = reduce(state, command);
    expect(result.error, `${id} ${JSON.stringify(command)}`).toBeUndefined();
    state = result.state;
    if (command.type === 'gate') reservations.push(state.gate.pendingDrained!);
    let enemySteps = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      expect(++enemySteps).toBeLessThanOrEqual(3);
      state = runEnemyActivation(state);
    }
    if (state.round !== round || state.phase !== 'playing') boundaries.push(structuredClone(state));
  }
  expect(state.phase).toBe('won');
  return { state, reservations, boundaries };
}

function expectFresh(state: BattleState) {
  expect(state).toMatchObject({ battleId: 'B04', phase: 'playing', round: 1,
    capture: { heldRounds: 0 }, records: [], gate: { drained: true, pendingRound: null } });
  expect(state.gate.pendingDrained).toBeUndefined();
  expect(state.units.every(unit => unit.hp === unit.maxHp && !unit.acted && !unit.guard)).toBe(true);
  expect(state.units.filter(unit => unit.team === 'player').map(unit => unit.id))
    .toEqual(['ally-lise', 'ally-garan', 'ally-neia', 'ally-iva']);
  expect(state.cells.some(cell => cell.shallow)).toBe(false);
}

describe('Independent B04 campaign and normal-AI integration', () => {
  it('loses at the deadline under stationary defense and retries without spending campaign milestones', () => {
    let state = createInitialState('B04');
    let activations = 0;
    while (state.phase === 'playing') {
      const unit = state.units.find(u => u.team === 'player' && u.hp > 0 && !u.acted);
      expect(unit).toBeDefined();
      for (const command of [{ type: 'start', unitId: unit!.id }, { type: 'defend' }, { type: 'end', facing: 'E' }] as Command[]) {
        const result = reduce(state, command);
        expect(result.error).toBeUndefined();
        state = result.state;
        while (state.phase === 'playing' && state.turn === 'enemy') state = runEnemyActivation(state);
      }
      expect(++activations).toBeLessThanOrEqual(40);
    }
    expect(state).toMatchObject({ phase: 'lost', round: 10, capture: { heldRounds: 0 }, records: [] });
    expect(state.units.find(u => u.id === 'ally-lise')!.hp).toBeGreaterThan(0);
    const { storage, data } = memory();
    let campaign = createCampaign();
    for (const [id, commands] of [['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands]] as [BattleId, Command[]][])
      campaign = completeBattle(campaign, replay(id, commands).state);
    expect(completeBattle(campaign, state)).toBe(campaign);
    expect(writeCampaign(storage, selectBattle(campaign, 'B04')).ok).toBe(true);
    const saved = data.get(CAMPAIGN_KEY);
    expectFresh(createInitialState('B04'));
    expect(data.get(CAMPAIGN_KEY)).toBe(saved);
    expect(readCampaign(storage).campaign.evidence).toEqual(['B01:A', 'B01:B', 'B02:O', 'B03:M']);
  });

  it('plays B01–B03 into B04, saves victory, restores all evidence, and retries with clean battle resources', () => {
    const { storage, data } = memory();
    let campaign = createCampaign();
    for (const [id, commands] of [
      ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands],
    ] as [BattleId, Command[]][]) {
      expect(selectBattle(campaign, 'B04')).toBe(campaign);
      campaign = completeBattle(campaign, replay(id, commands).state);
    }
    expect(campaign.completed).toEqual(['B01', 'B02', 'B03']);
    expect(campaign.unlocked).toEqual(['B01', 'B02', 'B03', 'B04']);
    expect(writeCampaign(storage, selectBattle(campaign, 'B04')).ok).toBe(true);
    const restored = readCampaign(storage);
    expect(restored.warning).toBeNull();
    expect(restored.campaign.currentBattle).toBe('B04');
    expectFresh(createInitialState(restored.campaign.currentBattle));

    const won = replay(restored.campaign.currentBattle, b04.commands as Command[]).state;
    expect(won.round).toBe(b04.round);
    expect(won.records).toEqual(['C']);
    expect(won.units.filter(unit => unit.team === 'player').map(unit => [unit.id, unit.hp])).toEqual(b04.playerHp);
    expect(writeCampaign(storage, completeBattle(restored.campaign, won)).ok).toBe(true);
    const completed = readCampaign(storage).campaign;
    expect(completed.completed).toEqual(['B01', 'B02', 'B03', 'B04']);
    expect(completed.evidence).toEqual(['B01:A', 'B01:B', 'B02:O', 'B03:M', 'B04:C']);
    const saved = data.get(CAMPAIGN_KEY);
    expectFresh(createInitialState(completed.currentBattle));
    expect(data.get(CAMPAIGN_KEY)).toBe(saved);
    expect(writeCampaign(storage, selectBattle(completed, 'B01')).ok).toBe(true);
    expect(readCampaign(storage).campaign.evidence).toEqual(completed.evidence);
    expect(data.get('unrelated-user-state')).toBe('keep');
  });

  it('reads a legacy three-battle checkpoint without writes, then earns C through reversible normal-AI play', () => {
    const raw = JSON.stringify({ version: 1, unlocked: ['B01', 'B02', 'B03'],
      completed: ['B01', 'B02', 'B03'], currentBattle: 'B03', evidence: ['B01:A', 'B01:B', 'B02:O', 'B03:M'] });
    const { storage, data, writes } = memory(raw);
    const loaded = readCampaign(storage);
    expect(loaded.writable).toBe(true);
    const selected = selectBattle(loaded.campaign, 'B04');
    expectFresh(createInitialState(selected.currentBattle));
    expect(writes()).toBe(0);
    expect(data.get(CAMPAIGN_KEY)).toBe(raw);

    const result = replay('B04', b04.repeated.commands as Command[]);
    expect(result.reservations).toEqual([false, true, false]);
    expect(result.boundaries.some(s => s.gate.drained && s.round > 2 && s.capture?.heldRounds === 0)).toBe(true);
    expect(result.state).toMatchObject({ round: 10, capture: { heldRounds: 2 }, gate: { drained: false }, records: ['C'] });
    expect(writeCampaign(storage, completeBattle(selected, result.state)).ok).toBe(true);
    expect(readCampaign(storage).campaign.evidence).toEqual([...loaded.campaign.evidence, 'B04:C']);
  });

  it('cannot advance a new or incomplete campaign with a B04 result, even a real normal-AI victory', () => {
    const won = replay('B04', b04.commands as Command[]).state;
    const campaign = completeBattle(createCampaign(), replay('B01', b01.gate.commands as Command[]).state);
    expect(selectBattle(campaign, 'B04')).toBe(campaign);
    expect(completeBattle(campaign, won)).toBe(campaign);
    const { storage } = memory();
    expect(writeCampaign(storage, campaign).ok).toBe(true);
    expect(readCampaign(storage).campaign.completed).toEqual(['B01']);
    expect(readCampaign(storage).campaign.evidence).not.toContain('B04:C');
  });

  it('protects an unknown save even after a legitimate normal-AI four-battle campaign has been earned', () => {
    const raw = '{"version":999,"external":"preserve me"}';
    const { storage, data, writes } = memory(raw);
    let campaign = createCampaign();
    for (const [id, commands] of [
      ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands], ['B04', b04.commands],
    ] as [BattleId, Command[]][]) campaign = completeBattle(campaign, replay(id, commands).state);
    expect(readCampaign(storage).writable).toBe(false);
    expect(writeCampaign(storage, campaign).ok).toBe(false);
    expect(data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(writes()).toBe(0);
    expect(data.get('unrelated-user-state')).toBe('keep');
  });
});
