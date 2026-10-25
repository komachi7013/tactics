import type Phaser from 'phaser';
import anchors from './b01Anchors.json';
import sceneMetadata from './b01SceneMetadata.json';
import type { Facing, Pos } from '../domain/types';

/** All raster partitions retain the approved reference's source registration. */
export const B01_SCENE = sceneMetadata;
export const B01_TEXTURES = { ground: 'b01-scene-base', water: 'b01-scene-water', underfloor: 'b01-scene-underfloor' };
export const B01_MATERIALS = [
  { key: B01_TEXTURES.ground, file: B01_SCENE.base },
  { key: B01_TEXTURES.water, file: B01_SCENE.water.file },
  { key: B01_TEXTURES.underfloor, file: B01_SCENE.underfloor.file },
  ...B01_SCENE.parts.map(part => ({ key: part.key, file: part.file })),
];
export function b01Projection(width: number, height: number) {
  const scale = Math.max(width / 1536, height / 1024);
  const offsetX = (width - 1536 * scale) / 2, offsetY = (height - 1024 * scale) / 2;
  const source = (p: { x: number; y: number }) => ({ x: offsetX + p.x * scale, y: offsetY + p.y * scale });
  return { scale, tw: 120 * scale, th: 60 * scale, elevation: 30 * scale, offsetX, offsetY, source,
    project: (p: Pos, h = 0) => source({ x: 730 + (p.x - p.y) * 60, y: 270 + (p.x + p.y) * 30 - h * 30 }) };
}
/** Exact per-cell clips share one large water crop, rather than tiling small patches. */
export function prepareB01Landscape(scene: Phaser.Scene): void {
  if (!scene.textures.exists(B01_TEXTURES.water)) return;
  const water = scene.textures.get(B01_TEXTURES.water).getSourceImage() as HTMLImageElement;
  const [left, top] = B01_SCENE.water.bounds;
  for (const polygon of B01_SCENE.water.polygons) {
    const cx = polygon[0].x, cy = polygon[1].y;
    const key = `b01-scene-water-${cx}-${cy}`;
    if (scene.textures.exists(key)) continue;
    const texture = scene.textures.createCanvas(key, 120, 60);
    if (!texture) throw new Error('B01 water canvas unavailable');
    const ctx = texture.getContext();
    ctx.beginPath(); polygon.forEach((p, i) => i ? ctx.lineTo(p.x - cx + 60, p.y - cy + 30) : ctx.moveTo(p.x - cx + 60, p.y - cy + 30)); ctx.closePath(); ctx.clip();
    ctx.drawImage(water, left - cx + 60, top - cy + 30); texture.refresh();
  }
}
export function b01ActorAnchor(asset: string, facing: Facing) {
  const frames = anchors[asset as keyof typeof anchors];
  return frames?.[{ N: 0, E: 1, S: 2, W: 3 }[facing]];
}

/** Cells at identical projected centers need an explicit floor choice. */
export function b01OverlappingFloors<T extends Pos & { height: number }>(cells: readonly T[], pos: Pos): T[] {
  const cell = cells.find(c => c.x === pos.x && c.y === pos.y);
  if (!cell) return [];
  return cells.filter(c => c.x - c.y === cell.x - cell.y && c.x + c.y - c.height === cell.x + cell.y - cell.height)
    .sort((a, b) => a.height - b.height);
}

/** Keep one nearest surface at each height under the pointer, including hidden floors. */
export function b01FloorsAtPoint<T extends Pos & { height: number }>(cells: readonly T[], point: Pos): T[] {
  const nearest = new Map<number, { cell: T; distance: number }>();
  for (const cell of cells) {
    const x = 730 + (cell.x - cell.y) * 60, y = 270 + (cell.x + cell.y - cell.height) * 30;
    const distance = Math.abs(point.x - x) / 60 + Math.abs(point.y - y) / 30;
    if (distance <= 1.001 && (!nearest.has(cell.height) || distance < nearest.get(cell.height)!.distance)) nearest.set(cell.height, { cell, distance });
  }
  return [...nearest.values()].map(v => v.cell).sort((a,b) => a.height - b.height);
}
