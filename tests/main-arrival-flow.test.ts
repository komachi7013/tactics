import { describe,it,expect,vi } from 'vitest';
import ts from 'typescript';
import source from '../src/main.ts?raw';
import { createPartyBattle } from '../src/party';
import { defaultParty } from '../src/progression';
import { getUnit } from '../src/domain/engine';
import { selectionCommandState, reduceSelectionCommand } from '../src/view/selectionCommands';
import { arrivalInteraction } from '../src/view/arrivalInteraction';
import type { Command } from '../src/domain/types';
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const names=['dispatch','showArrivalInteraction','confirmCommand'];
const code=names.map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)!.getText(ast)).join('\n');
const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup(){
 const initial=createPartyBattle('B01',defaultParty('B01'));getUnit(initial,'ally-lise')!.pos={x:2,y:3};
 let yes=()=>{},cancel=()=>{};
 const ctx={state:initial,mode:'move',floorSelection:undefined,commandOwner:'ally-lise',selected:'enemy-melee-01',screen:'battle',dialogOpen:false,pendingArrival:null as unknown,
  editPassability:false,renderReport:{drawn:true},battleFlow:{canDispatch:()=>!ctx.dialogOpen},
  selectionCommandState,reduceSelectionCommand,arrivalInteraction,getUnit,
  commitMovementFacing:()=>{},soundsForTransition:()=>[],audio:{playSESequence:()=>{},playSE:()=>{}},message:'',render:vi.fn(),say:vi.fn(),announceCommittedAttack:()=>{},presentCommitted:vi.fn(),
  attackAvailability:()=>({targets:[]}),
  modal:vi.fn((_title:string,_body:string,_label:string,confirm:()=>void,_canCancel:boolean,_cancelLabel:string,_type:string,onCancel:()=>void)=>{ctx.dialogOpen=true;yes=confirm;cancel=onCancel;}),
 };
 const api=new Function('ctx',`with(ctx){${js}; return {${names.join(',')}};}`)(ctx) as {dispatch:(c:Command)=>void;showArrivalInteraction:()=>void};
 return {ctx,api,confirm:()=>{ctx.dialogOpen=false;yes();},cancel:()=>{ctx.dialogOpen=false;cancel();}};
}
describe('actual main arrival popup boundary',()=>{
 it('waits for presentation to settle, cancels without undoing movement, and never repeats a queued popup',()=>{
  const h=setup();h.api.dispatch({type:'move',to:{x:2,y:2}});
  expect(h.ctx.modal).not.toHaveBeenCalled();expect(h.ctx.state.records).toEqual([]);
  h.api.showArrivalInteraction();expect(h.ctx.modal).toHaveBeenCalledOnce();
  expect(h.ctx.modal.mock.calls[0][0]).toBe('水位記録を採取');
  const before=structuredClone(h.ctx.state);h.cancel();expect(h.ctx.state).toEqual(before);
  expect(getUnit(h.ctx.state,'ally-lise')!.pos).toEqual({x:2,y:2});expect(h.ctx.mode).toBe('inspect');
  h.api.showArrivalInteraction();expect(h.ctx.modal).toHaveBeenCalledOnce();
 });
 it('commits only on confirmation and rejects stale arrivals after the battle state changes',()=>{
  const h=setup();h.api.dispatch({type:'move',to:{x:2,y:2}});h.api.showArrivalInteraction();h.confirm();
  expect(h.ctx.state.records).toContain('A');expect(h.ctx.state.activation.collected).toBe(true);expect(h.ctx.state.activation.acted).toBe(false);
  const stale=setup();stale.api.dispatch({type:'move',to:{x:2,y:2}});stale.ctx.state=structuredClone(stale.ctx.state);
  stale.api.showArrivalInteraction();expect(stale.ctx.modal).not.toHaveBeenCalled();
 });
});
