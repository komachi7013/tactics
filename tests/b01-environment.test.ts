import { describe, expect, it } from 'vitest';
import { createInitialState, lineOfSight } from '../src/domain/engine';
import { B01_ENVIRONMENT } from '../src/view/b01Environment';
describe('B01 visual environment registration', () => {
  it('keeps every drainage grate on existing walkable dry ground', () => {
    const state=createInitialState('B01'),before=JSON.stringify(state);
    const cell=(p:{x:number;y:number})=>state.cells.find(c=>c.x===p.x&&c.y===p.y)!;
    for(const p of B01_ENVIRONMENT.grates)expect(cell(p)).toMatchObject({height:0,blocked:false,shallow:false});
    expect(state.cells.filter(c=>c.shallow)).toHaveLength(8);
    expect(lineOfSight(state,{x:0,y:3},{x:4,y:3})).toBe(true);
    expect(lineOfSight(state,{x:0,y:4},{x:4,y:4})).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });
});
