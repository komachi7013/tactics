import { getBattleConfig } from '../domain/battles';
import type { BattleState, Pos } from '../domain/types';

export interface MapLabelRect { x: number; y: number; width: number; height: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function mapLabelOverlap(a: MapLabelRect, b: MapLabelRect, gap = 4): number {
  return Math.max(0, Math.min(a.x + a.width + gap, b.x + b.width) - Math.max(a.x - gap, b.x))
    * Math.max(0, Math.min(a.y + a.height + gap, b.y + b.height) - Math.max(a.y - gap, b.y));
}

/** Include the always-visible HP strip, body, feet and name; never move the actor. */
export function mapLabelPeopleBounds(state: BattleState, project: (pos: Pos, height: number) => Pos, scale: number, movingFeet: readonly Pos[] = []): MapLabelRect[] {
  const config = getBattleConfig(state.battleId);
  const positions = [...state.units.filter(unit => unit.hp > 0).map(unit => unit.pos), ...movingFeet];
  if (config.objective === 'repair' || config.objective === 'evacuate') positions.push(...config.records.filter(record => !state.records.includes(record.id)));
  return positions.map(pos => {
    const height = state.cells.find(cell => cell.x === pos.x && cell.y === pos.y)?.height ?? 0;
    const foot = project(pos, height);
    return { x: foot.x - 34 * scale, y: foot.y - 108 * scale, width: 68 * scale, height: 138 * scale };
  });
}

/** A fallback for non-rendering tests; Phaser text's real wrapped dimensions win in-game. */
export function estimateMapLabelSize(value: string, fontSize: number, maxWidth: number): { width: number; height: number } {
  let rows = 0, widest = 0;
  for (const line of value.split('\n')) {
    let width = 0; rows++;
    for (const char of line) {
      const next = /[\x00-\x7f]/.test(char) ? fontSize * .62 : fontSize;
      if (width && width + next > maxWidth - 8) { widest = Math.max(widest, width); rows++; width = 0; }
      width += next;
    }
    widest = Math.max(widest, width);
  }
  return { width: Math.min(maxWidth, widest + 8), height: rows * (fontSize + 3) + 4 };
}

/** Greedy nearest-free placement. Only label rectangles and leader endpoints are returned. */
export function placeMapObjectLabel(input: {
  anchor: Pos; width: number; height: number; canvasWidth: number; canvasHeight: number;
  occupied: readonly MapLabelRect[]; people: readonly MapLabelRect[]; clearance: number;
}): { rect: MapLabelRect; center: Pos; leaderEnd: Pos; collisionFree: boolean } {
  const { anchor, occupied, people } = input, margin = 7, gap = 6;
  const width = Math.min(input.width, Math.max(1, input.canvasWidth - margin * 2));
  const height = Math.min(input.height, Math.max(1, input.canvasHeight - margin * 2));
  const preferred = { x: anchor.x, y: anchor.y + height / 2 + gap + 2 };
  const candidates: Pos[] = [preferred];
  for (let ring = 1; ring <= 6; ring++) {
    const dx = (width / 2 + input.clearance + gap) * ring, dy = (height + gap) * ring;
    candidates.push({ x: anchor.x - dx, y: preferred.y }, { x: anchor.x + dx, y: preferred.y },
      { x: anchor.x, y: preferred.y + dy }, { x: anchor.x, y: preferred.y - dy },
      { x: anchor.x - dx, y: preferred.y + dy }, { x: anchor.x + dx, y: preferred.y + dy });
  }
  const allObstacles = [...occupied, ...people];
  let best: MapLabelRect | undefined, bestCost = Infinity, bestOverlap = Infinity;
  const examine = (point: Pos) => {
    const rect = { x: clamp(point.x - width / 2, margin, Math.max(margin, input.canvasWidth - margin - width)),
      y: clamp(point.y - height / 2, margin, Math.max(margin, input.canvasHeight - margin - height)), width, height };
    const overlap = allObstacles.reduce((sum, other) => sum + mapLabelOverlap(rect, other), 0);
    const distance = Math.hypot(rect.x + width / 2 - preferred.x, rect.y + height / 2 - preferred.y);
    const cost = overlap * 100000 + distance;
    if (cost < bestCost) { best = rect; bestCost = cost; bestOverlap = overlap; }
  };
  candidates.forEach(examine);
  // Dense groups may need a free lane a little beyond their immediate neighbours.
  if (bestOverlap > 0) for (let y = margin + height / 2; y <= input.canvasHeight - margin - height / 2; y += Math.max(20, height + gap))
    for (let x = margin + width / 2; x <= input.canvasWidth - margin - width / 2; x += Math.max(24, width / 2 + gap)) examine({ x, y });
  const rect = best!, center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const leaderEnd = { x: clamp(anchor.x, rect.x, rect.x + rect.width), y: clamp(anchor.y, rect.y, rect.y + rect.height) };
  return { rect, center, leaderEnd, collisionFree: bestOverlap === 0 };
}
