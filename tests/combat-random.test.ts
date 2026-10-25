import { describe, expect, it } from 'vitest';
import { createBattleRandom, createCombatRandomConfig, deriveBattleSeed, nextCombatRoll, validCombatRandomConfig } from '../src/domain/combatRandom';
import { BATTLE_IDS } from '../src/progression';

function sequence(battle = 'B01' as typeof BATTLE_IDS[number], count = 24) {
  let random = createBattleRandom(createCombatRandomConfig(), battle);
  return Array.from({ length: count }, () => {
    const next = nextCombatRoll(random); random = next.random; return next.roll;
  });
}
describe('versioned combat random series (not connected to combat yet)', () => {
  it('replays every battle with the same root and distinguishes battle series', () => {
    for (const battle of BATTLE_IDS) expect(sequence(battle)).toEqual(sequence(battle));
    expect(new Set(BATTLE_IDS.map(id => deriveBattleSeed(createCombatRandomConfig().rootSeed, id))).size).toBe(12);
    expect(sequence('B01')).not.toEqual(sequence('B02'));
  });
  it('has a fixed algorithm vector, returns a new value and never mutates input', () => {
    const input = Object.freeze({ version: 1 as const, state: 0, draws: 0 });
    expect(nextCombatRoll(input)).toEqual({ random: { version: 1, state: 1831565813, draws: 1 }, roll: 0.26642920868471265 });
    expect(input).toEqual({ version: 1, state: 0, draws: 0 });
    expect(nextCombatRoll(input)).toEqual(nextCombatRoll(input));
  });
  it('produces bounded rolls, advances exactly once per call, and survives serialized continuation', () => {
    let random = createBattleRandom(createCombatRandomConfig(), 'B12');
    for (let i = 0; i < 1024; i++) {
      const next = nextCombatRoll(random);
      expect(next.roll).toBeGreaterThanOrEqual(0); expect(next.roll).toBeLessThan(1);
      expect(next.random.draws).toBe(i + 1); random = next.random;
    }
    expect(nextCombatRoll(JSON.parse(JSON.stringify(random)))).toEqual(nextCombatRoll(random));
  });
  it('accepts uint32 endpoints including zero and rejects malformed roots or versions', () => {
    for (const rootSeed of [0, 0xffffffff]) expect(validCombatRandomConfig({ version: 1, rootSeed })).toBe(true);
    for (const value of [null, [], {}, { version: 1 }, { version: 2, rootSeed: 0 },
      ...[-1, 0x100000000, .5, NaN, Infinity, '7'].map(rootSeed => ({ version: 1, rootSeed })),
      { ...createCombatRandomConfig(), unknown: 1 }]) expect(validCombatRandomConfig(value)).toBe(false);
  });
  it('rejects invalid battle keys or state rather than resetting the stream', () => {
    expect(() => deriveBattleSeed(0, 'B00' as never)).toThrow();
    expect(() => deriveBattleSeed(-1, 'B01')).toThrow();
    for (const bad of [{ version: 2, state: 0, draws: 0 }, { version: 1, state: -1, draws: 0 },
      { version: 1, state: 0, draws: -1 }, { version: 1, state: 0, draws: Number.MAX_SAFE_INTEGER }]) {
      expect(() => nextCombatRoll(bad as never)).toThrow();
    }
  });
});
