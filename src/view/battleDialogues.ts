import type { BattleId, BattleState } from '../domain/types';
import type { StoryPage } from './storyPanel';

const ACTORS = { リセ: 'ally-lise', ガラン: 'ally-garan', ネイア: 'ally-neia', セナ: 'ally-sena', イヴァ: 'ally-iva', ダニ: 'ally-dani', トマ: 'escort-toma', 代表: 'escort-delegation' } as const;
type Speaker = keyof typeof ACTORS;
export interface BattleLine { speaker: Speaker; text: string }
export interface BattleDialogue { id: string; battleId: BattleId; title: string; kind: 'brief' | 'important'; pages: readonly StoryPage[] }
type Trigger = 'first-record' | 'both-records' | 'observation' | 'gate-open' | 'water-return' | 'cart-push' | 'manifest' | 'hold-started' | 'signature' | 'compensation' | 'escort-first' | 'escort-half' | 'first-rescue' | 'maintenance' | 'sluices-ready' | 'first-worker' | 'first-repair' | 'subdued';
interface AuthoredEvent { battleId: BattleId; key: string; trigger: Trigger; kind: BattleDialogue['kind']; title: string; lines: readonly BattleLine[] }
const line = (speaker: Speaker, text: string): BattleLine => ({ speaker, text });
const event = (battleId: BattleId, key: string, trigger: Trigger, kind: BattleDialogue['kind'], title: string, lines: readonly BattleLine[]): AuthoredEvent => ({ battleId, key, trigger, kind, title, lines });

/** Reveals follow committed objective facts, never elapsed wall time or a map click. */
export const BATTLE_DIALOGUES: readonly AuthoredEvent[] = [
  event('B01', 'first-record', 'first-record', 'brief', '現場の高さ', [line('リセ', '水位痕を一つ記録した。公図の数字だけで片付けず、もう一か所も照合します。'), line('ネイア', 'その跡を見て、何度も知らせたんだ。今度は、聞いたことも残して。')]),
  event('B01', 'records-ready', 'both-records', 'important', '二つの水位痕', [line('リセ', '二か所の記録がそろいました。食い違いの理由は、持ち帰って確かめます。'), line('ガラン', '調べた者までここで失うな。リセを退路へ通すぞ。')]),
  event('B02', 'observed', 'observation', 'important', '公図と旧堤', [line('リセ', '旧堤の観測を残しました。渡し場だけの食い違いではなさそうです。'), line('ガラン', '結論を急ぐな。比べられる記録を、まず岸の外へ運ぶ。')]),
  event('B03', 'first-push', 'cart-push', 'brief', '荷車を一歩', [line('リセ', '荷車が一マス進みました。次に押す前に、前方と周囲の敵を確かめます。'), line('セナ', '急ぐのと、揺さぶるのは違う。負傷者の声も聞いて。')]),
  event('B03', 'manifest', 'manifest', 'important', '名前を運ぶ', [line('リセ', '名簿の写しを確保しました。これで人を守れたことにはなりません。荷車も外へ。'), line('セナ', 'そう。書かれた名前と、いまここにいる人を、別々に置いていかないで。')]),
  event('B04', 'water-return', 'water-return', 'brief', '設備と暮らし', [line('リセ', '水路の状態が変わりました。下流の訴えを、上流の暮らしを壊す理由にはしません。'), line('イヴァ', '保守の手を止めない。それが協力の条件だ。')]),
  event('B04', 'hold', 'hold-started', 'important', '拠点を守る時間', [line('リセ', '拠点の保持が始まりました。到着しただけで、引き継ぎが済んだわけではありません。'), line('イヴァ', 'この時間に水路を確かめる。もう一巡、ここを守ってくれ。')]),
  event('B05', 'signature-found', 'signature', 'important', '署名のある資料', [line('リセ', '再認証の署名欄を確保しました。指令と時刻表をそろえて、ここから運び出します。'), line('ガラン', '途中で捨てたり書き直したりはさせない。話す場所へ、全部持って行こう。')]),
  event('B05', 'compensation', 'compensation', 'brief', '名簿にない声も', [line('リセ', '補償名簿も回収できました。ここに名前がない人の被害まで、ないことにはしません。'), line('ダニ', '村の名簿と証言へ重ねる。これ一冊で、調査を終わらせない。')]),
  event('B06', 'chain-open', 'gate-open', 'brief', '鎖門の先へ', [line('リセ', '鎖門が開通しました。トマの近くを守り、次の足場を空けます。'), line('イヴァ', '門は通せた。証人を運ぶ仕事は、まだ続くぞ。')]),
  event('B06', 'toma-moved', 'escort-first', 'important', '証言する人', [line('リセ', 'トマ、足は動きますか。出口まで、一人にはしません。'), line('トマ', '歩けます。帳簿を渡して終わりにせず、訂正の経緯を私の言葉で話します。')]),
  event('B07', 'first-rescue', 'first-rescue', 'important', '引き渡した先にも', [line('リセ', '一方の集合点の住民を、場外の案内係へ引き継ぎました。残る集合点にも向かいます。'), line('ネイア', 'この人たちを逃がすために戻った。あなたの署名の話は、それで終わらない。')]),
  event('B08', 'maintenance', 'maintenance', 'important', '危険を分けて読む', [line('リセ', '保守記録を確保しました。水位痕と合わせ、設備の危険と命令の責任を分けて確かめます。'), line('イヴァ', '危険が本物なら、なおさら隠すな。運用できる手順を残すんだ。')]),
  event('B08', 'sluices-ready', 'sluices-ready', 'brief', '二つの水路', [line('リセ', '両水路の排水が反映され、予約もなくなりました。記録と操作所の保持条件を確かめます。'), line('イヴァ', '切り替えただけで終えるな。引き継げる状態を守ってくれ。')]),
  event('B09', 'delegation-first', 'escort-first', 'brief', '一行の歩幅', [line('リセ', '代表と証人の一行が進みました。前を空け、近くの護衛を切らさないように。'), line('代表', '連署も証言も、到着して公開の場へ出してこそだ。')]),
  event('B09', 'delegation-half', 'escort-half', 'important', 'まだ、採決ではない', [line('リセ', '回廊を進めています。着いたら、まず招集と記録の保全を求めます。'), line('代表', '協定の可決を先取りはしない。ほかの都市へも、同じ記録を示そう。')]),
  event('B10', 'harbor-open', 'gate-open', 'brief', '救援路を開く', [line('リセ', '外港の鎖門が開通しました。検問の保持まで、荷揚げの人を前に出さないで。'), line('イヴァ', '船を迎える口はできた。陸の受け渡しを守るぞ。')]),
  event('B10', 'harbor-hold', 'hold-started', 'important', '暮らしへ届くまで', [line('リセ', '検問の保持が始まりました。首府の人へ救援を届けるまで、持ち場を守ります。'), line('ガラン', '荷が岸へ上がる時間をつくる。敵を追って、ここを空けるな。')]),
  event('B11', 'first-worker', 'first-worker', 'brief', '設備を知る人', [line('リセ', '一人の保守員を安全な場所へ案内できました。もう一人の救出も続けます。'), line('イヴァ', '弁の仕事は、この人たちと組んで進める。追い立てて済む作業じゃない。')]),
  event('B11', 'first-repair', 'first-repair', 'important', '人の手で復旧する', [line('リセ', '補助弁の復旧が反映されました。必要な設備と、退去路の条件をもう一度確認します。'), line('イヴァ', '直したのは設備を知る人たちだ。その手を、命令ごと敵に回すな。')]),
  event('B12', 'commander-subdued', 'subdued', 'important', '生存した保全対象', [line('リセ', 'ヴェスクは生存した保全対象です。私たちの判断で裁かず、引き渡しまで守ります。'), line('ガラン', '武器を下げさせた。だが任務は終わりじゃない。二つの操作台の保持も必要だ。')]),
  event('B12', 'control-hold', 'hold-started', 'brief', 'もう一巡の時間', [line('リセ', '二つの操作台の保持が始まりました。避難と同期のために、もう一巡この状態を守ります。'), line('イヴァ', '下の作業へ時間を渡すんだ。勝手に弁を放すな。')]),
];

const rescueCount = (s: BattleState, ids: readonly string[]) => ids.filter(id => s.records.includes(id)).length;
function reached(trigger: Trigger, before: BattleState, after: BattleState): boolean {
  const added = (id: string) => !before.records.includes(id) && after.records.includes(id);
  switch (trigger) {
    case 'first-record': return before.records.length === 0 && after.records.length > 0;
    case 'both-records': return !['A','B'].every(id => before.records.includes(id)) && ['A','B'].every(id => after.records.includes(id));
    case 'observation': return added('O');
    case 'gate-open': return !before.gate.drained && after.gate.drained;
    case 'water-return': return before.gate.drained && !after.gate.drained;
    case 'cart-push': return (before.escort?.index ?? 0) === 0 && (after.escort?.index ?? 0) > 0;
    case 'manifest': return added('M');
    case 'signature': return added('S');
    case 'compensation': return added('K');
    case 'escort-first': return (before.escort?.index ?? 0) === 0 && (after.escort?.index ?? 0) > 0;
    case 'escort-half': { const middle = Math.max(2, Math.ceil(((after.escort?.route.length ?? 1) - 1) / 2)); return (before.escort?.index ?? 0) < middle && (after.escort?.index ?? 0) >= middle; }
    case 'first-rescue': return rescueCount(before,['V1','V2']) === 0 && rescueCount(after,['V1','V2']) === 1;
    case 'maintenance': return added('P');
    case 'sluices-ready': { const ready = (s: BattleState) => ['N','S'].every(id => s.sluices?.[id]?.drained && s.sluices[id].pendingRound === null); return !ready(before) && ready(after); }
    case 'first-worker': return rescueCount(before,['W1','W2']) === 0 && rescueCount(after,['W1','W2']) === 1;
    case 'first-repair': return !Object.values(before.repairs ?? {}).some(v => v.completed) && Object.values(after.repairs ?? {}).some(v => v.completed);
    case 'subdued': return !before.finalControl?.commanderSubdued && !!after.finalControl?.commanderSubdued;
    case 'hold-started': return (before.finalControl?.heldRounds ?? before.capture?.heldRounds ?? 0) === 0 && (after.finalControl?.heldRounds ?? after.capture?.heldRounds ?? 0) === 1;
  }
}
function pagesFor(lines: readonly BattleLine[], state: BattleState): StoryPage[] {
  return lines.filter(row => state.units.some(unit => unit.id === ACTORS[row.speaker] && unit.hp > 0))
    .map(row => ({ speaker: { name: row.speaker, unitId: ACTORS[row.speaker] }, text: `「${row.text}」`, sourceText: `${row.speaker}「${row.text}」` }));
}

/** Per-attempt view journal. No campaign schema, storage writes, rule mutations or timers. */
export class BattleDialogueJournal {
  private seen = new Set<string>();
  private pending: BattleDialogue[] = [];
  private played: BattleDialogue[] = [];
  constructor(private battleId: BattleId) {}
  reset(battleId: BattleId): void { this.battleId = battleId; this.seen.clear(); this.pending = []; this.played = []; }
  observe(before: BattleState, after: BattleState): void {
    if (before === after || before.battleId !== after.battleId || after.battleId !== this.battleId || after.phase !== 'playing') return;
    for (const row of BATTLE_DIALOGUES) {
      const id = `${row.battleId}:${row.key}`;
      if (row.battleId !== after.battleId || this.seen.has(id) || !reached(row.trigger,before,after)) continue;
      const pages = pagesFor(row.lines,after);
      if (!pages.length) continue;
      this.seen.add(id); this.pending.push({ id, battleId: row.battleId, title: row.title, kind: row.kind, pages });
    }
  }
  /** Called only after presentation settles and before a new command/enemy continuation. */
  drain(): BattleDialogue[] { const rows = this.pending; this.pending = []; this.played.push(...rows); return structuredClone(rows); }
  discardPending(): void { this.pending = []; }
  get history(): readonly BattleDialogue[] { return structuredClone(this.played); }
}
