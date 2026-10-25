import { describe, expect, it } from 'vitest';
import { attackPreview, createInitialState, getUnit, reduce } from '../src/domain/engine';
import { createBattleRandom, createCombatRandomConfig } from '../src/domain/combatRandom';
import type { AttackSector, BattleState, Facing, Team } from '../src/domain/types';

// Declared rule fixtures. PRNG state 0 draws .2664 (hit); state 36 draws .9561
// (front/side miss, rear hit). They do not claim actual campaign reachability.
function battle(team: Team = 'player', weapon: 'melee' | 'bow' = 'melee', sector: AttackSector = 'front', miss = false) {
  const state = createInitialState('B01');
  state.cells.forEach(c => { c.height = 0; c.blocked = false; c.water = false; c.shallow = false; });
  const template = structuredClone(state.units[0]);
  const actorId = team === 'player' ? 'ally-lise' : 'enemy-attacker';
  const targetId = team === 'player' ? 'enemy-target' : 'ally-lise';
  const facing: Facing = sector === 'front' ? 'W' : sector === 'rear' ? 'E' : 'N';
  state.units = [
    { ...template, id: actorId, team, pos: { x: weapon === 'bow' ? 2 : 3, y: 4 }, hp: 50, maxHp: 50, atk: 9, def: 2, weapon, facing: 'E', acted: false },
    { ...template, id: targetId, team: team === 'player' ? 'enemy' : 'player', pos: { x: 4, y: 4 }, hp: 50, maxHp: 50, atk: 9, def: 2, weapon: 'melee', facing, acted: false },
    { ...template, id: 'protector', team: team === 'player' ? 'enemy' : 'player', pos: { x: 8, y: 7 }, hp: 50, maxHp: 50, acted: false },
  ];
  state.activeId = actorId; state.turn = team;
  state.combatRandom = { version: 1, state: miss ? 36 : 0, draws: 0 };
  return { state, actorId, targetId };
}
const cases = (['player','enemy'] as Team[]).flatMap(team => (['melee','bow'] as const).flatMap(weapon =>
  (['front','side','rear'] as AttackSector[]).flatMap(sector => [false, true].map(miss => ({ team, weapon, sector, miss })))));
describe('committed directional combat resolution', () => {
  it.each(cases)('$team $weapon $sector with highRoll=$miss resolves once and preserves its input', ({ team, weapon, sector, miss }) => {
    const { state, actorId, targetId } = battle(team, weapon, sector, miss), before = structuredClone(state);
    const preview = attackPreview(state, actorId, targetId), chance = sector === 'front' ? 90 : sector === 'side' ? 95 : 100;
    const damageOnHit = 7 + (weapon === 'melee' && sector === 'rear' ? 2 : 0), hit = !miss || sector === 'rear';
    expect(preview).toMatchObject({ legal: true, damage: damageOnHit, hitChance: chance, sector });
    const result = reduce(state, { type: 'attack', targetId }); expect(result.error).toBeUndefined();
    expect(result.state.lastAttack).toEqual({ sequence: 1, actorId, targetId, hitChance: chance, hit, damageOnHit, damage: hit ? damageOnHit : 0, sector });
    expect(getUnit(result.state, targetId)!.hp).toBe(50 - (hit ? damageOnHit : 0));
    expect(result.state.activation.acted).toBe(true); expect(result.state.combatRandom!.draws).toBe(1);
    expect(state).toEqual(before);
    const duplicate = reduce(result.state, { type: 'attack', targetId });
    expect(duplicate.error).toBeDefined(); expect(duplicate.state).toBe(result.state);
    expect(duplicate.state.combatRandom!.draws).toBe(1);
  });
  it('spends survey and action on a miss but retains target protection, ready effects, and HP', () => {
    const { state, actorId, targetId } = battle('player', 'melee', 'front', true);
    getUnit(state, actorId)!.surveyBonus = true;
    const target = getUnit(state, targetId)!; target.protection = { sourceId: 'protector' }; target.plankReady = true; target.surveyBonus = true;
    const after = reduce(state, { type: 'attack', targetId }).state;
    expect(after.lastAttack).toMatchObject({ hit: false, damage: 0, damageOnHit: 7 });
    expect(getUnit(after, actorId)!.surveyBonus).toBeUndefined(); expect(after.activation.acted).toBe(true);
    expect(getUnit(after, targetId)).toMatchObject({ hp: 50, protection: { sourceId: 'protector' }, plankReady: true, surveyBonus: true });
    expect(after.log.at(-1)).toContain('外れ');
  });
  it('consumes protection on a hit, keeps guard duration, and does not stack guard/protection reductions', () => {
    const { state, actorId, targetId } = battle();
    getUnit(state, actorId)!.surveyBonus = true;
    const target = getUnit(state, targetId)!; target.guard = true; target.protection = { sourceId: 'protector' };
    expect(attackPreview(state, actorId, targetId).damage).toBe(7);
    const after = reduce(state, { type: 'attack', targetId }).state;
    expect(getUnit(after, targetId)!.protection).toBeUndefined(); expect(getUnit(after, targetId)!.guard).toBe(true);
    expect(getUnit(after, targetId)!.hp).toBe(43); expect(getUnit(after, actorId)!.surveyBonus).toBeUndefined();
  });
  it('retains protection after misses only until the existing source activation expiry', () => {
    const { state, targetId } = battle('player', 'melee', 'front', true);
    getUnit(state, targetId)!.protection = { sourceId: 'protector' };
    const after = reduce(state, { type: 'attack', targetId }).state;
    const ended = reduce(after, { type: 'end', facing: 'E' }).state;
    expect(ended.turn).toBe('enemy');
    const started = reduce(ended, { type: 'start', unitId: 'protector' }); expect(started.error).toBeUndefined();
    expect(getUnit(started.state, targetId)!.protection).toBeUndefined(); expect(started.state.combatRandom!.draws).toBe(1);
    expect(started.state.lastAttack).toEqual(after.lastAttack);
  });
  it('keeps minimum-one damage and reports actual capped HP loss separately from damage on hit', () => {
    const low = battle(); getUnit(low.state, low.targetId)!.def = 999;
    expect(reduce(low.state, { type: 'attack', targetId: low.targetId }).state.lastAttack).toMatchObject({ damage: 1, damageOnHit: 1 });
    const overkill = battle(); getUnit(overkill.state, overkill.targetId)!.hp = 2;
    const after = reduce(overkill.state, { type: 'attack', targetId: overkill.targetId }).state;
    expect(after.lastAttack).toMatchObject({ hit: true, damage: 2, damageOnHit: 7 }); expect(getUnit(after, overkill.targetId)!.hp).toBe(0);
  });
  it('does not draw during previews, illegal commands, moves, undo, defend or facing changes', () => {
    const { state, actorId, targetId } = battle(); const before = structuredClone(state);
    for (let i = 0; i < 20; i++) attackPreview(state, actorId, targetId);
    expect(state).toEqual(before);
    const invalid = reduce(state, { type: 'attack', targetId: actorId }); expect(invalid.error).toBeDefined(); expect(invalid.state).toBe(state);
    let after = reduce(state, { type: 'move', to: { x: 3, y: 5 } }).state;
    expect(after.activation.moved).toBe(true); after = reduce(after, { type: 'undoMove' }).state;
    expect(after.activation.moved).toBe(false); after = reduce(after, { type: 'defend' }).state;
    after = reduce(after, { type: 'end', facing: 'S' }).state;
    expect(after.combatRandom).toEqual(before.combatRandom); expect(after.lastAttack).toBeUndefined();
  });
  it('keeps explicit legacy factories guaranteed-hit and without a new result event', () => {
    const { state, actorId, targetId } = battle('player', 'bow', 'front', true); delete state.combatRandom;
    expect(attackPreview(state, actorId, targetId)).toMatchObject({ hitChance: 100, reason: '必中', damage: 7 });
    const after = reduce(state, { type: 'attack', targetId }).state;
    expect(getUnit(after, targetId)!.hp).toBe(43); expect(after.combatRandom).toBeUndefined(); expect(after.lastAttack).toBeUndefined();
  });
  it.each([false, true])('preserves the B12 final-round nonlethal/hold boundary for miss=%s', miss => {
    const state: BattleState = createInitialState('B12');
    state.round = 8; state.finalControl = { heldRounds: 2, commanderSubdued: false };
    state.combatRandom = { ...createBattleRandom(createCombatRandomConfig(), 'B12'), state: miss ? 36 : 0 };
    for (const unit of state.units) { unit.acted = unit.id !== 'ally-lise'; if (unit.team === 'enemy') unit.hp = 0; }
    getUnit(state, 'ally-lise')!.pos = { x: 10, y: 7 };
    getUnit(state, 'ally-garan')!.pos = { x: 5, y: 9 }; getUnit(state, 'ally-iva')!.pos = { x: 15, y: 7 };
    getUnit(state, 'ally-neia')!.pos = { x: 9, y: 16 };
    const commander = getUnit(state, 'enemy-vesk')!; commander.hp = 1; commander.facing = 'W';
    let result = reduce(state, { type: 'start', unitId: 'ally-lise' }); expect(result.error).toBeUndefined();
    result = reduce(result.state, { type: 'attack', targetId: commander.id }); expect(result.error).toBeUndefined();
    expect(result.state.phase).toBe('playing'); expect(result.state.finalControl!.commanderSubdued).toBe(!miss);
    result = reduce(result.state, { type: 'end', facing: 'E' }); expect(result.error).toBeUndefined();
    expect(result.state.phase).toBe(miss ? 'lost' : 'won'); expect(result.state.round).toBe(8);
    expect(result.state.records).toEqual(miss ? [] : ['U','V']);
  });
});
