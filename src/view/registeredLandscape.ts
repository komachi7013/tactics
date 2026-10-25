import type Phaser from 'phaser';
import type { Cell } from '../domain/types';
import type { BattleId } from '../domain/types';
import type { SceneRegistration } from './registeredProjection';
import b02 from '../landscapes/b02.json';
import b03 from '../landscapes/b03.json';
import b04 from '../landscapes/b04.json';
import b05 from '../landscapes/b05.json';
import b06 from '../landscapes/b06.json';
import b07 from '../landscapes/b07.json';
import b08 from '../landscapes/b08.json';
import b09 from '../landscapes/b09.json';
import b10 from '../landscapes/b10.json';
import b11 from '../landscapes/b11.json';
import b12 from '../landscapes/b12.json';
interface RegisteredWater {id:string;path:string;bounds:number[];polygons:number[][][];cells:{x:number;y:number}[];sourceId?:string;sceneSource?:boolean;alpha?:number}
interface RegisteredLandscape { battleId:BattleId; key:string; path:string; registration:SceneRegistration; worker?:{path:string;width:number;height:number;foot:number[];visibleHeight:number};cutaway?:typeof b03.cutaway;physicalFloors?:{x:number;y:number}[];water?:RegisteredWater[];overlays?:typeof b06.overlays }
/** Original scene pixels remain intact; registration is reviewed before integration. */
export const REGISTERED_B02:RegisteredLandscape={battleId:'B02',key:'b02-adopted-landscape',path:'/assets/b02-adopted/river-scene.png',registration:b02.registration};
export const REGISTERED_B03:RegisteredLandscape={battleId:'B03',key:'b03-adopted-landscape',path:'/assets/b03-adopted/town-scene.png',registration:b03.registration,cutaway:b03.cutaway};
export const REGISTERED_B04:RegisteredLandscape={battleId:'B04',key:'b04-adopted-landscape',path:'/assets/b04-adopted/dry-channel.png',registration:b04.registration,physicalFloors:b04.physicalFloors,water:b04.water};
export const REGISTERED_B05:RegisteredLandscape={battleId:'B05',key:'b05-adopted-landscape',path:'/assets/b05-adopted/archive.png',registration:b05.registration,physicalFloors:b05.physicalFloors};
export const REGISTERED_B06:RegisteredLandscape={battleId:'B06',key:'b06-adopted-landscape',path:'/assets/b06-adopted/canal.png',registration:b06.registration,physicalFloors:b06.physicalFloors,overlays:b06.overlays};
export const REGISTERED_B07:RegisteredLandscape={battleId:'B07',key:'b07-adopted-landscape',path:'/assets/b07-adopted/grass-scene.png',registration:b07.registration,physicalFloors:b07.physicalFloors};
export const REGISTERED_B08:RegisteredLandscape={battleId:'B08',key:'b08-adopted-landscape',path:'/assets/b08-adopted/weir.png',registration:b08.registration,physicalFloors:b08.physicalFloors,water:b08.water};
export const REGISTERED_B09:RegisteredLandscape={battleId:'B09',key:'b09-adopted-landscape',path:'/assets/b09-adopted/corridor.png',registration:b09.registration,physicalFloors:b09.physicalFloors};
export const REGISTERED_B10:RegisteredLandscape={battleId:'B10',key:'b10-adopted-landscape',path:'/assets/b10-adopted/harbor.png',registration:b10.registration,physicalFloors:b10.physicalFloors,overlays:b10.overlays};
export const REGISTERED_B11:RegisteredLandscape={battleId:'B11',key:'b11-adopted-landscape',path:'/assets/b11-adopted/maintenance.png',registration:b11.registration,physicalFloors:b11.physicalFloors,worker:b11.worker};
export const REGISTERED_B12:RegisteredLandscape={battleId:'B12',key:'b12-adopted-landscape',path:'/assets/b12-adopted/terrace.png',registration:b12.registration,physicalFloors:b12.physicalFloors};
export const REGISTERED_LANDSCAPES=[REGISTERED_B02,REGISTERED_B03,REGISTERED_B04,REGISTERED_B05,REGISTERED_B06,REGISTERED_B07,REGISTERED_B08,REGISTERED_B09,REGISTERED_B10,REGISTERED_B11,REGISTERED_B12];
/** Gathering points have physical support even before they become traversable. */
export function registeredFloors(spec:RegisteredLandscape,cells:Cell[]):Cell[]{if(!spec.physicalFloors)return cells.filter(c=>!c.blocked);const keys=new Set(spec.physicalFloors.map(c=>c.x+','+c.y));return cells.filter(c=>keys.has(c.x+','+c.y))}
export const registeredLandscape=(id:BattleId)=>REGISTERED_LANDSCAPES.find(s=>s.battleId===id);
export interface RegisteredPart {key:string;bounds:number[];depth:number;whenShallow?:{x:number;y:number}[];whenGateOpen?:boolean}
/** Tight canvas partitions preserve the prototype's source coordinates without full-scene copies. */
export function prepareRegisteredParts(scene:Phaser.Scene,spec:RegisteredLandscape):RegisteredPart[]{
 const waterParts:RegisteredPart[]=[];
 for(const water of spec.water??[]){
  const key=spec.key+'-water-'+water.id,b=water.bounds;
  if(!scene.textures.exists(key)){
   const original=scene.textures.get(spec.key+'-water-source-'+(water.sourceId??water.id)).getSourceImage() as HTMLImageElement;
   const texture=scene.textures.createCanvas(key,b[2]-b[0],b[3]-b[1]);if(!texture)throw Error('水路の描画素材を準備できません');
   const ctx=texture.getContext();ctx.save();
   try{ctx.beginPath();for(const polygon of water.polygons){polygon.forEach(([x,y],i)=>i?ctx.lineTo(x-b[0],y-b[1]):ctx.moveTo(x-b[0],y-b[1]));ctx.closePath()}ctx.clip();ctx.globalAlpha=water.alpha??.8;if(water.sceneSource)ctx.drawImage(original,-b[0],-b[1]);else ctx.drawImage(original,0,0,b[2]-b[0],b[3]-b[1]);texture.refresh()}
   catch(error){scene.textures.remove(key);throw error}finally{ctx.restore()}
  }
  waterParts.push({key,bounds:b,depth:-99,whenShallow:water.cells});
 }
 for(const overlay of spec.overlays??[]){
  const key=spec.key+'-overlay-'+overlay.id,b=overlay.bounds;
  if(!scene.textures.exists(key)){
   const original=scene.textures.get(spec.key+'-overlay-source-'+overlay.id).getSourceImage() as HTMLImageElement;
   const texture=scene.textures.createCanvas(key,b[2]-b[0],b[3]-b[1]);if(!texture)throw Error('景観の状態表示を準備できません');
   const ctx=texture.getContext();ctx.save();
   try{ctx.translate(-b[0],-b[1]);ctx.beginPath();overlay.polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ctx.drawImage(original,0,0);texture.refresh()}
   catch(error){scene.textures.remove(key);throw error}finally{ctx.restore()}
  }
  waterParts.push({key,bounds:b,depth:-99,whenGateOpen:overlay.whenGateOpen});
 }
 const c=spec.cutaway;if(!c)return waterParts;
 const original=scene.textures.get(spec.key).getSourceImage() as HTMLImageElement;
 const insert=scene.textures.get(spec.key+'-insert').getSourceImage() as HTMLImageElement;
 const polygon=(ctx:CanvasRenderingContext2D,points:number[][])=>{points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath()};
 const transform=(ctx:CanvasRenderingContext2D,matrix:string)=>ctx.transform(...matrix.match(/-?\d*\.?\d+/g)!.map(Number) as [number,number,number,number,number,number]);
 const parts:RegisteredPart[]=[{key:spec.key+'-room',bounds:[900,630,1340,860],depth:-99},{key:spec.key+'-facade',bounds:[880,440,1370,860],depth:998},{key:spec.key+'-jamb',bounds:[1020,645,1050,840],depth:999}];
 const created:string[]=[];try{for(const [i,p]of parts.entries()){
  if(scene.textures.exists(p.key))continue;
  const texture=scene.textures.createCanvas(p.key,p.bounds[2]-p.bounds[0],p.bounds[3]-p.bounds[1]);if(!texture)throw Error('倉の描画素材を準備できません');
  created.push(p.key);const ctx=texture.getContext();ctx.save();ctx.translate(-p.bounds[0],-p.bounds[1]);
  if(i===0){ctx.save();ctx.beginPath();polygon(ctx,c.floor);ctx.clip();transform(ctx,c.floorTransform);ctx.drawImage(insert,0,0);ctx.restore();ctx.save();transform(ctx,c.portalTransform);ctx.beginPath();polygon(ctx,[[635,590],[790,668],[790,822],[610,764],[635,748]]);ctx.clip();ctx.drawImage(insert,0,0);ctx.restore()}
  else if(i===1){ctx.beginPath();polygon(ctx,c.facade);polygon(ctx,c.door);ctx.clip('evenodd');ctx.globalAlpha=c.facadeOpacity;ctx.drawImage(original,0,0)}
  else{transform(ctx,c.portalTransform);ctx.beginPath();polygon(ctx,[[748,660],[790,681],[790,819],[748,798]]);ctx.clip();ctx.drawImage(insert,0,0)}
  ctx.restore();texture.refresh();
 }
 }catch(error){for(const key of created)if(scene.textures.exists(key))scene.textures.remove(key);throw error}
 return [...waterParts,...parts];
}
