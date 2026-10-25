import type Phaser from 'phaser';
import type { Pos } from '../domain/types';

/** Visual registration only. No terrain, path cost, cover or command data. */
export const B01_ENVIRONMENT = {
  grates: [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 6 }, { x: 4, y: 6 }],
} as const;
export const b01EnvironmentKey = (p: Pos) => `b01-environment-floor-${p.x}-${p.y}`;
const source = (x: number, y: number) => ({ x: 730 + (x - y) * 60, y: 270 + (x + y) * 30 });

/** Ground details are clipped per actual H0 diamond and sorted with its floor.
 * Continuous source-space lines cross cell boundaries without repeated tile stamps. */
export function prepareB01Environment(scene: Phaser.Scene): void {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) {
    const key = b01EnvironmentKey({ x, y });
    if (scene.textures.exists(key)) continue;
    const tile = scene.textures.createCanvas(key, 120, 60);
    if (!tile) throw new Error('B01 environment canvas unavailable');
    const ctx = tile.getContext(), center = source(x, y);
    ctx.translate(60 - center.x, 30 - center.y);
    ctx.beginPath();ctx.moveTo(center.x, center.y - 30);ctx.lineTo(center.x + 60, center.y);ctx.lineTo(center.x, center.y + 30);ctx.lineTo(center.x - 60, center.y);ctx.closePath();ctx.clip();
    const polygon = (points: number[][], color: string, alpha: number) => {
      ctx.globalAlpha = alpha;ctx.fillStyle = color;ctx.beginPath();
      points.forEach(([x,y],i) => { const p=source(x,y); if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y); });ctx.closePath();ctx.fill();
    };
    const line = (a: number[], b: number[], color: string, alpha: number, width=1) => {
      const p=source(a[0],a[1]),q=source(b[0],b[1]);ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
    };
    // A worn limestone work apron, with long setting-out grooves and rounded scuffs.
    polygon([[-.5,-.5],[2.5,-.5],[2.5,3.5],[-.5,3.5]], '#7c7767', .15);
    for(let row=0;row<4;row++) {
      line([-.5,row+.15],[2.5,row+.15],'#625a46',.22,1.2);
      for(let col=0;col<3;col++) line([col+(row%2)*.45,row-.5],[col+(row%2)*.45,row+.15],'#f1e0b5',.36,1.5);
    }
    // Two connected, flush paving bands. The rest of the apron remains walkable.
    polygon([[-.5,5.62],[9.5,5.62],[9.5,6.38],[-.5,6.38]], '#87775b', .30);
    polygon([[.62,.5],[1.38,.5],[1.38,6.38],[.62,6.38]], '#87775b', .30);
    polygon([[1,1.72],[2.25,1.72],[2.25,2.28],[1,2.28]], '#87775b', .25);
    polygon([[1,3.72],[2,3.72],[2,4.28],[1,4.28]], '#87775b', .25);
    for(const edge of [5.62,6.38])line([-.5,edge],[9.5,edge],'#67583d',.4,1.8);
    for(const edge of [.62,1.38])line([edge,.5],[edge,5.62],'#67583d',.4,1.8);
    for(let i=0;i<20;i++)line([i*.5-.4,5.64],[i*.5-.4,6.36],'#d4c49c',.45,1.6);
    for(let i=0;i<12;i++)line([.64,i*.5+.5],[1.36,i*.5+.5],'#d4c49c',.42,1.5);
    // Survey wear on the A working apron is flat engraving, not equipment/occupancy.
    const a=source(2,2);ctx.save();ctx.translate(a.x,a.y);ctx.scale(1,.5);ctx.globalAlpha=.19;ctx.strokeStyle='#665d43';ctx.lineWidth=1.3;
    for(const radius of [24,40]){ctx.beginPath();ctx.arc(0,0,radius,.15,Math.PI*1.65);ctx.stroke();}ctx.restore();
    // Dry access grates at the two ends of the existing eight-cell channel.
    if(B01_ENVIRONMENT.grates.some(c=>c.x===x&&c.y===y)) {
      polygon([[x-.46,y-.46],[x+.46,y-.46],[x+.46,y+.46],[x-.46,y+.46]],'#3a443c',.65);
      polygon([[x-.35,y-.35],[x+.35,y-.35],[x+.35,y+.35],[x-.35,y+.35]],'#555d50',.8);
      for(let i=0;i<7;i++) {
        const t=x-.32+i*.105;
        line([t,y-.34],[t,y+.34],'#272e27',.9,4);
        line([t-.025,y-.34],[t-.025,y+.34],'#b4aa82',.9,1.5);
      }
      for(const t of [y-.36,y+.36])line([x-.36,t],[x+.36,t],'#d6c29a',.9,3);
    }
    tile.refresh();
  }
}
