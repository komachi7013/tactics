import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/domain/engine';
import { readOrderRows, ReadOrderUpdates, type ReadOrderSnapshot } from '../src/view/readOrder';

function fixture() {
  const state = createInitialState('B01');
  const enemies = state.units.filter(u => u.team === 'enemy');
  state.readOrders = [enemies[0].id];
  const ally = state.units.find(u => u.team === 'player')!;
  const snapshot: ReadOrderSnapshot = { byActor: {
    [enemies[0].id]: { actorId: enemies[0].id, destination: { x: 3, y: 2 }, path: [{ x: 2, y: 2 }, { x: 3, y: 2 }], targetId: ally.id, damage: 5, action: 'attack', moveCost: 1 },
  }, next: undefined };
  return { state, enemies, ally, snapshot };
}
describe('read order conditional view', () => {
  it('shows the marked local destination, path and current damage without disclosing an unread global actor', () => {
    const { state, enemies, ally, snapshot } = fixture();
    snapshot.next = { actorId: enemies[1].id, destination: { x: 8, y: 7 }, path: [], damage: 99, action: 'attack', moveCost: 3 };
    const before = JSON.stringify(state);
    const rows = readOrderRows(state, snapshot);
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toContain('(3,2)へ移動（費用1）');
    expect(rows[0].detail).toContain('(2,2) → (3,2)');
    expect(rows[0].detail).toContain(`${ally.name}を攻撃・現在の予測 5 ダメージ`);
    expect(rows[0].relation).toBe('今の全体評価では別の敵が先候補');
    expect(JSON.stringify(rows)).not.toContain(enemies[1].id);
    expect(JSON.stringify(rows)).not.toContain('99');
    expect(JSON.stringify(rows)).not.toContain('(8,7)');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('labels an already acted enemy as a next-round conditional local plan even if snapshot is malformed as global next', () => {
    const { state, enemies, snapshot } = fixture();
    enemies[0].acted = true; snapshot.next = snapshot.byActor[enemies[0].id];
    expect(readOrderRows(state, snapshot)[0].relation).toContain('今R行動済・全体選出対象外（次R以降の仮候補）');
  });
  it('distinguishes marked global selection, stationary defense and unavailable candidate', () => {
    const { state, enemies, snapshot } = fixture();
    snapshot.byActor[enemies[0].id] = { actorId: enemies[0].id, destination: enemies[0].pos, path: [], action: 'defend', moveCost: 0 };
    snapshot.next = snapshot.byActor[enemies[0].id];
    const row = readOrderRows(state, snapshot)[0];
    expect(row.relation).toBe('今敵が応手するなら、この敵が選出候補');
    expect(row.detail).toContain('移動なし → 防御');
    delete snapshot.byActor[enemies[0].id]; snapshot.next = undefined;
    expect(readOrderRows(state, snapshot)[0].detail).toBe('現在の盤面に合法な候補なし');
    expect(readOrderRows(state, snapshot)[0].relation).toBe('現在の全体評価に選出候補なし');
  });
  it('keeps multiple marks after Dani retreats and excludes dead or invalid targets', () => {
    const { state, enemies, snapshot } = fixture();
    state.readOrders!.push(enemies[1].id, 'missing');
    expect(readOrderRows(state, snapshot)).toHaveLength(2);
    enemies[0].hp = 0;
    expect(readOrderRows(state, snapshot).map(row => row.id)).toEqual([enemies[1].id]);
  });
  it('announces only changes in existing settled candidates and permits a fresh battle with the same IDs', () => {
    const { state, enemies, snapshot } = fixture();
    const tracker = new ReadOrderUpdates();
    const original = readOrderRows(state, snapshot);
    expect(tracker.observe(original)).toBe('');
    expect(tracker.observe(readOrderRows(state, snapshot))).toBe('');
    snapshot.byActor[enemies[0].id].damage = 3;
    expect(tracker.observe(readOrderRows(state, snapshot))).toBe(`読令の候補更新 1: ${enemies[0].name}`);
    expect(tracker.observe(readOrderRows(state, snapshot))).toBe('');
    snapshot.byActor[enemies[0].id].damage = 2;
    expect(tracker.observe(readOrderRows(state, snapshot))).toBe(`読令の候補更新 2: ${enemies[0].name}`);
    tracker.clear(); expect(tracker.observe(original)).toBe('');
  });
});
