import { attackPreview, createInitialState, getUnit, reduce } from '../../src/domain/engine';
import { nextCombatRoll } from '../../src/domain/combatRandom';
import type { Command } from '../../src/domain/types';
import { createPresentation } from '../../src/view/presentation';

/** Declared flat-board fixture, not a campaign replay. Results come from the real reducer. */
export function committedAttackFixture({ hit = true, lethal = false, weapon = 'melee', attackDuration = 220 }: {
  hit?: boolean; lethal?: boolean; weapon?: 'melee' | 'bow'; attackDuration?: number;
} = {}) {
  let before = createInitialState('B01');
  before.cells.forEach(cell => { cell.height = 0; cell.blocked = false; cell.shallow = false; });
  before.units = before.units.filter(unit => unit.id === 'ally-lise' || unit.id === 'enemy-melee-01');
  const actor = getUnit(before, 'ally-lise')!, originalTarget = getUnit(before, 'enemy-melee-01')!;
  actor.pos = { x: 4, y: 5 }; actor.weapon = weapon;
  originalTarget.pos = { x: weapon === 'melee' ? 5 : 6, y: 5 }; originalTarget.facing = 'W';
  if (lethal) originalTarget.hp = 1;
  // Bare createInitialState intentionally supports legacy no-RNG states. Never
  // assume it supplied combatRandom, or reuse a seed object from another test.
  before.combatRandom = { version: 1, state: 0, draws: 0 };
  const begun = reduce(before, { type: 'start', unitId: actor.id });
  if (begun.error) throw new Error(`Fixture start rejected: ${begun.error}`);
  before = begun.state;
  const preview = attackPreview(before, actor.id, originalTarget.id);
  if (!preview.legal) throw new Error(`Fixture attack rejected: ${preview.reason}`);
  let seed = 0;
  while ((nextCombatRoll({ version: 1, state: seed, draws: 0 }).roll < preview.hitChance / 100) !== hit) {
    if (++seed > 10000) throw new Error('No deterministic seed for requested hit/miss');
  }
  before.combatRandom = { version: 1, state: seed, draws: 0 };
  const command: Command = { type: 'attack', targetId: originalTarget.id };
  const snapshot = JSON.stringify(before), result = reduce(before, command);
  if (result.error) throw new Error(`Fixture commit rejected: ${result.error}`);
  const after = result.state, resolution = after.lastAttack;
  if (!resolution || resolution.hit !== hit || resolution.sequence !== 1 || after.combatRandom?.draws !== 1)
    throw new Error('Fixture did not commit exactly the requested seeded result');
  const target = getUnit(after, originalTarget.id)!, targetBefore = getUnit(before, originalTarget.id)!;
  if (resolution.damage !== targetBefore.hp - target.hp || (!hit && target.hp !== targetBefore.hp))
    throw new Error('Fixture HP loss does not match the authoritative resolution');
  if (JSON.stringify(before) !== snapshot) throw new Error('Fixture reducer mutated its input');
  const raw = createPresentation(before, after, [command]);
  if (!raw?.attack?.resolution) throw new Error('Fixture has no committed presentation result');
  const plan = { ...raw, attackDuration, durationMs: raw.moveDuration + attackDuration + (raw.afterMoveDuration ?? 0) };
  return { before, after, command, plan, target, targetBefore: structuredClone(targetBefore) };
}
