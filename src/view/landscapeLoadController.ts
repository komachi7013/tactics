export type LoadState={phase:'ready'|'loading'|'failed';error?:unknown};
export interface LandscapeLoadPort {
 has(id:string):boolean;
 load(id:string):Promise<void>;
 prepare(id:string):void;
 release(id:string):void;
 clear():void;
 changed():void;
}
/** One serialized image loader; every callback consults the latest selected battle. */
export class LandscapeLoadController {
 private target?:string;
 private pending?:string;
 private disposed=false;
 private prepared=new Set<string>();
 private held=new Set<string>();
 private failed=new Map<string,unknown>();
 constructor(private port:LandscapeLoadPort){}
 request(id:string):LoadState {
  if(this.disposed)return{phase:'failed',error:new Error('Landscape controller disposed')};
  if(this.target!==id){this.port.clear();this.target=id;for(const old of this.held)if(old!==id&&old!==this.pending){this.port.release(old);this.held.delete(old);this.prepared.delete(old)}}
  if(this.pending)return{phase:'loading'};
  if(this.failed.has(id))return{phase:'failed',error:this.failed.get(id)};
  if(this.port.has(id)){
   this.held.add(id);
   try{if(!this.prepared.has(id)){this.port.prepare(id);this.prepared.add(id)}return{phase:'ready'}}
   catch(error){this.failed.set(id,error);return{phase:'failed',error}}
  }
  this.pending=id;this.held.add(id);
  // Promise.resolve also turns synchronous queue failures into this one failure path.
  Promise.resolve().then(()=>this.disposed?undefined:this.port.load(id)).then(()=>{if(!this.disposed&&!this.port.has(id))throw new Error(id+' landscape assets incomplete')}).catch(error=>{this.failed.set(id,error)}).finally(()=>{
   this.pending=undefined;
   if(this.disposed||this.target!==id){this.port.release(id);this.held.delete(id);this.prepared.delete(id)}
   if(!this.disposed)this.port.changed();
  });
  return{phase:'loading'};
 }
 /** A failed initial Phaser preload is already an attempted load. */
 recordFailure(id:string,error:unknown){this.failed.set(id,error);this.held.add(id)}
 /** Called only by an explicit retry control, never from resize/display. */
 retry(){if(this.target)this.failed.delete(this.target);if(!this.disposed)this.port.changed()}
 stop(){if(this.disposed)return;this.disposed=true;this.port.clear();for(const id of this.held)if(id!==this.pending)this.port.release(id);this.held.clear();this.prepared.clear()}
}
