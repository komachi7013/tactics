import {describe,expect,it} from 'vitest';
import {createDialogSettlement} from '../src/view/modalFocus';
describe('confirmation settlement across immediate/replaced dialogs',()=>{
 it('dispatches once even if reduced-motion completes immediately and another dialog is opened',()=>{
  let closes=0,actions=0,current=true;
  const settle=createDialogSettlement(()=>current,()=>{closes++;current=false});
  const action=()=>{actions++;current=true};
  settle(action);settle(action);settle(action);
  expect({closes,actions}).toEqual({closes:1,actions:1});
 });
 it('cancel settles without dispatching a queued confirmation',()=>{
  let closes=0,actions=0;const settle=createDialogSettlement(()=>true,()=>closes++);
  settle();settle(()=>actions++);expect({closes,actions}).toEqual({closes:1,actions:0});
 });
 it('ignores callbacks from a disconnected or replaced dialog',()=>{
  let closes=0,actions=0;const settle=createDialogSettlement(()=>false,()=>closes++);
  settle(()=>actions++);expect({closes,actions}).toEqual({closes:0,actions:0});
 });
 it('blocks a synchronous reentrant confirmation before action completion',()=>{
  let actions=0;const settle=createDialogSettlement(()=>true,()=>{});
  const action=()=>{actions++;settle(action)};settle(action);expect(actions).toBe(1);
 });
});
