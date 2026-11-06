import {describe,it,expect} from 'vitest';
import {canPickBoard} from '../src/view/boardPointer';
describe('canvas-only target picking',()=>{
 it('rejects global releases on command buttons and target cards even at valid board coordinates',()=>{
  const canvas=new EventTarget(),button=new EventTarget();
  expect(canPickBoard({event:{target:button},getDistance:()=>0},canvas)).toBe(false);
  expect(canPickBoard({event:{target:canvas},getDistance:()=>0},canvas)).toBe(true);
  expect(canPickBoard({event:{target:canvas},getDistance:()=>20},canvas)).toBe(false);
 });
});
