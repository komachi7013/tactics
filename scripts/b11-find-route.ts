/** B11 offline bounded beam search. All transitions use public reduce + deterministic enemy AI.
 * Run: node_modules/.bin/esbuild scripts/b11-find-route.ts --bundle --platform=node --format=esm --outfile=/tmp/tactics-b11-route.mjs
 * then BEAM_WIDTH=24 node /tmp/tactics-b11-route.mjs from project root.
 * IDLE=1 records unchanged-position defense loss. BEAM_WIDTH controls bounded search.
 * Keeps all four player-side units alive in candidate selection; no runtime stat changes.
 * Outputs /tmp/tactics-b11-{victory,defeat}-route.json for review/fixture assembly.
 * Width/depth bound and fixed E-facing restriction do not prove optimality or impossibility.
 */
import { createInitialState, reduce, getUnit, reachable, attackPreview, healPreview, canCollect, canRepair } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
import { writeFileSync } from 'node:fs';
type Node={s:BattleState;commands:Command[]};
const width=Number(process.env.BEAM_WIDTH??24);
function ai(s:BattleState){while(s.turn==='enemy'&&s.phase==='playing')s=runEnemyActivation(s);return s;}
function score(s:BattleState){
 const lise=getUnit(s,'ally-lise')!;
 const combat=s.units.filter(u=>u.team==='player'&&u.hp>0);
 const enemyHp=s.units.filter(u=>u.team==='enemy').reduce((n,u)=>n+u.hp,0);
 const targets=[...(!s.records.includes('W1')?[{x:2,y:2}]:!s.repairs!.A.completed&&s.repairs!.A.pendingRound===null?[{x:3,y:1}]:[]),...(!s.records.includes('W2')?[{x:7,y:5}]:!s.repairs!.B.completed&&s.repairs!.B.pendingRound===null?[{x:8,y:6}]:[])];
 const progress=s.records.length*250+Object.values(s.repairs!).reduce((n,r)=>n+(r.completed?500:r.pendingRound?350:0),0);
 const targetDist=targets.reduce((n,p)=>n+Math.min(...combat.map(u=>Math.abs(u.pos.x-p.x)+Math.abs(u.pos.y-p.y))),0);
 const exitDist=targets.length?0:Math.abs(lise.pos.x)+Math.abs(lise.pos.y-6);
 return (s.phase==='won'?100000:0)+(s.phase==='lost'?-100000:0)-enemyHp*14+combat.reduce((n,u)=>n+u.hp,0)+lise.hp*3+combat.length*1000+progress-targetDist*35-exitDist*40-s.round*2;
}
function expand(n:Node):Node[]{
 const out:Node[]=[];
 for(const u of n.s.units.filter(u=>u.team==='player'&&u.hp>0&&!u.acted&&u.kind!=='escort')){
 const start={type:'start',unitId:u.id} as Command;
 const begun=reduce(n.s,start).state;
 // Public rules permit action then movement. Include it to clear the westward retreat after striking.
 const immediate:Command[]=[];
 for(const e of begun.units.filter(v=>v.team==='enemy'&&v.hp>0))if(attackPreview(begun,u.id,e.id).legal)immediate.push({type:'attack',targetId:e.id});
 for(const t of begun.units)if(healPreview(begun,u.id,t.id).legal)immediate.push({type:'heal',targetId:t.id});
 for(const action of immediate){
 const acted=reduce(begun,action).state;
 for(const p of reachable(acted,u.id).filter(p=>p.cost>0)){
 const move:Command={type:'move',to:{x:p.x,y:p.y}},end:Command={type:'end',facing:'E'};
 let next=reduce(acted,move).state;next=reduce(next,end).state;next=ai(next);
 if(next.phase!=='lost'&&next.units.filter(u=>u.team==='player').every(u=>u.hp>0))out.push({s:next,commands:[...n.commands,start,action,move,end]});
 }
 }
 for(const p of reachable(begun,u.id)){
 const moves:Command[]=p.cost?[{type:'move',to:{x:p.x,y:p.y}}]:[];
 let moved=begun;for(const c of moves)moved=reduce(moved,c).state;
 if(moved.phase==='won'){out.push({s:moved,commands:[...n.commands,start,...moves]});continue;}
 const actions:Command[]=[{type:'defend'}];
 for(const recordId of ['W1','W2'])if(canCollect(moved,recordId))actions.push({type:'collect',recordId});
 for(const siteId of ['A','B'])if(canRepair(moved,siteId))actions.push({type:'repair',siteId});
 for(const e of moved.units.filter(v=>v.team==='enemy'&&v.hp>0))if(attackPreview(moved,u.id,e.id).legal)actions.push({type:'attack',targetId:e.id});
 for(const t of moved.units)if(healPreview(moved,u.id,t.id).legal)actions.push({type:'heal',targetId:t.id});
 for(const action of actions){
 let next=reduce(moved,action).state;
 const end:Command={type:'end',facing:'E'};
 const done=next.phase!=='playing';
 if(!done)next=reduce(next,end).state;
 next=ai(next);if(next.phase==='lost'||next.units.some(u=>u.team==='player'&&u.hp<=0))continue;
 out.push({s:next,commands:[...n.commands,start,...moves,action,...done?[]:[end]]});
 }
 }
 }
 return out;
}
if(process.env.IDLE==='1'){
 let s=createInitialState('B11');const commands:Command[]=[];
 while(s.phase==='playing'){
 const u=s.units.find(u=>u.team==='player'&&u.hp>0&&!u.acted&&u.kind!=='escort')!;
 for(const c of [{type:'start',unitId:u.id},{type:'defend'},{type:'end',facing:'E'}] as Command[]){
 if(s.phase!=='playing')break;
 const r=reduce(s,c);if(r.error)throw Error(r.error);commands.push(c);s=ai(r.state);
 }
 }
 writeFileSync('/tmp/tactics-b11-defeat-route.json',JSON.stringify({commands,round:s.round,phase:s.phase,records:s.records,log:s.log,playerHp:s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])},null,2)+'\n');
 console.log('IDLE',s.phase,s.round,s.log.at(-1));process.exit(0);
}
let beam:Node[]=[{s:createInitialState('B11'),commands:[]}];
let won:Node|undefined;
for(let depth=0;depth<48;depth++){
 const candidates=beam.flatMap(expand);
 won=candidates.find(n=>n.s.phase==='won');
 if(won)break;
 const seen=new Set<string>();
 beam=candidates.sort((a,b)=>score(b.s)-score(a.s)).filter(n=>{
 const {log,...rest}=n.s;const key=JSON.stringify(rest);if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,width);
 if(beam[0])writeFileSync('/tmp/tactics-b11-best.json',JSON.stringify(beam[0]));
 console.log({depth,candidates:candidates.length,best:beam[0]&&score(beam[0].s),round:beam[0]?.s.round,records:beam[0]?.s.records,repairs:beam[0]?.s.repairs});
 if(!beam.length)break;
}
if(!won)throw Error('No route found within bounded beam. This is not proof of impossibility.');
const pack={commands:won.commands,round:won.s.round,phase:won.s.phase,records:won.s.records,playerHp:won.s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])};
writeFileSync('/tmp/tactics-b11-victory-route.json',JSON.stringify(pack,null,2)+'\n');
console.log('WIN',pack.round,pack.records,pack.playerHp);
