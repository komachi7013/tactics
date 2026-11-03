import { describe, expect, it } from 'vitest';
import { createInitialState, getCell, getUnit, reduce } from '../src/domain/engine';
import { createPartyBattle } from '../src/party';
import { createJobs } from '../src/jobs';
import { defaultParty } from '../src/progression';
import { selectionCommandState } from '../src/view/selectionCommands';
import { nearbyInteraction } from '../src/view/nearbyInteraction';

function recordState() {
  const state = createInitialState('B01');
  getUnit(state, 'ally-lise')!.pos = { x: 2, y: 3 };
  return selectionCommandState(state, 'ally-lise');
}
describe('nearby map interactions in the main command area', () => {
  it('offers a nearby record without collecting it or consuming an action', () => {
    const state = recordState(), before = JSON.stringify(state);
    expect(nearbyInteraction(state, { x: 2, y: 2 }, { type: 'collect', recordId: 'A' })).toEqual({ visible: true, enabled: true, reason: '' });
    expect(JSON.stringify(state)).toBe(before);
    expect(state.records).not.toContain('A'); expect(state.activation.acted).toBe(false);
  });
  it('hides unrelated distant sites, including when no actor is selected', () => {
    expect(nearbyInteraction(recordState(), { x: 7, y: 5 }, { type: 'collect', recordId: 'B' }).visible).toBe(false);
    expect(nearbyInteraction(createInitialState('B01'), { x: 0, y: 5 }, { type: 'collect', recordId: 'A' }).visible).toBe(false);
  });
  it('keeps a nearby unavailable action visible with the exact rule reason', () => {
    const state = recordState(); state.activation.acted = true;
    const command = { type: 'collect' as const, recordId: 'A' };
    expect(nearbyInteraction(state, { x: 2, y: 2 }, command)).toEqual({ visible: true, enabled: false, reason: reduce(state, command).error });
  });
  it('rechecks height and an already acquired record', () => {
    const high = recordState(); getCell(high, { x: 2, y: 2 })!.height = getCell(high, getUnit(high, 'ally-lise')!.pos)!.height + 2;
    expect(nearbyInteraction(high, { x: 2, y: 2 }, { type: 'collect', recordId: 'A' }).enabled).toBe(false);
    const collected = recordState(); collected.records.push('A');
    expect(nearbyInteraction(collected, { x: 2, y: 2 }, { type: 'collect', recordId: 'A' }).enabled).toBe(false);
  });
  it('offers opening a box on its cell and preserves pending and persistent ownership', () => {
    let state = createPartyBattle('B01', defaultParty('B01'), createJobs(), 1);
    const chest = state.equipmentChests![0]; getUnit(state, 'ally-lise')!.pos = { ...chest.pos };
    state = selectionCommandState(state, 'ally-lise'); const before = JSON.stringify(state);
    expect(nearbyInteraction(state, chest.pos, { type: 'loot', eventId: chest.eventId }).enabled).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    state.pendingEquipment = [chest.eventId];
    expect(nearbyInteraction(state, chest.pos, { type: 'loot', eventId: chest.eventId }).enabled).toBe(false);
  });
  it('offers a nearby gate, then shows its pending restriction without changing the reservation', () => {
    const state = recordState(), command = { type: 'gate' as const };
    expect(nearbyInteraction(state, { x: 2, y: 4 }, command).enabled).toBe(true);
    const next = reduce(state, command).state, before = JSON.stringify(next);
    expect(nearbyInteraction(next, { x: 2, y: 4 }, command).enabled).toBe(false);
    expect(JSON.stringify(next)).toBe(before);
  });
  it('gates transient input without hiding the nearby site or changing gameplay', () => {
    const state = recordState(), before = JSON.stringify(state);
    const result = nearbyInteraction(state, { x: 2, y: 2 }, { type: 'collect', recordId: 'A' }, false);
    expect(result.visible).toBe(true); expect(result.enabled).toBe(false); expect(result.reason).not.toBe('');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('does not expose enemy or escort activations as manual interaction commands', () => {
    const state = createInitialState('B01'); state.activeId = 'enemy-melee-01';
    expect(nearbyInteraction(state, getUnit(state, state.activeId)!.pos, { type: 'gate' }).visible).toBe(false);
  });
});
