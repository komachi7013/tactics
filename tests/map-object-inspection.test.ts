import { describe, expect, it } from 'vitest';
import { createPartyBattle } from '../src/party';
import { BATTLE_IDS, defaultParty } from '../src/progression';
import { getBattleConfig } from '../src/domain/battles';
import { mapObjectPlacements } from '../src/view/mapObjectAssets';
import { mapObjectCellStatus } from '../src/view/mapObjectInspection';

describe('map site inspection without an action', () => {
  it.each(BATTLE_IDS)('%s exposes every current object name and state through cell inspection without mutation', id => {
    const state = createPartyBattle(id, defaultParty(id)), before = structuredClone(state);
    for (const row of mapObjectPlacements(state)) {
      expect(mapObjectCellStatus(state, row.pos)).toContain(row.label.replace(/\n/g, ' ／ '));
    }
    expect(state).toEqual(before);
  });
  it('returns no site name for an ordinary floor cell', () => {
    const state = createPartyBattle('B01', defaultParty('B01'));
    expect(mapObjectCellStatus(state, { x: 0, y: 5 })).toBeNull();
  });
  it('names both objects if equipment and a record share a cell', () => {
    const state = createPartyBattle('B01', defaultParty('B01'));
    const record = getBattleConfig('B01').records[0];
    state.equipmentChests![0].pos = { x: record.x, y: record.y };
    const before = structuredClone(state), text = mapObjectCellStatus(state, record)!;
    expect(text).toContain('装備箱'); expect(text).toContain('水位記録A');
    expect(state).toEqual(before);
  });
  it('retains pending pickup and gate state without a permanent map label', () => {
    const state = createPartyBattle('B01', defaultParty('B01'));
    state.pendingEquipment = ['chest:B01']; state.gate.pendingRound = 2;
    const before = structuredClone(state);
    expect(mapObjectCellStatus(state, state.equipmentChests![0].pos)).toContain('仮回収済み');
    expect(mapObjectCellStatus(state, getBattleConfig('B01').gate!)).toContain('R2排水予約');
    expect(state).toEqual(before);
  });
  it.each(['B07', 'B11'] as const)('keeps %s rescue and gathering people inspectable', id => {
    const state = createPartyBattle(id, defaultParty(id));
    for (const record of getBattleConfig(id).records) {
      expect(mapObjectCellStatus(state, record)).toContain(record.name);
      state.records.push(record.id);
      expect(mapObjectCellStatus(state, record)).toContain(id === 'B11' ? '救出済み' : '案内済み');
    }
  });
});
