import { describe, expect, it } from 'vitest';
import { attackPreview, canCollect, canGate, createInitialState, getCell, getUnit, reachable, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import { getBattleConfig } from '../src/domain/battles';
import route from './fixtures/b02-route.json';
import type { BattleState, Command } from '../src/domain/types';

function ai(s:BattleState){let count=0;while(s.phase==='playing'&&s.turn==='enemy'){if(++count>3)throw Error('AI stalled');s=runEnemyActivation(s);}return s;}
describe('B02 independent battle configuration and rules',()=>{
 it('replays a legal victory against unmodified real AI and rejects commands after victory',()=>{
  let s=createInitialState('B02');for(const c of route.commands as Command[]){expect(s.turn).toBe('player');const before=structuredClone(s),result=reduce(s,c);expect(result.error,JSON.stringify(c)).toBeUndefined();expect(s).toEqual(before);s=ai(result.state);}
  expect(s.phase).toBe('won');expect(s.round).toBe(route.round);expect(s.records).toEqual(['O']);expect(getUnit(s,'ally-lise')!.hp).toBeGreaterThan(0);expect(getUnit(s,'ally-lise')!.pos).toEqual(getBattleConfig('B02').exit);
  expect(reduce(s,{type:'start',unitId:'ally-lise'}).state).toBe(s);
 });
 it('defaults to unchanged B01 and returns detached config',()=>{
  expect(createInitialState().battleId).toBe('B01');const c=getBattleConfig('B02');c.exit.x=0;expect(getBattleConfig('B02').exit).toEqual({x:31,y:2});
 });
 it('starts B02 with fresh resources and enemy guard goals',()=>{
  const s=createInitialState('B02');expect(s.records).toEqual([]);expect(s.gate).toEqual({drained:false,pendingRound:null});expect(s.units.every(u=>u.hp===u.maxHp&&!u.acted)).toBe(true);
  for(const u of s.units.filter(u=>u.team==='enemy'))expect(u.guardGoal).toEqual(u.pos);
 });
 it('keeps the long bridge continuous and every scenery boundary impassable',()=>{
  const s=createInitialState('B02');expect(s.cells).toHaveLength(99);
  const bridge=s.cells.filter(c=>c.bridge);expect(bridge).toHaveLength(18);
  for(const c of bridge){expect(c).toMatchObject({y:1,height:1,blocked:false,shallow:false});}
  getUnit(s,'ally-lise')!.pos={x:10,y:1};const r=reachable(s,'ally-lise');
  expect(r.some(c=>c.x===14&&c.y===1)).toBe(true);expect(r.every(p=>!getCell(s,p)!.blocked)).toBe(true);
  expect(r.some(c=>c.x===10&&c.y===0)).toBe(false);
 });
 it('connects the high observation plaza through stairs to the bridge and low east bank',()=>{
  const s=createInitialState('B02');expect(getCell(s,{x:2,y:1})!.height).toBe(2);expect(getCell(s,{x:3,y:1})!.height).toBe(1);expect(getCell(s,{x:22,y:1})!.height).toBe(1);expect(getCell(s,{x:23,y:1})!.height).toBe(0);
  expect(getCell(s,{x:0,y:2})!.blocked).toBe(true);expect(getCell(s,{x:4,y:2})!.blocked).toBe(true);
 });
 it('requires an observation action, prevents own-cell collection and disables water gate',()=>{
  let s=createInitialState('B02');getUnit(s,'ally-lise')!.pos={x:2,y:1};s=reduce(s,{type:'start',unitId:'ally-lise'}).state;expect(canCollect(s,'O')).toBe(true);expect(canCollect(s,'A')).toBe(false);expect(canGate(s)).toBe(false);expect(reduce(s,{type:'gate'}).state).toBe(s);
  s=reduce(s,{type:'collect',recordId:'O'}).state;expect(s.records).toEqual(['O']);expect(canCollect(s,'O')).toBe(false);
  let own=createInitialState('B02');getUnit(own,'ally-lise')!.pos={x:2,y:0};own=reduce(own,{type:'start',unitId:'ally-lise'}).state;expect(canCollect(own,'O')).toBe(false);
 });
 it('does not win from enemy elimination or escape without observation',()=>{
  let s=createInitialState('B02');s.units.filter(u=>u.team==='enemy').forEach(u=>u.hp=0);getUnit(s,'ally-lise')!.pos={x:30,y:2};s=reduce(s,{type:'start',unitId:'ally-lise'}).state;s=reduce(s,{type:'move',to:{x:31,y:2}}).state;expect(s.phase).toBe('playing');
 });
 it('wins only with O and living Lise on the east exit',()=>{
  let s=createInitialState('B02');s.records=['O'];getUnit(s,'ally-lise')!.pos={x:30,y:2};s=reduce(s,{type:'start',unitId:'ally-lise'}).state;s=reduce(s,{type:'move',to:{x:31,y:2}}).state;expect(s.phase).toBe('won');expect(s.log.at(-1)).toContain('B03');expect(reduce(s,{type:'end',facing:'E'}).state).toBe(s);
 });
 it('loses to bridge closure after eighteen rounds when no enemies remain and resets cleanly',()=>{
  let s=createInitialState('B02');s.units.filter(u=>u.team==='enemy').forEach(u=>u.hp=0);for(let i=0;i<54&&s.phase==='playing';i++){s=ai(s);if(s.phase!=='playing')break;const u=s.units.find(u=>u.team==='player'&&u.hp>0&&!u.acted)!;s=reduce(s,{type:'start',unitId:u.id}).state;s=reduce(s,{type:'defend'}).state;s=reduce(s,{type:'end',facing:'E'}).state;s=ai(s);}
  expect(s.phase).toBe('lost');expect(s.round).toBe(18);expect(s.log.at(-1)).toContain('橋が閉鎖');expect(createInitialState('B02')).toEqual(createInitialState('B02'));
 });
 it('permits bow fire across height-zero deep water without treating water as a wall',()=>{
  const s=createInitialState('B02');getUnit(s,'ally-neia')!.pos={x:10,y:0};getUnit(s,'enemy-melee-02')!.pos={x:13,y:0};expect(attackPreview(s,'ally-neia','enemy-melee-02').legal).toBe(true);
 });
});
