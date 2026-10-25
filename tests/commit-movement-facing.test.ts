import { describe,it,expect } from 'vitest';
import { createInitialState,reduce } from '../src/domain/engine';
import { commitMovementFacing } from '../src/view/commitMovementFacing';
import type { Command,BattleState } from '../src/domain/types';
function step(s:BattleState,c:Command,enabled=true){const r=reduce(s,c);expect(r.error).toBeUndefined();commitMovementFacing(s,r.state,c,enabled);return r.state;}
describe('directional trial committed facing',()=>{
 it('retains final route direction, allows explicit end direction and keeps before immutable',()=>{
  let s=step(createInitialState(),{type:'start',unitId:'ally-lise'});const baseline=JSON.stringify(s);
  const moved=step(s,{type:'move',to:{x:2,y:6}});expect(moved.units.find(u=>u.id==='ally-lise')!.facing).toBe('S');expect(JSON.stringify(s)).toBe(baseline);
  const ended=step(moved,{type:'end',facing:'N'});expect(ended.units.find(u=>u.id==='ally-lise')!.facing).toBe('N');
 });
 it('undo restores the previous facing and position; default game is unchanged',()=>{
  let s=step(createInitialState(),{type:'start',unitId:'ally-lise'});
  const moved=step(s,{type:'move',to:{x:2,y:6}});const undone=step(moved,{type:'undoMove'});
  expect(undone.units.find(u=>u.id==='ally-lise')!.facing).toBe('E');expect(undone.units.find(u=>u.id==='ally-lise')!.pos).toEqual({x:0,y:5});expect(undone.activation.moveOriginFacing).toBeUndefined();
  expect(step(s,{type:'move',to:{x:2,y:6}},false).units.find(u=>u.id==='ally-lise')!.facing).toBe('E');
 });
});
