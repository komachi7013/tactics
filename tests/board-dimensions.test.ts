import { afterEach, describe, expect, it, vi } from 'vitest';
import * as battles from '../src/domain/battles';
import { createInitialState, getCell } from '../src/domain/engine';
afterEach(() => vi.restoreAllMocks());
describe('configured board extents', () => {
  it.each([[24,16],[12,24]])('builds the entire configured %i by %i board without phantom UI cells', (width,height) => {
    const baseline = createInitialState('B01'), config = battles.getBattleConfig('B01');
    vi.spyOn(battles,'getBattleConfig').mockReturnValue({...config,width,height});
    const expanded = createInitialState('B01');
    expect(expanded.cells).toHaveLength(width*height);
    expect(new Set(expanded.cells.map(c=>`${c.x},${c.y}`)).size).toBe(width*height);
    expect(getCell(expanded,{x:width-1,y:height-1})).toMatchObject({x:width-1,y:height-1});
    expect(getCell(expanded,{x:width,y:height-1})).toBeUndefined();
    expect(expanded.cells.filter(c=>c.x<10&&c.y<8)).toEqual(baseline.cells);
    expect(expanded.units).toEqual(baseline.units);
  });
});
