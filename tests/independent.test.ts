import { describe, expect, it } from 'vitest';
import { createInitialState, getUnit, reduce } from '../src/domain/engine';
import { runEnemyActivation, runEnemyActivationWithTrace } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
import routes from './fixtures/routes.json';

/** Independent replay: no HP edits, teleporting, skipped enemy turns or altered turn flags. */
function replay(commands:Command[]){
 let s=createInitialState();let reservations=0,drains=0;
 const check=(before:BattleState,after:BattleState)=>{
  if(!before.gate.drained&&after.gate.drained){drains++;expect(after.round).toBe(before.round+1);expect(before.gate.pendingRound).toBe(after.round);expect(after.cells.some(c=>c.shallow)).toBe(false);expect(after.units.map(u=>[u.id,u.pos])).toEqual(before.units.map(u=>[u.id,u.pos]));} 
 };
 const ai=()=>{let guard=0;while(s.turn==='enemy'&&s.phase==='playing'){
  if(++guard>3)throw Error('Enemy loop exceeded living enemy count');
  const before=structuredClone(s),a=runEnemyActivation(s),b=runEnemyActivation(s);
  expect(a).toEqual(b);expect(s).toEqual(before);let traced=s;for(const c of runEnemyActivationWithTrace(s).commands){const next=reduce(traced,c).state;check(traced,next);traced=next;}expect(traced).toEqual(a);s=a;
 }};
 ai();
 for(const command of commands){
  expect(s.turn).toBe('player');expect(s.phase).toBe('playing');
  const snapshot=structuredClone(s),result=reduce(s,command);
  expect(result.error,JSON.stringify(command)).toBeUndefined();expect(s).toEqual(snapshot);
  if(command.type==='gate'){reservations++;expect(result.state.round).toBe(s.round);expect(result.state.cells.filter(c=>c.shallow)).toHaveLength(8);}
  check(s,result.state);s=result.state;
  if(s.phase==='playing'){
   const bad=reduce(s,{type:'move',to:{x:-50,y:999}});
   expect(bad.error).toBeTruthy();expect(bad.state).toBe(s);
  }
  ai();
 }
 return {s,reservations,drains};
}
describe('Independent B01 canonical route replay',()=>{
 for(const name of ['dryBypass','gate'] as const)it(`${name}: wins from unchanged initial state against real AI`,()=>{
  const route=routes[name];const {s,reservations,drains}=replay(route.commands as Command[]);
  expect(s.phase).toBe('won');expect(s.round).toBeLessThanOrEqual(8);expect(s.round).toBe(route.round);
  expect(s.records.sort()).toEqual(['A','B']);expect(getUnit(s,'ally-lise')!.hp).toBeGreaterThan(0);expect(getUnit(s,'ally-lise')!.pos).toEqual({x:9,y:6});
  expect(reservations).toBe(name==='gate'?1:0);expect(drains).toBe(name==='gate'?1:0);
  for(const command of route.commands as Command[]){const rejected=reduce(s,command);expect(rejected.error).toBeTruthy();expect(rejected.state).toBe(s);}
 });
 it('refuses record collection on its own cell (the contract is adjacent)',()=>{
  let s=createInitialState();s.units[0].pos={x:2,y:2};s=reduce(s,{type:'start',unitId:'ally-lise'}).state;
  const result=reduce(s,{type:'collect',recordId:'A'});expect(result.error).toBeTruthy();expect(result.state).toBe(s);
 });
 it('restart factory restores all battle resources after a completed route',()=>{
  const {s}=replay(routes.gate.commands as Command[]);const clean=createInitialState();
  expect(s.phase).toBe('won');expect(clean.phase).toBe('playing');expect(clean.round).toBe(1);expect(clean.records).toEqual([]);expect(clean.gate).toEqual({drained:false,pendingRound:null});expect(clean.units.every(u=>u.hp===u.maxHp&&!u.acted)).toBe(true);
 });
});
