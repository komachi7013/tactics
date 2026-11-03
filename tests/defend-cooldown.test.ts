import { describe, expect, it } from 'vitest';
import { getEnemyDecisionSnapshot, runEnemyActivationWithTrace } from '../src/domain/ai';
import { attackPreview, createInitialState, defendAvailability, getUnit, reduce } from '../src/domain/engine';
import type { BattleState, Command, Team } from '../src/domain/types';
import { reduceSelectionCommand, selectionCommandState } from '../src/view/selectionCommands';

const enemyId = 'enemy-melee-01';
const idFor = (team: Team) => team === 'player' ? 'ally-lise' : enemyId;
function fixture(): BattleState {
 const s = createInitialState();
 s.cells.forEach(c => { c.height = 0; c.blocked = false; c.shallow = false; });
 s.units = s.units.filter(u => u.team === 'player' || u.id === enemyId);
 getUnit(s, 'ally-lise')!.pos = { x: 0, y: 0 };
 getUnit(s, 'ally-garan')!.pos = { x: 0, y: 2 };
 getUnit(s, 'ally-neia')!.pos = { x: 0, y: 3 };
 const enemy = getUnit(s, enemyId)!;
 enemy.pos = { x: 8, y: 6 }; enemy.guardGoal = { ...enemy.pos }; enemy.move = 0;
 return s;
}
function apply(s: BattleState, command: Command): BattleState {
 const r = reduce(s, command);
 expect(r.error, JSON.stringify(command)).toBeUndefined();
 return r.state;
}
function nextOpportunity(s: BattleState, team: Team, round: number): BattleState {
 for (let i = 0; i < 10; i++) {
  if (s.turn === team && s.round === round && !s.activeId) return s;
  expect(s.phase).toBe('playing');
  s = s.turn === 'player' ? apply(s, { type: 'endPlayerTurn' }) : runEnemyActivationWithTrace(s).state;
 }
 throw new Error('Faction opportunity did not advance');
}

describe('defend cooldown follows faction opportunities, not activation starts', () => {
 it.each(['player', 'enemy'] as Team[])('%s may defend on T1 and T3, but not T2', team => {
  let s = fixture(); s.turn = team;
  const id = idFor(team);
  s = apply(s, { type: 'start', unitId: id });
  expect(defendAvailability(s, id).legal).toBe(true);
  s = apply(s, { type: 'defend' });
  expect(getUnit(s, id)).toMatchObject({ guard: true, defendAvailableRound: 3 });
  expect(s.activation.acted).toBe(true);
  expect(reduce(s, { type: 'defend' }).error).toBeTruthy();
  s = apply(s, { type: 'end', facing: 'N' });
  s = nextOpportunity(s, team, 2);
  s = apply(s, { type: 'start', unitId: id });
  expect(getUnit(s, id)).toMatchObject({ guard: false, defendAvailableRound: 3 });
  expect(defendAvailability(s, id)).toMatchObject({ legal: false, cooldownReady: false, availableRound: 3 });
  expect(defendAvailability(s, id).reason).toContain('第3ラウンド');
  const blocked = reduce(s, { type: 'defend' });
  expect(blocked.state).toBe(s); expect(blocked.error).toBeTruthy();
  s = apply(s, { type: 'end', facing: 'W' });
  s = nextOpportunity(s, team, 3);
  s = apply(s, { type: 'start', unitId: id });
  expect(defendAvailability(s, id).legal).toBe(true);
  s = apply(s, { type: 'defend' });
  expect(getUnit(s, id)).toMatchObject({ guard: true, defendAvailableRound: 5 });
 });

 it('a skipped T2 still counts without an actual activation start', () => {
  let s = apply(fixture(), { type: 'start', unitId: 'ally-lise' });
  s = apply(s, { type: 'defend' });
  s = apply(s, { type: 'end', facing: 'E' });
  s = nextOpportunity(s, 'player', 2);
  expect(getUnit(s, 'ally-lise')!.defendAvailableRound).toBe(3);
  // Ends the whole player phase without starting Lise at all.
  s = apply(s, { type: 'endPlayerTurn' });
  expect(getUnit(s, 'ally-lise')).toMatchObject({ guard: false, defendAvailableRound: 3 });
  s = nextOpportunity(s, 'player', 3);
  s = apply(s, { type: 'start', unitId: 'ally-lise' });
  expect(defendAvailability(s, 'ally-lise').legal).toBe(true);
 });

 it('selection, repeated previews, switching, cancelling and a rejected commit cannot change guard or cooldown', () => {
  const s = fixture(); s.round = 2;
  const unit = getUnit(s, 'ally-lise')!; unit.guard = true; unit.defendAvailableRound = 3;
  const before = structuredClone(s);
  for (const selected of ['ally-lise', 'ally-garan', 'ally-lise']) {
   const preview = selectionCommandState(s, selected);
   expect(getUnit(preview, 'ally-lise')!.defendAvailableRound).toBe(3);
  }
  const preview = selectionCommandState(s, 'ally-lise');
  expect(defendAvailability(preview, 'ally-lise').legal).toBe(false);
  const failed = reduceSelectionCommand(s, 'ally-lise', { type: 'defend' });
  expect(failed.state).toBe(s); expect(failed.commands).toEqual([]); expect(failed.error).toBeTruthy();
  expect(s).toEqual(before);
 });

 it('only committing defend consumes availability; legacy missing fields remain absent in previews', () => {
  const s = fixture(), before = structuredClone(s);
  const preview = selectionCommandState(s, 'ally-lise');
  expect(defendAvailability(preview, 'ally-lise').legal).toBe(true);
  expect(getUnit(preview, 'ally-lise')!.defendAvailableRound).toBeUndefined();
  const committed = reduceSelectionCommand(s, 'ally-lise', { type: 'defend' });
  expect(committed.error).toBeUndefined();
  expect(committed.commands).toEqual([{ type: 'start', unitId: 'ally-lise' }, { type: 'defend' }]);
  expect(getUnit(committed.state, 'ally-lise')!.defendAvailableRound).toBe(3);
  expect(s).toEqual(before);
 });

 it('direction-only end does not grant guard or spend future defense', () => {
  const s = fixture();
  const ended = reduceSelectionCommand(s, 'ally-lise', { type: 'end', facing: 'S' });
  expect(ended.error).toBeUndefined();
  expect(getUnit(ended.state, 'ally-lise')).toMatchObject({ guard: false, facing: 'S', acted: true });
  expect(getUnit(ended.state, 'ally-lise')!.defendAvailableRound).toBeUndefined();
 });

 it('legacy serialized battle states allow defense, and new deadlines survive a JSON round trip', () => {
  let s: BattleState = JSON.parse(JSON.stringify(fixture()));
  expect(s.units.every(u => u.defendAvailableRound === undefined)).toBe(true);
  s = apply(s, { type: 'start', unitId: 'ally-lise' });
  s = apply(s, { type: 'defend' });
  const restored: BattleState = JSON.parse(JSON.stringify(s));
  expect(getUnit(restored, 'ally-lise')!.defendAvailableRound).toBe(3);
  restored.round = 2; restored.activation.acted = false;
  expect(reduce(restored, { type: 'defend' }).error).toBeTruthy();
  expect(createInitialState().units.every(u => u.defendAvailableRound === undefined)).toBe(true);
 });

 it.each(['missing', 'dead', 'escort', 'inactive', 'wrong-turn', 'unit-acted', 'action-spent', 'terminal'] as const)('availability rejects %s without mutation', condition => {
  const s = apply(fixture(), { type: 'start', unitId: 'ally-lise' }), u = getUnit(s, 'ally-lise')!;
  if (condition === 'dead') u.hp = 0;
  if (condition === 'escort') u.kind = 'escort';
  if (condition === 'inactive') s.activeId = null;
  if (condition === 'wrong-turn') s.turn = 'enemy';
  if (condition === 'unit-acted') u.acted = true;
  if (condition === 'action-spent') s.activation.acted = true;
  if (condition === 'terminal') s.phase = 'won';
  const before = structuredClone(s);
  expect(defendAvailability(s, condition === 'missing' ? 'absent' : u.id).legal).toBe(false);
  expect(s).toEqual(before);
 });
});

describe('defense effect and enemy fallback remain consistent', () => {
 it('keeps damage reduction at 2, minimum damage 1, and does not stack with protection', () => {
  let s = apply(fixture(), { type: 'start', unitId: 'ally-lise' });
  getUnit(s, enemyId)!.pos = { x: 1, y: 0 };
  getUnit(s, enemyId)!.atk = 10;
  getUnit(s, 'ally-lise')!.facing = 'E';
  const base = attackPreview(s, enemyId, 'ally-lise').damage;
  s = apply(s, { type: 'defend' });
  expect(attackPreview(s, enemyId, 'ally-lise').damage).toBe(base - 2);
  getUnit(s, 'ally-lise')!.protection = { sourceId: 'ally-garan' };
  expect(attackPreview(s, enemyId, 'ally-lise').damage).toBe(base - 2);
  getUnit(s, enemyId)!.atk = 1;
  getUnit(s, 'ally-lise')!.def = 20;
  expect(attackPreview(s, enemyId, 'ally-lise').damage).toBe(1);
 });

 it('AI defends on T1, ends without defense on T2, and defends again on T3 with replayable traces', () => {
  let s = fixture(); s.turn = 'enemy';
  for (const round of [1, 2, 3]) {
   s = nextOpportunity(s, 'enemy', round);
   const expectedAction = round === 2 ? 'wait' : 'defend';
   expect(getEnemyDecisionSnapshot(s).next).toMatchObject({ actorId: enemyId, action: expectedAction });
   const before = structuredClone(s), result = runEnemyActivationWithTrace(s);
   expect(result.commands.some(c => c.type === 'defend')).toBe(round !== 2);
   expect(result.commands.at(-1)?.type).toBe('end');
   let replay = s;
   for (const command of result.commands) replay = apply(replay, command);
   expect(replay).toEqual(result.state); expect(s).toEqual(before);
   s = result.state;
  }
 });

 it('AI cooldown changes only fallback action, never candidate ranking or movement', () => {
  const ready = fixture(); ready.turn = 'enemy';
  getUnit(ready, enemyId)!.move = 2;
  getUnit(ready, enemyId)!.guardGoal = { x: 5, y: 5 };
  const cooldown = structuredClone(ready); getUnit(cooldown, enemyId)!.defendAvailableRound = 3;
  const a = getEnemyDecisionSnapshot(ready).next!, b = getEnemyDecisionSnapshot(cooldown).next!;
  expect(a.action).toBe('defend'); expect(b.action).toBe('wait');
  expect({ ...a, action: b.action }).toEqual(b);
  const execution = runEnemyActivationWithTrace(cooldown);
  expect(execution.commands.some(c => c.type === 'move')).toBe(true);
  expect(execution.commands.some(c => c.type === 'defend')).toBe(false);
  expect(getUnit(execution.state, enemyId)!.pos).toMatchObject(b.destination);
 });

 it('AI still attacks while defense is cooling down', () => {
  const s = fixture(); s.turn = 'enemy'; s.round = 2;
  const enemy = getUnit(s, enemyId)!;
  enemy.pos = { x: 1, y: 0 }; enemy.defendAvailableRound = 3;
  expect(getEnemyDecisionSnapshot(s).next?.action).toBe('attack');
  const result = runEnemyActivationWithTrace(s);
  expect(result.commands.some(c => c.type === 'attack')).toBe(true);
  expect(result.commands.some(c => c.type === 'defend')).toBe(false);
  expect(getUnit(result.state, enemyId)!.defendAvailableRound).toBe(3);
 });
});
