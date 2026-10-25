import{describe,it,expect,vi}from'vitest';import type Phaser from'phaser';import{prepareRegisteredParts,REGISTERED_B03}from'../src/view/registeredLandscape';
describe('registered scene material failure recovery',()=>{
 it('removes partially prepared critical textures before a later draw retries',()=>{
  const keys=new Set([REGISTERED_B03.key,REGISTERED_B03.key+'-insert']);let fail=true;
  const remove=vi.fn((key:string)=>keys.delete(key)),createCanvas=vi.fn((key:string)=>{keys.add(key);return{getContext:()=>new Proxy({},{get:()=>vi.fn()}),refresh:()=>{if(fail&&key.endsWith('-facade'))throw Error('upload failed')}}});
  const scene={textures:{exists:(key:string)=>keys.has(key),get:()=>({getSourceImage:()=>({})}),createCanvas,remove}}as unknown as Phaser.Scene;
  expect(()=>prepareRegisteredParts(scene,REGISTERED_B03)).toThrow('upload failed');expect([...keys]).toEqual([REGISTERED_B03.key,REGISTERED_B03.key+'-insert']);expect(remove.mock.calls.map(c=>c[0])).toEqual([REGISTERED_B03.key+'-room',REGISTERED_B03.key+'-facade']);
  fail=false;const parts=prepareRegisteredParts(scene,REGISTERED_B03);expect(parts).toHaveLength(3);for(const p of parts)expect(keys.has(p.key)).toBe(true);
  const count=createCanvas.mock.calls.length;prepareRegisteredParts(scene,REGISTERED_B03);expect(createCanvas).toHaveBeenCalledTimes(count);
 });
});
