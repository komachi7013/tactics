import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ATTACK_BODIES } from '../src/view/dedicatedAttack';
describe('shipped dedicated body contract',()=>{
 it('contains complete four-frame288px sheets and provenance with the approved origin',()=>{
  expect(Object.keys(ATTACK_BODIES)).toHaveLength(36);
  for(const body of Object.values(ATTACK_BODIES)){
   const png=fs.readFileSync('public'+body.path);
   expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(16)).toBe(576);expect(png.readUInt32BE(20)).toBe(576);
   const provenance=JSON.parse(fs.readFileSync('public'+body.path.replace('.png','.json'),'utf8'));
   if ('castId' in body) {
    expect(provenance).toMatchObject({ actor: body.castId, direction: body.direction, weapon: body.weapon, frames: 4, frameMs: 100, referenceHeightPx: body.referenceHeight });
    expect(body.originY).toBe(provenance.anchor[1] / body.cell);
    expect(provenance.sheetSha256).toBe(createHash('sha256').update(png).digest('hex'));
   } else {
    expect(body.displaySize/body.cell).toBe(80/256);
    expect(body.originY).toBeCloseTo(provenance.paddedOriginPx[1]/288,5);
    expect(provenance.pixelsUnchangedByPadding).toBe(true);
   }
  }
 });
});
