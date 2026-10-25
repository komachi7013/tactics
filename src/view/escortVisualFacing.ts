import type {BattleState,Facing,Unit} from '../domain/types';
import {cardinalSegment} from './directionalMovement';
import {presentationMoveTiming,type PresentationPlan} from './presentation';

/** Body-only direction from the already saved escort route. Combat facing, HUD arrows,
 * simulation and save schema remain authoritative and unchanged. Re-derivation avoids
 * stale view caches after reload, retry, backwards route restoration or battle changes. */
export function escortVisualFacing(state:BattleState,unit:Unit,plan?:PresentationPlan,elapsed=Infinity):Facing {
 const route=state.escort;
 if(unit.kind!=='escort'||route?.unitId!==unit.id)return unit.facing;
 let index=route.index;
 const current=route.route[index];
 if(!current||current.x!==unit.pos.x||current.y!==unit.pos.y)return unit.facing;
 const move=plan?.moves.find(m=>m.unitId===unit.id);
 if(move&&plan){
  const {start,duration}=presentationMoveTiming(plan,move);
  // A committed reducer result is displayed before the queued escort animation runs.
  // Keep its previous idle direction until its own movement ends.
  if(elapsed<start+duration){
   const from=move.path[0],prior=index-(move.path.length-1),p=route.route[prior];
   if(!p||p.x!==from?.x||p.y!==from?.y)return unit.facing;
   index=prior;
  }
 }
 return index>0?cardinalSegment(route.route[index-1],route.route[index])??unit.facing:unit.facing;
}
