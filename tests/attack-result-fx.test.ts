import { describe, expect, it } from 'vitest';
import { AttackResultFx, ATTACK_RESULT_MS, attackWeaponLines, attackWoundLines } from '../src/view/attackResultFx';
import { committedAttackFixture } from './helpers/committedAttackFixture';

function fixture(hit = true, attackDuration = 220, lethal = false) {
  const { after: state, plan, target, targetBefore } = committedAttackFixture({ hit, attackDuration, lethal });
  return { state, plan, target, targetBefore };
}

describe('committed attack result clock independent of the presentation gate', () => {
  it('creates a fresh deterministic seeded fixture for every invocation', () => {
    const first = committedAttackFixture({ hit: false }), original = JSON.stringify(first.after);
    first.before.combatRandom!.draws = 999;
    first.before.units[0].hp = 0;
    const second = committedAttackFixture({ hit: false });
    expect(JSON.stringify(second.after)).toBe(original);
    expect(second.before.combatRandom!.draws).toBe(0);
    expect(second.after.combatRandom!.draws).toBe(1);
    expect(second.after.lastAttack).toMatchObject({ hit: false, damage: 0, sequence: 1 });
    expect(second.before.combatRandom).not.toBe(first.before.combatRandom);
  });
  it.each([220, 400])('keeps a %sms attack result for800ms from impact and changes displayed HP at that same instant', duration => {
    const { state, plan, target, targetBefore } = fixture(true, duration), snapshot = JSON.stringify(state), fx = new AttackResultFx();
    fx.begin(plan, 1000);
    const impact = 1000 + duration / 2;
    expect(fx.at(impact - 1)?.visible).toBe(false);
    expect(fx.hp(target.id, target.hp, impact - 1)).toBe(targetBefore.hp);
    expect(fx.at(impact)).toMatchObject({ visible: true, hit: true, damage: plan.attack!.resolution!.damage, endsAt: impact + ATTACK_RESULT_MS });
    expect(fx.hp(target.id, target.hp, impact)).toBe(target.hp);
    expect(fx.hp('unrelated-unit', 17, impact - 1)).toBe(17);
    expect(fx.at(1000 + duration)?.visible).toBe(true);
    expect(fx.at(impact + 799)?.visible).toBe(true);
    expect(fx.at(impact + 800)).toBeUndefined();
    expect(JSON.stringify(state)).toBe(snapshot);
  });
  it('uses a committed miss without damage, a wound or a second roll', () => {
    const { state, plan, target, targetBefore } = fixture(false), snapshot = JSON.stringify({ state, plan }), fx = new AttackResultFx();
    fx.begin(plan, 0);
    for (const time of [0, 110, 220, 500, 909]) {
      expect(fx.hp(target.id, target.hp, time)).toBe(targetBefore.hp);
      expect(fx.at(time)).toMatchObject({ hit: false, damage: 0 });
    }
    expect(JSON.stringify({ state, plan })).toBe(snapshot);
  });
  it('does not freeze subsequent healing to the old post-hit HP', () => {
    const { plan, target } = fixture(), fx = new AttackResultFx(); fx.begin(plan, 0);
    target.hp += 2;
    expect(fx.hp(target.id, target.hp, 200)).toBe(target.hp);
  });
  it('retains a downed visual target only until expiry and never retains a healed or missed target', () => {
    const { state, plan, target } = fixture(true, 220, true), fx = new AttackResultFx(); expect(target.hp).toBe(0); fx.begin(plan, 0);
    expect(fx.retainedTarget(state.units, 800)?.id).toBe(target.id);
    target.hp = 1; expect(fx.retainedTarget(state.units, 801)).toBeUndefined();
    target.hp = 0; expect(fx.retainedTarget(state.units, 910)).toBeUndefined();
    plan.attack!.resolution!.hit = false; fx.begin(plan, 1000);
    expect(fx.retainedTarget(state.units, 1200)).toBeUndefined();
  });
  it('replaces old feedback at the next attack and clears it without any delayed callback', () => {
    const { plan } = fixture(), fx = new AttackResultFx(); fx.begin(plan, 0); expect(fx.at(200)?.visible).toBe(true);
    fx.begin({ ...plan, attack: { ...plan.attack!, targetId: 'other-target', targetBefore: { ...plan.attack!.targetBefore, id: 'other-target' }, resolution: { ...plan.attack!.resolution!, targetId: 'other-target', sequence: 2 } } }, 250);
    expect(fx.at(250)).toMatchObject({ visible: false, attack: { targetId: 'other-target' } });
    fx.clear(); expect(fx.at(100000)).toBeUndefined(); expect(fx.present).toBe(false);
  });
  it('rejects a mismatched resolution rather than assigning its damage to another target', () => {
    const { plan } = fixture(), fx = new AttackResultFx(); plan.attack!.resolution!.targetId = 'wrong'; fx.begin(plan, 0); expect(fx.present).toBe(false);
  });
});

describe('deterministic added weapon and wound geometry', () => {
  it('distinguishes a sword/slash from a moving arrow and does not alter any input point', () => {
    const from = { x: 20, y: 30 }, to = { x: 100, y: 50 }, snapshot = JSON.stringify({ from, to });
    const melee = attackWeaponLines('melee', .5, from, to, 1, true);
    expect(melee.some(line => line.kind === 'sword')).toBe(true); expect(melee.some(line => line.kind === 'slash')).toBe(true);
    const early = attackWeaponLines('bow', .1, from, to, 1, true), later = attackWeaponLines('bow', .4, from, to, 1, true);
    expect(early.every(line => line.kind === 'arrow')).toBe(true); expect(early[0].to.x).toBeLessThan(later[0].to.x);
    expect(attackWeaponLines('melee', null, from, to, 1, true)).toEqual([]);
    expect(attackWeaponLines('bow', 1, from, to, 1, true)).toEqual([]);
    expect(JSON.stringify({ from, to })).toBe(snapshot);
  });
  it('keeps the short red wound localized to the supplied target point', () => {
    const lines = attackWoundLines({ x: 100, y: 200 }, 1);
    expect(lines).toHaveLength(3);
    expect(lines.every(line => line.kind === 'wound' && line.color === 0xdc3341)).toBe(true);
    for (const line of lines) for (const p of [line.from, line.to]) { expect(Math.abs(p.x - 100)).toBeLessThan(20); expect(Math.abs(p.y - 200)).toBeLessThan(20); }
  });
});
