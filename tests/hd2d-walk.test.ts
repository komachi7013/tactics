import { describe, expect, it } from 'vitest';
import { hd2dWalkTrial, hd2dWalkFrame, HD2D_WALK } from '../src/qa/hd2dWalk';
import type { PresentationPlan } from '../src/view/presentation';
const candidate={verified:true as const,visibleHeight:112};
const search='?qaSession=headfixed-test&qaWalk=lise-user-gif-local-20261023';
const plan=(n:number):PresentationPlan=>({moves:[{unitId:'ally-lise',path:Array.from({length:n+1},(_,x)=>({x,y:5}))}],moveDuration:Math.min(660,n*110),attackDuration:0,durationMs:Math.min(660,n*110)});
describe('user-saved GIF candidate trial gate and original speed sampling',()=>{
 it('requires DEV, exact isolated session, explicit unique trial flag and verified pixel measurement',()=>{
  expect(hd2dWalkTrial(true,'headfixed-test',search,candidate)).toBe(candidate);
  for(const [dev,session,q,c] of [[false,'headfixed-test',search,candidate],[true,null,search,candidate],[true,'other-test',search,candidate],[true,'headfixed-test','?qaSession=headfixed-test',candidate],[true,'headfixed-test',search+'&qaWalk=lise-user-gif-local-20261023',candidate],[true,'headfixed-test',search,null],[true,'headfixed-test',search,{verified:true,visibleHeight:0}]] as const)expect(hd2dWalkTrial(dev,session,q,c)).toBeNull();
  expect(hd2dWalkTrial(true,'headfixed-test',search)).toEqual({verified:true,visibleHeight:108});
  expect(hd2dWalkTrial(true,'headfixed-test','?qaSession=headfixed-test&qaWalk=lise-headfixed-v1')).toBeNull();
 });
 it.each([[1,[0]],[2,[0,1]],[4,[0,1,2,3]],[8,[0,1,2,3,4]]] as const)('retains current %s-cell timing; does not force all six frames', (n,expected)=>{
  const p=plan(n),snapshot=structuredClone(p),frames=new Set<number>();
  for(let t=0;t<p.durationMs;t++)frames.add(hd2dWalkFrame(p,'ally-lise',t)!);
  expect([...frames]).toEqual(expected);expect(hd2dWalkFrame(p,'ally-lise',p.durationMs)).toBeNull();expect(p).toEqual(snapshot);
 });
 it('supports only exact east segments for Lise, with no mirror or invented other directions',()=>{
  const p=plan(2);p.moves[0].path[2]={x:1,y:4};
  expect(hd2dWalkFrame(p,'ally-lise',0)).toBe(0);expect(hd2dWalkFrame(p,'ally-lise',110)).toBeNull();
  expect(hd2dWalkFrame(p,'ally-neia',0)).toBeNull();
  expect(hd2dWalkFrame(p,'ally-lise',-1)).toBeNull();expect(hd2dWalkFrame(p,'ally-lise',NaN)).toBeNull();
 });
 it('does not play before an after-attack move or after stop; original 140ms phase restarts per plan',()=>{
  const p=plan(4);p.moves[0].afterAttack=true;p.moveDuration=0;p.attackDuration=400;p.afterMoveDuration=440;p.durationMs=840;
  expect(hd2dWalkFrame(p,'ally-lise',399)).toBeNull();expect(hd2dWalkFrame(p,'ally-lise',400)).toBe(0);
  expect(hd2dWalkFrame(p,'ally-lise',540)).toBe(1);expect(hd2dWalkFrame(p,'ally-lise',840)).toBeNull();
  expect(HD2D_WALK.originY).toBe(120/128);
 });
});

it('enables uninterrupted footstep only behind the inspected candidate DEV/session gate',()=>{
 expect(hd2dWalkTrial(true,'headfixed-test',search+'&qaWalkMode=continuous')).toEqual({verified:true,visibleHeight:108,mode:'continuous'});
 expect(hd2dWalkTrial(false,'headfixed-test',search+'&qaWalkMode=continuous')).toBeNull();
 expect(hd2dWalkTrial(true,null,search+'&qaWalkMode=continuous')).toBeNull();
});
