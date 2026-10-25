import type { Pos } from '../domain/types';
export interface SceneRegistration { width: number; height: number; ox: number; oy: number; tw: number; th: number; elevation: number }
/** One transform owns terrain overlays, actor feet, movement and pointer input. */
export function registeredProjection(width: number, height: number, scene: SceneRegistration) {
  if (![width, height, scene.width, scene.height, scene.tw, scene.th].every(n => Number.isFinite(n) && n > 0)
    || ![scene.ox, scene.oy, scene.elevation].every(Number.isFinite) || scene.elevation < 0) throw new RangeError('Registered projection requires positive viewport/source/cell dimensions and a finite registration');
  const scale = Math.min(width / scene.width, height / scene.height);
  const offsetX = (width - scene.width * scale) / 2, offsetY = (height - scene.height * scale) / 2;
  const source = (p: Pos): Pos => ({ x: offsetX + p.x * scale, y: offsetY + p.y * scale });
  const unsource = (p: Pos): Pos => ({ x: (p.x - offsetX) / scale, y: (p.y - offsetY) / scale });
  const project = (p: Pos, h = 0): Pos => source({ x: scene.ox + (p.x - p.y) * scene.tw / 2, y: scene.oy + (p.x + p.y) * scene.th / 2 - h * scene.elevation });
  const unproject = (p: Pos, h = 0): Pos => {
    const s = unsource(p), a = (s.x - scene.ox) / (scene.tw / 2), b = (s.y - scene.oy + h * scene.elevation) / (scene.th / 2);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  };
  const polygon = (p: Pos, h = 0): Pos[] => { const c = project(p, h); return [{ x: c.x, y: c.y - scene.th * scale / 2 }, { x: c.x + scene.tw * scale / 2, y: c.y }, { x: c.x, y: c.y + scene.th * scale / 2 }, { x: c.x - scene.tw * scale / 2, y: c.y }]; };
  /** Accept canvas display coordinates once; callers must not unsource first. */
  const floorsAt = <T extends Pos & { height: number }>(cells: readonly T[], point: Pos): T[] => {
    const nearest = new Map<number, { cell: T; distance: number }>();
    for (const c of cells) { const p = project(c, c.height), distance = Math.abs(point.x - p.x) / (scene.tw * scale / 2) + Math.abs(point.y - p.y) / (scene.th * scale / 2); if (distance <= 1.001 && (!nearest.has(c.height) || distance < nearest.get(c.height)!.distance)) nearest.set(c.height, { cell: c, distance }); }
    return [...nearest.values()].sort((a, b) => a.cell.height - b.cell.height).map(v => v.cell);
  };
  return { scale, offsetX, offsetY, source, unsource, project, unproject, polygon, floorsAt };
}
