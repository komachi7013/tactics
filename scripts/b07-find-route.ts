/** Offline bounded beam; public reduce + unchanged deterministic AI only.
 * esbuild scripts/b07-find-route.ts --bundle --platform=node --format=esm --outfile=/tmp/tactics-b07-route.mjs
 * BEAM_WIDTH=12 node /tmp/tactics-b07-route.mjs ; IDLE=1 records defense loss.
 * Fixed E facing, bounded width/depth: no optimality or impossibility claim.
 */
import {createInitialState,reduce,getUnit,reachable,canCollect,attackPreview,healPreview} from '../src/domain/engine';
import {runEnemyActivation} from '../src/domain/ai';
import type {BattleState,Command,Pos} from '../src/domain/types';
import {writeFileSync} from 'node:fs';
type Node={s:BattleState;commands:Command[]};
const distance=(a:Pos,b:Pos)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const ai=(state:BattleState)=>{let s=state;while(s.turn==='enemy'&&s.phase==='playing')s=runEnemyActivation(s);return s;};
function actions(s:BattleState,id:string):Command[]{
 const out:Command[]=[{type:'defend'}];
 for(const e of s.units.filter(u=>u.team==='enemy'&&u.hp>0))if(attackPreview(s,id,e.id).legal)out.push({type:'attack',targetId:e.id});
 for(const t of s.units)if(healPreview(s,id,t.id).legal)out.push({type:'heal',targetId:t.id});
 for(const recordId of ['V1','V2'])if(canCollect(s,recordId))out.push({type:'collect',recordId});
 return out;
}
function score(s:BattleState){
 const lise=getUnit(s,'ally-lise')!,allies=s.units.filter(u=>u.team==='player'&&u.hp>0);
 const remaining=[{id:'V1',x:2,y:2},{id:'V2',x:7,y:5}].filter(r=>!s.records.includes(r.id));
 return (s.phase==='won'?100000:0)-(s.phase==='lost'?100000:0)+s.records.length*650
 -s.units.filter(u=>u.team==='enemy').reduce((v,u)=>v+u.hp,0)*20
 +allies.length*100+allies.reduce((v,u)=>v+u.hp,0)+lise.hp*4
 -remaining.reduce((v,r)=>v+Math.min(...allies.map(u=>distance(u.pos,r)))*30,0)
 -distance(lise.pos,{x:9,y:6})*(remaining.length?2:35)-s.round*2;
}
function expand(n:Node):Node[]{
 const out:Node[]=[];
 const emit=(s:BattleState,commands:Command[])=>{s=ai(s);if(s.phase!=='lost')out.push({s,commands:[...n.commands,...commands]});};
 const end:Command={type:'end',facing:'E'};
 for(const u of n.s.units.filter(u=>u.team==='player'&&u.hp>0&&!u.acted)){
 const start:Command={type:'start',unitId:u.id},begun=reduce(n.s,start).state;
 for(const action of actions(begun,u.id).filter(c=>c.type!=='defend')){
 const acted=reduce(begun,action).state;
 if(acted.phase==='won'){emit(acted,[start,action]);continue;}
 for(const p of reachable(acted,u.id).filter(p=>p.cost>0)){
 const move:Command={type:'move',to:{x:p.x,y:p.y}},moved=reduce(acted,move).state;
 emit(moved.phase==='won'?moved:reduce(moved,end).state,[start,action,move,...moved.phase==='won'?[]:[end]]);
 }
 }
 for(const p of reachable(begun,u.id)){
 const moves:Command[]=p.cost?[{type:'move',to:{x:p.x,y:p.y}}]:[];
 const moved=moves.length?reduce(begun,moves[0]).state:begun;
 if(moved.phase==='won'){emit(moved,[start,...moves]);continue;}
 for(const action of actions(moved,u.id)){
 const acted=reduce(moved,action).state;
 emit(acted.phase==='won'?acted:reduce(acted,end).state,[start,...moves,action,...acted.phase==='won'?[]:[end]]);
 }
 }
 }
 return out;
}
function pack(n:Node){return {commands:n.commands,round:n.s.round,phase:n.s.phase,records:n.s.records,playerHp:n.s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp]),log:n.s.log};}
if(process.env.IDLE==='1'){
 let s=createInitialState('B07');const commands:Command[]=[];
 while(s.phase==='playing'){
 const u=s.units.find(u=>u.team==='player'&&u.hp>0&&!u.acted)!;
 for(const c of [{type:'start',unitId:u.id},{type:'defend'},{type:'end',facing:'E'}] as Command[]){if(s.phase!=='playing')break;const r=reduce(s,c);if(r.error)throw Error(r.error);commands.push(c);s=ai(r.state);}
 }
 writeFileSync('/tmp/tactics-b07-defeat-route.json',JSON.stringify(pack({s,commands}),null,2)+'\n');console.log('DEFENSE',s.phase,s.round);process.exit(0);
}
let beam:Node[]=[{s:createInitialState('B07'),commands:[]}],won:Node|undefined;
for(let depth=0;depth<40;depth++){
 const candidates=beam.flatMap(expand);won=candidates.find(n=>n.s.phase==='won');if(won)break;
 const seen=new Set<string>();beam=candidates.sort((a,b)=>score(b.s)-score(a.s)).filter(n=>{const {log,...rest}=n.s,key=JSON.stringify(rest);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,Number(process.env.BEAM_WIDTH??12));
 console.log({depth,candidates:candidates.length,score:beam[0]&&score(beam[0].s),round:beam[0]?.s.round,records:beam[0]?.s.records});if(!beam.length)break;
}
if(!won)throw Error('No route in bounded search; not proof of impossibility.');
writeFileSync('/tmp/tactics-b07-victory-route.json',JSON.stringify(pack(won),null,2)+'\n');console.log('WIN',pack(won));
