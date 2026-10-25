/** Offline bounded beam search. All transitions use public reduce + deterministic enemy AI.
 * Run: node_modules/.bin/esbuild scripts/b05-find-route.ts --bundle --platform=node --format=esm --outfile=/tmp/tactics-b05-route.mjs
 * then BEAM_WIDTH=12 node /tmp/tactics-b05-route.mjs from project root.
 * WITH_K=1 searches optional evidence; IDLE=1 records unchanged-position defense loss.
 * Outputs /tmp/tactics-b05-{required,optional,defeat}-route.json for review/fixture assembly.
 * Width/depth bound and move->action/E-facing restriction do not prove optimality or impossibility.
 */
import { createInitialState, reduce, getUnit, reachable, canCollect, canGate, attackPreview, healPreview } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
import { writeFileSync } from 'node:fs';
type Node={s:BattleState;commands:Command[]};
const gate=false;
const optional=process.env.WITH_K==='1';
const evidence=optional?['D','T','S','K']:['D','T','S'];
const width=Number(process.env.BEAM_WIDTH??15);
function ai(s:BattleState){while(s.turn==='enemy'&&s.phase==='playing')s=runEnemyActivation(s);return s;}
function score(s:BattleState){
 const lise=getUnit(s,'ally-lise')!;
 const enemyHp=s.units.filter(u=>u.team==='enemy').reduce((n,u)=>n+u.hp,0);
 const alive=s.units.filter(u=>u.team==='player'&&u.hp>0);
 const sites=[{id:'D',x:2,y:2},{id:'T',x:7,y:1},{id:'S',x:7,y:5},{id:'K',x:8,y:6}].filter(r=>evidence.includes(r.id)&&!s.records.includes(r.id));
 const travel=sites.reduce((n,r)=>n+Math.min(...alive.map(u=>Math.abs(u.pos.x-r.x)+Math.abs(u.pos.y-r.y))),0);
 const exitDist=Math.abs(lise.pos.x)+Math.abs(lise.pos.y-6);
 return (s.phase==='won'?100000:0)+(s.phase==='lost'?-100000:0)-enemyHp*12+alive.reduce((n,u)=>n+u.hp,0)+lise.hp*3+alive.length*100+s.records.filter(r=>evidence.includes(r)).length*250-travel*18-(sites.length===0?exitDist*35:0)-s.round*3;
}
function expand(n:Node):Node[]{
 const out:Node[]=[];
 for(const u of n.s.units.filter(u=>u.team==='player'&&u.hp>0&&!u.acted&&u.kind!=='escort')){
 const start={type:'start',unitId:u.id} as Command;
 const begun=reduce(n.s,start).state;
 for(const p of reachable(begun,u.id)){
 const moves:Command[]=p.cost?[{type:'move',to:{x:p.x,y:p.y}}]:[];
 let moved=begun;for(const c of moves)moved=reduce(moved,c).state;
 if(moved.phase==='won'){out.push({s:moved,commands:[...n.commands,start,...moves]});continue;}
 const actions:Command[]=[{type:'defend'}];
 for(const e of moved.units.filter(v=>v.team==='enemy'&&v.hp>0))if(attackPreview(moved,u.id,e.id).legal)actions.push({type:'attack',targetId:e.id});
 for(const id of evidence)if(canCollect(moved,id))actions.push({type:'collect',recordId:id});
 for(const t of moved.units)if(healPreview(moved,u.id,t.id).legal)actions.push({type:'heal',targetId:t.id});
 if(gate&&canGate(moved)&&moved.gate.drained)actions.push({type:'gate'});
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
 let s=createInitialState('B05');const commands:Command[]=[];
 while(s.phase==='playing'){
 const u=s.units.find(u=>u.team==='player'&&u.hp>0&&!u.acted)!;
 for(const c of [{type:'start',unitId:u.id},{type:'defend'},{type:'end',facing:'E'}] as Command[]){
 if(s.phase!=='playing')break;
 const r=reduce(s,c);if(r.error)throw Error(r.error);commands.push(c);s=ai(r.state);
 }
 }
 writeFileSync('/tmp/tactics-b05-defeat-route.json',JSON.stringify({commands,round:s.round,phase:s.phase,log:s.log,playerHp:s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])},null,2)+'\n');
 console.log('IDLE',s.phase,s.round,s.log.at(-1));process.exit(0);
}
let beam:Node[]=[{s:createInitialState('B05'),commands:[]}];
let won:Node|undefined;
for(let depth=0;depth<40;depth++){
 const candidates=beam.flatMap(expand);
 won=candidates.find(n=>n.s.phase==='won'&&(!optional||n.s.records.includes('K')));
 if(won)break;
 const seen=new Set<string>();
 beam=candidates.sort((a,b)=>score(b.s)-score(a.s)).filter(n=>{
 const {log,...rest}=n.s;const key=JSON.stringify(rest);if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,width);
 console.log({gate,depth,candidates:candidates.length,best:beam[0]&&score(beam[0].s),round:beam[0]?.s.round,records:beam[0]?.s.records});
 if(!beam.length)break;
}
if(!won)throw Error('No route found within bounded beam. This is not proof of impossibility.');
const pack={commands:won.commands,round:won.s.round,records:won.s.records,playerHp:won.s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])};
writeFileSync(optional?'/tmp/tactics-b05-optional-route.json':'/tmp/tactics-b05-required-route.json',JSON.stringify(pack,null,2)+'\n');
console.log('WIN',pack.round,pack.records,pack.playerHp);
