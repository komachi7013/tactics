import { describe, expect, it } from 'vitest';
import { getBattleConfig } from '../src/domain/battles';
import { canCollect, createInitialState } from '../src/domain/engine';
import type { BattleId } from '../src/domain/types';
import { battleObjectiveCopy } from '../src/view/battleObjectiveCopy';

const battles: BattleId[] = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12'];

describe('battle objective presentation contract', () => {
  it('connects B01 record markers, names, actions and positions without inventing a roster collectible', () => {
    const copy = battleObjectiveCopy('B01');
    expect(copy.records).toEqual([
      { id: 'A', name: '水位記録A', marker: '水位記録A', position: { x: 2, y: 2 }, actionLabel: '水位記録Aを採取', optional: false },
      { id: 'B', name: '水位記録B', marker: '水位記録B', position: { x: 7, y: 5 }, actionLabel: '水位記録Bを採取', optional: false },
    ]);
    expect(copy.legend.join(' ')).toContain('水位記録A(2,2)');
    expect(copy.legend.join(' ')).toContain('水位記録B(7,5)');
    expect(copy.storyBridge).toContain('味方の誰が採取しても');
    expect(copy.records.some(record => record.name.includes('名簿'))).toBe(false);
  });

  it('states an explicit collect action, Lise-only exit and optional immediate gate effect', () => {
    const copy = battleObjectiveCopy('B01');
    expect(copy.steps.join(' ')).toContain('立つだけでは取得できません');
    expect(copy.steps.join(' ')).toContain('高さ差1以内');
    expect(copy.steps.join(' ')).toContain('各1行動');
    expect(copy.steps.join(' ')).toContain('生存するリセ');
    expect(copy.steps.join(' ')).toContain('順不同');
    expect(copy.exitMarker).toBe('脱出（リセ）');
    expect(copy.gateMarker).toBe('水門（任意）');
    expect(copy.legend.join(' ')).toContain('その場で排水');
    expect(copy.legend.join(' ')).toContain('浅瀬適性は1のまま');
  });

  it('matches the stated B01 collection conditions against the actual rules', () => {
    const state = createInitialState('B01');
    const garan = state.units.find(unit => unit.id === 'ally-garan')!;
    state.activeId = garan.id;
    garan.pos = { x: 1, y: 2 };
    state.cells.find(cell => cell.x === 1 && cell.y === 2)!.height = 0;
    state.cells.find(cell => cell.x === 2 && cell.y === 2)!.height = 0;
    expect(canCollect(state, 'A')).toBe(true); // Not restricted to Lise.
    garan.pos = { x: 2, y: 2 };
    expect(canCollect(state, 'A')).toBe(false); // Standing on the marker is insufficient.
    garan.pos = { x: 1, y: 1 };
    expect(canCollect(state, 'A')).toBe(false); // Diagonal is not adjacency.
    garan.pos = { x: 1, y: 2 };
    state.cells.find(cell => cell.x === 1 && cell.y === 2)!.height = 2;
    expect(canCollect(state, 'A')).toBe(false);
    state.cells.find(cell => cell.x === 1 && cell.y === 2)!.height = 0;
    state.activation.acted = true;
    expect(canCollect(state, 'A')).toBe(false);
  });

  it('keeps all twelve stage definitions and non-B01 procedures unchanged', () => {
    for (const id of battles) {
      const before = getBattleConfig(id), copy = battleObjectiveCopy(id);
      expect(getBattleConfig(id)).toEqual(before);
      expect(copy.records.map(record => [record.id, record.name, record.position, record.optional])).toEqual(
        before.records.map(record => [record.id, record.name, { x: record.x, y: record.y }, record.optional === true]),
      );
      if (id !== 'B01') {
        expect(copy.summary).toBe(before.intro);
        expect(copy.steps).toEqual([]);
        expect(copy.legend).toEqual([]);
        expect(copy.storyBridge).toBeNull();
      }
    }
  });

  it('does not attach an exit requirement to control/hold stages and preserves optional evidence', () => {
    for (const id of ['B04', 'B08', 'B10', 'B12'] as BattleId[]) expect(battleObjectiveCopy(id).exitMarker).toBeNull();
    expect(battleObjectiveCopy('B05').records.find(record => record.id === 'K')!.optional).toBe(true);
    expect(battleObjectiveCopy('B05').records.filter(record => !record.optional).map(record => record.id)).toEqual(['D', 'T', 'S']);
  });
});
