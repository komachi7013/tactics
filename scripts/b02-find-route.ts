/** Offline bounded beam search. All transitions use public reduce + deterministic enemy AI. */
import { createInitialState, reduce, getUnit, reachable, canCollect, canGate, attackPreview } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
type Node={s:BattleState;commands:Command[]};
const gate=false;
const width=Number(process.env.BEAM_WIDTH??20);
function ai(s:BattleState){while(s.turn==='enemy'&&s.phase==='playing')s=runEnemyActivation(s);return s;}
function score(s:BattleState){
 const lise=getUnit(s,'ally-lise')!;
 const enemies=s.units.filter(u=>u.team==='enemy');
 const enemyHp=enemies.reduce((n,u)=>n+u.hp,0);
 const alive=s.units.filter(u=>u.team==='player'&&u.hp>0);
 const oDist=Math.min(...alive.map(u=>Math.abs(u.pos.x-3)+Math.abs(u.pos.y-1)));
 const exitDist=Math.abs(lise.pos.x-9)+Math.abs(lise.pos.y-4);
 return (s.phase==='won'?100000:0)+(s.phase==='lost'?-100000:0)+s.records.length*120-enemyHp*3+alive.reduce((n,u)=>n+u.hp*.7,0)+lise.hp*2-(!s.records.includes('O')?oDist*5:0)-exitDist*(enemyHp>12?1:5)-s.round*3;
}
function expand(n:Node):Node[]{
 const out:Node[]=[];
 for(const u of n.s.units.filter(u=>u.team==='player'&&u.hp>0&&!u.acted)){
 const start={type:'start',unitId:u.id} as Command;
 const begun=reduce(n.s,start).state;
 for(const p of reachable(begun,u.id)){
 const moves:Command[]=p.cost?[{type:'move',to:{x:p.x,y:p.y}}]:[];
 let moved=begun;for(const c of moves)moved=reduce(moved,c).state;
 if(moved.phase==='won'){out.push({s:moved,commands:[...n.commands,start,...moves]});continue;}
 const actions:Command[]=[{type:'defend'}];
 for(const e of moved.units.filter(v=>v.team==='enemy'&&v.hp>0))if(attackPreview(moved,u.id,e.id).legal)actions.push({type:'attack',targetId:e.id});
 for(const id of ['O'])if(canCollect(moved,id))actions.push({type:'collect',recordId:id});
 if(gate&&canGate(moved))actions.push({type:'gate'});
 for(const action of actions){
 let next=reduce(moved,action).state;
 const end:Command={type:'end',facing:'E'};
 const done=next.phase!=='playing';
 if(!done)next=reduce(next,end).state;
 next=ai(next);if(next.phase==='lost')continue;
 out.push({s:next,commands:[...n.commands,start,...moves,action,...done?[]:[end]]});
 }
 }
 }
 return out;
}
let beam:Node[]=[{s:createInitialState('B02'),commands:[]}];
let won:Node|undefined;
for(let depth=0;depth<24;depth++){
 const candidates=beam.flatMap(expand);
 won=candidates.find(n=>n.s.phase==='won'&&(!gate||n.s.gate.drained));
 if(won)break;
 const seen=new Set<string>();
 beam=candidates.sort((a,b)=>score(b.s)-score(a.s)).filter(n=>{
 const {log,...rest}=n.s;const key=JSON.stringify(rest);if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,width);
 console.log({gate,depth,candidates:candidates.length,best:beam[0]&&score(beam[0].s),round:beam[0]?.s.round,records:beam[0]?.s.records});
 if(!beam.length)break;
}
if(!won)throw Error('No route found within bounded beam. This is not proof of impossibility.');
writeFileSync('tests/fixtures/b02-route.json',JSON.stringify({commands:won.commands,round:won.s.round,playerHp:won.s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])},null,2)+'\n');
console.log('WIN',won.s.round,won.s.log);
