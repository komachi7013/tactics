import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ATTACK_BODIES } from '../src/view/dedicatedAttack';
describe('shipped dedicated body contract',()=>{
 it('contains complete four-frame288px sheets and provenance with the approved origin',()=>{
  for(const body of Object.values(ATTACK_BODIES)){
   const png=fs.readFileSync('public'+body.path);
   expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(16)).toBe(576);expect(png.readUInt32BE(20)).toBe(576);
   expect(body.displaySize/body.cell).toBe(80/256);
   const provenance=JSON.parse(fs.readFileSync('public'+(body.path.includes('/attacks-v1/') ? body.path.replace('attack-e.png','source-contract.json') : body.path.replace('.png','.json')),'utf8'));
   expect(body.originY).toBeCloseTo(provenance.paddedOriginPx[1]/288,5);expect(provenance.pixelsUnchangedByPadding).toBe(true);
  }
 });
});
