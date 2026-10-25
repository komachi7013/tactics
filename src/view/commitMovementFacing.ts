import type { BattleState, Command } from '../domain/types';
import { createPresentation } from './presentation';
import { cardinalSegment } from './directionalMovement';

/** Movement default: travel sets the default combat facing; explicit end facing still wins.
 * Only called after a successful reducer result, by the command bridge.
 * Undo restores the pre-move facing as well as the position. */
export function commitMovementFacing(before:BattleState, after:BattleState, command:Command, enabled:boolean):void {
 if(!enabled||before.battleId!==after.battleId||!before.activeId)return;
 const old=before.units.find(u=>u.id===before.activeId),next=after.units.find(u=>u.id===before.activeId);
 if(!old||!next)return;
 if(command.type==='move'){
  const path=createPresentation(before,after,[command])?.moves.find(m=>m.unitId===old.id)?.path;
  if(!path||path.length<2)return;
  const facing=cardinalSegment(path[path.length-2],path[path.length-1]);if(!facing)return;
  after.activation.moveOriginFacing=old.facing;next.facing=facing;
 } else if(command.type==='undoMove'){
  if(before.activation.moveOriginFacing)next.facing=before.activation.moveOriginFacing;
  delete after.activation.moveOriginFacing;
 }
}
