import {describe,it,expect,vi} from 'vitest';
import ts from 'typescript';
import source from '../src/main.ts?raw';
import {createInitialState,getUnit,reduce} from '../src/domain/engine';
import {createPresentation,samplePresentation,separateMoveAndAttack} from '../src/view/presentation';
import {withFourPoseTempo} from '../src/view/movementTempo';
import {movementFacing} from '../src/view/directionalMovement';
import {soundsForTransition} from '../src/audio-events';
import type {BattleState,Command} from '../src/domain/types';
function commit(s:BattleState,c:Command){const r=reduce(s,c);expect(r.error).toBeUndefined();return r.state;}
function fixture(){const s=createInitialState();s.combatRandom={version:1,state:0,draws:0};s.cells.forEach(c=>{c.blocked=false;c.shallow=false;});getUnit(s,'enemy-melee-01')!.pos={x:1,y:5};return commit(s,{type:'start',unitId:'ally-lise'});}
describe('attack then movement cancellation',()=>{
 it('undoes only a move made after an attack, retaining damage, used attack and random resolution',()=>{
  const start=fixture(),attacked=commit(start,{type:'attack',targetId:'enemy-melee-01'});
  const moved=commit(attacked,{type:'move',to:{x:0,y:4}}),back=commit(moved,{type:'undoMove'});
  expect(getUnit(back,'ally-lise')!.pos).toEqual(getUnit(attacked,'ally-lise')!.pos);
  expect(back.activation.acted).toBe(true);expect(back.activation.moved).toBe(false);
  expect(back.units.map(u=>u.hp)).toEqual(attacked.units.map(u=>u.hp));expect(back.lastAttack).toEqual(attacked.lastAttack);
  expect(back.combatRandom).toEqual(attacked.combatRandom);expect(back.combatRandom?.draws).toBe(1);
  expect(reduce(back,{type:'attack',targetId:'enemy-melee-01'}).error).toBeTruthy();
 });
 it('still rejects undo when the attack occurred after the move',()=>{
  const start=fixture(),moved=commit(start,{type:'move',to:{x:1,y:4}}),attacked=commit(moved,{type:'attack',targetId:'enemy-melee-01'});
  expect(reduce(attacked,{type:'undoMove'}).error).toBeTruthy();
 });
});
describe('sequential walking and attacking',()=>{
 it('holds the actor at the destination before beginning attack frames',()=>{
  const plan=separateMoveAndAttack(withFourPoseTempo({moves:[{unitId:'actor',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]}],attack:{actorId:'actor',targetId:'target',weapon:'melee',targetBefore:createInitialState().units[0]},moveDuration:220,attackDuration:400,durationMs:620},200))!;
  expect(samplePresentation(plan,399).attackProgress).toBeNull();
  expect(samplePresentation(plan,500).positions.actor.to).toEqual({x:2,y:0});
  expect(movementFacing(plan,'actor',500)).toBeNull();expect(samplePresentation(plan,500).attackProgress).toBeNull();
  expect(samplePresentation(plan,600).attackProgress).toBe(0);
 });
 it('delays actual main attack sound and result text until movement has ended',()=>{
  const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='presentCommitted')!;
  const js=ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const before=fixture();getUnit(before,'enemy-melee-01')!.pos={x:2,y:5};
  const moved=commit(before,{type:'move',to:{x:1,y:5}}),after=commit(moved,{type:'attack',targetId:'enemy-melee-01'});
  const tasks:(()=>void)[]=[],audio=vi.fn(),announce=vi.fn();
  const ctx={state:after,screen:'battle',attackAnnouncementTimer:undefined,dialogueBrief:{clear:()=>{}},dialogueJournal:{observe:()=>{}},createPresentation,soundsForTransition,
   board:{preparePresentation:(p:ReturnType<typeof createPresentation>)=>separateMoveAndAttack(withFourPoseTempo(p,200))},
   window:{clearTimeout:()=>{},setTimeout:(f:()=>void)=>{tasks.push(f);return 1;}},audio:{playSESequence:audio},announceCommittedAttack:announce,render:()=>{},battleFlow:{presentCommitted:vi.fn()}};
  const run=new Function('ctx',`with(ctx){${js};return presentCommitted;}`)(ctx);
  run(before,[{type:'move',to:{x:1,y:5}},{type:'attack',targetId:'enemy-melee-01'}]);
  expect(audio.mock.calls[0][0].every((event:{delayMs:number})=>event.delayMs>=400)).toBe(true);
  expect(announce).not.toHaveBeenCalled();tasks[0]();expect(announce).toHaveBeenCalledOnce();
 });
});
