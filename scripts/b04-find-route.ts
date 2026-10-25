/** Offline bounded beam search. All transitions use public reduce + deterministic enemy AI.
 * Run: node_modules/.bin/esbuild scripts/b04-find-route.ts --bundle --platform=node --format=esm --outfile=/tmp/tactics-b04-route.mjs
 * then BEAM_WIDTH=25 node /tmp/tactics-b04-route.mjs from project root.
 * Width/depth bound and move->action/E-facing restriction do not prove optimality or impossibility.
 */
import { createInitialState, reduce, getUnit, reachable, canCollect, canGate, attackPreview, healPreview } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
import { writeFileSync } from 'node:fs';
type Node={s:BattleState;commands:Command[]};
const gate=true;
const width=Number(process.env.BEAM_WIDTH??15);
function ai(s:BattleState){while(s.turn==='enemy'&&s.phase==='playing')s=runEnemyActivation(s);return s;}
function score(s:BattleState){
 const lise=getUnit(s,'ally-lise')!;
 const enemies=s.units.filter(u=>u.team==='enemy'),enemyHp=enemies.reduce((n,u)=>n+u.hp,0);
 const alive=s.units.filter(u=>u.team==='player'&&u.hp>0);
 const pointDistance=Math.min(...alive.map(u=>Math.abs(u.pos.x-8)+Math.abs(u.pos.y-5)));
 const gateDistance=Math.min(...alive.map(u=>Math.abs(u.pos.x-2)+Math.abs(u.pos.y-4)));
 const wet=!s.gate.drained||s.gate.pendingDrained===false;
 return (s.phase==='won'?100000:0)+(s.phase==='lost'?-100000:0)-enemyHp*8+alive.reduce((n,u)=>n+u.hp,0)+lise.hp*2+alive.length*80+(wet?180:-gateDistance*5)+(s.capture?.heldRounds??0)*300-pointDistance*(enemyHp===0?30:5)-s.round*2;

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
 for(const id of [] as string[])if(canCollect(moved,id))actions.push({type:'collect',recordId:id});
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
let beam:Node[]=[{s:createInitialState('B04'),commands:[]}];
let won:Node|undefined;
for(let depth=0;depth<40;depth++){
 const candidates=beam.flatMap(expand);
 won=candidates.find(n=>n.s.phase==='won'&&!n.s.gate.drained);
 if(won)break;
 const seen=new Set<string>();
 beam=candidates.sort((a,b)=>score(b.s)-score(a.s)).filter(n=>{
 const {log,...rest}=n.s;const key=JSON.stringify(rest);if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,width);
 console.log({gate,depth,candidates:candidates.length,best:beam[0]&&score(beam[0].s),round:beam[0]?.s.round,records:beam[0]?.s.records});
 if(!beam.length)break;
}
if(!won)throw Error('No route found within bounded beam. This is not proof of impossibility.');
// Derive a separate legal repeat route from the normal R4 checkpoint.
let repeated=createInitialState('B04');const repeatedCommands:Command[]=[];
for(const c of won.commands){if(repeated.round>=4)break;const r=reduce(repeated,c);if(r.error)throw Error(r.error);repeated=ai(r.state);repeatedCommands.push(c);}
function append(c:Command){const r=reduce(repeated,c);if(r.error)throw Error(r.error);repeated=ai(r.state);repeatedCommands.push(c);}
while(repeated.phase==='playing'){
 const round=repeated.round;
 for(const id of ['ally-iva','ally-lise','ally-garan','ally-neia']){
 if(repeated.phase!=='playing')break;
 append({type:'start',unitId:id});append(round===4||round===5?id==='ally-iva'?{type:'gate'}:{type:'defend'}:{type:'defend'});append({type:'end',facing:'E'});
 }
}
if(repeated.phase!=='won')throw Error('Repeat route did not win');
const pack=(s:BattleState,commands:Command[])=>({commands,round:s.round,playerHp:s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])});
writeFileSync('tests/fixtures/b04-route.json',JSON.stringify({...pack(won.s,won.commands),repeated:pack(repeated,repeatedCommands)},null,2)+'\n');
console.log('WIN',won.s.round,won.s.log);
