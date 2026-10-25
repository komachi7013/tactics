import {describe,it,expect} from 'vitest';
import {createInitialState,attackPreview} from '../src/domain/engine';
import {escortVisualFacing} from '../src/view/escortVisualFacing';
import type {PresentationPlan} from '../src/view/presentation';
describe('escort body-only stop facing',()=>{
 it.each(['N','S','W']as const)('derives %s after a corner without changing combat or saved state',direction=>{
  const s=createInitialState('B06'),u=s.units.find(x=>x.id==='escort-toma')!,end={x:direction==='W'?10:11,y:direction==='N'?15:direction==='S'?17:16};
  u.pos=end;u.facing='E';s.escort={unitId:u.id,index:2,route:[{x:10,y:16},{x:11,y:16},end]};
  const frozen=JSON.stringify(s),enemy=s.units.find(x=>x.team==='enemy')!;const combat=attackPreview(s,enemy.id,u.id);
  expect(escortVisualFacing(s,u)).toBe(direction);expect(JSON.stringify(s)).toBe(frozen);expect(attackPreview(s,enemy.id,u.id)).toEqual(combat);
  const restored=JSON.parse(frozen);expect(escortVisualFacing(restored,restored.units.find((x:any)=>x.id===u.id))).toBe(direction);
  const p:PresentationPlan={moves:[{unitId:u.id,path:[{x:11,y:16},end],afterAttack:true,durationMs:180}],moveDuration:360,attackDuration:220,afterMoveDuration:180,durationMs:760};
  expect(escortVisualFacing(s,u,p,0)).toBe('E');expect(escortVisualFacing(s,u,p,579)).toBe('E');expect(escortVisualFacing(s,u,p,759)).toBe('E');expect(escortVisualFacing(s,u,p,760)).toBe(direction);
  s.escort.index=1;u.pos={x:11,y:16};expect(escortVisualFacing(s,u)).toBe('E');
 });
 it('does not override explicit player/enemy direction or unrelated/off-route units',()=>{
  const s=createInitialState('B06');for(const u of s.units){u.facing='W';expect(escortVisualFacing(s,u)).toBe('W');}
  const u=s.units.find(x=>x.id==='escort-toma')!;s.escort={unitId:u.id,index:1,route:[{x:0,y:0},{x:0,y:1}]};expect(escortVisualFacing(s,u)).toBe('W');
 });
});
