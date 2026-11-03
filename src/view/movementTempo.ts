import { presentationMoveTiming, type PresentationPlan } from './presentation';
/** Four-pose presentation: 180ms/tile, two tiles per complete gait (90ms/pose at constant speed).
 * A tile is a half-cycle, not a full cycle squeezed into one tile. Idle never advances phase.
 * This changes presentation duration only; domain turns, paths and attack duration are unchanged. */
export const FOUR_POSE_TEMPO={tileMs:180,tilesPerCycle:2,frames:4} as const;
export const STANDING_WALK_TEMPO={tileMs:200,tilesPerCycle:4,frames:19,cycleMs:800} as const;
export function withFourPoseTempo(plan:PresentationPlan|null,tileMs:number=FOUR_POSE_TEMPO.tileMs):PresentationPlan|null {
 if(!plan?.moves.length)return plan;
 const moves=plan.moves.map(m=>({...m,durationMs:(m.path.length-1)*tileMs}));
 const duration=(after:boolean)=>Math.max(0,...moves.filter(m=>!!m.afterAttack===after).map(m=>m.durationMs));
 const moveDuration=duration(false),afterMoveDuration=duration(true);
 return {...plan,moves,moveDuration,afterMoveDuration,durationMs:moveDuration+plan.attackDuration+afterMoveDuration};
}
export function travelledTiles(plan:PresentationPlan,id:string,elapsed:number):number {
 const move=plan.moves.find(m=>m.unitId===id);if(!move)return 0;
 const {start,duration}=presentationMoveTiming(plan,move);
 return duration>0?Math.max(0,Math.min(1,(elapsed-start)/duration))*(move.path.length-1):0;
}
export function distancePose(plan:PresentationPlan,id:string,elapsed:number,priorTiles=0,frames:number=FOUR_POSE_TEMPO.frames,tilesPerCycle:number=FOUR_POSE_TEMPO.tilesPerCycle):number {
 return Math.floor((priorTiles+travelledTiles(plan,id,elapsed))*frames/tilesPerCycle)%frames;
}
