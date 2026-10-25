import {describe,it,expect} from 'vitest';
import {createInitialState,getUnit,reduce,attackPreview} from '../src/domain/engine';
import {runEnemyActivationWithTrace} from '../src/domain/ai';
import {getBattleConfig} from '../src/domain/battles';
import {BATTLE_IDS} from '../src/progression';
import type {BattleState,Command} from '../src/domain/types';
function apply(s:BattleState,c:Command){const r=reduce(s,c);expect(r.error,JSON.stringify(c)).toBeUndefined();return r.state;}
function finish(s:BattleState,id:string){s=apply(s,{type:'start',unitId:id});return apply(s,{type:'end',facing:getUnit(s,id)!.facing});}
describe('faction phases and unchanged activation boundaries',()=>{
 it.each(BATTLE_IDS)('%s permits arbitrary allied order, then all enemies, then player-first next R',id=>{
  let s=createInitialState(id);const players=s.units.filter(u=>u.team==='player'&&u.kind!=='escort').reverse(),enemyIds=s.units.filter(u=>u.team==='enemy').map(u=>u.id);
  const hp=s.units.map(u=>u.hp);for(let i=0;i<players.length;i++){s=finish(s,players[i].id);expect(s.round).toBe(1);expect(s.turn).toBe(i===players.length-1?'enemy':'player');expect(s.units.map(u=>u.hp)).toEqual(hp);}
  const acted:string[]=[];while(s.turn==='enemy'&&s.phase==='playing'){const before=s,trace=runEnemyActivationWithTrace(s);expect(trace.state).not.toBe(s);expect(trace.commands[0].type).toBe('start');const start=trace.commands[0];if(start.type==='start'){expect(acted).not.toContain(start.unitId);acted.push(start.unitId);}s=trace.state;if(acted.length<enemyIds.length){expect(s.turn).toBe('enemy');expect(s.round).toBe(1);}expect(s.units.filter(u=>u.team==='player'&&u.hp>0&&u.kind!=='escort').every(u=>u.acted||s.round===2)).toBe(true);expect(before.units.filter(u=>u.team==='enemy'&&u.acted).length).toBe(acted.length-1);}
  expect(acted.sort()).toEqual(enemyIds.sort());expect(s.phase).toBe('playing');expect(s.round).toBe(2);expect(s.turn).toBe('player');expect(s.activeId).toBeNull();expect(s.units.every(u=>!u.acted)).toBe(true);
 });
 it('endPlayerTurn is rejected during an activation or enemy phase and does not mutate rejected state',()=>{
  const initial=createInitialState(),active=apply(initial,{type:'start',unitId:'ally-lise'});for(const s of [active,{...initial,turn:'enemy' as const}]){const before=structuredClone(s),r=reduce(s,{type:'endPlayerTurn'});expect(r.error).toBeDefined();expect(r.state).toBe(s);expect(s).toEqual(before);}
 });
 it('explicit waits preserve position/facing and attack/move effects, but perform start-time expiry',()=>{
  let s=createInitialState();const p=getUnit(s,'ally-lise')!,g=getUnit(s,'ally-garan')!,n=getUnit(s,'ally-neia')!;p.guard=true;p.surveyBonus=true;p.plankReady=true;n.protection={sourceId:p.id};g.guard=true;g.acted=true;g.protection={sourceId:g.id};
  const before=structuredClone(s);s=apply(s,{type:'endPlayerTurn'});expect(s.turn).toBe('enemy');expect(s.round).toBe(1);expect(s.units.map(u=>[u.pos,u.facing])).toEqual(before.units.map(u=>[u.pos,u.facing]));expect(getUnit(s,p.id)).toMatchObject({guard:false,acted:true,surveyBonus:true,plankReady:true});expect(getUnit(s,n.id)!.protection).toBeUndefined();expect(getUnit(s,g.id)).toMatchObject({guard:true,protection:{sourceId:g.id}});expect(before.units[0].guard).toBe(true);
 });
 it('does not expire guard/protection at a simple player→enemy boundary',()=>{
  let s=createInitialState();s=apply(s,{type:'start',unitId:'ally-garan'});s=apply(s,{type:'defend'});s=apply(s,{type:'end',facing:'N'});getUnit(s,'ally-lise')!.protection={sourceId:'ally-garan'};s=apply(s,{type:'endPlayerTurn'});expect(getUnit(s,'ally-garan')!.guard).toBe(true);expect(getUnit(s,'ally-lise')!.protection).toEqual({sourceId:'ally-garan'});
 });
 it('does not run equipment/escort or increment R between the two phases, and advances once at R boundary',()=>{
  let s=createInitialState('B06');for(const enemy of s.units.filter(u=>u.team==='enemy'))enemy.atk=0;
  s.gate.pendingRound=2;getUnit(s,'ally-lise')!.pos={...s.escort!.route[1]}; // Deliberately blocked next cell: no forced escort move.
  s=apply(s,{type:'endPlayerTurn'});expect(s.round).toBe(1);expect(s.gate.drained).toBe(false);expect(s.escort!.index).toBe(0);
  let steps=0;while(s.turn==='enemy'&&s.phase==='playing'){s=runEnemyActivationWithTrace(s).state;expect(++steps).toBeLessThan(5);}expect(s.round).toBe(2);expect(s.gate.drained).toBe(true);expect(s.gate.pendingRound).toBeNull();expect(s.escort!.index).toBe(0);
 });
 it('skips an absent enemy faction without scheduling an empty phase, and keeps round limits unchanged',()=>{
  let s=createInitialState();for(const e of s.units.filter(u=>u.team==='enemy'))e.hp=0;s=apply(s,{type:'endPlayerTurn'});expect(s.turn).toBe('player');expect(s.round).toBe(2);
  s.round=getBattleConfig('B01').roundLimit;s=apply(s,{type:'endPlayerTurn'});expect(s.phase).toBe('lost');expect(s.round).toBe(8);expect(reduce(s,{type:'endPlayerTurn'}).state).toBe(s);
 });
 it('preserves move undo and does not give a second move/action inside a faction phase',()=>{
  let s=createInitialState();s=apply(s,{type:'start',unitId:'ally-lise'});getUnit(s,'ally-lise')!.plankReady=true;s=apply(s,{type:'move',to:{x:1,y:5}});expect(getUnit(s,'ally-lise')!.plankReady).toBeUndefined();s=apply(s,{type:'undoMove'});expect(getUnit(s,'ally-lise')!.plankReady).toBe(true);s=apply(s,{type:'defend'});expect(reduce(s,{type:'defend'}).error).toBeDefined();expect(reduce(s,{type:'undoMove'}).error).toBeDefined();s=apply(s,{type:'end',facing:'N'});expect(reduce(s,{type:'start',unitId:'ally-lise'}).error).toBeDefined();expect(s.turn).toBe('player');
 });
 it('stops on a decisive attack before phase/round advancement or another enemy can act',()=>{
  let s=createInitialState();s.turn='enemy';const p=getUnit(s,'ally-lise')!;p.hp=1;p.pos={x:4,y:5};s=apply(s,{type:'start',unitId:'enemy-melee-01'});expect(attackPreview(s,'enemy-melee-01',p.id).legal).toBe(true);s=apply(s,{type:'attack',targetId:p.id});expect(s.phase).toBe('lost');expect(s.round).toBe(1);expect(runEnemyActivationWithTrace(s)).toEqual({state:s,commands:[]});
 });
});

it('applies a pending chain gate before exactly one actual escort step at the next R',()=>{
 let s=createInitialState('B06');for(const e of s.units.filter(u=>u.team==='enemy'))e.hp=0;
 s.gate.pendingRound=2;const cart=getUnit(s,s.escort!.unitId!)!,next=s.escort!.route[1];
 const adjacent=s.cells.find(c=>!c.blocked&&Math.abs(c.x-cart.pos.x)+Math.abs(c.y-cart.pos.y)===1&&(c.x!==next.x||c.y!==next.y)&&!s.units.some(u=>u.hp>0&&u.pos.x===c.x&&u.pos.y===c.y))!;
 getUnit(s,'ally-lise')!.pos={x:adjacent.x,y:adjacent.y};s=apply(s,{type:'endPlayerTurn'});
 expect(s.round).toBe(2);expect(s.gate.drained).toBe(true);expect(s.escort!.index).toBe(1);expect(getUnit(s,s.escort!.unitId!)!.pos).toEqual(next);
});
it('finishes zero-movement activations without stalling and stops immediately when the party is all down',()=>{
 let s=createInitialState();s.units.forEach(u=>u.move=0);s=apply(s,{type:'endPlayerTurn'});let n=0;while(s.turn==='enemy'&&s.phase==='playing'){const next=runEnemyActivationWithTrace(s);expect(next.state).not.toBe(s);s=next.state;expect(++n).toBeLessThanOrEqual(3);}expect(s.round).toBe(2);expect(s.turn).toBe('player');
 s=createInitialState();s.units.filter(u=>u.team==='player').forEach(u=>u.hp=0);s=apply(s,{type:'endPlayerTurn'});expect(s.phase).toBe('lost');expect(runEnemyActivationWithTrace(s).commands).toEqual([]);
});
