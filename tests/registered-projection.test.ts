import { describe, expect, it } from 'vitest';
import { registeredProjection } from '../src/view/registeredProjection';
const scene={width:1536,height:1024,ox:520,oy:-30,tw:120,th:60,elevation:30};
describe('registered landscape coordinate contract',()=>{
 it('rejects zero/invalid sizes instead of exposing an inverse with NaN coordinates',()=>{
  expect(()=>registeredProjection(0,1000,scene)).toThrow(RangeError);expect(()=>registeredProjection(1000,NaN,scene)).toThrow(RangeError);expect(()=>registeredProjection(1000,1000,{...scene,tw:0})).toThrow(RangeError);expect(()=>registeredProjection(1000,1000,{...scene,ox:Infinity})).toThrow(RangeError);
 });
 it.each([[1090,836],[390,844],[1440,1000]])('retains the full approved source and inverts all 24x16 feet at %ix%i',(width,height)=>{
  const p=registeredProjection(width,height,scene);
  const a=p.source({x:0,y:0}),b=p.source({x:1536,y:1024});expect(a.x).toBeGreaterThanOrEqual(0);expect(a.y).toBeGreaterThanOrEqual(0);expect(b.x).toBeLessThanOrEqual(width+1e-8);expect(b.y).toBeLessThanOrEqual(height+1e-8);
  for(let y=0;y<16;y++)for(let x=0;x<24;x++)for(const h of [0,1,2]){const q=p.unproject(p.project({x,y},h),h);expect(q.x).toBeCloseTo(x,9);expect(q.y).toBeCloseTo(y,9);}
 });
 it('uses the same floor diamond for source registration and pointer selection',()=>{
  const p=registeredProjection(1536,1024,scene),cell={x:8,y:6,height:1};expect(p.project(cell,1)).toEqual({x:640,y:360});const poly=p.polygon(cell,1);expect(poly).toEqual([{x:640,y:330},{x:700,y:360},{x:640,y:390},{x:580,y:360}]);expect(p.floorsAt([cell],p.project(cell,1))).toEqual([cell]);expect(p.floorsAt([cell],{x:640,y:391})).toEqual([]);
 });
 it('exposes overlapping floors as choices instead of silently moving the actor anchor',()=>{
  const p=registeredProjection(1536,1024,scene),low={x:2,y:2,height:0},high={x:3,y:3,height:2},point=p.project(low,0);expect(p.project(high,2)).toEqual(point);expect(p.floorsAt([high,low],point)).toEqual([low,high]);
 });
 it('does not select the area outside the diamond near its diagonal corners',()=>{
  const p=registeredProjection(1536,1024,scene),cell={x:8,y:6,height:1};
  for(let y=320;y<=400;y+=5)for(let x=570;x<=710;x+=5){const expected=Math.abs(x-640)/60+Math.abs(y-360)/30<=1.001;expect(p.floorsAt([cell],{x,y}).length>0,`${x},${y}`).toBe(expected);}
  expect(p.floorsAt([cell],{x:695,y:385})).toEqual([]);
 });
});
