import type { BattleId } from '../domain/types';
export interface BriefingContext {
  finalGuide: string;
  repairGuide: string;
  portGuide: string;
  delegationGuide: string;
  sluiceGuide: string;
  chainGuide: string;
  archiveExitLabel: string;
}
/** Original complete operation instructions; equipment/coordinates are supplied unchanged. */
export function briefingRulesText(battleId: BattleId, config: { gate?: unknown; roundLimit: number }, context: BriefingContext): string {
  const { finalGuide, repairGuide, portGuide, delegationGuide, sluiceGuide, chainGuide, archiveExitLabel } = context;
  return (battleId === 'B12' ? finalGuide : battleId === 'B11' ? repairGuide : battleId === 'B10' ? portGuide : battleId === 'B09' ? delegationGuide : battleId === 'B08' ? sluiceGuide : battleId === 'B07' ? 'V1(4,4)・V2(13,12)に上下左右隣接・高さ差1以内から各1行動で住民避難案内。集合点に生存敵が上下左右で隣接すると不可（敵との高さ差は不問）。案内後は場外の案内係が送る抽象化で、住民HP・被ダメージ・盤面上の実移動や護送はありません。案内済みの集合点は通行可能。両Vと生存リセの東出口(19,11)到達で即勝利、リセが先に出口にいても最後の案内で終了。リセHP0または第10R終了に未達で敗北。敵全滅だけでは勝てません。セナは生存味方へ手当+6を2回。' : battleId === 'B06' ? chainGuide : battleId === 'B05' ? '必須D・T・Sは順不同。どの生存味方でも隣接・高さ差1以内から各1行動で採取し部隊で共有。必須3件とリセの西退去口' + archiveExitLabel + '到達が揃うと即勝利します。リセが先に退去口にいる場合も最後の資料取得で終了。任意の補償名簿Kが必要なら先に確保してください。リセHP0または第10R終了に未達で敗北。敵全滅だけでは勝てません。' : battleId === 'B04' ? '水門に隣接して再入水を予約、次R開始に発効。制圧点Cに味方戦闘員が立ち、敵の隣接なし・入水済み・切替予約なしの状態で連続2R終了を迎えると勝利。条件不足なら保持0。リセHP0または第10R終了に未達で敗北。対象8セルの切替は移動費だけを変え、HP・高さ・位置は変わりません。' : '記録は上下左右の隣接から1行動で取得。リセが倒れると敗北。') + (battleId === 'B04' || battleId === 'B05' || battleId === 'B06' || battleId === 'B07' || battleId === 'B08' || battleId === 'B09' || battleId === 'B10' || battleId === 'B11' || battleId === 'B12' ? '' : config.gate ? '水門は任意。次ラウンドから対象水路の移動費2→1（浅瀬適性のある人物は1のまま）。' : battleId === 'B03' ? '荷車は味方戦闘員の隣接と次セルの空きを確認し、次R開始に1セルずつ進みます。敵が隣接すると停止。施療士として出撃したセナの手当は+6・2回、荷車も対象。荷車HP0または第'+config.roundLimit+'R終了で未達も敗北。' : '深水は通行不可。石橋を渡って脱出してください。');
}
