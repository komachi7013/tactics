import { describe, expect, it } from 'vitest';
import { createInitialState, getCell, getUnit, movementObjectBlocked, reachable, reduce, canGate, escortAdvancePreview, capturePreview } from '../src/domain/engine';
import { getBattleConfig } from '../src/domain/battles';
import { exitReady } from '../src/domain/exitReady';
import { BATTLE_IDS, defaultParty } from '../src/progression';
import { createPartyBattle } from '../src/party';
import { mapObjectPlacements } from '../src/view/mapObjectAssets';
import { cellInspection } from '../src/view/cellInspection';
import { reduceSelectionCommand } from '../src/view/selectionCommands';
import type { BattleId, BattleState, Command, Pos } from '../src/domain/types';

function commit(state: BattleState, command: Command) {
 const result = reduce(state, command); expect(result.error).toBeUndefined(); return result.state;
}
function beside(state: BattleState, pos: Pos) {
 const actor = getUnit(state, 'ally-lise')!;
 const neighbor = state.cells.find(cell => Math.abs(cell.x - pos.x) + Math.abs(cell.y - pos.y) === 1 && !movementObjectBlocked(state, cell))!;
 actor.pos = { x: pos.x, y: pos.y };
 state.units = state.units.filter(unit => unit.kind === 'escort' || unit.id === actor.id);
 state.cells.forEach(cell => { cell.height = 0; cell.blocked = false; cell.water = false; cell.shallow = false; });
 return actor;
}

describe('selected cells and object movement rules', () => {
 it.each(BATTLE_IDS)('%s retains an accessible approach to every record and chest on the authored map', id => {
  const state = createPartyBattle(id, defaultParty(id)), config = getBattleConfig(id);
  for (const pos of [...config.records, ...(state.equipmentChests ?? []).map(chest => chest.pos)]) {
   const target = getCell(state, pos)!;
   expect(state.cells.some(cell => !cell.blocked && !movementObjectBlocked(state, cell)
    && Math.abs(cell.height - target.height) <= 1 && Math.abs(cell.x - pos.x) + Math.abs(cell.y - pos.y) === 1), `${id} (${pos.x},${pos.y})`).toBe(true);
  }
 });
 it.each(BATTLE_IDS)('%s allows entering objects before collection and removes collected artwork', id => {
  const initial = createPartyBattle(id, defaultParty(id));
  for (const record of getBattleConfig(id).records) {
   let state = structuredClone(initial); const actor = beside(state, record);
   expect(reachable(state, actor.id).some(p => p.x === record.x && p.y === record.y)).toBe(true);
   state = commit(state, { type: 'start', unitId: actor.id });
   state = commit(state, { type: 'collect', recordId: record.id });
   expect(movementObjectBlocked(state, record)).toBe(false);
   expect(mapObjectPlacements(state).some(row => row.id === 'record:' + record.id)).toBe(false);
   expect(reachable(state, actor.id).some(p => p.x === record.x && p.y === record.y)).toBe(true);
  }
  for (const chest of initial.equipmentChests ?? []) {
   let state = structuredClone(initial); const actor = beside(state, chest.pos);
   expect(reachable(state, actor.id).some(p => p.x === chest.pos.x && p.y === chest.pos.y)).toBe(true);
   state = commit(state, { type: 'start', unitId: actor.id });
   state = commit(state, { type: 'loot', eventId: chest.eventId });
   expect(mapObjectPlacements(state).some(row => row.id === chest.eventId)).toBe(false);
   expect(reachable(state, actor.id).some(p => p.x === chest.pos.x && p.y === chest.pos.y)).toBe(true);
  }
 });

 it.each(BATTLE_IDS)('%s allows standing on valves after use and permits movement onto the exit', id => {
  const state = createInitialState(id), config = getBattleConfig(id);
  for (const pos of [config.gate, ...(config.sluiceGates ?? []).map(g => g.panel), ...(config.repairSites ?? []).map(g => g.pos)].filter(Boolean) as Pos[]) {
   expect(movementObjectBlocked(state, pos)).toBe(false);
   state.gate.drained = true; state.records = config.records.map(r => r.id);
   expect(movementObjectBlocked(state, pos)).toBe(false);
  }
  if (!['capture', 'sluice', 'finale'].includes(config.objective ?? '')) {
   const actor = beside(state, config.exit); actor.pos={x:Math.max(0,config.exit.x-1),y:config.exit.y};
   expect(reachable(state, actor.id).some(p => p.x === config.exit.x && p.y === config.exit.y)).toBe(true);
  }
 });

 it('describes selected floors and objects rather than the previous character', () => {
  const state = createInitialState();
  expect(cellInspection(state, { x: 0, y: 4 })).toMatchObject({ title: '乾地の床' });
  expect(cellInspection(state, getBattleConfig('B01').records[0]).title).toContain('水位記録');
  expect(cellInspection(state, getBattleConfig('B01').gate!)).toMatchObject({ title: '水門弁', lines: [], values: [] });
 });
});

describe('reusable water controls', () => {
 it.each(['B01', 'B04', 'B06', 'B08', 'B10'] as BattleId[])('%s can operate in both directions without changing HP, height or positions', id => {
  const initial = createInitialState(id), config = getBattleConfig(id);
  const gateId = config.sluiceGates?.[0].id, pos = config.gate ?? config.sluiceGates![0].panel;
  let state = initial; const actor = beside(state, pos);
  // Keep the escort away from its destination so advancing the turn cannot finish the stage.
  if (state.escort) state.escort.index = 0;
  const before = state.units.map(unit => [unit.id, unit.hp, { ...unit.pos }]);
  const heights = state.cells.map(cell => cell.height);
  for (let n = 0; n < 3; n++) {
   const status = gateId ? state.sluices![gateId] : state.gate, wasDrained = status.drained;
   state = commit(state, { type: 'start', unitId: actor.id });
   expect(canGate(state, gateId)).toBe(true);
   state = commit(state, { type: 'gate', gateId });
   expect(canGate(state, gateId)).toBe(false);
   if (id === 'B01') expect(state.gate.drained).toBe(!wasDrained);
   else expect((gateId ? state.sluices![gateId] : state.gate).pendingDrained).toBe(!wasDrained);
   state = commit(state, { type: 'end', facing: 'E' });
   expect((gateId ? state.sluices![gateId] : state.gate).drained).toBe(!wasDrained);
   expect(state.cells.map(cell => cell.height)).toEqual(heights);
   expect(state.units.map(unit => [unit.id, unit.hp, unit.pos])).toEqual(before);
  }
 });

 it('stops escort progress and capture when the corresponding chain gate is closed', () => {
  const escort = createInitialState('B06'); escort.gate.drained = false;
  expect(escortAdvancePreview(escort).canAdvance).toBe(false);
  const port = createInitialState('B10'); port.gate.drained = false;
  expect(capturePreview(port).eligible).toBe(false);
 });
});

describe('exit readiness and cancelling movement', () => {
 it.each(BATTLE_IDS.filter(id => getBattleConfig(id).records.length > 0 && !['capture', 'sluice', 'finale'].includes(getBattleConfig(id).objective ?? '')))('%s waits for required records and any gate or repair prerequisites', id => {
  const state = createInitialState(id), config = getBattleConfig(id);
  expect(exitReady(state)).toBe(false);
  state.records = config.records.filter(row => !row.optional).map(row => row.id);
  if (config.escortRequiresOpenGate) { expect(exitReady(state)).toBe(false); state.gate.drained = true; }
  for (const site of config.repairSites ?? []) {
   expect(exitReady(state)).toBe(false); state.repairs![site.id] = { completed: true, pendingRound: null };
  }
  expect(exitReady(state)).toBe(true);
  expect(mapObjectPlacements(state).find(row => row.kind === 'exit')?.ready).toBe(true);
 });

 it('can commit and replay another ally after move cancellation without ending the first ally', () => {
  let state = createInitialState();
  state = reduceSelectionCommand(state, 'ally-lise', { type: 'move', to: { x: 1, y: 5 } }).state;
  state = commit(state, { type: 'undoMove' });
  const result = reduceSelectionCommand(state, 'ally-garan', { type: 'move', to: { x: 2, y: 6 } });
  expect(result.error).toBeUndefined();
  expect(result.state.activeId).toBe('ally-garan');
  expect(getUnit(result.state, 'ally-lise')).toMatchObject({ acted: false, pos: { x: 0, y: 5 } });
  expect(result.commands.reduce(commit, state)).toEqual(result.state);
  expect(getCell(result.state, { x: 2, y: 6 })).toBeDefined();
 });
});
