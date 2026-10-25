import type {Pos} from '../domain/types';
import {presentationMoveTiming,type PresentationPlan} from './presentation';
/** Existing cart has one fixed camera. Ground rolling axis and radius are measured
 * in its 256px source; neither the rim nor body is transformed by the animation. */
export const CART_WHEEL={key:'motion-cart-wheel',path:'/assets/motion-v1/cart/wheel-four.png',cell:256,frames:4,sourceRadius:Math.hypot(22,11),axis:{x:22,y:-11},spokes:8} as const;
export function cartWheelAngle(plan:PresentationPlan,id:string,elapsed:number,project:(p:Pos)=>Pos,radiusPixels:number):number {
 const m=plan.moves.find(m=>m.unitId===id);if(!m||m.path.length<2||!Number.isFinite(elapsed)||radiusPixels<=0)return 0;
 const {start,duration}=presentationMoveTiming(plan,m);if(duration<=0)return 0;
 const progress=Math.max(0,Math.min(1,(elapsed-start)/duration))*(m.path.length-1),axisLength=Math.hypot(CART_WHEEL.axis.x,CART_WHEEL.axis.y);
 let distance=0;
 for(let i=0;i<m.path.length-1;i++){
  const portion=Math.max(0,Math.min(1,progress-i));if(!portion)break;
  const a=project(m.path[i]),b=project(m.path[i+1]);distance+=portion*((b.x-a.x)*CART_WHEEL.axis.x+(b.y-a.y)*CART_WHEEL.axis.y)/axisLength;
 }
 return distance/radiusPixels;
}
/** Four source phases span a single 45degree spoke pitch. At rest keep this
 * distance-derived phase; elapsed wall time by itself never spins a wheel. */
export function cartWheelFrame(angle:number):number {
 const index=Math.round(angle/(Math.PI/16));return ((index%4)+4)%4;
}
