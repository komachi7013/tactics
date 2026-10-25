import {describe,it,expect} from 'vitest';
import {cartWheelAngle,cartWheelFrame,CART_WHEEL} from '../src/view/cartWheel';
import type {PresentationPlan} from '../src/view/presentation';
const project=({x,y}:{x:number;y:number})=>({x:x*32-y*32,y:x*16+y*16});
const plan=(reverse=false):PresentationPlan=>({moves:[{unitId:'enemy',path:[{x:0,y:0},{x:1,y:0}],durationMs:720},{unitId:'escort-cart',path:reverse?[{x:1,y:0},{x:0,y:0}]:[{x:0,y:0},{x:1,y:0}],afterAttack:true,durationMs:180}],moveDuration:720,attackDuration:0,afterMoveDuration:180,durationMs:900});
describe('cart wheel uses its own escorted displacement clock',()=>{
 it('does not spin while the preceding enemy moves or after the cart stops',()=>{const p=plan();expect(cartWheelAngle(p,'escort-cart',600,project,12)).toBe(0);const end=cartWheelAngle(p,'escort-cart',900,project,12);expect(end).toBeGreaterThan(0);expect(cartWheelAngle(p,'escort-cart',1200,project,12)).toBe(end);expect(cartWheelAngle(p,'escort-cart',810,project,12)).toBeCloseTo(end/2);});
 it('reverses rotation on undo without changing direction assets or domain rules',()=>{const a=cartWheelAngle(plan(),'escort-cart',900,project,12),b=cartWheelAngle(plan(true),'escort-cart',900,project,12);expect(a+b).toBeCloseTo(0);expect(cartWheelFrame(a+b)).toBe(0);});
 it('preserves phase across consecutive one-cell escort movements and view scale',()=>{const a=cartWheelAngle(plan(),'escort-cart',900,project,12);const scaled=(p:{x:number;y:number})=>{const q=project(p);return {x:q.x*2,y:q.y*2};};expect(cartWheelAngle(plan(),'escort-cart',900,scaled,24)).toBeCloseTo(a);expect(cartWheelFrame(a+a)).toBe(cartWheelFrame(2*a));});
 it('uses four uniform spoke phases with reverse modulo and does not animate absent movement',()=>{for(let i=0;i<4;i++){expect(cartWheelFrame(i*Math.PI/16)).toBe(i);expect(cartWheelFrame(-i*Math.PI/16)).toBe((4-i)%4);}expect(cartWheelFrame(Math.PI/4)).toBe(0);expect(CART_WHEEL.spokes).toBe(8);expect(cartWheelAngle({...plan(),moves:[]},'escort-cart',900,project,12)).toBe(0);});
});
