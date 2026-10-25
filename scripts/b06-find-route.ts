/** Offline bounded beam search. All transitions use public reduce + deterministic enemy AI.
 * Run: node_modules/.bin/esbuild scripts/b06-find-route.ts --bundle --platform=node --format=esm --outfile=/tmp/tactics-b06-route.mjs
 * then GATE_AFTER_ROUND=4 BEAM_WIDTH=12 node /tmp/tactics-b06-route.mjs from project root.
 * IDLE=1 records unchanged-position defense loss. GATE_AFTER_ROUND defaults to 4, a search-only late-opening strategy; gameplay allows opening earlier. BEAM_WIDTH controls bounded search.
 * Outputs /tmp/tactics-b06-{victory,defeat}-route.json for review/fixture assembly.
 * Width/depth bound and fixed E-facing restriction do not prove optimality or impossibility.
 */
import { createInitialState, reduce, getUnit, reachable, canGate, attackPreview, healPreview } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
import { writeFileSync } from 'node:fs';
type Node={s:BattleState;commands:Command[]};
const gate=true;
const gateAfter=Number(process.env.GATE_AFTER_ROUND??4);
const width=Number(process.env.BEAM_WIDTH??12);
function ai(s:BattleState){while(s.turn==='enemy'&&s.phase==='playing')s=runEnemyActivation(s);return s;}
function score(s:BattleState){
 const lise=getUnit(s,'ally-lise')!;
 const toma=getUnit(s,'escort-toma')!;
 const combat=s.units.filter(u=>u.team==='player'&&u.kind!=='escort'&&u.hp>0);
 const enemyHp=s.units.filter(u=>u.team==='enemy').reduce((n,u)=>n+u.hp,0);
 const guardDist=Math.min(...combat.map(u=>Math.abs(u.pos.x-toma.pos.x)+Math.abs(u.pos.y-toma.pos.y)));
 const next=s.escort?.route[(s.escort?.index??0)+1];
 const blockedNext=next&&s.units.some(u=>u.hp>0&&u.pos.x===next.x&&u.pos.y===next.y);
 const gateDist=Math.min(...combat.map(u=>Math.abs(u.pos.x-3)+Math.abs(u.pos.y-3)));
 return (s.phase==='won'?100000:0)+(s.phase==='lost'?-100000:0)-enemyHp*14+combat.reduce((n,u)=>n+u.hp,0)+lise.hp*3+toma.hp*3+combat.length*100+(s.escort?.index??0)*170+(s.gate.drained?220:s.gate.pendingRound?170:0)-(s.round>=gateAfter&&!s.gate.drained&&!s.gate.pendingRound?gateDist*20:0)-guardDist*35-(blockedNext?120:0)-s.round*2;
}
function expand(n:Node):Node[]{
 const out:Node[]=[];
 for(const u of n.s.units.filter(u=>u.team==='player'&&u.hp>0&&!u.acted&&u.kind!=='escort')){
 const start={type:'start',unitId:u.id} as Command;
 const begun=reduce(n.s,start).state;
 // Public rules permit action then movement. Include it to clear a narrow bridge after striking.
 const immediate:Command[]=[];
 for(const e of begun.units.filter(v=>v.team==='enemy'&&v.hp>0))if(attackPreview(begun,u.id,e.id).legal)immediate.push({type:'attack',targetId:e.id});
 for(const t of begun.units)if(healPreview(begun,u.id,t.id).legal)immediate.push({type:'heal',targetId:t.id});
 if(begun.round>=gateAfter&&canGate(begun))immediate.push({type:'gate'});
 for(const action of immediate){
 const acted=reduce(begun,action).state;
 for(const p of reachable(acted,u.id).filter(p=>p.cost>0)){
 const move:Command={type:'move',to:{x:p.x,y:p.y}},end:Command={type:'end',facing:'E'};
 let next=reduce(acted,move).state;next=reduce(next,end).state;next=ai(next);
 if(next.phase!=='lost')out.push({s:next,commands:[...n.commands,start,action,move,end]});
 }
 }
 for(const p of reachable(begun,u.id)){
 const moves:Command[]=p.cost?[{type:'move',to:{x:p.x,y:p.y}}]:[];
 let moved=begun;for(const c of moves)moved=reduce(moved,c).state;
 if(moved.phase==='won'){out.push({s:moved,commands:[...n.commands,start,...moves]});continue;}
 const actions:Command[]=[{type:'defend'}];
 for(const e of moved.units.filter(v=>v.team==='enemy'&&v.hp>0))if(attackPreview(moved,u.id,e.id).legal)actions.push({type:'attack',targetId:e.id});
 for(const t of moved.units)if(healPreview(moved,u.id,t.id).legal)actions.push({type:'heal',targetId:t.id});
 if(gate&&moved.round>=gateAfter&&canGate(moved)&&!moved.gate.drained)actions.push({type:'gate'});
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
if(process.env.IDLE==='1'){
 let s=createInitialState('B06');const commands:Command[]=[];
 while(s.phase==='playing'){
 const u=s.units.find(u=>u.team==='player'&&u.hp>0&&!u.acted&&u.kind!=='escort')!;
 for(const c of [{type:'start',unitId:u.id},{type:'defend'},{type:'end',facing:'E'}] as Command[]){
 if(s.phase!=='playing')break;
 const r=reduce(s,c);if(r.error)throw Error(r.error);commands.push(c);s=ai(r.state);
 }
 }
 writeFileSync('/tmp/tactics-b06-defeat-route.json',JSON.stringify({commands,round:s.round,phase:s.phase,log:s.log,playerHp:s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])},null,2)+'\n');
 console.log('IDLE',s.phase,s.round,s.log.at(-1));process.exit(0);
}
let beam:Node[]=[{s:createInitialState('B06'),commands:[]}];
let won:Node|undefined;
for(let depth=0;depth<48;depth++){
 const candidates=beam.flatMap(expand);
 won=candidates.find(n=>n.s.phase==='won');
 if(won)break;
 const seen=new Set<string>();
 beam=candidates.sort((a,b)=>score(b.s)-score(a.s)).filter(n=>{
 const {log,...rest}=n.s;const key=JSON.stringify(rest);if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,width);
 if(beam[0])writeFileSync('/tmp/tactics-b06-best.json',JSON.stringify(beam[0]));
 console.log({gate,depth,candidates:candidates.length,best:beam[0]&&score(beam[0].s),round:beam[0]?.s.round,progress:beam[0]?.s.escort?.index});
 if(!beam.length)break;
}
if(!won)throw Error('No route found within bounded beam. This is not proof of impossibility.');
const pack={commands:won.commands,round:won.s.round,records:won.s.records,playerHp:won.s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])};
writeFileSync('/tmp/tactics-b06-victory-route.json',JSON.stringify(pack,null,2)+'\n');
console.log('WIN',pack.round,pack.records,pack.playerHp);
