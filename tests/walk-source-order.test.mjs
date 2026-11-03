import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {CAST_WALK} from '../src/view/castMotion';

describe('standing-derived walk timing and source order',()=>{
 it('retains 19 distinct chronological source frames and the complete 800ms cycle for all48 directions',()=>{
  for(const directions of Object.values(CAST_WALK))for(const asset of Object.values(directions)){
   const file=resolve(process.cwd(),'public'+asset.path);
   const metadata=JSON.parse(readFileSync(file.replace(/\.png$/,'.json'),'utf8'));
   expect(metadata.sourceIndices).toHaveLength(19);
   for(let i=1;i<19;i++)expect(metadata.sourceIndices[i]).toBeGreaterThan(metadata.sourceIndices[i-1]);
   expect(metadata.durationsMs).toHaveLength(19);
   expect(metadata.durationsMs.reduce((a,b)=>a+b,0)).toBe(800);
   expect(asset.frames).toBe(19);expect(asset.cycleMs).toBe(800);expect(asset.tilesPerCycle).toBe(4);
   const png=readFileSync(file);
   expect(png.readUInt32BE(16)).toBe(5*asset.cell);
   expect(png.readUInt32BE(20)).toBe(4*asset.cell);
   expect(metadata.sheetSha256).toBe(createHash('sha256').update(png).digest('hex'));
  }
 });
 it('uses the current standing-derived outputs and retains alternating contact annotations',()=>{
  for(const directions of Object.values(CAST_WALK))for(const asset of Object.values(directions)){
   expect(asset.path).toContain('/walk-standing-v1/');
   const metadata=JSON.parse(readFileSync(resolve(process.cwd(),'public'+asset.path.replace(/\.png$/,'.json')),'utf8'));
   expect(metadata.contactReview.visualReviewed).toBe(true);
   const contacts=metadata.contactReview.contacts;
   expect(contacts).toHaveLength(3);
   expect(contacts[0].foot).not.toBe(contacts[1].foot);
   expect(contacts[0].foot).toBe(contacts[2].foot);
   expect(contacts[0].frame).toBeLessThan(contacts[1].frame);
   expect(contacts[1].frame).toBeLessThan(contacts[2].frame);
  }
 });
});
