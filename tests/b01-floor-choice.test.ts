import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/domain/engine';
import { b01OverlappingFloors, b01Projection, b01FloorsAtPoint } from '../src/view/b01Landscape';
describe('B01 overlapping floor selection', () => {
  it('exposes both floors for every ambiguous projected center without modifying state', () => {
    const state = createInitialState('B01'), before = JSON.stringify(state);
    const projection = b01Projection(1090, 794);
    const groups = new Map<string, typeof state.cells>();
    for (const c of state.cells) {
      const p = projection.project(c, c.height), key = `${p.x},${p.y}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    const ambiguous = [...groups.values()].filter(g => g.length > 1);
    expect(ambiguous).toHaveLength(3);
    for (const group of ambiguous) for (const floor of group) {
      expect(b01OverlappingFloors(state.cells, floor)).toEqual([...group].sort((a,b) => a.height - b.height));
    }
    expect(JSON.stringify(state)).toBe(before);
  });
  it('includes every logical floor when a higher surface or actor can intercept its center', () => {
    const { cells } = createInitialState('B01');
    for (const c of cells) {
      const point = { x: 730 + (c.x - c.y) * 60, y: 270 + (c.x + c.y - c.height) * 30 };
      expect(b01FloorsAtPoint(cells, point)).toContainEqual(c);
    }
  });
  it('does not introduce a floor choice for ordinary cells or missing positions', () => {
    const { cells } = createInitialState('B01');
    expect(b01OverlappingFloors(cells, {x:0,y:5})).toHaveLength(1);
    expect(b01OverlappingFloors(cells, {x:-1,y:0})).toEqual([]);
  });
});
