import landscape from '../src/landscapes/b09.json';
import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, resetCampaign, selectBattle, writeCampaign, type Campaign, type StorageLike } from '../src/campaign';
import { createInitialState, escortAdvancePreview, getCell, reduce } from '../src/domain/engine';
import { getBattleConfig } from '../src/domain/battles';
import { runEnemyActivation } from '../src/domain/ai';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';
import { buildSevenBattleCheckpoint } from '../src/qa/checkpoint';
import type { BattleId, BattleState, Command, Pos } from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/b02-route.json';
import b03 from './fixtures/b03-route.json';
import b04 from './fixtures/b04-route.json';
import b05 from './fixtures/b05-route.json';
import b06 from './fixtures/b06-route.json';
import b07 from './fixtures/b07-route.json';
import b08 from './fixtures/b08-route.json';
import b09 from './fixtures/b09-route.json';

const route: Pos[] = landscape.escortRoute;
const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
const distance = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
// Independent predicates use the observed units and map, not the engine preview.
function progressCondition(state: BattleState, index: number, pos: Pos) {
  const group = state.units.find(u => u.id === 'escort-delegation')!;
  if (group.hp <= 0) return { next: null, permitted: false, reason: '安全を維持できません' };
  const next = route[index + 1] ?? null;
  if (!next) return { next, permitted: false, reason: '退出口に到着' };
  if (!state.units.some(u => u.team === 'player' && u.kind !== 'escort' && u.hp > 0 && distance(u.pos, pos) === 1))
    return { next, permitted: false, reason: '味方戦闘員の隣接が必要' };
  if (state.units.some(u => u.team === 'enemy' && u.hp > 0 && distance(u.pos, pos) === 1))
    return { next, permitted: false, reason: '隣接する敵を排除' };
  const from = getCell(state, pos), to = getCell(state, next);
  if (!from || !to || to.blocked || Math.abs(from.height - to.height) > 1)
    return { next, permitted: false, reason: '通行不能' };
  // The escort itself has already moved in an observed post-transition state.
  if (state.units.some(u => u.id !== group.id && u.hp > 0 && same(u.pos, next)))
    return { next, permitted: false, reason: '占有' };
  return { next, permitted: true, reason: '次ラウンド開始に1セル前進' };
}
function auditEscort(before: BattleState, after: BattleState) {
  const e = after.escort!, group = after.units.find(u => u.id === 'escort-delegation')!;
  expect(e.route).toEqual(route); expect(e.unitId).toBe('escort-delegation');
  expect(e.index).toBeGreaterThanOrEqual(0); expect(e.index).toBeLessThanOrEqual(18);
  expect(group.pos).toEqual(route[e.index]);
  const preview = escortAdvancePreview(after), expected = progressCondition(after, e.index, group.pos);
  expect(preview.next).toEqual(expected.next); expect(preview.canAdvance).toBe(expected.permitted);
  expect(preview.reason).toContain(expected.reason);
  const advance = e.index - before.escort!.index;
  if (after.round === before.round) expect(advance).toBe(0);
  else {
    expect(after.round).toBe(before.round + 1);
    const previousPos = route[before.escort!.index];
    const atBoundary = progressCondition(after, before.escort!.index, previousPos);
    expect(advance).toBe(atBoundary.permitted ? 1 : 0);
    expect(after.log.some(line => line.includes(advance ? '一行が1セル前進' : '一行停止:'))).toBe(true);
  }
  expect(after.round).toBeLessThanOrEqual(22);
  if (group.hp <= 0 || after.units.find(u => u.id === 'ally-lise')!.hp <= 0) expect(after.phase).toBe('lost');
  if (after.phase === 'won') {
    expect(e.index).toBe(18); expect(group.pos).toEqual(getBattleConfig('B09').exit);
    expect(group.hp).toBeGreaterThan(0); expect(after.units.find(u => u.id === 'ally-lise')!.hp).toBeGreaterThan(0);
    expect(after.records.slice().sort()).toEqual(['H', 'J']); expect(after.round).toBeGreaterThanOrEqual(19);
  } else expect(after.records).toEqual([]);
}
function play(id: BattleId, commands: Command[]): BattleState {
  let state = createInitialState(id);
  const observe = (next: BattleState) => { if (id === 'B09') auditEscort(state, next); state = next; };
  for (const command of commands) {
    expect(state.phase).toBe('playing'); expect(state.turn).toBe('player');
    const result = reduce(state, command);
    expect(result.error, `${id}: ${JSON.stringify(command)}`).toBeUndefined(); observe(result.state);
    let responses = 0;
    while (state.phase === 'playing' && state.turn === 'enemy') {
      expect(++responses).toBeLessThanOrEqual(3); observe(runEnemyActivation(state));
    }
  }
  return state;
}
function eightBattleCampaign(): Campaign {
  let campaign = createCampaign();
  for (const [id, commands] of [
    ['B01', b01.gate.commands], ['B02', b02.commands], ['B03', b03.commands], ['B04', b04.commands],
    ['B05', b05.optional.commands], ['B06', b06.victory.commands], ['B07', b07.victory.commands], ['B08', b08.victory.commands],
  ] as [BattleId, Command[]][]) {
    expect(campaign.unlocked).toContain(id);
    const won = play(id, commands); expect(won.phase).toBe('won');
    campaign = completeBattle(selectBattle(campaign, id), won);
  }
  return campaign;
}
function memory(initial: [string, string][] = []) {
  const values = new Map(initial);
  const storage: StorageLike = {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => { values.set(key, value); }),
    removeItem: vi.fn(key => { values.delete(key); }),
  };
  return { values, storage };
}
function expectFreshB09(state: BattleState) {
  expect(state.phase).toBe('playing'); expect(state.round).toBe(1); expect(state.records).toEqual([]);
  expect(state.escort).toEqual({ route, index: 0, unitId: 'escort-delegation' });
  expect(state.units.filter(u => u.team === 'player').map(u => u.id).sort())
    .toEqual(['ally-garan', 'ally-lise', 'ally-neia', 'ally-sena', 'escort-delegation']);
  expect(state.units.every(u => u.hp === u.maxHp && !u.acted)).toBe(true);
  expect(state.units.find(u => u.id === 'ally-sena')!.healCharges).toBe(2);
  expect(state.units.find(u => u.id === 'escort-delegation')!.pos).toEqual(route[0]);
  expect(state.cells).toEqual(landscape.cells);expect(state.cells.some(c=>c.shallow)).toBe(false);
  expect(state.capture).toBeUndefined(); expect(state.sluices).toBeUndefined();
}

// Actual eight-battle AI replays can exceed the default 5 seconds under suite contention.
describe('B09 independent campaign and QA integration', { timeout: 30_000 }, () => {
  it('earns eight victories, reads an old v1 save without writes, then wins B09 and restores sixteen evidence', () => {
    const eight = eightBattleCampaign();
    expect(eight.completed).toHaveLength(8); expect(eight.evidence).toHaveLength(14);
    // Compatibility serialization only: do not alter runtime state to unlock or win.
    const oldRaw = JSON.stringify({ ...eight, unlocked: eight.unlocked.filter(id => id !== 'B09') });
    const { storage, values } = memory([[CAMPAIGN_KEY, oldRaw]]);
    const loaded = readCampaign(storage);
    expect(loaded.writable).toBe(true); expect(loaded.warning).toBeNull(); expect(loaded.campaign.unlocked).toContain('B09');
    expect(values.get(CAMPAIGN_KEY)).toBe(oldRaw);
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
    const won = play('B09', b09.victory.commands as Command[]);
    expect(won.phase).toBe('won'); expect(won.round).toBe(b09.victory.round);
    expect(writeCampaign(storage, completeBattle(selectBattle(loaded.campaign, 'B09'), won)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toEqual(['B01','B02','B03','B04','B05','B06','B07','B08','B09']);
    expect(restored.currentBattle).toBe('B09'); expect(restored.evidence).toHaveLength(16);
    expect(restored.evidence).toEqual(expect.arrayContaining(['B05:K','B06:W','B07:V1','B07:V2','B08:P','B08:C','B09:J','B09:H']));
    expectFreshB09(createInitialState(restored.currentBattle)); expect(values.size).toBe(1);
  });
  it('does not advance on normal defeat and retries with full escort, healing charges and original chapter rosters', () => {
    const campaign = selectBattle(eightBattleCampaign(), 'B09');
    const lost = play('B09', b09.defeat.commands as Command[]);
    expect(lost.phase).toBe('lost'); expect(lost.round).toBe(b09.defeat.round);
    expect(completeBattle(campaign, lost)).toEqual(campaign);
    const { storage } = memory(); expect(writeCampaign(storage, campaign).ok).toBe(true);
    expect(writeCampaign(storage, completeBattle(campaign, lost)).ok).toBe(true);
    const restored = readCampaign(storage).campaign;
    expect(restored.completed).toHaveLength(8); expect(restored.evidence).toHaveLength(14);
    expectFreshB09(createInitialState(restored.currentBattle));
    expect(createInitialState('B08').units.filter(u => u.team === 'player').map(u => u.id).sort())
      .toEqual(['ally-garan','ally-iva','ally-lise','ally-neia']);
    expect(createInitialState('B07').units.filter(u => u.team === 'player').map(u => u.id).sort())
      .toEqual(['ally-garan','ally-lise','ally-neia','ally-sena']);
    expect(createInitialState('B06').units.filter(u => u.team === 'player').map(u => u.id).sort())
      .toEqual(['ally-garan','ally-iva','ally-lise','ally-sena','escort-toma']);
  });
  it('earns B08 and B09 from the seven-battle checkpoint without any access to ordinary or older QA keys', () => {
    const protectedEntries: [string, string][] = [
      [CAMPAIGN_KEY, '{ordinary-save-byte-preserved'],
      ...['b06','b07','b08'].map(id => [qaStorageKey(`${id}-chrome-20261018-a`), `{existing-${id}-qa`] as [string,string]),
    ];
    const { storage, values } = memory(protectedEntries);
    const session = 'b09-independent-qa-a', store = createQaStorage(storage, session);
    const checkpoint = buildSevenBattleCheckpoint();
    expect(checkpoint.currentBattle).toBe('B08'); expect(checkpoint.completed).toHaveLength(7);
    expect(checkpoint.evidence).toHaveLength(12); expect(checkpoint.unlocked).toContain('B08');
    expect(checkpoint.completed).not.toContain('B08'); expect(checkpoint.unlocked).not.toContain('B09');
    expect(writeCampaign(store, checkpoint).ok).toBe(true);
    for (const [id, commands] of [['B08', b08.victory.commands], ['B09', b09.victory.commands]] as [BattleId, Command[]][]) {
      const campaign = selectBattle(readCampaign(store).campaign, id); expect(campaign.currentBattle).toBe(id);
      const won = play(id, commands); expect(won.phase).toBe('won');
      expect(writeCampaign(store, completeBattle(campaign, won)).ok).toBe(true);
    }
    const restored = readCampaign(createQaStorage(storage, session)).campaign;
    expect(restored.completed).toHaveLength(9); expect(restored.evidence).toHaveLength(16);
    expectFreshB09(createInitialState(restored.currentBattle));
    expect(resetCampaign(store).ok).toBe(true); expect(values.has(qaStorageKey(session))).toBe(false);
    for (const [key,value] of protectedEntries) expect(values.get(key)).toBe(value);
    for (const mock of [storage.getItem, storage.setItem, storage.removeItem])
      for (const call of vi.mocked(mock).mock.calls) expect(call[0]).toBe(qaStorageKey(session));
  });
});
