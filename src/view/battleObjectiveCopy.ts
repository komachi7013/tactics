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
  /** Short player-facing steps. Numeric details belong in the field guide. */
  steps: string[];
  /** Rules available when the player opens the field guide. */
  legend: string[];
  storyBridge: string | null;
  records: ObjectiveRecordCopy[];
  gateMarker: string | null;
  exitMarker: string | null;
}

const point = (position: Pos) => `(${position.x},${position.y})`;

const MISSIONS: Record<BattleId, { summary: string; steps: string[]; notes: string[] }> = {
  B01: { summary: '2つの水位記録を取得し、リセを脱出地点まで移動させる。',
    steps: ['2つの水位記録を手に入れる。', 'リセを東の脱出地点へ向かわせる。'],
    notes: ['水門を動かすと、その場で水路の水を抜けます。もう一度動かすと水が戻ります。水門を使わずに進んでもかまいません。'] },
  B02: { summary: '観測地点を調べ、橋が閉まる前にリセを東岸へ移動させる。',
    steps: ['高台の観測地点で記録を取る。', '石橋を渡り、リセを東の脱出地点へ向かわせる。'],
    notes: ['深い水には入れません。階段と石橋を通って進みましょう。'] },
  B03: { summary: '名簿を取得し、負傷者の荷車を搬出口まで運ぶ。',
    steps: ['名簿の写しを手に入れる。', '荷車のそばで「荷車を押す」を選び、搬出口まで運ぶ。'],
    notes: ['荷車は味方が押すと進みます。自動では動きません。', '荷車を押せるのは1ラウンドに1回です。敵がすぐそばにいるときや、進む先がふさがっているときは押せません。', 'セナの「手当」は荷車にも使えます。リセと荷車の両方を守りましょう。'] },
  B04: { summary: '水路に水を戻し、拠点Cを守り抜く。',
    steps: ['水門を操作して、水路に水を戻す。', '味方を拠点Cに立たせ、2ラウンド続けて守る。'],
    notes: ['水位が変わるのは次のラウンドの始めです。', '拠点を守った回数はラウンドの終わりに数えます。水がない、切り替えを待っている、敵が拠点のすぐ隣にいる場合は、最初から数え直します。'] },
  B05: { summary: '3つの資料を取得し、リセを西の出口まで移動させる。',
    steps: ['放流指令、時刻表、署名を手に入れる。', 'リセを西の出口へ向かわせる。'],
    notes: ['資料を調べる順番は自由です。', '補償名簿は、持ち帰らなくても先へ進めます。調べるなら脱出前に取得しましょう。'] },
  B06: { summary: '鎖門を開き、トマを東の船着場まで護送する。',
    steps: ['操作盤で鎖門を開く。', 'トマのそばを守りながら、東の船着場へ向かう。'],
    notes: ['鎖門は次のラウンドの始めに開きます。', '味方がトマのすぐ隣にいて、敵が近くにおらず、前の道が空いていれば、トマはラウンドの始めに1マス進みます。', 'トマを直接操作する必要はありません。鎖門を閉めると護送は止まり、開け直すと再開できます。'] },
  B07: { summary: '北と南の住民を避難させ、リセを東の出口まで移動させる。',
    steps: ['集合場所V1とV2へ向かい、住民を避難させる。', 'リセを東の出口へ向かわせる。'],
    notes: ['集合場所へ移動し、確認画面で住民を案内します。敵が集合場所のすぐ隣にいるときは、先に追い払いましょう。', '案内した住民は安全な場所へ移ります。'] },
  B08: { summary: '保守記録を取得し、北と南の水を抜いて操作所Cを守る。',
    steps: ['保守記録を手に入れる。', '北と南の水路を排水する。', '味方を操作所Cに立たせ、2ラウンド続けて守る。'],
    notes: ['北と南の弁は、それぞれ別の水路を動かします。切り替わるのは次のラウンドの始めです。', '保守記録の取得と両方の排水を済ませてから、ラウンドの終わりに守った回数を数えます。切り替え待ちや敵の隣接があると、最初から数え直します。'] },
  B09: { summary: '代表と証人の一行を、裁定所まで護送する。',
    steps: ['一行のそばに味方を置いて守る。', '敵を退けて道を空け、北の出口まで付き添う。'],
    notes: ['味方がすぐ隣にいて、敵が近くにおらず、前の道が空いていれば、一行はラウンドの始めに1マス進みます。', '一行のHPが減ったら、セナの「手当」で回復できます。'] },
  B10: { summary: '港の鎖門を開き、救援船が入れるよう検問Cを守る。',
    steps: ['信号盤を操作して、港の鎖門を開く。', '味方を検問Cに立たせ、2ラウンド続けて守る。'],
    notes: ['鎖門が開くのは次のラウンドの始めです。', '開門後、ラウンドの終わりに守った回数を数えます。敵が検問のすぐ隣にいる、門が閉じている、切り替え待ちの場合は最初から数え直します。'] },
  B11: { summary: '保守員2人を救出し、補助弁を直してリセを西の出口へ戻す。',
    steps: ['北と南に取り残された保守員を救出する。', 'それぞれの保守員に協力してもらい、補助弁AとBを直す。', '両方の修理が終わったら、リセを西の出口へ向かわせる。'],
    notes: ['保守員のいるマスへ移動し、確認画面で救出します。敵が保守員のすぐ隣にいる場合は、先に追い払いましょう。', '救出後、対応する弁のマスで修理を頼めます。修理が終わるのは次のラウンドの始めです。'] },
  B12: { summary: 'ヴェスクを捕らえ、北と南の操作台を守り抜く。',
    steps: ['ヴェスクを倒して、放流の強行を止める。', '北と南の操作台に味方を1人ずつ立たせ、2ラウンド続けて守る。'],
    notes: ['ヴェスクは倒しても命を落としません。捕らえた後は攻撃する必要はありません。', '操作台は立つだけで使えます。敵が隣にいても、味方が両方の台に残っていれば守った回数を数えます。', 'ヴェスクを捕らえる前に、操作台を守り始めてもかまいません。両方の目標を達成したラウンドの終わりに戦闘が終わります。'] },
};

/** Presentation copy only. Never replaces rules, required records, or state. */
export function battleObjectiveCopy(battleId: BattleId): BattleObjectiveCopy {
  const config = getBattleConfig(battleId);
  const records = config.records.map(record => ({
    id: record.id,
    name: record.name,
    position: { x: record.x, y: record.y },
    marker: record.name,
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
  const mission = MISSIONS[battleId];
  return {
    ...fallback,
    summary: mission.summary,
    steps: [...mission.steps],
    legend: [
      ...(records.length ? ['記録や住民のいるマスへ移動すると、確認画面が開きます。「確定」で調べたり、案内したりできます。'] : []),
      ...(config.gate || config.sluiceGates?.length || config.repairSites?.length ? ['弁や操作盤のマスへ移動すると、操作するかどうかを確認できます。'] : []),
      ...mission.notes,

    ],
    storyBridge: records.length ? '記録は、どの仲間が手に入れても調査隊全員のものになります。' : null,
    gateMarker: battleId === 'B01' ? '水門（任意）' : fallback.gateMarker,
  };
}
