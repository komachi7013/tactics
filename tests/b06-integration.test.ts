import{getBattleConfig}from'../src/domain/battles';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState, escortUnit, getUnit, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleId, BattleState, Command } from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/b02-route.json';
import b03 from './fixtures/b03-route.json';
import b04 from './fixtures/b04-route.json';
import b05 from './fixtures/b05-route.json';
import b06 from './fixtures/b06-route.json';

function memory(raw?: string) {
  const data = new Map<string, string>([['user-other', 'preserve']]);
  if (raw !== undefined) data.set(CAMPAIGN_KEY, raw);
  let writes = 0;
  const storage: StorageLike = { getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { writes++; data.set(k, v); }, removeItem: k => { data.delete(k); } };
  return { data, storage, writes: () => writes };
}
// Only public player commands and the shipped, unchanged enemy AI.
function replay(id: BattleId, commands: Command[]) {
  let state = createInitialState(id);
  const cells = structuredClone(state.cells);
  let gateCommands = 0;
  for (const command of commands) {
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe('player');
    const result = reduce(state, command);
    expect(result.error, `${id}: ${JSON.stringify(command)}`).toBeUndefined();
    if (command.type === 'gate') gateCommands++;
    state = result.state;
    let ai = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      expect(++ai).toBeLessThanOrEqual(3);
      state = runEnemyActivation(state);
    }
    if (id === 'B06') expect(state.cells).toEqual(cells);
  }
  return { state, gateCommands };
}
function fiveBattles(optional = true) {
  let campaign = createCampaign();
  for (const [id, commands] of [
    ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands],
    ['B04', b04.commands], ['B05', b05[optional ? 'optional' : 'required'].commands],
  ] as [BattleId, Command[]][]) {
    expect(selectBattle(campaign, 'B06')).toBe(campaign);
    const { state } = replay(id, commands);
    expect(state.phase).toBe('won');
    if (id === 'B03') {
      expect(escortUnit(state)?.id).toBe('escort-cart');
      expect(escortUnit(state)?.hp).toBe(24);
      expect(state.round).toBe(b03.round);
      expect(state.escort).not.toHaveProperty('unitId');
      expect(getUnit(state, 'ally-sena')?.healCharges).toBe(0);
    }
    campaign = completeBattle(campaign, state);
  }
  return campaign;
}
const allIds: BattleId[] = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06'];

describe('Independent B06 normal-AI integration', () => {
  it.each([true, false])('plays all six battles preserving optional K=%s, W and fresh replay resources', optional => {
    const m = memory();
    const prior = fiveBattles(optional);
    expect(prior.unlocked).toEqual(allIds);
    expect(prior.completed).toEqual(allIds.slice(0, 5));
    expect(writeCampaign(m.storage, selectBattle(prior, 'B06')).ok).toBe(true);
    const loaded = readCampaign(m.storage);
    expect(loaded.warning).toBeNull();
    const { state, gateCommands } = replay(loaded.campaign.currentBattle, b06.victory.commands as Command[]);
    expect(state.phase).toBe('won');
    expect(state.round).toBe(b06.victory.round);
    expect(gateCommands).toBe(1);
    expect(state.records).toEqual(['W']);
    expect(escortUnit(state)?.id).toBe('escort-toma');
    expect(escortUnit(state)?.pos).toEqual(getBattleConfig('B06').exit);
    expect(escortUnit(state)!.hp).toBeGreaterThan(0);
    expect(state.units.filter(u => u.team === 'player').map(u => [u.id, u.hp])).toEqual(b06.victory.playerHp);
    expect(getUnit(state, 'ally-sena')?.healCharges).toBe(0);
    expect(state.units.some(u => u.id === 'ally-neia')).toBe(false);
    expect(writeCampaign(m.storage, completeBattle(loaded.campaign, state)).ok).toBe(true);
    const restored = readCampaign(m.storage).campaign;
    expect(restored.completed).toEqual(allIds);
    expect(restored.evidence).toEqual([...prior.evidence, 'B06:W']);
    expect(restored.evidence.includes('B05:K')).toBe(optional);
    const raw = m.data.get(CAMPAIGN_KEY);
    const fresh = createInitialState(restored.currentBattle);
    expect(fresh).toMatchObject({ battleId: 'B06', phase: 'playing', round: 1, records: [], gate: { drained: false, pendingRound: null } });
    expect(fresh.escort?.index).toBe(0);
    expect(escortUnit(fresh)?.hp).toBe(20);
    expect(getUnit(fresh, 'ally-sena')?.healCharges).toBe(2);
    expect(fresh.units.every(u => u.hp === u.maxHp && !u.acted && !u.guard)).toBe(true);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(m.data.get('user-other')).toBe('preserve');
  });

  it('reads an actually earned legacy five-win v1 without writes, then preserves W and K through stale sessions', () => {
    const earned = fiveBattles();
    const legacy: Campaign = { ...earned, unlocked: allIds.slice(0, 5) };
    const raw = JSON.stringify(legacy);
    const m = memory(raw);
    const loaded = readCampaign(m.storage);
    expect(loaded.writable).toBe(true);
    expect(loaded.warning).toBeNull();
    expect(loaded.campaign.unlocked).toEqual(allIds);
    expect(loaded.campaign.currentBattle).toBe('B05');
    expect(m.writes()).toBe(0);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    const won = replay('B06', b06.victory.commands as Command[]).state;
    expect(won.phase).toBe('won');
    expect(writeCampaign(m.storage, completeBattle(selectBattle(loaded.campaign, 'B06'), won)).ok).toBe(true);
    const required = replay('B05', b05.required.commands as Command[]).state;
    expect(writeCampaign(m.storage, completeBattle(selectBattle(readCampaign(m.storage).campaign, 'B05'), required)).ok).toBe(true);
    expect(writeCampaign(m.storage, legacy).ok).toBe(true);
    const restored = readCampaign(m.storage).campaign;
    expect(restored.completed).toEqual(allIds);
    expect(restored.evidence).toEqual([...earned.evidence, 'B06:W']);
  });

  it('normal-AI defense loses without campaign mutation; retry resets witness, gate, actions and aid and wins', () => {
    const prior = selectBattle(fiveBattles(), 'B06');
    const m = memory();
    expect(writeCampaign(m.storage, prior).ok).toBe(true);
    const raw = m.data.get(CAMPAIGN_KEY);
    const lost = replay('B06', b06.defeat.commands as Command[]).state;
    expect(lost.phase).toBe('lost');
    expect(lost.round).toBe(b06.defeat.round);
    expect(lost.records).toEqual([]);
    expect(completeBattle(prior, lost)).toBe(prior);
    const initial = createInitialState(readCampaign(m.storage).campaign.currentBattle);
    expect(initial).toEqual(createInitialState('B06'));
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    const won = replay(initial.battleId, b06.victory.commands as Command[]).state;
    expect(writeCampaign(m.storage, completeBattle(prior, won)).ok).toBe(true);
    expect(readCampaign(m.storage).campaign.evidence).toContain('B06:W');
  });

  it.each(['{"version":999,"foreign":"keep"}', '{bad json'])('protects unreadable saves after a real B06 victory: %s', raw => {
    const prior = fiveBattles();
    const won = replay('B06', b06.victory.commands as Command[]).state;
    const m = memory(raw);
    expect(readCampaign(m.storage).writable).toBe(false);
    expect(writeCampaign(m.storage, completeBattle(selectBattle(prior, 'B06'), won)).ok).toBe(false);
    expect(m.data.get(CAMPAIGN_KEY)).toBe(raw);
    expect(m.writes()).toBe(0);
    expect(m.data.get('user-other')).toBe('preserve');
  });
});
