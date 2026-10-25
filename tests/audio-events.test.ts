import { describe, expect, it } from 'vitest';
import { createInitialState, reduce } from '../src/domain/engine';
import { soundForTransition } from '../src/audio-events';

describe('audio only observes committed battle transitions', () => {
  it('does not emit for unchanged/illegal actions; committed movement emits once and undo is UI only', () => {
    const initial = createInitialState('B12');
    const failed = reduce(initial, { type: 'move', to: { x: 4, y: 4 } });
    expect(failed.error).toBeTruthy();
    expect(soundForTransition(initial, failed.state)).toBeNull();
    const started = reduce(initial, { type: 'start', unitId: 'ally-garan' }).state;
    expect(soundForTransition(initial, started, { type: 'start', unitId: 'ally-garan' })).toBe('se-ui');
    const command = { type: 'move', to: { x: 8, y: 15 } } as const;
    const moved = reduce(started, command).state;
    expect(soundForTransition(started, moved, command)).toBe('se-move');
    expect(soundForTransition(moved, moved, command)).toBeNull();
    expect(soundForTransition(moved, reduce(moved, { type: 'undoMove' }).state, { type: 'undoMove' })).toBe('se-ui');
  });
  it('prioritizes final outcome over hits or records; does not repeat a completed outcome', () => {
    const state = createInitialState('B12');
    const won = structuredClone(state); won.phase = 'won'; won.records = ['U', 'V'];
    expect(soundForTransition(state, won)).toBe('se-victory');
    expect(soundForTransition(won, structuredClone(won))).toBeNull();
    const lost = structuredClone(state); lost.phase = 'lost'; lost.units[0].hp = 0;
    expect(soundForTransition(state, lost)).toBe('se-defeat');
  });
  it('uses HP changes for either side and nonlethal hits without inventing a death sound', () => {
    const state = createInitialState('B12');
    const hit = structuredClone(state); hit.units.find(u => u.id === 'enemy-vesk')!.hp = 0;
    hit.finalControl!.commanderSubdued = true;
    expect(soundForTransition(state, hit)).toBe('se-impact');
    const injured = structuredClone(state); injured.units[0].hp = 1;
    expect(soundForTransition(injured, state)).toBe('se-heal');
    const recorded = structuredClone(state); recorded.records.push('U');
    expect(soundForTransition(state, recorded)).toBe('se-record');
  });
  it('observes automatic gate/repair and escort movement without frame-based footsteps', () => {
    const state = createInitialState('B11');
    const repaired = structuredClone(state); repaired.repairs!.A.completed = true;
    expect(soundForTransition(state, repaired)).toBe('se-mechanism');
    const gate = createInitialState('B06'); const opened = structuredClone(gate); opened.gate.drained = true;
    expect(soundForTransition(gate, opened)).toBe('se-mechanism');
    const escorted = structuredClone(gate); escorted.units.find(u => u.kind === 'escort')!.pos.x++;
    expect(soundForTransition(gate, escorted)).toBe('se-move');
    expect(soundForTransition(gate, structuredClone(gate))).toBeNull();
  });
});
