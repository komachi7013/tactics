import { describe, expect, it } from 'vitest';
import { MapObjectOutlines, objectOutlinePixels } from '../src/view/mapObjectOutline';

function texturePort(failure: 'read' | 'refresh' | null = null) {
  const source = { width: 16, height: 16 }, original = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) original.set([85, 111, 37, 255], (y * 16 + x) * 4);
  const keys = new Set(['prop']), frames: { key: string; width: number; height: number; pixels?: Uint8ClampedArray }[] = [];
  let refreshed = 0;
  return { original, keys, frames, refreshes: () => refreshed,
    exists: (key: string) => keys.has(key),
    get: (_key: string) => ({ getSourceImage: () => source }),
    remove: (key: string) => { keys.delete(key); },
    createCanvas: (key: string, width: number, height: number) => {
      if (keys.has(key)) return null;
      const frame: typeof frames[number] = { key, width, height }; frames.push(frame); keys.add(key);
      return { getContext: () => ({ drawImage: () => {},
        getImageData: () => { if (failure === 'read') throw new Error('readback denied'); return { data: original.slice() }; },
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (data: ImageData) => { frame.pixels = data.data.slice(); },
      }) as unknown as CanvasRenderingContext2D,
      refresh: () => { if (failure === 'refresh') throw new Error('upload failed'); refreshed++; } };
    },
  };
}

describe('alpha-derived object outlines', () => {
  it('follows disconnected source alpha rather than a rectangle and keeps original interior empty', () => {
    const alpha = new Uint8Array(11 * 11); alpha[3 * 11 + 3] = 255; alpha[7 * 11 + 7] = 255;
    alpha[0] = 30; const before = alpha.slice(), result = objectOutlinePixels(alpha, 11, 11, 2, 1);
    const rgba = (x: number, y: number) => [...result.pixels.slice(((y + result.padding) * result.width + x + result.padding) * 4, ((y + result.padding) * result.width + x + result.padding) * 4 + 4)];
    expect(rgba(3, 3)).toEqual([0, 0, 0, 0]); expect(rgba(7, 7)).toEqual([0, 0, 0, 0]);
    expect(rgba(3, 2)).toEqual([255, 255, 255, 255]); expect(rgba(3, 1)).toEqual([12, 25, 27, 255]);
    expect(rgba(1, 1)).toEqual([0, 0, 0, 0]); expect(rgba(0, 0)).toEqual([0, 0, 0, 0]);
    expect(rgba(5, 5)).toEqual([0, 0, 0, 0]); expect(alpha).toEqual(before);
  });
  it('pads edge pixels without clipping and rejects invalid masks', () => {
    const result = objectOutlinePixels(Uint8Array.of(255), 1, 1, 3, 2);
    const alphaAt = (x: number, y: number) => result.pixels[(y * result.width + x) * 4 + 3];
    expect(alphaAt(result.padding - 3, result.padding)).toBe(255);
    expect(alphaAt(result.padding, result.padding + 3)).toBe(255);
    expect(alphaAt(0, 0)).toBe(0); expect(alphaAt(result.padding, result.padding)).toBe(0);
    expect(() => objectOutlinePixels(new Uint8Array(2), 1, 1, 3, 2)).toThrow();
    expect(() => objectOutlinePixels(Uint8Array.of(255), 1, 1, 2, 3)).toThrow();
  });
  it('preserves source color and anchor, caches one canvas per prop, and uploads once for WebGL', () => {
    const textures = texturePort(), cache = new MapObjectOutlines(), before = textures.original.slice();
    const asset = { key: 'prop', width: 16, height: 16, originX: .5, originY: .90625 };
    const first = cache.prepare(textures, asset, 1)!;
    expect(textures.original).toEqual(before); expect(textures.refreshes()).toBe(1);
    expect(textures.frames[0].pixels?.some(v => v > 0)).toBe(true);
    const padding = (textures.frames[0].width - 16) / 2;
    expect(-first.originX * first.width + padding).toBeCloseTo(-asset.originX * asset.width);
    expect(-first.originY * first.height + padding).toBeCloseTo(-asset.originY * asset.height);
    // A tiny resize reuses pixel radii but still recalculates display geometry.
    const next = cache.prepare(textures, asset, 1.01)!;
    expect(next.key).toBe(first.key); expect(next.width).toBeCloseTo(first.width * 1.01);
    expect(textures.refreshes()).toBe(1);
    const smaller = cache.prepare(textures, asset, .5)!;
    expect(smaller.key).not.toBe(first.key); expect(textures.keys.has(first.key)).toBe(false);
    expect(textures.keys.size).toBe(2); // Original PNG plus exactly one runtime canvas.
    cache.clear(textures); expect([...textures.keys]).toEqual(['prop']);
  });
  it.each(['read', 'refresh'] as const)('cleans up a failed %s derivative and leaves the original ready for normal drawing', failure => {
    const textures = texturePort(failure), cache = new MapObjectOutlines();
    expect(() => cache.prepare(textures, { key: 'prop', width: 16, height: 16, originX: .5, originY: .9 }, 1)).toThrow();
    expect([...textures.keys]).toEqual(['prop']); cache.clear(textures); expect([...textures.keys]).toEqual(['prop']);
  });
});
