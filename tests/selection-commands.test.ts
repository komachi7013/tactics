import { describe, expect, it } from 'vitest';
import { createInitialState, getUnit, reduce } from '../src/domain/engine';
import type { BattleState, Command } from '../src/domain/types';
import { reduceSelectionCommand, selectionCommandState } from '../src/view/selectionCommands';

function fixture(): BattleState {
 const s = createInitialState();
 s.cells.forEach(c => { c.height = 0; c.shallow = false; c.blocked = false; });
 getUnit(s, 'ally-lise')!.pos = { x: 0, y: 0 };
 getUnit(s, 'ally-garan')!.pos = { x: 0, y: 2 };
 getUnit(s, 'ally-neia')!.pos = { x: 0, y: 3 };
 getUnit(s, 'enemy-melee-01')!.pos = { x: 1, y: 0 };
 getUnit(s, 'enemy-melee-01')!.hp = 100;
 return s;
}
function apply(s: BattleState, command: Command): BattleState {
 const r = reduce(s, command);
 expect(r.error).toBeUndefined();
 return r.state;
}
function replay(s: BattleState, commands: Command[]): BattleState {
 return commands.reduce(apply, s);
}

describe('selection previews do not commit activation', () => {
 it('derives start-time expiry only in the preview and leaves selection/cancellation non-destructive', () => {
  const s = fixture();
  getUnit(s, 'ally-lise')!.guard = true;
  getUnit(s, 'ally-garan')!.protection = { sourceId: 'ally-lise' };
  const before = structuredClone(s), preview = selectionCommandState(s, 'ally-lise');
  expect(preview).not.toBe(s);
  expect(preview.activeId).toBe('ally-lise');
  expect(getUnit(preview, 'ally-lise')!.guard).toBe(false);
  expect(getUnit(preview, 'ally-garan')!.protection).toBeUndefined();
  expect(preview.activation).toEqual({ moved: false, acted: false, moveOrigin: null });
  // Cancelling discards this preview; no commit helper is called.
  expect(s).toEqual(before);
  expect(s.activeId).toBeNull();
  expect(getUnit(s, 'ally-lise')!.guard).toBe(true);
 });

 it('can inspect a different eligible ally without activating either or spending guard', () => {
  const s = fixture();
  getUnit(s, 'ally-lise')!.guard = true;
  getUnit(s, 'ally-garan')!.guard = true;
  const before = structuredClone(s);
  expect(selectionCommandState(s, 'ally-lise').activeId).toBe('ally-lise');
  const other = selectionCommandState(s, 'ally-garan');
  expect(other.activeId).toBe('ally-garan');
  expect(getUnit(other, 'ally-lise')!.guard).toBe(true);
  expect(getUnit(other, 'ally-garan')!.guard).toBe(false);
  expect(s).toEqual(before);
 });

 it.each([null, undefined, '', 'absent', 'enemy-melee-01'])('returns the original state for invalid selection %s', selected => {
  const s = fixture();
  expect(selectionCommandState(s, selected)).toBe(s);
 });

 it.each(['dead', 'acted', 'escort', 'enemy-turn', 'terminal'] as const)('does not preview an ineligible %s selection', condition => {
  const s = fixture(), u = getUnit(s, 'ally-lise')!;
  if (condition === 'dead') u.hp = 0;
  if (condition === 'acted') u.acted = true;
  if (condition === 'escort') u.kind = 'escort';
  if (condition === 'enemy-turn') s.turn = 'enemy';
  if (condition === 'terminal') s.phase = 'won';
  const before = structuredClone(s);
  expect(selectionCommandState(s, u.id)).toBe(s);
  expect(s).toEqual(before);
 });

 it('keeps an existing actor and moved/acted flags when the inspected selection changes', () => {
  const initial = fixture();
  getUnit(initial, 'ally-lise')!.jobCommand = 'survey';
  getUnit(initial, 'ally-lise')!.surveyCharges = 2;
  let s = apply(initial, { type: 'start', unitId: 'ally-lise' });
  s = apply(s, { type: 'move', to: { x: 0, y: 1 } });
  s = apply(s, { type: 'survey', targetId: 'ally-garan' });
  for (const selected of ['ally-lise', 'ally-garan', 'enemy-melee-01', null]) {
   expect(selectionCommandState(s, selected)).toBe(s);
  }
  expect(s.activation).toMatchObject({ moved: true, acted: true });
 });
});

describe('selection command commits are atomic', () => {
 it('commits a move and returns the exact implicit-start trace from the original state', () => {
  const s = fixture(), before = structuredClone(s);
  const command: Command = { type: 'move', to: { x: 0, y: 1 } };
  const r = reduceSelectionCommand(s, 'ally-lise', command);
  expect(r.error).toBeUndefined();
  expect(r.commands).toEqual([{ type: 'start', unitId: 'ally-lise' }, command]);
  expect(r.state).toEqual(replay(s, r.commands));
  expect(r.state.activeId).toBe('ally-lise');
  expect(r.state.activation.moved).toBe(true);
  expect(s).toEqual(before);
 });

 it.each(['occupied-move', 'invalid-attack', 'undo-before-move'] as const)('rolls back start and its expiry when %s fails', condition => {
  const s = fixture();
  getUnit(s, 'ally-lise')!.guard = true;
  getUnit(s, 'ally-garan')!.protection = { sourceId: 'ally-lise' };
  const before = structuredClone(s);
  const command: Command = condition === 'occupied-move' ? { type: 'move', to: { x: 0, y: 2 } }
   : condition === 'invalid-attack' ? { type: 'attack', targetId: 'ally-garan' } : { type: 'undoMove' };
  const r = reduceSelectionCommand(s, 'ally-lise', command);
  expect(r.error).toBeTruthy();
  expect(r.state).toBe(s);
  expect(r.commands).toEqual([]);
  expect(s).toEqual(before);
 });

 it.each([null, 'absent', 'enemy-melee-01'])('cannot implicitly start invalid selection %s', selected => {
  const s = fixture(), r = reduceSelectionCommand(s, selected, { type: 'move', to: { x: 0, y: 1 } });
  expect(r.error).toBeTruthy();
  expect(r.state).toBe(s);
  expect(r.commands).toEqual([]);
 });

 it('ignores selection changes after moving and cannot reset movement through another ally', () => {
  const moved = reduceSelectionCommand(fixture(), 'ally-lise', { type: 'move', to: { x: 0, y: 1 } }).state;
  const again = reduceSelectionCommand(moved, 'ally-garan', { type: 'move', to: { x: 1, y: 1 } });
  expect(again.error).toBeTruthy();
  expect(again.state).toBe(moved);
  expect(again.commands).toEqual([]);
  const ended = reduceSelectionCommand(moved, 'ally-garan', { type: 'end', facing: 'N' });
  expect(ended.error).toBeUndefined();
  expect(ended.commands).toEqual([{ type: 'end', facing: 'N' }]);
  expect(getUnit(ended.state, 'ally-lise')).toMatchObject({ facing: 'N', acted: true, guard: false, pos: { x: 0, y: 1 } });
  expect(getUnit(ended.state, 'ally-garan')!.acted).toBe(false);
 });

 it('commits direction-only end from selection without adding defense or an action', () => {
  const s = fixture();
  getUnit(s, 'ally-lise')!.guard = true;
  const r = reduceSelectionCommand(s, 'ally-lise', { type: 'end', facing: 'W' });
  expect(r.error).toBeUndefined();
  expect(r.commands).toEqual([{ type: 'start', unitId: 'ally-lise' }, { type: 'end', facing: 'W' }]);
  expect(getUnit(r.state, 'ally-lise')).toMatchObject({ acted: true, facing: 'W', guard: false, pos: { x: 0, y: 0 } });
  expect(r.state.log.some(line => line.includes('防御'))).toBe(false);
  expect(getUnit(s, 'ally-lise')!.guard).toBe(true);
 });

 it('commits attack with a replayable start/attack trace and no selected-state mutation', () => {
  const s = fixture(), before = structuredClone(s);
  const r = reduceSelectionCommand(s, 'ally-lise', { type: 'attack', targetId: 'enemy-melee-01' });
  expect(r.error).toBeUndefined();
  expect(r.commands).toEqual([{ type: 'start', unitId: 'ally-lise' }, { type: 'attack', targetId: 'enemy-melee-01' }]);
  expect(r.state).toEqual(replay(s, r.commands));
  expect(getUnit(r.state, 'enemy-melee-01')!.hp).toBeLessThan(100);
  expect(r.state.activation.acted).toBe(true);
  expect(s).toEqual(before);
 });

 it.each([{ type: 'start', unitId: 'ally-garan' }, { type: 'endPlayerTurn' }] as Command[])('forwards explicit $type without implicit start', command => {
  const s = fixture(), r = reduceSelectionCommand(s, 'ally-lise', command), expected = reduce(s, command);
  expect(r.error).toBeUndefined();
  expect(r.state).toEqual(expected.state);
  expect(r.commands).toEqual([command]);
 });

 it('keeps explicit rejected commands atomic even with another eligible selected unit', () => {
  const s = apply(fixture(), { type: 'start', unitId: 'ally-lise' });
  for (const command of [{ type: 'start', unitId: 'ally-garan' }, { type: 'endPlayerTurn' }] as Command[]) {
   const r = reduceSelectionCommand(s, 'ally-garan', command);
   expect(r.error).toBeTruthy();
   expect(r.state).toBe(s);
   expect(r.commands).toEqual([]);
  }
 });

 it('does not change the existing enemy/domain defend rule when the player UI omits that button', () => {
  const s = fixture();
  s.turn = 'enemy';
  const started = reduceSelectionCommand(s, 'ally-lise', { type: 'start', unitId: 'enemy-melee-01' });
  const defended = reduceSelectionCommand(started.state, 'ally-garan', { type: 'defend' });
  expect(defended.error).toBeUndefined();
  expect(defended.commands).toEqual([{ type: 'defend' }]);
  expect(getUnit(defended.state, 'enemy-melee-01')!.guard).toBe(true);
 });
});
