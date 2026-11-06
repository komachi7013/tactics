import { expect, it } from 'vitest';
import { createInitialState, getCell, getUnit, reduce } from '../src/domain/engine';
import { registeredFloors, REGISTERED_B06 } from '../src/view/registeredLandscape';

it('lets a unit move onto a debug-opened bridge-side cell and restores the default on reset', () => {
  const initial = createInitialState('B06');
  getUnit(initial, 'ally-lise')!.pos = { x: 8, y: 6 };
  const { state } = reduce(initial, { type: 'start', unitId: 'ally-lise' });
  const to = { x: 8, y: 5 };
  const cell = getCell(state, to)!;
  const move = { type: 'move', to } as const;
  expect(reduce(state, move).error).toBeTruthy();

  cell.debugBlocked = false;
  expect(registeredFloors(REGISTERED_B06, state.cells)).toContain(cell);
  const moved = reduce(state, move);
  expect(moved.error).toBeUndefined();
  expect(getUnit(moved.state, 'ally-lise')!.pos).toEqual(to);
  expect(getCell(moved.state, to)!.blocked).toBe(true);

  delete cell.debugBlocked;
  expect(reduce(state, move).error).toBeTruthy();

  const bridge = { x: 8, y: 7 };
  expect(reduce(state, { type: 'move', to: bridge }).error).toBeUndefined();
  getCell(state, bridge)!.debugBlocked = true;
  expect(reduce(state, { type: 'move', to: bridge }).error).toBeTruthy();
});
