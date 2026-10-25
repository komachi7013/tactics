// Frozen pre-read-order decision/execution oracle. Source snapshot: read-order-runtime-v1/ai-before.ts.txt.
// Test-only duplication intentionally preserves the old global comparator and fallback.
import { attackPreview, getCell, getUnit, reachable, reduce } from '../../src/domain/engine';
import type { BattleState, Command, Facing, Pos, Unit } from '../../src/domain/types';
const distance=(a:Pos,b:Pos)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
interface Candidate {id:string; pos:Pos; cost:number; target:string; damage:number; remaining:number}
function remaining(s:BattleState,u:Unit):number {
 const goal=u.guardGoal??(u.weapon==='bow'?{x:7,y:2}:{x:7,y:5});
 if(distance(u.pos,goal)===0)return 0;
 const occupied=s.units.some(v=>v.hp>0&&v.id!==u.id&&distance(v.pos,goal)===0);
 const next={...s,units:s.units.map(v=>v.id===u.id?{...v,move:1000}:v)};
 const cells=reachable(next,u.id);
 return Math.min(...cells.filter(p=>occupied?distance(p,goal)===1&&Math.abs(getCell(s,p)!.height-getCell(s,goal)!.height)<=1:distance(p,goal)===0).map(p=>p.cost));
}
export function legacyEnemyActivation(state:BattleState):BattleState {
 return legacyEnemyActivationWithTrace(state).state;
}
export function legacyEnemyActivationWithTrace(state:BattleState):{state:BattleState;commands:Command[]} {
 const commands:Command[]=[];
 const apply=(s:BattleState,command:Command):BattleState=>{commands.push(command);return reduce(s,command).state;};
 if(state.phase!=='playing'||state.turn!=='enemy'||state.activeId)return {state,commands};
 const enemies=state.units.filter(u=>u.team==='enemy'&&u.hp>0&&!u.acted),targets=state.units.filter(u=>u.team==='player'&&u.hp>0),options:Candidate[]=[];
 for(const enemy of enemies)for(const p of reachable(state,enemy.id)){
 const s={...state,units:state.units.map(u=>u.id===enemy.id?{...u,pos:{x:p.x,y:p.y}}:u)};
 const attacks=targets.map(t=>({t,p:attackPreview(s,enemy.id,t.id)})).filter(v=>v.p.legal);
 if(attacks.length)for(const a of attacks)options.push({id:enemy.id,pos:p,cost:p.cost,target:a.t.id,damage:a.p.damage,remaining:0});
 else options.push({id:enemy.id,pos:p,cost:p.cost,target:'',damage:0,remaining:remaining(s,getUnit(s,enemy.id)!)});
 }
 const attacks=options.filter(o=>o.target);
 const tie=(a:Candidate,b:Candidate)=>a.cost-b.cost||a.pos.y-b.pos.y||a.pos.x-b.pos.x||a.target.localeCompare(b.target)||a.id.localeCompare(b.id);
 let choice:Candidate|undefined;
 if(attacks.length)choice=attacks.sort((a,b)=>b.damage-a.damage||tie(a,b))[0];
 else if(options.some(o=>Number.isFinite(o.remaining)))choice=options.sort((a,b)=>(a.remaining===b.remaining?0:a.remaining-b.remaining)||tie(a,b))[0];
 else choice=options.filter(o=>o.cost===0).sort((a,b)=>a.id.localeCompare(b.id))[0];
 if(!choice)return {state,commands};
 let s=apply(state,{type:'start',unitId:choice.id});
 if(choice.cost>0)s=apply(s,{type:'move',to:choice.pos});
 s=choice.target?apply(s,{type:'attack',targetId:choice.target}):apply(s,{type:'defend'});
 if(s.phase!=='playing')return {state:s,commands};
 const actor=getUnit(s,choice.id)!;
 const target=s.units.filter(u=>u.team==='player'&&u.hp>0).sort((a,b)=>distance(a.pos,actor.pos)-distance(b.pos,actor.pos)||a.id.localeCompare(b.id))[0];
 let facing:Facing=actor.facing;
 if(target){const dx=target.pos.x-actor.pos.x,dy=target.pos.y-actor.pos.y;facing=Math.abs(dx)>=Math.abs(dy)?dx>=0?'E':'W':dy>=0?'S':'N';}
 return {state:apply(s,{type:'end',facing}),commands};
}
