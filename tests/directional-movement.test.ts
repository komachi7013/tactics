import { describe,it,expect } from 'vitest';
import { cardinalSegment,movementFacing } from '../src/view/directionalMovement';
import type { PresentationPlan } from '../src/view/presentation';
const plan:PresentationPlan={moves:[{unitId:'ally-lise',path:[{x:0,y:0},{x:1,y:0},{x:1,y:-1},{x:0,y:-1},{x:0,y:0}]}],moveDuration:440,attackDuration:0,durationMs:440};
describe('directional visual movement',()=>{
 it('selects actual E/N/W/S route segments without changing the plan',()=>{
  const fixed=JSON.stringify(plan);
  expect([0,109,110,219,220,329,330,439].map(t=>movementFacing(plan,'ally-lise',t))).toEqual(['E','E','N','N','W','W','S','S']);
  expect(movementFacing(plan,'ally-lise',440)).toBeNull();expect(JSON.stringify(plan)).toBe(fixed);
 });
 it('does not play before or after delayed NPC movement or on invalid geometry',()=>{
  const delayed:PresentationPlan={moves:[{unitId:'escort-toma',afterAttack:true,path:[{x:0,y:0},{x:0,y:1}]}],moveDuration:110,attackDuration:220,afterMoveDuration:110,durationMs:440};
  expect(movementFacing(delayed,'escort-toma',329)).toBeNull();expect(movementFacing(delayed,'escort-toma',330)).toBe('S');expect(movementFacing(delayed,'escort-toma',440)).toBeNull();
  expect(cardinalSegment({x:0,y:0},{x:1,y:1})).toBeNull();expect(cardinalSegment({x:0,y:0},{x:0,y:0})).toBeNull();expect(movementFacing(plan,'ally-lise',NaN)).toBeNull();
 });
});
