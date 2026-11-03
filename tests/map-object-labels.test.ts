import { describe, expect, it } from 'vitest';
import { estimateMapLabelSize, mapLabelOverlap, mapLabelPeopleBounds, placeMapObjectLabel, type MapLabelRect } from '../src/view/mapObjectLabels';
import { mapObjectPlacements } from '../src/view/mapObjectAssets';
import { registeredLandscape } from '../src/view/registeredLandscape';
import { registeredProjection } from '../src/view/registeredProjection';
import { b01Projection } from '../src/view/b01Landscape';
import { createPartyBattle } from '../src/party';
import { BATTLE_IDS, defaultParty } from '../src/progression';
import type { BattleId, BattleState } from '../src/domain/types';

function layout(id: BattleId, width: number, height: number, prepare: (state: BattleState) => void = () => {}) {
  const state = createPartyBattle(id, defaultParty(id)); prepare(state); const before = structuredClone(state);
  const registered = registeredLandscape(id);
  const camera = registered ? registeredProjection(width, height, registered.registration) : b01Projection(width, height);
  const people = mapLabelPeopleBounds(state, camera.project, camera.scale), occupied: MapLabelRect[] = [];
  const labels = mapObjectPlacements(state).sort((a, b) => a.pos.x + a.pos.y - b.pos.x - b.pos.y || a.pos.x - b.pos.x).map(row => {
    const cell = state.cells.find(cell => cell.x === row.pos.x && cell.y === row.pos.y)!;
    const anchor = camera.project(row.pos, cell.height), size = estimateMapLabelSize(row.label, Math.max(12, 11 * camera.scale), Math.min(210, Math.max(40, width - 16)));
    const placed = placeMapObjectLabel({ anchor, ...size, canvasWidth: width, canvasHeight: height, people, occupied, clearance: 22 * camera.scale });
    occupied.push(placed.rect); return { id: row.id, label: row.label, anchor, ...placed };
  });
  expect(state).toEqual(before);
  return { labels, people };
}

describe('map object label lanes', () => {
  it.each([[1000, 650], [360, 420]])('separates B03 name register and adjacent equipment at %ix%i without moving their cells', (width, height) => {
    const { labels, people } = layout('B03', width, height), record = labels.find(row => row.id === 'record:M')!, chest = labels.find(row => row.id === 'chest:B03')!;
    expect(Math.hypot(record.anchor.x - chest.anchor.x, record.anchor.y - chest.anchor.y)).toBeLessThan(60);
    expect(record.label).toContain('M'); expect(chest.label).toContain('装備箱');
    expect(mapLabelOverlap(record.rect, chest.rect)).toBe(0);
    for (const row of [record, chest]) {
      expect(row.collisionFree).toBe(true);
      for (const person of people) expect(mapLabelOverlap(row.rect, person)).toBe(0);
    }
  });
  it.each(['B08', 'B12'] as const)('%s long equipment labels avoid initial people and remain inside normal and narrow canvases', id => {
    for (const [width, height] of [[1000, 650], [360, 420]]) {
      const { labels, people } = layout(id, width, height);
      for (const row of labels) {
        expect(row.collisionFree, `${id} ${row.id} ${width}`).toBe(true);
        expect(row.rect.x).toBeGreaterThanOrEqual(7); expect(row.rect.y).toBeGreaterThanOrEqual(7);
        expect(row.rect.x + row.rect.width).toBeLessThanOrEqual(width - 7);
        expect(row.rect.y + row.rect.height).toBeLessThanOrEqual(height - 7);
        for (const person of people) expect(mapLabelOverlap(row.rect, person), row.id).toBe(0);
      }
    }
  });
  it('keeps all twelve initial maps deterministic and their marker text intact', () => {
    for (const id of BATTLE_IDS) {
      const first = layout(id, 1000, 650), second = layout(id, 1000, 650);
      expect(first).toEqual(second);
      for (let i = 0; i < first.labels.length; i++) for (let j = 0; j < i; j++) expect(mapLabelOverlap(first.labels[i].rect, first.labels[j].rect), `${id} ${i}/${j}`).toBe(0);
    }
  });
  it('keeps longer drain reservations and occupied console state text readable on a narrow map', () => {
    for (const id of ['B08', 'B12'] as const) {
      const { labels, people } = layout(id, 360, 420, state => {
        if (id === 'B08') {
          state.sluices!.N = { drained: true, pendingRound: 3, pendingDrained: false };
          state.sluices!.S = { drained: false, pendingRound: 3, pendingDrained: true };
        } else {
          state.units.find(unit => unit.id === 'ally-lise')!.pos = { ...mapObjectPlacements(state).find(row => row.id === 'control:A')!.pos };
          state.finalControl!.heldRounds = 1;
        }
      });
      for (const row of labels) {
        expect(row.collisionFree, `${id} ${row.id}`).toBe(true);
        for (const person of people) expect(mapLabelOverlap(row.rect, person), row.id).toBe(0);
      }
      expect(labels.some(row => row.label.includes(id === 'B08' ? 'R3再入水予約' : 'リセ 占有中 / 共有保持1/2R'))).toBe(true);
    }
  });
  it('wraps long CJK and state lines without dropping the source text or clipping its bounds', () => {
    const source = '北分散操作台 A (5,9)\nネイア 占有中 / 共有保持1/2R';
    const size = estimateMapLabelSize(source, 11, 150);
    expect(size.width).toBeLessThanOrEqual(150); expect(size.height).toBeGreaterThan(30);
    const placed = placeMapObjectLabel({ anchor: { x: 315, y: 230 }, ...size, canvasWidth: 320, canvasHeight: 240, occupied: [], people: [], clearance: 12 });
    expect(placed.rect.x + placed.rect.width).toBeLessThanOrEqual(313);
    expect(placed.rect.y + placed.rect.height).toBeLessThanOrEqual(233);
    expect(source).toBe('北分散操作台 A (5,9)\nネイア 占有中 / 共有保持1/2R');
  });
});
