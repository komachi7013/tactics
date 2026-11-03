import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { PAINTED_OBJECT_MASKS, PAINTED_MASK_ISSUES } from '../src/view/paintedObjectMasks';

function rgbaPixels(png) {
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  expect(png[24]).toBe(8); expect(png[25]).toBe(6); expect(png[28]).toBe(0);
  const idat = []; let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset), kind = png.subarray(offset + 4, offset + 8).toString();
    if (kind === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const scan = inflateSync(Buffer.concat(idat)), stride = width * 4, pixels = new Uint8Array(width * height * 4);
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = scan[y * (stride + 1)]; expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0, up = y ? pixels[(y - 1) * stride + x] : 0;
      const diagonal = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][filter];
      pixels[y * stride + x] = (scan[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

describe('shipped painted-equipment candidate masks, separate from visual acceptance', () => {
  it('ships exactly eight registered, tight, binary white alpha masks with matching hashes and source dimensions', () => {
    expect(PAINTED_MASK_ISSUES).toEqual([]); expect(PAINTED_OBJECT_MASKS).toHaveLength(8);
    const metadata = JSON.parse(readFileSync('public/assets/map-object-masks-v1/metadata.json', 'utf8'));
    for (const mask of PAINTED_OBJECT_MASKS) {
      const file = readFileSync(resolve('public', mask.path.slice(1))), decoded = rgbaPixels(file);
      expect(decoded.width).toBe(mask.bounds[2] - mask.bounds[0]); expect(decoded.height).toBe(mask.bounds[3] - mask.bounds[1]);
      const alpha = [], xs = [], ys = [];
      for (let i = 0; i < decoded.pixels.length; i += 4) {
        const a = decoded.pixels[i + 3]; alpha.push(a); expect(a === 0 || a === 255).toBe(true);
        if (a) { expect([...decoded.pixels.slice(i, i + 3)]).toEqual([255, 255, 255]); xs.push((i / 4) % decoded.width); ys.push(Math.floor(i / 4 / decoded.width)); }
      }
      expect(alpha).toContain(0); expect(xs.length).toBeGreaterThan(0);
      expect(Math.min(...xs)).toBe(0); expect(Math.max(...xs)).toBe(decoded.width - 1);
      expect(Math.min(...ys)).toBe(0); expect(Math.max(...ys)).toBe(decoded.height - 1);
      const entry = metadata.masks.find(row => row.key === mask.key);
      expect(createHash('sha256').update(file).digest('hex')).toBe(entry.maskSha256);
      const source = readFileSync(resolve('public/assets', entry.sourceBackground));
      expect([source.readUInt32BE(16), source.readUInt32BE(20)]).toEqual(entry.source);
    }
  });
});
