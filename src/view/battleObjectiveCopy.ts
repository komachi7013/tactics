import { getBattleConfig } from '../domain/battles';
import type { BattleId, Pos } from '../domain/types';

export interface ObjectiveRecordCopy {
  id: string;
  name: string;
  position: Pos;
  marker: string;
  actionLabel: string;
  optional: boolean;
}

export interface BattleObjectiveCopy {
  summary: string;
  /** Empty outside B01: retain each stage's existing detailed procedure. */
  steps: string[];
  /** Empty outside B01: retain each stage's existing terrain/operation note. */
  legend: string[];
  storyBridge: string | null;
  records: ObjectiveRecordCopy[];
  gateMarker: string | null;
  exitMarker: string | null;
}

const point = (position: Pos) => `(${position.x},${position.y})`;

/** Presentation copy only. Never replaces rules, required records, or state. */
export function battleObjectiveCopy(battleId: BattleId): BattleObjectiveCopy {
  const config = getBattleConfig(battleId);
  const records = config.records.map(record => ({
    id: record.id,
    name: record.name,
    position: { x: record.x, y: record.y },
    marker: record.name.includes(record.id) ? record.name : `${record.id} ${record.name}`,
    actionLabel: config.objective === 'repair' ? `${record.name}を救出`
      : config.objective === 'evacuate' ? `${record.name}の避難を案内`
      : battleId === 'B02' ? `${record.name}を観測` : `${record.name}を採取`,
    optional: record.optional === true,
  }));
  // Other stages keep their established objective/procedure text. In particular,
  // capture and finale maps must not acquire a fictitious escape requirement.
  const controlObjective = config.objective === 'capture' || config.objective === 'sluice' || config.objective === 'finale';
  const fallback: BattleObjectiveCopy = {
    summary: config.intro,
    steps: [],
    legend: [],
    storyBridge: null,
    records,
    gateMarker: config.gate ? config.gateEffect === 'chain' ? '鎖門' : '水門' : null,
    exitMarker: controlObjective ? null : config.objective === 'escort' ? '護送の到着地点' : '脱出（リセ）',
  };
  if (battleId !== 'B01') return fallback;

  const recordList = records.map(record => record.name).join('・');
  return {
    ...fallback,
    summary: '水位記録A・Bを採取し、リセが東の脱出地点へ。',
    steps: [
      '① 味方を記録A・Bの上下左右に隣接させる（高さ差1以内）',
      '② 「採取」を各1行動で実行する。立つだけでは取得できません',
      '③ 両方の採取と、生存するリセの脱出地点への到達で達成（順不同）',
    ],
    legend: [
      ...records.map(record => `記録${record.id}：${record.name}${point(record.position)}／隣接から採取`),
      `脱出（リセ）${point(config.exit)}：記録A・Bの採取も必要`,
      `水門（任意）${point(config.gate!)}：隣接から1行動で操作。その場で排水し、浅瀬の移動費2→1（浅瀬適性は1のまま）`,
    ],
    storyBridge: `この作戦で確保するのは、盤上の${recordList}です。味方の誰が採取しても部隊で共有されます。`,
    gateMarker: '水門（任意）',
    exitMarker: '脱出（リセ）',
  };
}
