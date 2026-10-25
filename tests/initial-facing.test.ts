import {describe,it,expect} from 'vitest';
import {faceNearestOpponents} from '../src/domain/initialFacing';
import {createInitialState,reduce} from '../src/domain/engine';
import {getAttackDirection} from '../src/domain/combatDirection';
import {createPartyBattle} from '../src/party';
import {BATTLE_IDS,defaultParty} from '../src/progression';
import {registeredProjection} from '../src/view/registeredProjection';
import type {Unit,Facing} from '../src/domain/types';

const unit=(id:string,team:Unit['team'],x:number,y:number,hp=10):Unit=>({...createInitialState().units[0],id,team,pos:{x,y},hp,facing:'N'});
describe('battle-start nearest opposing facing',()=>{
 it('faces each distributed opponent independently, without mutating inputs',()=>{
  const units=[unit('p1','player',0,0),unit('p2','player',8,8),unit('e1','enemy',0,2),unit('e2','enemy',10,8)];
  const before=structuredClone(units),next=faceNearestOpponents(units);
  expect(next.map(u=>u.facing)).toEqual(['S','E','N','W']);expect(units).toEqual(before);
 });
 it('uses Manhattan distance rather than array order or Euclidean distance',()=>{
  const next=faceNearestOpponents([unit('p','player',0,0),unit('e-diagonal','enemy',3,3),unit('e-axis','enemy',0,5)]);
  expect(next[0].facing).toBe('S');
 });
 it('breaks distance ties by ordinal ID independently of array order, and axis ties toward X',()=>{
  const units=[unit('p','player',4,4),unit('z','enemy',2,4),unit('a','enemy',5,5)];
  for(const input of [units,[...units].reverse()])expect(faceNearestOpponents(input).find(u=>u.id==='p')!.facing).toBe('E');
 });
 it('ignores dead opponents, preserves dead units and safe existing facing if no opponent exists',()=>{
  const p=unit('p','player',0,0),dead=unit('dead','enemy',0,1,0),live=unit('live','enemy',-3,0);
  const next=faceNearestOpponents([p,dead,live]);expect(next.map(u=>u.facing)).toEqual(['W','N','E']);
  expect(faceNearestOpponents([p,dead])).toEqual([p,dead]);expect(faceNearestOpponents([])).toEqual([]);
  expect(faceNearestOpponents([p,unit('coincident','enemy',0,0)])[0].facing).toBe('N');
 });
 it.each(BATTLE_IDS)('%s factory and prepared deployment face an actual nearest live opponent',id=>{
  for(const state of [createInitialState(id),createPartyBattle(id,defaultParty(id),undefined,4),createPartyBattle(id,[...defaultParty(id)].reverse())]){
   for(const u of state.units.filter(u=>u.hp>0)){
    const opponents=state.units.filter(v=>v.hp>0&&v.team!==u.team),d=(v:Unit)=>Math.abs(u.pos.x-v.pos.x)+Math.abs(u.pos.y-v.pos.y);
    const nearest=Math.min(...opponents.map(d));
    const target=opponents.filter(v=>d(v)===nearest).sort((a,b)=>a.id<b.id?-1:1)[0];
    expect(getAttackDirection(target.pos,u.pos,u.facing).sector).toBe('front');
   }
  }
 });
 it.each([['N',0,-1,1,-1],['E',1,0,1,1],['S',0,1,-1,1],['W',-1,0,-1,-1]] as const)('maps %s to the corresponding isometric screen quadrant',(_f,x,y,sx,sy)=>{
  const p=registeredProjection(1000,800,{width:1000,height:800,ox:500,oy:200,tw:60,th:30,elevation:12});
  const a=p.project({x:0,y:0}),b=p.project({x,y});
  expect(Math.sign(b.x-a.x)).toBe(sx);expect(Math.sign(b.y-a.y)).toBe(sy);
  expect(faceNearestOpponents([unit('p','player',0,0),unit('e','enemy',x,y)])[0].facing).toBe(_f);
 });
 it('retains explicit end-of-action facing and allows an opponent to approach from behind',()=>{
  let s=createInitialState();const u=s.units[0];
  s=reduce(s,{type:'start',unitId:u.id}).state;
  s=reduce(s,{type:'end',facing:'W'}).state;
  expect(s.units[0].facing).toBe('W');
  expect(getAttackDirection({x:u.pos.x+1,y:u.pos.y},u.pos,s.units[0].facing)).toEqual({sector:'rear',hitChance:100});
 });
});
