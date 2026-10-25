import {describe,it,expect} from 'vitest';
import {createInitialState,reduce,reachable} from '../src/domain/engine';
import {runEnemyActivation} from '../src/domain/ai';
import type {Command} from '../src/domain/types';
import fixtures from './fixtures/b01-comparison.json';

// Independent fixture replay: search/scoring code is deliberately not imported.
describe('B01 difficulty and early drainage evidence',()=>{
 for(const [name,route] of Object.entries(fixtures))it(`${name}: legal route against canonical enemy AI`,()=>{
 let state=createInitialState(),totalCost=0,savedCost=0,reservedAt:number|null=null;const hp=()=>state.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp]);
 for(const command of route.commands as Command[]){
 while(state.turn==='enemy'&&state.phase==='playing'){const next=runEnemyActivation(state);expect(next).not.toBe(state);state=next;}
 if(command.type==='gate'){reservedAt=state.round;expect(state.gate.drained).toBe(false);}
 if(command.type==='move'){
 const reachableCell=reachable(state,state.activeId!).find(p=>p.x===command.to.x&&p.y===command.to.y);expect(reachableCell).toBeDefined();totalCost+=reachableCell!.cost;
 if(state.gate.drained){
 const wet=structuredClone(state);wet.cells.forEach(c=>c.shallow=c.x>=3&&c.x<=4&&c.y>=2&&c.y<=5);wet.units.find(u=>u.id===state.activeId)!.move=100;
 const wetCell=reachable(wet,state.activeId!).find(p=>p.x===command.to.x&&p.y===command.to.y);expect(wetCell).toBeDefined();savedCost+=wetCell!.cost-reachableCell!.cost;
 }
 }
 const beforeRound=state.round,result=reduce(state,command);expect(result.error).toBeUndefined();state=result.state;
 if(command.type==='gate'){expect(state.gate.pendingRound).toBe(beforeRound+1);expect(state.gate.drained).toBe(false);}
 if(state.gate.drained){expect(reservedAt).not.toBeNull();expect(state.round).toBeGreaterThan(reservedAt!);}
 }
 expect(state.phase).toBe(route.phase);expect(state.round).toBe(route.round);expect(hp()).toEqual(route.hp);expect(totalCost).toBe(route.moveCost);if(route.phase==='won')expect(state.records.slice().sort()).toEqual(['A','B']);
 if(name==='noGate'){expect(state.units.filter(u=>u.team==='player').every(u=>u.hp>0)).toBe(true);expect(state.gate.drained).toBe(false);}
 if(name==='earlyGate'){expect(reservedAt).toBe(1);expect(state.gate.drained).toBe(true);expect(savedCost).toBe(4);}
 });
});
