import { describe, expect, it } from 'vitest';
import { readPaintedObjectMasks } from '../src/view/paintedObjectMasks';
import { mapObjectPlacements, mapObjectUsesPaintedArt } from '../src/view/mapObjectAssets';
import { createInitialState } from '../src/domain/engine';

// Synthetic registration fixture. These bounds do not claim acceptance of imagegen masks.
const rows = [
  ['B06', 'gate', 'b06-gate'], ['B08', 'sluice:N', 'b08-n'], ['B08', 'sluice:S', 'b08-s'],
  ['B10', 'gate', 'b10-gate'], ['B11', 'repair:A', 'b11-a'], ['B11', 'repair:B', 'b11-b'],
  ['B12', 'control:A', 'b12-a'], ['B12', 'control:B', 'b12-b'],
].map(([battleId, objectId, name], index) => ({ battleId, objectId, key: 'painted-mask-' + name,
  path: `/assets/stages/${battleId.toLowerCase()}/masks/${name}.png`, bounds: [100 + index * 10, 150, 180 + index * 10, 220] }));

describe('painted equipment source-coordinate registration', () => {
  it('registers exactly the eight existing painted targets without changing state or interpreting bounds as anchors', () => {
    const source = structuredClone(rows), parsed = readPaintedObjectMasks({ masks: source });
    expect(parsed.issues).toEqual([]); expect(parsed.masks).toHaveLength(8);
    expect(new Set(parsed.masks.map(row => row.key)).size).toBe(8);
    for (const mask of parsed.masks) {
      const state = createInitialState(mask.battleId), before = structuredClone(state);
      const target = mapObjectPlacements(state).find(row => row.id === mask.objectId)!;
      expect(target).toBeDefined(); expect(mapObjectUsesPaintedArt(mask.battleId, target.kind)).toBe(true);
      expect(mask.bounds[2] - mask.bounds[0]).toBe(80); expect(mask.bounds[3] - mask.bounds[1]).toBe(70);
      expect(state).toEqual(before);
    }
    expect(source).toEqual(rows); expect(readPaintedObjectMasks(rows).masks).toEqual(parsed.masks);
  });
  it('rejects wrong equipment identity, wrong path, bad crop extents and duplicate keys nonfatally', () => {
    for (const bad of [
      { ...rows[0], battleId: 'B01' }, { ...rows[0], objectId: 'exit' },
      { ...rows[0], path: '/assets/common/gate/gate.png' }, { ...rows[0], bounds: [0, 0, 1537, 100] },
      { ...rows[0], bounds: [50, 20, 49, 40] }, { ...rows[0], bounds: [-1, 0, 40, 40] },
    ]) {
      const result = readPaintedObjectMasks([bad]); expect(result.masks).toEqual([]); expect(result.issues).toHaveLength(1);
    }
    const duplicate = readPaintedObjectMasks([rows[0], rows[0], { ...rows[1], key: rows[0].key }]);
    expect(duplicate.masks).toHaveLength(1); expect(duplicate.issues).toHaveLength(2);
    expect(readPaintedObjectMasks(undefined).masks).toEqual([]); expect(readPaintedObjectMasks(undefined).issues).toHaveLength(1);
  });
});
