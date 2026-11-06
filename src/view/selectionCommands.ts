import { getUnit, reduce } from '../domain/engine';
import type { BattleState, Command, Result } from '../domain/types';

type SelectedUnitId = string | null | undefined;

/** A derived command preview; selecting or cancelling never commits activation-start effects. */
export function selectionCommandState(state: BattleState, selected: SelectedUnitId): BattleState {
 if (state.phase !== 'playing' || state.turn !== 'player' || !selected) return state;
 if (state.activeId && (state.activeId === selected || !state.activation.moveCancelled || state.activation.moved || state.activation.acted || state.activation.collected)) return state;
 const unit = getUnit(state, selected);
 if (!unit || unit.team !== 'player' || unit.hp <= 0 || unit.acted || unit.kind === 'escort') return state;
 return reduce(state, { type: 'start', unitId: unit.id }).state;
}

export interface SelectionCommandResult extends Result { commands: Command[] }

/** Commit implicit start + command together, or return the untouched input and no trace. */
export function reduceSelectionCommand(state: BattleState, selected: SelectedUnitId, command: Command): SelectionCommandResult {
 const explicit = command.type === 'start' || command.type === 'endPlayerTurn';
 const staged = explicit ? state : selectionCommandState(state, selected);
 const result = reduce(staged, command);
 if (result.error) return { state, error: result.error, commands: [] };
 const commands: Command[] = staged === state ? [] : [{ type: 'start', unitId: staged.activeId! }];
 commands.push(command);
 return { state: result.state, commands };
}
