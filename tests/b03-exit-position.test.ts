import {describe,it,expect} from 'vitest';
import {createInitialState,getUnit,escortUnit,reduce,getCell} from '../src/domain/engine';
import {getBattleConfig} from '../src/domain/battles';
import type {BattleState,Command} from '../src/domain/types';
function step(s:BattleState,c:Command){const r=reduce(s,c);expect(r.error).toBeUndefined();return r.state;}
describe('B03 exit one square north',()=>{
 it('extends the cart route and wins only at the new exit',()=>{
  let s=createInitialState('B03');s.units=s.units.filter(u=>u.team==='player');s.records=['M'];
  const exit=getBattleConfig('B03').exit;expect(exit).toEqual({x:8,y:3});
  expect(s.escort!.route.at(-1)).toEqual(exit);expect(getCell(s,exit)?.blocked).toBe(false);
  s.escort!.index=5;escortUnit(s)!.pos={x:8,y:4};getUnit(s,'ally-lise')!.pos={x:7,y:5};
  s=step(s,{type:'start',unitId:'ally-lise'});s=step(s,{type:'move',to:{x:7,y:4}});expect(s.phase).toBe('playing');
  s=step(s,{type:'pushCart'});expect(escortUnit(s)!.pos).toEqual(exit);expect(s.phase).toBe('won');
 });
});
