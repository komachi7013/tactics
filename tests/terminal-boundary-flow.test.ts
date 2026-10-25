import { beforeAll, describe, expect, it } from 'vitest';
import { createCampaign, completeBattle, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createPartyBattle } from '../src/party';
import { BATTLE_IDS, commonLevel, defaultParty } from '../src/progression';
import { getUnit, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { Command } from '../src/domain/types';
import { battleFlowHarness } from './helpers/battleFlowHarness';

let beforeFinal: Campaign;
const routes = import.meta.glob<{ commands: Command[] }>('./fixtures/progression-v2/*-route.json', { eager: true, import: 'default' });
beforeAll(() => {
  // Earn the save precondition with public commands and the unchanged AI.
  let campaign = createCampaign();
  for (const id of BATTLE_IDS.slice(0, 11)) {
    campaign = selectBattle(campaign, id);
    let state = createPartyBattle(id, defaultParty(id), campaign.jobs, commonLevel(campaign.completed));
    const route = routes[`./fixtures/progression-v2/${id.toLowerCase()}-route.json`];
    for (const command of route.commands) {
      const result = reduce(state, command); expect(result.error).toBeUndefined(); state = result.state;
      let guard = 0;
      while (state.phase === 'playing' && state.turn === 'enemy') {
        expect(++guard).toBeLessThanOrEqual(10); state = runEnemyActivation(state);
      }
    }
    expect(state.phase).toBe('won'); campaign = completeBattle(campaign, state);
  }
  beforeFinal = selectBattle(campaign, 'B12');
});

function terminalHarness() {
  let campaign = structuredClone(beforeFinal), writes = 0;
  const data = new Map<string, string>();
  const storage: StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { writes++; data.set(key, value); }, removeItem: key => { data.delete(key); } };
  expect(writeCampaign(storage, campaign).ok).toBe(true); writes = 0;
  const savedBefore = [...data.entries()];
  // Declared boundary fixture, not a claim of reaching this state through a UI.
  const state = createPartyBattle('B12', defaultParty('B12'), campaign.jobs, commonLevel(campaign.completed));
  state.round = 8; state.turn = 'player';
  state.finalControl = { heldRounds: 2, commanderSubdued: false };
  for (const unit of state.units) { unit.acted = unit.id !== 'ally-lise'; if (unit.team === 'enemy') unit.hp = 0; }
  getUnit(state, 'ally-lise')!.pos = { x: 10, y: 7 };
  getUnit(state, 'ally-garan')!.pos = { x: 5, y: 9 };
  getUnit(state, 'ally-iva')!.pos = { x: 15, y: 7 };
  getUnit(state, 'ally-neia')!.pos = { x: 9, y: 16 };
  getUnit(state, 'enemy-vesk')!.hp = 1;
  const h = battleFlowHarness(state, terminal => {
    const next = completeBattle(campaign, terminal);
    if (terminal.phase === 'won') {
      const saved = writeCampaign(storage, next); expect(saved.ok).toBe(true); campaign = saved.campaign!;
    } else expect(next).toBe(campaign);
  });
  return { ...h, campaign: () => campaign, writes: () => writes, saved: () => [...data.entries()], savedBefore };
}

describe('terminal rule decisions through live presentation continuation', () => {
  it('a living commander defeats the held objective at the R8 deadline, with no R9 or reward write', () => {
    const h = terminalHarness(), growth = structuredClone(h.campaign().growth);
    expect(h.submit({ type: 'start', unitId: 'ally-lise' })).toBe(true);
    expect(h.submit({ type: 'end', facing: 'E' })).toBe(true);
    expect(h.state()).toMatchObject({ phase: 'lost', round: 8, records: [] });
    expect(getUnit(h.state(), 'enemy-vesk')!.hp).toBe(1);
    expect(h.finish).toHaveBeenCalledTimes(1); expect(h.runEnemy).not.toHaveBeenCalled();
    expect(h.campaign().growth).toEqual(growth); expect(h.writes()).toBe(0); expect(h.saved()).toEqual(h.savedBefore);
    expect(h.pending()).toEqual([]); expect(h.submit({ type: 'end', facing: 'E' })).toBe(false); h.flow.dispose();
  });
  it('actual E suppression commits before400ms, but only the final end wins and awards once', () => {
    const h = terminalHarness(), beforeGrowth = structuredClone(h.campaign().growth);
    h.submit({ type: 'start', unitId: 'ally-lise' });
    expect(h.submit({ type: 'attack', targetId: 'enemy-vesk' })).toBe(true);
    const old = h.pending()[0].id;
    expect(h.pending()[0].ms).toBe(400);
    expect(h.state()).toMatchObject({ phase: 'playing', round: 8, records: [], finalControl: { commanderSubdued: true } });
    expect(getUnit(h.state(), 'enemy-vesk')!.hp).toBe(0);
    expect(h.submit({ type: 'end', facing: 'E' })).toBe(false);
    expect(h.finish).not.toHaveBeenCalled(); expect(h.writes()).toBe(0); expect(h.campaign().growth).toEqual(beforeGrowth);
    h.deliver(old);
    expect(h.state().phase).toBe('playing'); expect(h.finish).not.toHaveBeenCalled();
    expect(h.submit({ type: 'end', facing: 'E' })).toBe(true);
    expect(h.state()).toMatchObject({ phase: 'won', round: 8, records: ['U', 'V'] });
    expect(h.finish).toHaveBeenCalledTimes(1); expect(h.writes()).toBe(1);
    expect(h.campaign().completed).toEqual(BATTLE_IDS);
    const settled = structuredClone(h.campaign()), saved = h.saved();
    h.deliver(old); h.flow.finishNow(); h.signals.visibility(true); h.signals.preference(true);
    expect(h.finish).toHaveBeenCalledTimes(1); expect(h.writes()).toBe(1);
    expect(h.campaign()).toEqual(settled); expect(h.saved()).toEqual(saved); h.flow.dispose();
  });
  it.each(['timer', 'visibility', 'motion'] as const)('actual enemy attack kills Lise despite completed controls; %s settles loss once with no save', event => {
    const h = terminalHarness(), state = h.state();
    state.turn = 'enemy'; state.finalControl!.commanderSubdued = true;
    getUnit(state, 'enemy-vesk')!.hp = 0;
    for (const unit of state.units) unit.acted = true;
    getUnit(state, 'ally-lise')!.hp = 1;
    const enemy = getUnit(state, 'enemy-melee-01')!;
    enemy.hp = enemy.maxHp; enemy.pos = { x: 10, y: 8 }; enemy.move = 0; enemy.acted = false;
    h.flow.presentCommitted(null); const enemyTimer = h.pending()[0].id;
    expect(h.pending()[0].ms).toBe(620); h.deliver(enemyTimer);
    expect(h.runEnemy).toHaveBeenCalledTimes(1);
    expect(h.state()).toMatchObject({ phase: 'lost', round: 8, records: [] });
    expect(getUnit(h.state(), 'ally-lise')!.hp).toBe(0);
    expect(h.state().log.filter(l => l.includes('作戦失敗'))).toHaveLength(1);
    const attackTimer = h.pending()[0].id, committed = structuredClone(h.state());
    expect(h.pending()[0].ms).toBe(220); expect(h.finish).not.toHaveBeenCalled(); expect(h.writes()).toBe(0);
    if (event === 'timer') h.deliver(attackTimer);
    else if (event === 'visibility') h.signals.visibility(true);
    else h.signals.preference(true);
    if(event!=='timer'){
      expect(h.flow.presentationBusy).toBe(true);expect(h.flow.canShortenPresentation).toBe(false);
      expect(h.finish).not.toHaveBeenCalled();expect(h.writes()).toBe(0);
    }
    h.deliver(attackTimer); h.deliver(enemyTimer); h.flow.finishNow();
    expect(h.finish).toHaveBeenCalledTimes(1); expect(h.runEnemy).toHaveBeenCalledTimes(1);
    expect(h.state()).toEqual(committed); expect(h.writes()).toBe(0); expect(h.saved()).toEqual(h.savedBefore);
    expect(h.campaign().completed).not.toContain('B12'); expect(h.pending()).toEqual([]); h.flow.dispose();
  });
});
