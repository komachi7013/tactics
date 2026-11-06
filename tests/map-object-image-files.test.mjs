import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP_OBJECT_ASSETS } from '../src/view/mapObjectAssets';

describe('map object bitmap delivery', () => {
  it('ships every referenced PNG with RGBA alpha and retains the existing valve path', () => {
    for (const entry of Object.values(MAP_OBJECT_ASSETS)) {
      const file = resolve('public', entry.path.slice(1));
      expect(existsSync(file), entry.path).toBe(true);
      const png = readFileSync(file);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png[25]).toBe(6);
      expect(entry.width).toBeLessThanOrEqual(76);
      expect(entry.height).toBeLessThanOrEqual(76);
    }
    expect(MAP_OBJECT_ASSETS.valve.path).toBe('/assets/common/gate/gate.png');
  });
});
