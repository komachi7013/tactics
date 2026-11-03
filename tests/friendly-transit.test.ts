import { describe, expect, it } from 'vitest';
import { getEnemyDecisionSnapshot, runEnemyActivationWithTrace } from '../src/domain/ai';
import { getBattleConfig } from '../src/domain/battles';
import { createInitialState, escortAdvancePreview, getCell, getUnit, reachable, reduce } from '../src/domain/engine';
import type { BattleState, Team, Unit } from '../src/domain/types';

const teams: Team[] = ['player', 'enemy'];
const pos = (x: number, y = 0) => ({ x, y });
const actorId = (team: Team) => team === 'player' ? 'ally-lise' : 'enemy-actor';
function unit(id: string, team: Team, x: number): Unit {
 return { ...createInitialState().units[0], id, team, pos: pos(x), hp: 100, maxHp: 100, move: 4, acted: false };
}
function corridor(team: Team = 'player'): BattleState {
 const s = createInitialState();
 s.cells = Array.from({ length: 7 }, (_, x) => ({ ...pos(x), height: 0, shallow: false, blocked: false }));
 s.units = [unit(actorId(team), team, 0), unit('friend', team, 1)];
 if (team === 'enemy') s.units.push(unit('ally-lise', 'player', 6));
 s.turn = team;
 return s;
}
const at = (s: BattleState, id: string, x: number, y = 0) => reachable(s, id).find(p => p.x === x && p.y === y);
function start(s: BattleState, id: string): BattleState {
 const r = reduce(s, { type: 'start', unitId: id });
 expect(r.error).toBeUndefined();
 return r.state;
}

describe('same-team transit with empty stopping cells', () => {
 it.each(teams)('%s crosses allies, retains their cells in the route, and cannot stop on them', team => {
  const s = start(corridor(team), actorId(team)), before = structuredClone(s);
  const destination = at(s, actorId(team), 3)!;
  expect(destination).toMatchObject({ cost: 3, path: [pos(1), pos(2), pos(3)] });
  expect(at(s, actorId(team), 1)).toBeUndefined();
  expect(reachable(s, actorId(team)).every(p => !s.units.some(u => u.hp > 0 && u.id !== actorId(team) && u.pos.x === p.x && u.pos.y === p.y))).toBe(true);
  expect(reduce(s, { type: 'move', to: pos(1) })).toMatchObject({ state: s, error: expect.any(String) });
  const moved = reduce(s, { type: 'move', to: destination });
  expect(moved.error).toBeUndefined();
  expect(getUnit(moved.state, actorId(team))!.pos).toMatchObject(pos(3));
  expect(getUnit(moved.state, 'friend')!.pos).toEqual(pos(1));
  expect(s).toEqual(before);
 });

 it.each(teams)('%s cannot enter or cross the opposite team', team => {
  const s = corridor(team), other = team === 'player' ? 'enemy' : 'player';
  s.units.push(unit('opponent', other, 2));
  expect(at(s, actorId(team), 2)).toBeUndefined();
  expect(at(s, actorId(team), 3)).toBeUndefined();
  const active = start(s, actorId(team));
  expect(reduce(active, { type: 'move', to: pos(3) }).state).toBe(active);
 });

 it('uses an affordable weighted detour around an opponent, including friendly transit cost', () => {
  const s = corridor(), id = actorId('player');
  s.cells.push(...Array.from({ length: 5 }, (_, x) => ({ ...pos(x, 1), height: 0, shallow: x === 1, blocked: false })));
  getCell(s, pos(0, 1))!.blocked = true;
  s.units.push(unit('opponent', 'enemy', 2));
  getUnit(s, id)!.move = 6;
  const destination = at(s, id, 3)!;
  expect(destination.cost).toBe(6);
  expect(destination.path).toEqual([pos(1), pos(1, 1), pos(2, 1), pos(3, 1), pos(3)]);
  expect(at(s, id, 4)).toBeUndefined();
  getUnit(s, id)!.move = 5;
  expect(at(s, id, 3)).toBeUndefined();
 });

 it('charges shallow cells occupied by allies and preserves the existing plank discount', () => {
  const s = corridor(), actor = getUnit(s, 'ally-lise')!;
  getCell(s, pos(1))!.shallow = true;
  getCell(s, pos(1))!.water = true;
  actor.move = 2;
  expect(at(s, actor.id, 2)).toBeUndefined();
  actor.move = 3;
  expect(at(s, actor.id, 2)?.cost).toBe(3);
  actor.move = 2;
  actor.plankReady = true;
  expect(at(s, actor.id, 2)?.cost).toBe(2);
 });

 it.each(['blocked', 'height'] as const)('friendly occupancy does not bypass %s terrain', obstacle => {
  const s = corridor(), c = getCell(s, pos(1))!;
  if (obstacle === 'blocked') c.blocked = true;
  else c.height = 2;
  expect(at(s, 'ally-lise', 2)).toBeUndefined();
 });

 it.each(teams)('%s may cross and stop on retired units but dead actors cannot move', team => {
  const s = corridor(team), id = actorId(team);
  getUnit(s, 'friend')!.hp = 0;
  s.units.push({ ...unit('retired-opponent', team === 'player' ? 'enemy' : 'player', 2), hp: 0 });
  expect(at(s, id, 1)?.cost).toBe(1);
  expect(at(s, id, 2)?.cost).toBe(2);
  expect(at(s, id, 3)?.cost).toBe(3);
  getUnit(s, id)!.hp = 0;
  expect(reachable(s, id)).toEqual([]);
 });

 it.each(['enemy-on-route', 'friend-at-destination', 'terrain-on-route'] as const)('rechecks the current board after a displayed route: %s', change => {
  const s = start(corridor(), 'ally-lise'), displayed = at(s, 'ally-lise', 3)!;
  expect(displayed.path).toContainEqual(pos(1));
  if (change === 'enemy-on-route') getUnit(s, 'friend')!.team = 'enemy';
  if (change === 'friend-at-destination') getUnit(s, 'friend')!.pos = pos(3);
  if (change === 'terrain-on-route') getCell(s, pos(2))!.blocked = true;
  const before = structuredClone(s), r = reduce(s, { type: 'move', to: displayed });
  expect(r.error).toBeTruthy();
  expect(r.state).toBe(s);
  expect(s).toEqual(before);
 });

 it('allows a newly arrived ally on an intermediate cell', () => {
  const s = start(corridor(), 'ally-lise');
  getUnit(s, 'friend')!.pos = pos(5);
  const displayed = at(s, 'ally-lise', 3)!;
  getUnit(s, 'friend')!.pos = pos(2);
  expect(reduce(s, { type: 'move', to: displayed }).error).toBeUndefined();
 });

 it.each(['B03', 'B06', 'B09'] as const)('%s escort is a player ally in transit, never a stop or selectable mover', battle => {
  const original = createInitialState(battle), escort = original.units.find(u => u.kind === 'escort')!;
  expect(escort.team).toBe('player');
  const s = corridor();
  s.units = [s.units[0], { ...escort, pos: pos(1) }];
  expect(at(s, 'ally-lise', 2)?.path).toEqual([pos(1), pos(2)]);
  expect(at(s, 'ally-lise', 1)).toBeUndefined();
  expect(reachable(s, escort.id)).toEqual([]);
  expect(reduce(s, { type: 'start', unitId: escort.id }).state).toBe(s);
  s.units.push(unit('enemy-actor', 'enemy', 0));
  getUnit(s, 'ally-lise')!.pos = pos(6);
  expect(at(s, 'enemy-actor', 2)).toBeUndefined();
 });

 it('keeps fixed evacuation NPC terrain blocked and escort auto-advance unable to stop on allies', () => {
  const s = corridor();
  getCell(s, pos(1))!.blocked = true;
  expect(at(s, 'ally-lise', 2)).toBeUndefined();
  const escort = createInitialState('B03').units.find(u => u.kind === 'escort')!;
  s.units = [s.units[0], { ...escort, pos: pos(1) }, unit('friend', 'player', 2)];
  getCell(s, pos(1))!.blocked = false;
  s.battleId = 'B03';
  s.escort = { route: [pos(1), pos(2)], index: 0, unitId: escort.id };
  expect(escortAdvancePreview(s)).toMatchObject({ canAdvance: false, reason: '次の進行先が占有されています' });
  s.units = s.units.filter(u => u.id !== 'friend');
  expect(escortAdvancePreview(s)).toMatchObject({ canAdvance: true, next: pos(2) });
 });

 it.each(['B07', 'B11'] as const)('%s fixed NPCs remain terrain obstacles, not newly friendly units', battle => {
  const s = createInitialState(battle), actor = getUnit(s, 'ally-lise')!;
  actor.move = 1000;
  for (const npc of getBattleConfig(battle).records) {
   expect(getCell(s, npc)?.blocked).toBe(true);
   expect(s.units.some(u => u.pos.x === npc.x && u.pos.y === npc.y)).toBe(false);
   expect(at(s, actor.id, npc.x, npc.y)).toBeUndefined();
   expect(reachable(s, actor.id).every(p => p.path.every(step => step.x !== npc.x || step.y !== npc.y))).toBe(true);
  }
 });

 it('does not assume an unknown runtime faction is friendly', () => {
  const s = corridor();
  // Team currently has no neutral member; an external invalid faction must not gain friendly transit.
  s.units[1] = { ...s.units[1], team: 'neutral' } as unknown as Unit;
  expect(at(s, 'ally-lise', 2)).toBeUndefined();
 });

 it('AI intent and execution use the same route through a friendly unit without stopping on it', () => {
  const s = corridor('enemy');
  getUnit(s, 'enemy-actor')!.move = 3;
  getUnit(s, 'friend')!.acted = true;
  getUnit(s, 'ally-lise')!.pos = pos(4);
  const snapshot = getEnemyDecisionSnapshot(s), choice = snapshot.next!;
  expect(choice).toMatchObject({ actorId: 'enemy-actor', destination: pos(3), moveCost: 3, targetId: 'ally-lise', action: 'attack' });
  expect(choice.path).toEqual([pos(1), pos(2), pos(3)]);
  const result = runEnemyActivationWithTrace(s);
  expect(result.commands).toContainEqual({ type: 'move', to: expect.objectContaining(pos(3)) });
  let replay = s;
  for (const command of result.commands) {
   const next = reduce(replay, command);
   expect(next.error).toBeUndefined();
   replay = next.state;
  }
  expect(replay).toEqual(result.state);
  expect(getUnit(result.state, 'enemy-actor')!.pos).toMatchObject(choice.destination);
  expect(getUnit(result.state, 'friend')!.pos).toEqual(pos(1));
 });

 it('AI guard-goal distance also traverses friendly cells when no attack is available', () => {
  const s = corridor('enemy'), actor = getUnit(s, 'enemy-actor')!;
  actor.move = 2;
  actor.guardGoal = pos(4);
  getUnit(s, 'friend')!.acted = true;
  expect(getEnemyDecisionSnapshot(s).next).toMatchObject({ actorId: actor.id, destination: pos(2), action: 'defend', path: [pos(1), pos(2)] });
  const result = runEnemyActivationWithTrace(s);
  expect(getUnit(result.state, actor.id)!.pos).toMatchObject(pos(2));
 });
});
