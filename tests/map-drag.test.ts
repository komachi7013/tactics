import {describe,it,expect} from 'vitest';
import {mountMapDrag} from '../src/view/mapDrag';
function setup(){
 const events=new EventTarget(),viewport=new EventTarget() as EventTarget&{ownerDocument:unknown;scrollLeft:number;scrollTop:number;classList:unknown};
 const classes=new Set<string>();Object.assign(viewport,{ownerDocument:{defaultView:events},scrollLeft:400,scrollTop:300,classList:{add:(c:string)=>classes.add(c),remove:(c:string)=>classes.delete(c)}});
 const drag=mountMapDrag(viewport as unknown as HTMLElement);
 const send=(type:string,values:Record<string,unknown>={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerType:'mouse',pointerId:1,button:0,buttons:1,isPrimary:true,clientX:100,clientY:100,...values});(type==='pointerdown'?viewport:events).dispatchEvent(event);return event;};
 return {viewport,drag,classes,send};
}
describe('map drag scrolling',()=>{
 it('pans both axes and suppresses selection until the next click, including a return to the origin',()=>{
  const h=setup();h.send('pointerdown');h.send('pointermove',{clientX:160,clientY:180});
  expect([h.viewport.scrollLeft,h.viewport.scrollTop]).toEqual([340,220]);expect(h.drag.suppressSelection).toBe(true);
  h.send('pointermove');h.send('pointerup');expect(h.drag.suppressSelection).toBe(true);expect(h.classes.size).toBe(0);
  h.send('pointerdown');h.send('pointerup');expect(h.drag.suppressSelection).toBe(false);
 });
 it('keeps small click jitter selectable without scrolling',()=>{
  const h=setup();h.send('pointerdown');h.send('pointermove',{clientX:103,clientY:102});h.send('pointerup');
  expect(h.drag.suppressSelection).toBe(false);expect([h.viewport.scrollLeft,h.viewport.scrollTop]).toEqual([400,300]);
 });
 it('leaves native touch scrolling alone and allows a touch tap after mouse dragging',()=>{
  const h=setup();h.send('pointerdown');h.send('pointermove',{clientX:140});h.send('pointerup');
  h.send('pointerdown',{pointerType:'touch'});const event=h.send('pointermove',{pointerType:'touch',clientX:220});
  expect(h.viewport.scrollLeft).toBe(360);expect(event.defaultPrevented).toBe(false);expect(h.drag.suppressSelection).toBe(false);
 });
 it('ignores secondary buttons and removes active listeners on disposal',()=>{
  const h=setup();h.send('pointerdown',{button:2});h.send('pointermove',{clientX:200});expect(h.viewport.scrollLeft).toBe(400);
  h.send('pointerdown');h.send('pointermove',{clientX:150});h.drag.dispose();h.send('pointermove',{clientX:250});
  expect(h.viewport.scrollLeft).toBe(350);expect(h.classes.size).toBe(0);
 });
});
