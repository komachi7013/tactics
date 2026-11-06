import type { BattleId } from '../domain/types';

export interface PaintedObjectMask {
  battleId: BattleId;
  objectId: string;
  key: string;
  path: string;
  /** Absolute bounds on the unchanged 1536x1024 registered background, not a cell anchor. */
  bounds: [number, number, number, number];
}

const EXPECTED_FILES: Record<string, string> = {
  'B06/gate': 'b06-gate.png', 'B08/sluice:N': 'b08-n.png', 'B08/sluice:S': 'b08-s.png',
  'B10/gate': 'b10-gate.png', 'B11/repair:A': 'b11-a.png', 'B11/repair:B': 'b11-b.png',
  'B12/control:A': 'b12-a.png', 'B12/control:B': 'b12-b.png',
};

/** Invalid optional registration is reported but must never prevent a battle from drawing. */
export function readPaintedObjectMasks(value: unknown): { masks: PaintedObjectMask[]; issues: string[] } {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { masks?: unknown }).masks : undefined;
  if (!Array.isArray(rows)) return { masks: [], issues: ['背景設備の輪郭マスク登録がありません'] };
  const masks: PaintedObjectMask[] = [], issues: string[] = [], usedObjects = new Set<string>(), usedKeys = new Set<string>();
  for (const raw of rows) {
    const row = raw as Partial<PaintedObjectMask> | null;
    const id = row && `${row.battleId}/${row.objectId}`, expected = id && EXPECTED_FILES[id];
    const b = row?.bounds;
    if (!row || !expected || typeof row.key !== 'string' || !row.key || usedObjects.has(id!) || usedKeys.has(row.key)
      || row.path !== `/assets/stages/${expected.slice(0, 3)}/masks/${expected}` || !Array.isArray(b) || b.length !== 4
      || !b.every(Number.isInteger) || b[0] < 0 || b[1] < 0 || b[2] > 1536 || b[3] > 1024 || b[2] <= b[0] || b[3] <= b[1]) {
      issues.push(`背景設備の輪郭マスク登録不正: ${id ?? 'unknown'}`); continue;
    }
    usedObjects.add(id!); usedKeys.add(row.key);
    masks.push({ battleId: row.battleId!, objectId: row.objectId!, key: row.key, path: row.path, bounds: [...b] });
  }
  return { masks, issues };
}

// An optional eager JSON import permits a missing mask package to fall back to the
// unchanged painted background. Delivery tests separately require all eight files.
const metadata = import.meta.glob<unknown>('../assets/stages/map-object-masks.json', { eager: true, import: 'default' });
const parsed = readPaintedObjectMasks(Object.values(metadata)[0]);
export const PAINTED_OBJECT_MASKS: readonly PaintedObjectMask[] = parsed.masks;
export const PAINTED_MASK_ISSUES: readonly string[] = parsed.issues;
