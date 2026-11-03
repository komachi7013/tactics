import type { Unit } from '../domain/types';
import type { PresentationPlan } from './presentation';

export const ATTACK_RESULT_MS = 800;
export const ATTACK_IMPACT_FRACTION = .5;
type Attack = NonNullable<PresentationPlan['attack']>;
export interface AttackResultCue {
  attack: Attack;
  startsAt: number;
  endsAt: number;
  visible: boolean;
  hit: boolean;
  damage: number;
}

/** View-only clock. No callbacks, rule commands, HP writes or random rolls. */
export class AttackResultFx {
  private pending?: Omit<AttackResultCue, 'visible'>;
  get present(): boolean { return !!this.pending; }
  begin(plan: PresentationPlan, now: number): void {
    if (!plan.attack) return;
    this.clear();
    const result = plan.attack.resolution;
    if (!result || result.actorId !== plan.attack.actorId || result.targetId !== plan.attack.targetId) return;
    const startsAt = now + plan.moveDuration + plan.attackDuration * ATTACK_IMPACT_FRACTION;
    this.pending = {
      attack: structuredClone(plan.attack), startsAt, endsAt: startsAt + ATTACK_RESULT_MS,
      hit: result.hit, damage: result.hit ? result.damage : 0,
    };
  }
  at(now: number): AttackResultCue | undefined {
    if (!this.pending) return;
    if (now >= this.pending.endsAt) { this.clear(); return; }
    return { ...this.pending, visible: now >= this.pending.startsAt };
  }
  hp(unitId: string, committedHp: number, now: number): number {
    const cue = this.at(now);
    return cue?.attack.targetId === unitId && !cue.visible ? cue.attack.targetBefore.hp : committedHp;
  }
  retainedTarget(units: readonly Unit[], now: number): Unit | undefined {
    const cue = this.at(now);
    return cue?.hit && units.some(unit => unit.id === cue.attack.targetId && unit.hp <= 0)
      ? cue.attack.targetBefore : undefined;
  }
  clear(): void { this.pending = undefined; }
}

export interface FxPoint { x: number; y: number }
export interface FxLine { from: FxPoint; to: FxPoint; color: number; width: number; alpha: number; kind: 'sword' | 'slash' | 'arrow' | 'wound' }
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Screen-space additions only: never changes the character texture or anatomy. */
export function attackWeaponLines(weapon: 'melee' | 'bow', progress: number | null, from: FxPoint, to: FxPoint, scale: number, hit: boolean): FxLine[] {
  if (progress === null || progress < 0 || progress >= 1) return [];
  const s = scale, dx = to.x - from.x, dy = to.y - from.y, angle = Math.atan2(dy, dx);
  const line = (a: FxPoint, b: FxPoint, color: number, width: number, kind: FxLine['kind'], alpha = 1): FxLine => ({ from: a, to: b, color, width: width * s, alpha, kind });
  if (weapon === 'bow') {
    if (progress >= .58) return [];
    const aim = { x: to.x + (hit ? 0 : 10 * s), y: to.y - (hit ? 0 : 15 * s) };
    const q = clamp(progress / ATTACK_IMPACT_FRACTION), tip = { x: from.x + (aim.x - from.x) * q, y: from.y + (aim.y - from.y) * q };
    const a = Math.atan2(aim.y - from.y, aim.x - from.x), ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const back = (distance: number, side = 0) => ({ x: tip.x - ux * distance * s + nx * side * s, y: tip.y - uy * distance * s + ny * side * s });
    return [line(back(20), tip, 0x263334, 3, 'arrow'), line(back(19), tip, 0xf5d7a0, 1.6, 'arrow'),
      line(back(6, 4), tip, 0xf2f6ec, 2, 'arrow'), line(back(6, -4), tip, 0xf2f6ec, 2, 'arrow'),
      line(back(18, 4), back(13), 0xd8b277, 2, 'arrow'), line(back(18, -4), back(13), 0xd8b277, 2, 'arrow')];
  }
  const sweep = angle - 1.1 + progress * 2.2, ux = Math.cos(sweep), uy = Math.sin(sweep), nx = -uy, ny = ux;
  const hand = { x: from.x + Math.cos(angle) * 5 * s, y: from.y + Math.sin(angle) * 5 * s };
  const blade = { x: hand.x + ux * 29 * s, y: hand.y + uy * 29 * s };
  const lines = [line(hand, blade, 0x243334, 5, 'sword'), line(hand, blade, 0xf3f5df, 2.6, 'sword'),
    line({ x: hand.x - nx * 6 * s, y: hand.y - ny * 6 * s }, { x: hand.x + nx * 6 * s, y: hand.y + ny * 6 * s }, 0xd8ac58, 3, 'sword')];
  if (progress >= .35 && progress < .75) lines.push(line({ x: to.x - 12 * s, y: to.y + 11 * s }, { x: to.x + 13 * s, y: to.y - 12 * s }, 0xffe9af, 3.5, 'slash', 1 - Math.abs(progress - .5) * 3));
  return lines;
}

export function attackWoundLines(point: FxPoint, scale: number): FxLine[] {
  return [-4, 0, 4].map(offset => ({
    from: { x: point.x + (-8 + offset) * scale, y: point.y + (8 + offset) * scale },
    to: { x: point.x + (5 + offset) * scale, y: point.y + (-7 + offset) * scale },
    color: 0xdc3341, width: 2.4 * scale, alpha: .95, kind: 'wound' as const,
  }));
}
