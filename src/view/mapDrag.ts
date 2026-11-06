/** Mouse panning shares the native scroll surface used by wheel and touch. */
export function mountMapDrag(viewport: HTMLElement) {
 const events=viewport.ownerDocument.defaultView!;
 let origin:{id:number;x:number;y:number;left:number;top:number}|undefined;
 let dragged=false;
 const finish=()=>{origin=undefined;viewport.classList.remove('is-dragging');};
 const down=(event:PointerEvent)=>{
  if(event.button!==0||!event.isPrimary)return;
  dragged=false;finish();
  if(event.pointerType!=='mouse')return;
  if((event.target as Element|null)?.closest?.('button, summary, input, select, textarea, a'))return;
  origin={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
 };
 const move=(event:PointerEvent)=>{
  if(!origin||event.pointerId!==origin.id)return;
  if(!(event.buttons&1)){finish();return;}
  const dx=event.clientX-origin.x,dy=event.clientY-origin.y;
  if(!dragged&&Math.hypot(dx,dy)<6)return;
  dragged=true;viewport.classList.add('is-dragging');
  event.preventDefault();viewport.scrollLeft=origin.left-dx;viewport.scrollTop=origin.top-dy;
 };
 const up=(event:PointerEvent)=>{if(origin?.id===event.pointerId)finish();};
 viewport.addEventListener('pointerdown',down);
 events.addEventListener('pointermove',move,{passive:false});
 events.addEventListener('pointerup',up);events.addEventListener('pointercancel',up);events.addEventListener('blur',finish);
 return {
  // Keep this set through pointerup: Phaser must not select the release square.
  get suppressSelection(){return dragged;},
  dispose(){finish();viewport.removeEventListener('pointerdown',down);events.removeEventListener('pointermove',move);events.removeEventListener('pointerup',up);events.removeEventListener('pointercancel',up);events.removeEventListener('blur',finish);},
 };
}
