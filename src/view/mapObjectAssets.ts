import { getBattleConfig } from '../domain/battles';
import type { BattleId, BattleState, Pos } from '../domain/types';
import { exitReady } from '../domain/exitReady';

/** Display data only. These props do not change collision, commands or rewards. */
export const MAP_OBJECT_ASSETS = {
  equipment: { key: 'map-object-equipment', path: '/assets/common/map-objects-v1/equipment-chest.png', width: 60, height: 60, originX: .5, originY: .90625 },
  measurement: { key: 'map-object-measurement', path: '/assets/common/map-objects-v1/water-record.png', width: 62, height: 62, originX: .5, originY: .90625 },
  document: { key: 'map-object-document', path: '/assets/common/map-objects-v1/archive-record.png', width: 55, height: 55, originX: .5, originY: .90625 },
  exit: { key: 'map-object-exit', path: '/assets/common/map-objects-v1/exit-marker.png', width: 65, height: 65, originX: .5, originY: .90625 },
  capture: { key: 'map-object-capture', path: '/assets/common/map-objects-v1/capture-marker.png', width: 60, height: 60, originX: .5, originY: .90625 },
  valve: { key: 'gate', path: '/assets/common/gate/gate.png', width: 76, height: 76, originX: .5, originY: .92 },
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
  ready?: boolean;
}

/** Stable names for the inspection card, without turn counters or map coordinates. */
export function mapObjectDisplayName(object: MapObjectPlacement): string {
  if (object.kind === 'equipment') return '宝箱';
  return object.label.split('\n')[0].replace(/・保持.*$/, '').replace(/\s*\(\d+,\d+\)/, '');
}

const gateLabel = (id: BattleId) => id === 'B06' ? '鎖門操作盤' : id === 'B10' ? '外港鎖門の信号盤' : '水門弁';
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
    if (completed) continue;
    result.push({ id: chest.eventId, asset: 'equipment', kind: 'equipment', pos: { ...chest.pos },
      label: '宝箱',
      instruction: '宝箱のマスへ移動すると、開けるかどうかを確認できます。持ち帰った装備は次の戦闘から使えます。', completed });
  }
  if (config.objective !== 'evacuate' && config.objective !== 'repair') {
    for (const record of config.records) {
      if (state.records.includes(record.id)) continue;
      result.push({ id: 'record:' + record.id, asset: state.battleId === 'B01' || state.battleId === 'B02' ? 'measurement' : 'document', kind: 'record', pos: { x: record.x, y: record.y },
        label: `${record.name}${record.optional ? '（任意）' : ''}`,
        instruction: '記録のあるマスへ移動すると、取得するかどうかを確認できます。', completed: false });
    }
  }
  if (config.gate) {
    const chain = config.gateEffect === 'chain';
    const nextDrained = state.gate.pendingDrained ?? (config.reversibleGate ? !state.gate.drained : true);
    const status = state.gate.pendingRound !== null ? `R${state.gate.pendingRound}${chain ? nextDrained ? '開通' : '閉門' : nextDrained ? '排水' : '再入水'}予約`
      : chain ? state.gate.drained ? '開通済み' : '未開通'
      : config.reversibleGate ? state.gate.drained ? '乾地' : '入水'
      : state.gate.drained ? '排水済み' : '未排水';
    result.push({ id: 'gate', asset: 'valve', kind: 'gate', pos: { ...config.gate }, label: `${gateLabel(state.battleId)}\n${status}`,
      instruction: `弁のマスで操作を確認できます。${state.battleId === 'B01' ? '水位はその場で変わります。もう一度動かすと元に戻ります。' : '切り替わるのは次のラウンドの始めです。その後は、もう一度操作できます。'}`, completed: state.gate.drained });
  }
  for (const gate of config.sluiceGates ?? []) {
    const water = state.sluices?.[gate.id];
    const pending = water?.pendingRound != null ? ` / R${water.pendingRound}${(water.pendingDrained ?? !water.drained) ? '排水' : '再入水'}予約` : '';
    result.push({ id: 'sluice:' + gate.id, asset: 'valve', kind: 'sluice', pos: { ...gate.panel },
      label: `${gate.name} ${gate.id} 操作盤\n${water?.drained ? '排水済み' : '浅瀬'}${pending}`,
      instruction: 'そのマスで操作すると、次のラウンドの始めにこの水路の水位が変わります。もう一度操作すると元に戻せます。', completed: !!water?.drained });
  }
  for (const site of config.repairSites ?? []) {
    const repair = state.repairs?.[site.id];
    result.push({ id: 'repair:' + site.id, asset: 'valve', kind: 'repair', pos: { ...site.pos },
      label: `${site.name} ${site.id}\n${repair?.completed ? '復旧済み' : repair?.pendingRound ? `R${repair.pendingRound}復旧予約` : '未復旧'} / 要${site.workerRecordId}`,
      instruction: `${site.workerRecordId}の保守員を救出した後、弁のマスで修理を頼めます。次のラウンドの始めに直ります。`, completed: !!repair?.completed });
  }
  if (config.capturePoint) result.push({ id: 'capture', asset: 'capture', kind: 'capture', pos: { ...config.capturePoint },
    label: `${state.battleId === 'B10' ? '検問' : state.battleId === 'B08' ? '操作所' : '制圧点'} C・保持${state.capture?.heldRounds ?? 0}/${config.requiredHoldRounds ?? 2}R`,
    instruction: '味方をこのマスに立たせて守りましょう。水門や敵の位置などの条件は「操作のヒント」で確認できます。', completed: false });
  for (const point of config.controlPoints ?? []) {
    const occupant = state.units.find(unit => unit.team === 'player' && unit.kind !== 'escort' && unit.hp > 0 && unit.pos.x === point.pos.x && unit.pos.y === point.pos.y);
    result.push({ id: 'control:' + point.id, asset: 'valve', kind: 'control', pos: { ...point.pos },
      label: `${point.name} ${point.id} (${point.pos.x},${point.pos.y})\n${occupant ? occupant.name + ' 占有中' : '空き'} / 共有保持${state.finalControl?.heldRounds ?? 0}/${config.requiredHoldRounds ?? 2}R`,
      instruction: '北と南の操作台に味方を1人ずつ立たせ、2ラウンド続けて守ります。ヴェスクも捕らえましょう。', completed: false });
  }
  if (config.objective !== 'capture' && config.objective !== 'sluice' && config.objective !== 'finale') result.push({ id: 'exit', asset: 'exit', kind: 'exit', pos: { ...config.exit }, label: exitLabel(state.battleId),
    instruction: config.objective === 'escort' ? '調査や開門を済ませ、護送する人や荷車をここまで送り届けましょう。' : '調査や救出などの目標を終え、リセをここまで移動させましょう。', completed: false, ready: exitReady(state) });
  return result;
}

/** Fade a low prop under an occupying person; never move the gameplay target cell. */
export function mapObjectAlpha(placement: MapObjectPlacement, occupied: boolean): number {
  return occupied ? .32 : placement.completed && placement.kind !== 'gate' && placement.kind !== 'sluice' ? .5 : 1;
}
