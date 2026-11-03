import { getBattleConfig } from '../domain/battles';
import type { BattleId, BattleState, Pos } from '../domain/types';

/** Display data only. These props do not change collision, commands or rewards. */
export const MAP_OBJECT_ASSETS = {
  equipment: { key: 'map-object-equipment', path: '/assets/map-objects-v1/equipment-chest.png', width: 60, height: 60, originX: .5, originY: .90625 },
  measurement: { key: 'map-object-measurement', path: '/assets/map-objects-v1/water-record.png', width: 62, height: 62, originX: .5, originY: .90625 },
  document: { key: 'map-object-document', path: '/assets/map-objects-v1/archive-record.png', width: 55, height: 55, originX: .5, originY: .90625 },
  exit: { key: 'map-object-exit', path: '/assets/map-objects-v1/exit-marker.png', width: 65, height: 65, originX: .5, originY: .90625 },
  capture: { key: 'map-object-capture', path: '/assets/map-objects-v1/capture-marker.png', width: 60, height: 60, originX: .5, originY: .90625 },
  valve: { key: 'gate', path: '/assets/gate/gate.png', width: 76, height: 76, originX: .5, originY: .92 },
} as const;

export type MapObjectAsset = keyof typeof MAP_OBJECT_ASSETS;
export interface MapObjectPlacement {
  id: string;
  asset: MapObjectAsset;
  kind: 'equipment' | 'record' | 'gate' | 'sluice' | 'repair' | 'capture' | 'control' | 'exit';
  pos: Pos;
  label: string;
  /** Optional/supplementary instructions belong in the legend, not painted into art. */
  instruction: string;
  completed: boolean;
}

const gateLabel = (id: BattleId) => id === 'B06' ? '鎖門操作盤' : id === 'B10' ? '外港鎖門の信号盤' : '水門操作弁';
const exitLabel = (id: BattleId) => id === 'B03' ? '荷車の搬出口' : id === 'B06' ? 'トマの保護地点' : id === 'B09' ? '代表・証人の退出口' : id === 'B05' || id === 'B11' ? 'リセの西退去口' : id === 'B07' ? 'リセの東出口' : 'リセの脱出地点';

/** These authored landscapes already contain the equipment at the target cell. */
const PAINTED_EQUIPMENT: Partial<Record<BattleId, readonly MapObjectPlacement['kind'][]>> = {
  B06: ['gate'], B08: ['sluice'], B10: ['gate'], B11: ['repair'], B12: ['control'],
};
export function mapObjectUsesPaintedArt(id: BattleId, kind: MapObjectPlacement['kind']): boolean {
  return PAINTED_EQUIPMENT[id]?.includes(kind) ?? false;
}

/** All positions come from authored stage data; existing rescue people remain unchanged. */
export function mapObjectPlacements(state: BattleState): MapObjectPlacement[] {
  const config = getBattleConfig(state.battleId);
  const result: MapObjectPlacement[] = [];
  for (const chest of state.equipmentChests ?? []) {
    const completed = state.pendingEquipment?.includes(chest.eventId) ?? false;
    result.push({ id: chest.eventId, asset: 'equipment', kind: 'equipment', pos: { ...chest.pos },
      label: completed ? '装備箱・仮回収済み' : '装備箱',
      instruction: '同じマスまたは上下左右に隣接・高さ差1以内から1行動で回収。装備は勝利時に確定。', completed });
  }
  if (config.objective !== 'evacuate' && config.objective !== 'repair') {
    for (const record of config.records) {
      if (state.records.includes(record.id)) continue;
      result.push({ id: 'record:' + record.id, asset: state.battleId === 'B01' || state.battleId === 'B02' ? 'measurement' : 'document', kind: 'record', pos: { x: record.x, y: record.y },
        label: `${record.name}${record.name.endsWith(record.id) ? '' : ' ' + record.id}${record.optional ? '（任意）' : ''}`,
        instruction: '上下左右に隣接・高さ差1以内から1行動で採取。地点への到達だけでは取得されません。', completed: false });
    }
  }
  if (config.gate) {
    const chain = config.gateEffect === 'chain';
    const nextDrained = state.gate.pendingDrained ?? (config.reversibleGate ? !state.gate.drained : true);
    const status = state.gate.pendingRound !== null ? `R${state.gate.pendingRound}${chain ? '開通' : nextDrained ? '排水' : '再入水'}予約`
      : chain ? state.gate.drained ? '開通済み' : '未開通'
      : config.reversibleGate ? state.gate.drained ? '乾地' : '入水'
      : state.gate.drained ? '排水済み' : '未排水';
    result.push({ id: 'gate', asset: 'valve', kind: 'gate', pos: { ...config.gate }, label: `${gateLabel(state.battleId)}\n${status}`,
      instruction: `上下左右に隣接・高さ差1以内から1行動で操作。${state.battleId === 'B01' ? '操作直後に排水。' : '次ラウンドに反映。'}`, completed: state.gate.drained });
  }
  for (const gate of config.sluiceGates ?? []) {
    const water = state.sluices?.[gate.id];
    const pending = water?.pendingRound != null ? ` / R${water.pendingRound}${(water.pendingDrained ?? !water.drained) ? '排水' : '再入水'}予約` : '';
    result.push({ id: 'sluice:' + gate.id, asset: 'valve', kind: 'sluice', pos: { ...gate.panel },
      label: `${gate.name} ${gate.id} 操作盤\n${water?.drained ? '排水済み' : '浅瀬'}${pending}`,
      instruction: '上下左右に隣接・高さ差1以内から1行動で排水/再入水を予約。次ラウンドにこの水路へ反映。', completed: !!water?.drained });
  }
  for (const site of config.repairSites ?? []) {
    const repair = state.repairs?.[site.id];
    result.push({ id: 'repair:' + site.id, asset: 'valve', kind: 'repair', pos: { ...site.pos },
      label: `${site.name} ${site.id}\n${repair?.completed ? '復旧済み' : repair?.pendingRound ? `R${repair.pendingRound}復旧予約` : '未復旧'} / 要${site.workerRecordId}`,
      instruction: `${site.workerRecordId}の保守員を救出後、上下左右に隣接・高さ差1以内から1行動で復旧指示。次ラウンドに完了。`, completed: !!repair?.completed });
  }
  if (config.capturePoint) result.push({ id: 'capture', asset: 'capture', kind: 'capture', pos: { ...config.capturePoint },
    label: `${state.battleId === 'B10' ? '検問' : state.battleId === 'B08' ? '操作所' : '制圧点'} C・保持${state.capture?.heldRounds ?? 0}/${config.requiredHoldRounds ?? 2}R`,
    instruction: '味方戦闘員がこのマスに立ち、敵隣接なしで必要条件を満たして連続ラウンド保持。到達だけでは完了しません。', completed: false });
  for (const point of config.controlPoints ?? []) {
    const occupant = state.units.find(unit => unit.team === 'player' && unit.kind !== 'escort' && unit.hp > 0 && unit.pos.x === point.pos.x && unit.pos.y === point.pos.y);
    result.push({ id: 'control:' + point.id, asset: 'valve', kind: 'control', pos: { ...point.pos },
      label: `${point.name} ${point.id} (${point.pos.x},${point.pos.y})\n${occupant ? occupant.name + ' 占有中' : '空き'} / 共有保持${state.finalControl?.heldRounds ?? 0}/${config.requiredHoldRounds ?? 2}R`,
      instruction: '別々の生存味方で両操作台を同時に連続2ラウンド保持。ヴェスクの非致死制圧も必要。', completed: false });
  }
  if (config.objective !== 'capture' && config.objective !== 'sluice' && config.objective !== 'finale') result.push({ id: 'exit', asset: 'exit', kind: 'exit', pos: { ...config.exit }, label: exitLabel(state.battleId),
    instruction: config.objective === 'escort' ? '必要な記録・開門条件を満たし、護送対象をここへ。護送は条件を満たした次ラウンドに進行。' : '必要な採取・救出・復旧を済ませ、生存リセがこのマスへ到達。', completed: false });
  return result;
}

/** Fade a low prop under an occupying person; never move the gameplay target cell. */
export function mapObjectAlpha(placement: MapObjectPlacement, occupied: boolean): number {
  return occupied ? .32 : placement.completed ? .5 : 1;
}
