export class Actor {
  constructor(world, config) {
    this.world=world; this.config=config; this.keys=new Set();
    this.x=120; this.y=170; this.facing='down'; this.enabled=true;
    this.moving=false; this.phase=0; this.distance=0; this.stepDistance=0; this.steps=[];
  }
  stop() { this.keys.clear(); this.moving=false; this.phase=0; this.stepDistance=0; }
  setEnabled(value) { this.stop(); this.enabled=value; }
  place(x,y,facing='down') { this.stop(); this.x=x; this.y=y; this.facing=facing; }
  valid(x,y) {
    const {halfWidth:w,halfHeight:h}=this.config.collision;
    return x>=w && y>=h && x<=this.world.width-w && y<=this.world.height-h &&
      !this.world.obstacles.some(b=>x+w>b.x && x-w<b.x+b.width && y+h>b.y && y-h<b.y+b.height);
  }
  update(dt) {
    if(!Number.isFinite(dt) || dt<0) throw new Error('Invalid dt');
    const has=(...keys)=>keys.some(k=>this.keys.has(k));
    let dx=Number(has('ArrowRight','d'))-Number(has('ArrowLeft','a'));
    let dy=Number(has('ArrowDown','s'))-Number(has('ArrowUp','w'));
    const length=Math.hypot(dx,dy);
    if(!this.enabled || !length){this.moving=false;this.phase=0;this.stepDistance=0;return;}
    this.facing=dy?(dy>0?'down':'up'):(dx>0?'right':'left'); dx/=length;dy/=length;
    const distance=this.config.speed*dt;
    // Each displacement is smaller than the foot collider, preventing tunnelling.
    const count=Math.max(1,Math.ceil(distance/Math.min(this.config.collision.halfWidth,this.config.collision.halfHeight,2)));
    let moved=0;
    for(let i=0;i<count;i++){
      const ox=this.x,oy=this.y;
      if(this.valid(this.x+dx*distance/count,this.y))this.x+=dx*distance/count;
      if(this.valid(this.x,this.y+dy*distance/count))this.y+=dy*distance/count;
      moved+=Math.hypot(this.x-ox,this.y-oy);
    }
    this.moving=moved>0.00001;
    this.phase=this.moving?this.phase+moved/this.config.speed*1000:0;
    this.distance+=moved; this.stepDistance=this.moving?this.stepDistance+moved:0;
    while(this.stepDistance>=this.config.footsteps.distance){
      this.stepDistance-=this.config.footsteps.distance;
      this.steps.push({id:this.config.footsteps.audioId,material:this.world.materialAt(this.x,this.y),x:this.x,y:this.y});
    }
  }
}
