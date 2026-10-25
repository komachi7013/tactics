import { describe, expect, it } from 'vitest';
import { createCampaign, readCampaign, selectBattle, writeCampaign, type StorageLike } from '../src/campaign';
import { createPartyBattle } from '../src/party';
import { BATTLE_IDS, defaultParty } from '../src/progression';
import { attackPreview, getUnit, reduce } from '../src/domain/engine';
import { createCombatRandomConfig } from '../src/domain/combatRandom';
import { getEnemyDecisionSnapshot, runEnemyActivationWithTrace } from '../src/domain/ai';
import { readOrderRows } from '../src/view/readOrder';
import type { BattleState, Command } from '../src/domain/types';

function replay(start: BattleState, commands: readonly Command[]) {
  let current = start;
  for (const command of commands) {
    const result = reduce(current, command); expect(result.error).toBeUndefined(); current = result.state;
  }
  return current;
}
function initial() {
  const campaign = createCampaign();
  return createPartyBattle('B01', defaultParty('B01'), campaign.jobs, 1, { equipment: campaign.equipment, combat: campaign.combat });
}
const legalB01: Command[] = [
  { type: 'start', unitId: 'ally-neia' }, { type: 'move', to: { x: 2, y: 6 } },
  { type: 'attack', targetId: 'enemy-melee-01' }, { type: 'end', facing: 'E' },
];
describe('versioned combat factory/replay and non-consuming prediction', () => {
  it.each(BATTLE_IDS)('adds only a fresh deterministic stream to the %s factory, leaving map/units/objectives unchanged', id => {
    const config = createCombatRandomConfig(), party = defaultParty(id);
    const legacy = createPartyBattle(id, party), versioned = createPartyBattle(id, party, undefined, 1, { combat: config });
    const { combatRandom, ...sameBattle } = versioned;
    expect(combatRandom!.draws).toBe(0); expect(versioned.lastAttack).toBeUndefined(); expect(sameBattle).toEqual(legacy);
    expect(createPartyBattle(id, party, undefined, 1, { combat: config })).toEqual(versioned);
    expect(legacy.combatRandom).toBeUndefined(); expect(config).toEqual(createCombatRandomConfig());
  });
  it('replays a legal B01 movement/attack trace and restarts its initial stream', () => {
    const a = initial(), b = initial(), expected = replay(a, legalB01);
    expect(replay(b, legalB01)).toEqual(expected); expect(expected.combatRandom!.draws).toBe(1);
    expect(expected.lastAttack).toMatchObject({ sequence: 1, actorId: 'ally-neia', targetId: 'enemy-melee-01', hitChance: 90, damageOnHit: 5 });
    expect(initial().combatRandom).toEqual(a.combatRandom);
  });
  it('preserves legal replay results across save failure, recovery, fresh read and battle re-selection', () => {
    const data = new Map<string, string>(); let fail = true;
    const storage: StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error('quota'); data.set(key, value); }, removeItem: key => { data.delete(key); } };
    let campaign = readCampaign(storage).campaign;
    const deploy = () => createPartyBattle('B01', defaultParty('B01'), campaign.jobs, 1, { equipment: campaign.equipment, combat: campaign.combat });
    const expected = replay(deploy(), legalB01);
    expect(writeCampaign(storage, campaign).ok).toBe(false); expect(data.size).toBe(0);
    campaign = readCampaign(storage).campaign; expect(replay(deploy(), legalB01)).toEqual(expected);
    fail = false; const saved = writeCampaign(storage, campaign); expect(saved.ok).toBe(true);
    campaign = selectBattle(readCampaign(storage).campaign, 'B01'); expect(replay(deploy(), legalB01)).toEqual(expected);
  });
  it('AI/read-order/attack previews do not advance RNG, and the actual enemy trace replays its one miss', () => {
    const state = initial();
    state.cells.forEach(cell => { cell.height = 0; cell.blocked = false; cell.water = false; cell.shallow = false; });
    for (const unit of state.units) if (!['ally-lise','enemy-bow-01'].includes(unit.id)) unit.hp = 0;
    const actor = getUnit(state, 'enemy-bow-01')!, target = getUnit(state, 'ally-lise')!;
    actor.pos = { x: 4, y: 5 }; actor.move = 0;
    target.pos = { x: 6, y: 5 }; target.facing = 'W';
    state.turn = 'enemy'; state.combatRandom = { version: 1, state: 36, draws: 0 }; state.readOrders = [actor.id];
    const before = structuredClone(state);
    for (let i = 0; i < 20; i++) {
      const snapshot = getEnemyDecisionSnapshot(state);
      expect(snapshot.next).toMatchObject({ actorId: actor.id, targetId: target.id, action: 'attack' });
      expect(readOrderRows(state, snapshot)).toHaveLength(1);
      expect(attackPreview(state, actor.id, target.id)).toMatchObject({ hitChance: 90, damage: 5 });
    }
    expect(state).toEqual(before);
    const result = runEnemyActivationWithTrace(state);
    expect(result.commands).toContainEqual({ type: 'attack', targetId: target.id });
    expect(result.state.lastAttack).toMatchObject({ sequence: 1, hit: false, damage: 0, damageOnHit: 5 });
    expect(result.state.combatRandom!.draws).toBe(1); expect(getUnit(result.state, target.id)!.hp).toBe(target.hp);
    expect(replay(before, result.commands)).toEqual(result.state);
  });
  it('read-order and guaranteed heal/support commands never draw or publish an attack result', () => {
    let read = initial(); getUnit(read, 'ally-lise')!.jobCommand = 'readOrder'; getUnit(read, 'ally-lise')!.readCharges = 2;
    read = replay(read, [{ type: 'start', unitId: 'ally-lise' }, { type: 'readOrder', targetId: 'enemy-melee-01' }]);
    expect(read.readOrders).toContain('enemy-melee-01'); expect(read.combatRandom!.draws).toBe(0); expect(read.lastAttack).toBeUndefined();
    for (const command of ['heal','survey','protect','plank'] as const) {
      const state = initial(), actor = getUnit(state, 'ally-lise')!, target = getUnit(state, 'ally-garan')!;
      actor.pos = { x: 1, y: 5 }; target.pos = { x: 1, y: 6 }; target.hp -= 3;
      if (command === 'heal') actor.healCharges = 2;
      else { actor.jobCommand = command; actor.surveyCharges = 2; actor.plankCharges = 2; }
      const after = replay(state, [{ type: 'start', unitId: actor.id }, { type: command, targetId: target.id }]);
      expect(after.activation.acted).toBe(true); expect(after.combatRandom!.draws).toBe(0); expect(after.lastAttack).toBeUndefined();
    }
  });
  it('keeps the last committed result stable across non-attack state changes and sequences the next actual attack', () => {
    const first = replay(initial(), [...legalB01,{type:'endPlayerTurn'}]);
    expect(first.lastAttack!.sequence).toBe(1); expect(first.turn).toBe('enemy');
    const next = runEnemyActivationWithTrace(first);
    if (next.commands.some(c => c.type === 'attack')) {
      expect(next.state.lastAttack!.sequence).toBe(2); expect(next.state.combatRandom!.draws).toBe(2);
    } else {
      expect(next.state.lastAttack).toEqual(first.lastAttack); expect(next.state.combatRandom).toEqual(first.combatRandom);
    }
    expect(replay(first, next.commands)).toEqual(next.state);
  });
});
