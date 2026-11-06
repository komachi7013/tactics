import { describe, it, expect } from 'vitest';
import { MAP_OBJECT_ASSETS, mapObjectPlacements, mapObjectAlpha, mapObjectUsesPaintedArt } from '../src/view/mapObjectAssets';
import { createPartyBattle } from '../src/party';
import { BATTLE_IDS, defaultParty } from '../src/progression';
import { getBattleConfig } from '../src/domain/battles';
import { reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleId, BattleState, Command, Pos } from '../src/domain/types';

const battle = (id: BattleId) => createPartyBattle(id, defaultParty(id));
const marker = (state: BattleState, id: string) => mapObjectPlacements(state).find(row => row.id === id)!;
const commit = (state: BattleState, command: Command) => {
  const next = reduce(state, command); expect(next.error, JSON.stringify(command)).toBeUndefined(); return next.state;
};
/** Explicit position fixture; all reservation/completion changes below use real commands. */
function oneActorBeside(id: BattleId, point: Pos): BattleState {
  const state = battle(id), actor = state.units.find(unit => unit.id === 'ally-lise')!;
  const target = state.cells.find(c => c.x === point.x && c.y === point.y)!;
  const cell = state.cells.find(c => Math.abs(c.x - point.x) + Math.abs(c.y - point.y) === 1 && !c.blocked && (!c.water || c.bridge) && Math.abs(c.height - target.height) <= 1)!;
  expect(cell).toBeDefined(); actor.pos = { x: cell.x, y: cell.y }; state.units = [actor]; return state;
}
function nextRound(state: BattleState): BattleState {
  const round = state.round;
  const ended = commit(state, { type: 'end', facing: 'E' });
  // The explicit no-enemy fixture uses advanceTurn's normal empty-phase skip.
  const next = ended.turn === 'enemy' ? runEnemyActivation(ended) : ended;
  expect(next.round).toBe(round + 1); expect(next.turn).toBe('player'); return next;
}

describe('authored map object display mapping', () => {
  it('covers all twelve stages with only existing target positions and no state mutation', () => {
    for (const id of BATTLE_IDS) {
      const state = battle(id), before = structuredClone(state), config = getBattleConfig(id);
      const rows = mapObjectPlacements(state);
      expect(rows.length, id).toBeGreaterThan(0);
      expect(new Set(rows.map(row => row.id)).size, id).toBe(rows.length);
      for (const row of rows) {
        expect(row.pos.x).toBeGreaterThanOrEqual(0); expect(row.pos.x).toBeLessThan(config.width);
        expect(row.pos.y).toBeGreaterThanOrEqual(0); expect(row.pos.y).toBeLessThan(config.height);
        expect(state.cells.some(c => c.x === row.pos.x && c.y === row.pos.y), `${id} ${row.id}`).toBe(true);
        expect(MAP_OBJECT_ASSETS[row.asset]).toBeDefined();
        expect(row.instruction.length).toBeGreaterThan(10);
      }
      expect(state).toEqual(before);
    }
  });
  it('identifies equipment boxes rather than inventing money treasures, and keeps B12 box-free', () => {
    for (const id of BATTLE_IDS) {
      const rows = mapObjectPlacements(battle(id)).filter(row => row.kind === 'equipment');
      expect(rows.length, id).toBe(id === 'B12' ? 0 : 1);
      if (rows[0]) { expect(rows[0].label).toBe('宝箱'); expect(rows[0].instruction).toContain('持ち帰った装備'); }
    }
    const state = battle('B01'); state.pendingEquipment = [state.equipmentChests![0].eventId];
    expect(mapObjectPlacements(state).find(r => r.kind === 'equipment')).toBeUndefined();
  });
  it('distinguishes records, optional archives and existing rescue people without replacing them', () => {
    const state = battle('B01'); state.records = ['A'];
    expect(mapObjectPlacements(state).filter(r => r.kind === 'record').map(r => r.label)).toEqual(['水位記録B']);
    expect(mapObjectPlacements(battle('B05')).find(r => r.id === 'record:K')?.label).toBe('補償名簿 K（任意）');
    expect(marker(battle('B08'), 'record:P').label).toBe('補助堰の保守記録 P');
    expect(marker(battle('B03'), 'record:M').label).toBe('負傷者名簿の写し M');
    for (const id of ['B07', 'B11'] as const) expect(mapObjectPlacements(battle(id)).filter(r => r.kind === 'record')).toEqual([]);
  });
  it('keeps chain signals, independent sluices, repair prerequisites and finale consoles distinct', () => {
    expect(mapObjectPlacements(battle('B06')).find(r => r.kind === 'gate')?.label).toBe('鎖門操作盤\n未開通');
    expect(mapObjectPlacements(battle('B10')).find(r => r.kind === 'gate')?.label).toBe('外港鎖門の信号盤\n未開通');
    expect(mapObjectPlacements(battle('B08')).filter(r => r.kind === 'sluice')).toHaveLength(2);
    const repairs = mapObjectPlacements(battle('B11')).filter(r => r.kind === 'repair');
    expect(repairs).toHaveLength(2); expect(repairs[0].instruction).toContain('W1'); expect(repairs[1].instruction).toContain('W2');
    const finale = mapObjectPlacements(battle('B12'));
    expect(finale.filter(r => r.kind === 'control')).toHaveLength(2); expect(finale.some(r => r.kind === 'exit')).toBe(false);
  });
  it('fades props under characters without changing target positions or selection rules', () => {
    const row = mapObjectPlacements(battle('B01'))[0], pos = { ...row.pos };
    expect(mapObjectAlpha(row, true)).toBe(.32); expect(mapObjectAlpha(row, false)).toBe(1);
    expect(mapObjectAlpha({ ...row, completed: true }, false)).toBe(.5); expect(row.pos).toEqual(pos);
  });
  it('reuses authored equipment art instead of adding duplicate valves on five registered landscapes', () => {
    for (const [id, kind] of [['B06', 'gate'], ['B08', 'sluice'], ['B10', 'gate'], ['B11', 'repair'], ['B12', 'control']] as const) expect(mapObjectUsesPaintedArt(id, kind)).toBe(true);
    for (const id of ['B01', 'B04'] as const) expect(mapObjectUsesPaintedArt(id, 'gate')).toBe(false);
    for (const id of BATTLE_IDS) for (const kind of ['equipment', 'record', 'capture', 'exit'] as const) expect(mapObjectUsesPaintedArt(id, kind)).toBe(false);
    expect(MAP_OBJECT_ASSETS.valve.key).toBe('gate');
  });
  it('retains independent sluice direction through real drain and re-entry reservations and completions', () => {
    const point = getBattleConfig('B08').sluiceGates!.find(gate => gate.id === 'N')!.panel;
    let state = oneActorBeside('B08', point);
    expect(marker(state, 'sluice:N').label).toBe('北水路 N 操作盤\n浅瀬');
    state = commit(state, { type: 'start', unitId: 'ally-lise' }); state = commit(state, { type: 'gate', gateId: 'N' });
    expect(marker(state, 'sluice:N').label).toBe('北水路 N 操作盤\n浅瀬 / R2排水予約');
    expect(marker(state, 'sluice:S').label).toBe('南水路 S 操作盤\n浅瀬');
    state = nextRound(state); expect(marker(state, 'sluice:N').label).toBe('北水路 N 操作盤\n排水済み');
    state = commit(state, { type: 'start', unitId: 'ally-lise' }); state = commit(state, { type: 'gate', gateId: 'N' });
    expect(marker(state, 'sluice:N').label).toBe('北水路 N 操作盤\n排水済み / R3再入水予約');
    state = nextRound(state); expect(marker(state, 'sluice:N').label).toBe('北水路 N 操作盤\n浅瀬');
  });
  it('keeps reversible water direction distinct from chain opening through real gate commands', () => {
    let water = oneActorBeside('B04', getBattleConfig('B04').gate!);
    expect(marker(water, 'gate').label).toBe('水門弁\n乾地');
    water = commit(water, { type: 'start', unitId: 'ally-lise' }); water = commit(water, { type: 'gate' });
    expect(marker(water, 'gate').label).toBe('水門弁\nR2再入水予約');
    expect(marker(water, 'gate').instruction).not.toContain('任意');
    water = nextRound(water); expect(marker(water, 'gate').label).toBe('水門弁\n入水');
    let signal = oneActorBeside('B10', getBattleConfig('B10').gate!);
    signal = commit(signal, { type: 'start', unitId: 'ally-lise' }); signal = commit(signal, { type: 'gate' });
    expect(marker(signal, 'gate').label).toBe('外港鎖門の信号盤\nR2開通予約');
    signal = nextRound(signal); expect(marker(signal, 'gate').label).toBe('外港鎖門の信号盤\n開通済み');
  });
  it('keeps required worker identity and each repair state through a real repair command', () => {
    const config = getBattleConfig('B11'); let state = oneActorBeside('B11', config.repairSites!.find(site => site.id === 'A')!.pos);
    expect(marker(state, 'repair:A').label).toBe('北補助弁 A\n未復旧 / 要W1');
    state.records = ['W1']; const rescued = config.records.find(record => record.id === 'W1')!;
    state.cells.find(cell => cell.x === rescued.x && cell.y === rescued.y)!.blocked = false;
    state = commit(state, { type: 'start', unitId: 'ally-lise' }); state = commit(state, { type: 'repair', siteId: 'A' });
    expect(marker(state, 'repair:A').label).toBe('北補助弁 A\nR2復旧予約 / 要W1');
    expect(marker(state, 'repair:B').label).toBe('南補助弁 B\n未復旧 / 要W2');
    state = nextRound(state); expect(marker(state, 'repair:A').label).toBe('北補助弁 A\n復旧済み / 要W1');
    expect(marker(state, 'repair:B').label).toBe('南補助弁 B\n未復旧 / 要W2');
  });
  it('identifies the living fighter occupying each final console, without treating HP0 or escort as occupancy', () => {
    const state = battle('B12'), point = getBattleConfig('B12').controlPoints![0].pos;
    expect(marker(state, 'control:A').label).toContain('空き / 共有保持0/2R');
    const lise = state.units.find(unit => unit.id === 'ally-lise')!; lise.pos = { ...point }; state.finalControl!.heldRounds = 1;
    expect(marker(state, 'control:A').label).toBe(`北分散操作台 A (${point.x},${point.y})\nリセ 占有中 / 共有保持1/2R`);
    lise.hp = 0; expect(marker(state, 'control:A').label).toContain('空き / 共有保持1/2R');
  });
});
