import type Phaser from 'phaser';
import type {BattleId} from '../domain/types';
import {B01_MATERIALS,prepareB01Landscape} from './b01Landscape';
import {prepareB01Environment} from './b01Environment';
import {registeredLandscape,prepareRegisteredParts} from './registeredLandscape';
export function landscapeMaterials(id:BattleId):{key:string;path:string}[]{
 if(id==='B01')return B01_MATERIALS.map(m=>({key:m.key,path:'/assets/b01-scene-recovery-v1/'+m.file}));
 const spec=registeredLandscape(id);const materials=spec?[{key:spec.key,path:spec.path},...(spec.worker?[{key:spec.key+'-worker',path:spec.worker.path}]:[]),...(spec.cutaway?[{key:spec.key+'-insert',path:spec.cutaway.insert}]:[]),...(spec.water??[]).map(w=>({key:spec.key+'-water-source-'+(w.sourceId??w.id),path:w.path})),...(spec.overlays??[]).map(o=>({key:spec.key+'-overlay-source-'+o.id,path:o.path}))]:[];return [...new Map(materials.map(m=>[m.key,m])).values()];
}
export function landscapeTextureKeys(scene:Phaser.Scene,id:BattleId):string[]{const prefix=id==='B01'?['b01-scene-','b01-environment-']:[id.toLowerCase()+'-adopted-landscape'];return scene.textures.getTextureKeys().filter(key=>prefix.some(p=>key.startsWith(p)))}
/** Failed derived partitions must not survive as a seemingly valid cached image. */
export function prepareLandscape(scene:Phaser.Scene,id:BattleId){
 const before=new Set(landscapeTextureKeys(scene,id));
 try{if(id==='B01'){prepareB01Landscape(scene);prepareB01Environment(scene)}else{const spec=registeredLandscape(id);if(spec)prepareRegisteredParts(scene,spec)}}
 catch(error){for(const key of landscapeTextureKeys(scene,id))if(!before.has(key))scene.textures.remove(key);throw error}
}
export function releaseLandscape(scene:Phaser.Scene,id:BattleId){for(const key of landscapeTextureKeys(scene,id))scene.textures.remove(key)}

/** ImageFile snapshots loader.maxRetries at construction; only critical scene files opt out. */
export function queueLandscapeMaterials(scene:Phaser.Scene,id:BattleId){const retries=scene.load.maxRetries;scene.load.maxRetries=0;try{for(const m of landscapeMaterials(id))if(!scene.textures.exists(m.key))scene.load.image(m.key,m.path)}finally{scene.load.maxRetries=retries}}
