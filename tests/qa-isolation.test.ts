import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_KEY, completeBattle, createCampaign, readCampaign, resetCampaign, selectBattle, writeCampaign, type StorageLike } from '../src/campaign';
import { createQaStorage, qaStorageKey, selectProgressStorage } from '../src/qa/storage';
import { buildFourBattleCheckpoint } from '../src/qa/checkpoint';
import { createInitialState, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleId, Command } from '../src/domain/types';
import b05 from './fixtures/b05-route.json';
import b06 from './fixtures/b06-route.json';

function memory() {
  const values = new Map([[CAMPAIGN_KEY, '{user-save-must-not-be-parsed-or-rewritten'], ['other-user-key', 'keep']]);
  const raw: StorageLike = { getItem: vi.fn(k => values.get(k) ?? null),
    setItem: vi.fn((k, v) => { values.set(k, v); }), removeItem: vi.fn(k => { values.delete(k); }) };
  return { values, raw };
}
describe('DEV QA campaign isolation', () => {
  it('replays official B01–B04 with normal AI and leaves B05 uncompleted / B06 locked', () => {
    const c = buildFourBattleCheckpoint();
    expect(c.completed).toEqual(['B01','B02','B03','B04']);
    expect(c.unlocked).toEqual(['B01','B02','B03','B04','B05']);
    expect(c.currentBattle).toBe('B05');
    expect(c.evidence).toEqual(['B01:A','B01:B','B02:O','B03:M','B04:C']);
  });
  it('creates, reloads and resets one QA session without touching ordinary or another QA save', () => {
    const { raw, values } = memory(), key = qaStorageKey('b06-chrome-test-a');
    const userBefore = values.get(CAMPAIGN_KEY);
    const other = createQaStorage(raw, 'b06-chrome-test-b');
    expect(writeCampaign(other, createCampaign()).ok).toBe(true);
    const otherBefore = values.get(qaStorageKey('b06-chrome-test-b'));
    const selected = selectProgressStorage(raw, '?qaSession=b06-chrome-test-a');
    expect(selected.session).toBe('b06-chrome-test-a');
    expect(readCampaign(selected.storage).campaign.completed).toEqual([]);
    const c = buildFourBattleCheckpoint();
    expect(writeCampaign(selected.storage, c).ok).toBe(true);
    expect(readCampaign(createQaStorage(raw, 'b06-chrome-test-a')).campaign).toEqual(c);
    expect(values.has(key)).toBe(true);
    expect(resetCampaign(selected.storage).ok).toBe(true); expect(values.has(key)).toBe(false);
    expect(values.get(CAMPAIGN_KEY)).toBe(userBefore); expect(values.get('other-user-key')).toBe('keep');
    expect(values.get(qaStorageKey('b06-chrome-test-b'))).toBe(otherBefore);
    for (const call of vi.mocked(raw.getItem).mock.calls) expect(call[0]).not.toBe(CAMPAIGN_KEY);
    for (const call of vi.mocked(raw.setItem).mock.calls) expect(call[0]).not.toBe(CAMPAIGN_KEY);
    for (const call of vi.mocked(raw.removeItem).mock.calls) expect(call[0]).not.toBe(CAMPAIGN_KEY);
  });
  it('rejects invalid/duplicate sessions and access outside the campaign adapter', () => {
    const { raw } = memory();
    for (const search of ['?qaSession=', '?qaSession=../../user', '?qaSession=a', '?qaSession=valid-name&qaSession=other-name']) {
      expect(() => selectProgressStorage(raw, search)).toThrow();
    }
    const store = createQaStorage(raw, 'b06-chrome-test-a');
    expect(() => store.getItem('other-user-key')).toThrow();
    expect(() => store.setItem('other-user-key', 'overwrite')).toThrow();
    expect(() => store.removeItem('other-user-key')).toThrow();
    expect(raw.getItem).not.toHaveBeenCalled(); expect(raw.setItem).not.toHaveBeenCalled(); expect(raw.removeItem).not.toHaveBeenCalled();
  });
  it('keeps ordinary storage selection unchanged when no QA session is requested', () => {
    const { raw } = memory(); expect(selectProgressStorage(raw, '?unrelated=value')).toEqual({ storage: raw, session: null });
    expect(raw.getItem).not.toHaveBeenCalled();
  });
  it('preserves unreadable data within a QA session rather than repairing or overwriting it', () => {
    const { raw, values } = memory(), key = qaStorageKey('b06-chrome-test-a'); values.set(key, '{unreadable-qa');
    const store = createQaStorage(raw, 'b06-chrome-test-a');
    expect(readCampaign(store).writable).toBe(false);
    expect(writeCampaign(store, createCampaign()).ok).toBe(false); expect(values.get(key)).toBe('{unreadable-qa');
    expect(raw.setItem).not.toHaveBeenCalled();
  });
  it('earns B05 K and B06 W through real commands and restores them only within the QA namespace', () => {
    const { raw, values } = memory(), original = values.get(CAMPAIGN_KEY);
    const store = createQaStorage(raw, 'b06-chrome-test-a');
    expect(writeCampaign(store, buildFourBattleCheckpoint()).ok).toBe(true);
    expect(readCampaign(store).campaign.unlocked).not.toContain('B06');
    for (const [id, commands] of [['B05', b05.optional.commands], ['B06', b06.victory.commands]] as [BattleId, Command[]][]) {
      let campaign = selectBattle(readCampaign(store).campaign, id);
      expect(campaign.currentBattle).toBe(id);
      let state = createInitialState(id);
      for (const command of commands) {
        expect(state.turn).toBe('player'); const result = reduce(state, command);
        expect(result.error).toBeUndefined(); state = result.state;
        let count = 0;
        while (state.phase === 'playing' && state.turn === 'enemy') {
          expect(++count).toBeLessThanOrEqual(3); state = runEnemyActivation(state);
        }
      }
      expect(state.phase).toBe('won'); campaign = completeBattle(campaign, state);
      expect(writeCampaign(store, campaign).ok).toBe(true);
    }
    const restored = readCampaign(createQaStorage(raw, 'b06-chrome-test-a')).campaign;
    expect(restored.completed).toEqual(['B01','B02','B03','B04','B05','B06']);
    expect(restored.evidence).toHaveLength(10); expect(restored.evidence).toEqual(expect.arrayContaining(['B05:K','B06:W']));
    expect(restored.currentBattle).toBe('B06'); expect(values.get(CAMPAIGN_KEY)).toBe(original);
    for (const call of vi.mocked(raw.setItem).mock.calls) expect(call[0]).toBe(qaStorageKey('b06-chrome-test-a'));
  });
});
