import type { BattleId } from './types';

export const COMBAT_RANDOM_VERSION = 1 as const;
// A fixed first-version root keeps a new/legacy campaign replayable even when
// storage is unavailable. Saving later must persist this root, never reroll it.
export const DEFAULT_COMBAT_ROOT_SEED = 0x6d696f31;
export interface CombatRandomConfig { version: 1; rootSeed: number }
export interface CombatRandomState { version: 1; state: number; draws: number }

const uint32 = (value: unknown): value is number => Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 0xffffffff;
export function createCombatRandomConfig(): CombatRandomConfig {
  return { version: COMBAT_RANDOM_VERSION, rootSeed: DEFAULT_COMBAT_ROOT_SEED };
}
export function validCombatRandomConfig(value: unknown): value is CombatRandomConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as CombatRandomConfig;
  return Object.keys(candidate).length === 2 && Object.keys(candidate).every(key => key === 'version' || key === 'rootSeed')
    && candidate.version === COMBAT_RANDOM_VERSION && uint32(candidate.rootSeed);
}

/** Stable across reloads, retries, browser engines and mutable preparation data. */
export function deriveBattleSeed(rootSeed: number, battleId: BattleId): number {
  if (!uint32(rootSeed) || !/^B(0[1-9]|1[0-2])$/.test(battleId)) throw new Error('戦闘乱数の初期条件が不正です。');
  let hash = rootSeed ^ 0x811c9dc5;
  for (const character of `mio-combat-v1:${battleId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return hash >>> 0;
}
export function createBattleRandom(config: CombatRandomConfig, battleId: BattleId): CombatRandomState {
  if (!validCombatRandomConfig(config)) throw new Error('戦闘乱数の版またはseedが不正です。');
  return { version: COMBAT_RANDOM_VERSION, state: deriveBattleSeed(config.rootSeed, battleId), draws: 0 };
}

/** Pure Mulberry32 step. Only a committed attack may call this after integration.
 * roll is in [0,1); compare with chance/100. No preview or renderer owns RNG.
 */
export function nextCombatRoll(current: CombatRandomState): { random: CombatRandomState; roll: number } {
  if (!current || current.version !== COMBAT_RANDOM_VERSION || !uint32(current.state)
    || !Number.isSafeInteger(current.draws) || current.draws < 0 || current.draws >= Number.MAX_SAFE_INTEGER) {
    throw new Error('戦闘乱数の状態が不正です。');
  }
  const state = (current.state + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state ^ state >>> 15, state | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  const roll = ((value ^ value >>> 14) >>> 0) / 0x100000000;
  return { random: { version: COMBAT_RANDOM_VERSION, state, draws: current.draws + 1 }, roll };
}
