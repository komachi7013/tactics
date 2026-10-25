import { attackPreview, getUnit, reachable } from '../domain/engine';
import type { AttackBodyId } from './dedicatedAttack';
import type { AttackResolution, BattleState, Command, Pos, Unit } from '../domain/types';
export interface PresentationPlan {
  moves: { unitId: string; path: Pos[]; afterAttack?: boolean; durationMs?: number }[];
  attack?: { actorId: string; targetId: string; weapon: 'melee' | 'bow'; targetBefore: Unit; bodyId?: AttackBodyId; resolution?: AttackResolution };
  moveDuration: number;
  attackDuration: number;
  afterMoveDuration?: number;
  durationMs: number;
}
const same = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;
/** Read only the one newly committed roll. Persistent lastAttack is not an event queue. */
export function committedAttackResolution(before: BattleState, after: BattleState, actorId?: string, targetId?: string): AttackResolution | undefined {
  const result = after.lastAttack;
  if (before === after || before.battleId !== after.battleId || !before.combatRandom || !after.combatRandom || !result
    || result.sequence !== after.combatRandom.draws || result.sequence !== before.combatRandom.draws + 1
    || result.sequence === before.lastAttack?.sequence || (actorId !== undefined && result.actorId !== actorId)
    || (targetId !== undefined && result.targetId !== targetId)) return undefined;
  return result;
}
/** Builds disposable visual data; does not run commands or mutate the simulation. */
export function createPresentation(before: BattleState, after: BattleState, commands: readonly Command[]): PresentationPlan | null {
  if (before === after || before.battleId !== after.battleId) return null;
  const actorId = commands.find(c => c.type === 'start')?.unitId ?? before.activeId;
  const actor = actorId ? getUnit(before, actorId) : undefined;
  const move = commands.find(c => c.type === 'move');
  const moves: PresentationPlan['moves'] = [];
  for (const unit of before.units) {
    const next = getUnit(after, unit.id);
    if (!next || same(unit.pos, next.pos)) continue;
    let path: Pos[] | undefined;
    let afterAttack = false;
    if (unit.id === actorId && move?.type === 'move' && same(move.to, next.pos)) {
      const actual = reachable(before, unit.id).find(p => same(p, move.to));
      if (actual) path = [unit.pos, ...actual.path];
    } else if (unit.kind === 'escort' && before.escort && after.escort && after.escort.index > before.escort.index) {
      path = before.escort.route.slice(before.escort.index, after.escort.index + 1);
      const attackIndex = commands.findIndex(c => c.type === 'attack');
      afterAttack = attackIndex >= 0 && commands.slice(attackIndex + 1).some(c => c.type === 'end');
    } else if (unit.id === actorId && commands.some(c => c.type === 'undoMove')) {
      // Undo retraces the original route. Reverse traversal may exceed the unit's
      // movement allowance when returning into shallow water. Use the restored
      // actor's transient movement effects: a plank was consumed by the move
      // and exists again only in the undo result. This is disposable visual data.
      const original = { ...before, units: before.units.map(u => u.id === unit.id ? { ...next, pos: { ...next.pos } } : u) };
      const actual = reachable(original, unit.id).find(p => same(p, unit.pos));
      if (actual) path = [next.pos, ...actual.path].reverse();
    }
    if (path && path.length > 1 && same(path[0], unit.pos) && same(path[path.length - 1], next.pos)) {
      moves.push({ unitId: unit.id, path: path.map(p => ({ x: p.x, y: p.y })), ...(afterAttack ? { afterAttack: true } : {}) });
    }
  }
  // Round-start escort advancement happens after the final activation, never
  // concurrently with that actor's movement. Keep the simulation unchanged.
  if (moves.some(m => getUnit(before, m.unitId)?.kind !== 'escort')) {
    for (const m of moves) if (getUnit(before, m.unitId)?.kind === 'escort') m.afterAttack = true;
  }
  const command = commands.find(c => c.type === 'attack');
  let attack: PresentationPlan['attack'];
  if (actor && command?.type === 'attack') {
    const target = getUnit(before, command.targetId), movedActor = getUnit(after, actor.id);
    const attackState = { ...before, units: before.units.map(u => u.id === actor.id && movedActor ? { ...u, pos: movedActor.pos } : u) };
    const resolution = committedAttackResolution(before, after, actor.id, command.targetId);
    const legacyHit = !before.combatRandom && !after.combatRandom && getUnit(after, command.targetId)?.hp !== target?.hp;
    if (target && attackPreview(attackState, actor.id, target.id).legal && (resolution || legacyHit)) {
      attack = { actorId: actor.id, targetId: target.id, weapon: actor.weapon, targetBefore: structuredClone(target), ...(resolution ? { resolution: structuredClone(resolution) } : {}) };
    }
  }
  if (!moves.length && !attack) return null;
  const duration = (afterAttack: boolean) => Math.min(660, Math.max(0, ...moves.filter(m => !!m.afterAttack === afterAttack).map(m => (m.path.length - 1) * 110)));
  const moveDuration = duration(false), afterMoveDuration = duration(true);
  const attackDuration = attack ? 220 : 0;
  return { moves, ...(attack ? { attack } : {}), moveDuration, attackDuration, ...(afterMoveDuration ? { afterMoveDuration } : {}), durationMs: moveDuration + attackDuration + afterMoveDuration };
}
/** Per-unit movement clock; group durations still gate attack and turn transitions. */
export function presentationMoveTiming(plan: PresentationPlan, move: PresentationPlan['moves'][number]): {start:number;duration:number} {
  return {start:move.afterAttack ? plan.moveDuration + plan.attackDuration : 0,
    duration:move.durationMs ?? (move.afterAttack ? plan.afterMoveDuration ?? 0 : plan.moveDuration)};
}
export function samplePresentation(plan: PresentationPlan, elapsed: number): {
  positions: Record<string, { from: Pos; to: Pos; t: number }>;
  attackProgress: number | null;
  complete: boolean;
} {
  const time = Number.isNaN(elapsed) ? 0 : Math.max(0, elapsed);
  const positions: Record<string, { from: Pos; to: Pos; t: number }> = {};
  for (const move of plan.moves) {
    const {start,duration} = presentationMoveTiming(plan,move);
    const progress = duration ? Math.max(0, Math.min(1, (time - start) / duration)) : 1;
    const last = move.path.length - 1;
    if (progress >= 1) positions[move.unitId] = { from: { ...move.path[last] }, to: { ...move.path[last] }, t: 1 };
    else {
      const segment = progress * last, index = Math.floor(segment);
      positions[move.unitId] = { from: { ...move.path[index] }, to: { ...move.path[index + 1] }, t: segment - index };
    }
  }
  return { positions, attackProgress: plan.attack && time >= plan.moveDuration ? Math.min(1, (time - plan.moveDuration) / plan.attackDuration) : null, complete: time >= plan.durationMs };
}
