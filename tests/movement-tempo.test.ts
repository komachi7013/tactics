import {movementFacing} from '../src/view/directionalMovement';
import { describe,it,expect } from 'vitest';
import { distancePose,travelledTiles,withFourPoseTempo } from '../src/view/movementTempo';
import {samplePresentation, type PresentationPlan } from '../src/view/presentation';
const p:PresentationPlan={moves:[{unitId:'l',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:1}]}],moveDuration:330,attackDuration:0,durationMs:330};
describe('four-pose distance tempo',()=>{
 it('keeps long paths at the same tile speed instead of accelerating after six tiles',()=>{
 const long={...p,moves:[{unitId:'long',path:Array.from({length:9},(_,x)=>({x,y:0}))}]};
 const n=withFourPoseTempo(long)!;
 expect(n.durationMs).toBe(1440);expect(travelledTiles(n,'long',720)).toBe(4);
 expect(distancePose(n,'long',360,0,16,4)).toBe(8);
 });
 it('samples longer generated loops by distance and preserves phase at turns and across moves',()=>{
 const n=withFourPoseTempo(p)!;
 expect(distancePose(n,'l',90,0,16,3)).toBe(2);
 expect(distancePose(n,'l',180,0,16,3)).toBe(5);
 expect(distancePose(n,'l',360,0,16,3)).toBe(10);
 expect(movementFacing(n,'l',360)).toBe('S');
 expect(distancePose(n,'l',0,3,16,3)).toBe(0);
 expect(distancePose(n,'l',0,4,32,6)).toBe(21);
 expect(distancePose(n,'l',60000,0,16,3)).toBe(0);
 });
 it('uses 180ms/tile and two tiles per cycle, preserving the source plan',()=>{
 const fixed=JSON.stringify(p),n=withFourPoseTempo(p)!;expect(n.durationMs).toBe(540);expect(JSON.stringify(p)).toBe(fixed);
 expect([0,89,90,179,180,269,270,359,360,449,450,539].map(t=>distancePose(n,'l',t))).toEqual([0,0,1,1,2,2,3,3,0,0,1,1]);
 });
 it('retains phase between moves and holds delayed motion through attacks',()=>{
 const n=withFourPoseTempo(p)!;expect(distancePose(n,'l',0,1)).toBe(2);expect(travelledTiles(n,'l',540)).toBe(3);
 const delayed=withFourPoseTempo({...p,moves:[{...p.moves[0],afterAttack:true}],moveDuration:0,attackDuration:220,durationMs:550})!;
 expect(travelledTiles(delayed,'l',219)).toBe(0);expect(travelledTiles(delayed,'l',310)).toBe(.5);expect(delayed.attackDuration).toBe(220);
 });
});

describe('independent movement clocks and sequential escort',()=>{
 const long={unitId:'enemy',path:Array.from({length:5},(_,x)=>({x,y:0}))};
 const escort={unitId:'toma',path:[{x:10,y:16},{x:11,y:16}],afterAttack:true};
 it('finishes enemy before escort starts, with a 180ms escort and full gate',()=>{
  const n=withFourPoseTempo({moves:[long,escort],moveDuration:440,afterMoveDuration:110,attackDuration:220,durationMs:770})!;
  expect(n.moves.map(m=>m.durationMs)).toEqual([720,180]);expect(n.durationMs).toBe(1120);
  expect(travelledTiles(n,'toma',939)).toBe(0);expect(movementFacing(n,'toma',939)).toBeNull();
  expect(movementFacing(n,'enemy',720)).toBeNull();expect(movementFacing(n,'toma',940)).toBe('E');
  expect(travelledTiles(n,'toma',1030)).toBe(.5);expect(distancePose(n,'toma',1030,1)).toBe(3);
  expect(samplePresentation(n,1119).complete).toBe(false);expect(samplePresentation(n,1120).complete).toBe(true);
  expect(samplePresentation(n,1120).positions.toma.to).toEqual({x:11,y:16});
 });
 it('does not stretch a short same-phase unit to the longest path',()=>{
  const n=withFourPoseTempo({moves:[long,{...escort,afterAttack:false}],moveDuration:440,attackDuration:0,durationMs:440})!;
  expect(travelledTiles(n,'toma',90)).toBe(.5);expect(movementFacing(n,'toma',180)).toBeNull();
  expect(samplePresentation(n,180).positions.toma.to).toEqual({x:11,y:16});expect(samplePresentation(n,180).complete).toBe(false);
  expect(travelledTiles(n,'enemy',180)).toBe(1);expect(n.durationMs).toBe(720);
 });
});

describe('standing-derived walks',()=>{
 it('plays 19 chronological poses over 800ms at four tiles per cycle and holds during attacks',()=>{
  const source={moves:[{unitId:'actor',path:Array.from({length:9},(_,x)=>({x,y:0}))}],moveDuration:100,attackDuration:0,durationMs:100};
  const plan=withFourPoseTempo(source,200)!;
  expect(plan.durationMs).toBe(1600);
  expect(Array.from({length:19},(_,i)=>distancePose(plan,'actor',(i+.1)*800/19,0,19,4))).toEqual(Array.from({length:19},(_,i)=>i));
  expect(distancePose(plan,'actor',800,0,19,4)).toBe(0);
  const delayed=withFourPoseTempo({...source,moves:[{...source.moves[0],afterAttack:true}],attackDuration:220},200)!;
  expect(travelledTiles(delayed,'actor',219)).toBe(0);
  expect(distancePose(delayed,'actor',620,0,19,4)).toBe(9);
 });
});
