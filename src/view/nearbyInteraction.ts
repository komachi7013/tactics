import type { BattleState, Command, Pos } from '../domain/types';
import { getUnit, reduce } from '../domain/engine';

/** A view-only trial of the same command; never commits or starts an activation. */
export function nearbyInteraction(state: BattleState, pos: Pos, command: Command, interactive = true) {
  const actor = state.activeId ? getUnit(state, state.activeId) : undefined;
  if (!actor || actor.team !== 'player' || actor.kind === 'escort' || actor.hp <= 0
    || Math.abs(actor.pos.x-pos.x)+Math.abs(actor.pos.y-pos.y) > (command.type==='pushCart'?1:0)) {
    return { visible: false, enabled: false, reason: '' };
  }
  const error = reduce(state, command).error;
  return { visible: true, enabled: interactive && !error,
    reason: interactive ? error ?? '' : '' };
}
