import Phaser from 'phaser';
import './style.css';
import {registeredLandscape,registeredFloors} from './view/registeredLandscape';
import { endingContent } from './ending';
import { mountStoryPanel, type StoryPage } from './view/storyPanel';
import { mountStartScreen, readStartProgress } from './view/startScreen';
import { introStoryHtml, resultStoryHtml } from './view/storyContent';
import { readAuthoredStory, storySpeakerFace } from './view/storyScript';
import { briefingRulesText } from './view/briefingContent';
import { GameAudio, type AudioStatus } from './audio';
import { soundForTransition } from './audio-events';
import { reduce, getCell, getUnit, reachable, attackPreview, canCollect, canGate, healPreview, escortAdvancePreview, escortUnit, gatePreview, capturePreview, evacuationPreview, repairPreview, finalControlPreview, jobCommandPreview, effectiveShallowCost, equipmentPickupPreview } from './domain/engine';
import { runEnemyActivationWithTrace, getEnemyDecisionSnapshot } from './domain/ai';
import { createPresentation, committedAttackResolution } from './view/presentation';
import { BattleFlow } from './view/battleFlow';
import {commitMovementFacing} from './view/commitMovementFacing';
import { renderInspectionRoster, createInspectionFace, inspectionUnitStatus } from './view/inspectionRoster';
import { makeModalBackgroundInert, trapModalTab, createDialogSettlement } from './view/modalFocus';
import { readOrderRows, ReadOrderUpdates } from './view/readOrder';
import { getBattleConfig, requiredRecords } from './domain/battles';
import { createCampaign, completeBattle, selectBattle, writeCampaign, resetCampaign, editPreparation, getConfirmedEquipmentEvents, getUnconfirmedEquipmentEvents } from './campaign';
import type { Campaign, StorageLike } from './campaign';
import { defaultParty, commonLevel, returnFromAbsence } from './progression';
import { createPartyBattle } from './party';
import { mountPreparation } from './preparation';
import { createEquipment } from './equipment';
import { EQUIPMENT_SLOT_NAMES, equipmentCollectionRows, equipmentDefinition, equipmentEffectText } from './view/equipmentView';
import { selectProgressStorage, qaStorageKey } from './qa/storage';
import type { BattleId, Command, Facing, Pos } from './domain/types';
import { BoardScene, type BoardRenderReport } from './view/BoardScene';
import { hd2dWalkTrial } from './qa/hd2dWalk';
import { b01OverlappingFloors } from './view/b01Landscape';

const archiveExitLabel = '(' + getBattleConfig('B05').exit.x + ',' + getBattleConfig('B05').exit.y + ')';
const sluiceConfig=getBattleConfig('B08');
const posLabel=(p:{x:number;y:number})=>'('+p.x+','+p.y+')';
const sluiceRecordLabel=posLabel(sluiceConfig.records[0]),sluiceNorthLabel=posLabel(sluiceConfig.sluiceGates![0].panel),sluiceSouthLabel=posLabel(sluiceConfig.sluiceGates![1].panel),sluiceCaptureLabel=posLabel(sluiceConfig.capturePoint!);
const sluiceGuide=`リセ・ガラン・ネイア・イヴァを推奨する4人編成（準備で変更可）。トマは保護下。保守記録P${sluiceRecordLabel}は上下左右隣接・高さ差1以内から1行動で採取し部隊共有。N${sluiceNorthLabel}・S${sluiceSouthLabel}はそれぞれ隣接・高さ差1以内から1行動で排水/再入水を予約。次R開始に対象4セルのみ移動費2↔1（浅瀬適性があれば1）へ変更。高さ・HP・位置・射線は変わりません。各領域の予約は上書き不可、発効後に再反転可能。P取得・両水路排水済み・両予約なし・生存味方戦闘員がC${sluiceCaptureLabel}上・生存敵がCに上下左右隣接しないとき、R終了時に保持+1。条件不足なら0。連続2Rで勝利、リセHP0で敗北。第${sluiceConfig.roundLimit}R終了は保持達成を期限より先に判定。敵全滅・P取得・C到達だけでは勝てません。編成・訓練は戦闘前の「部隊の準備」から変更できます。`;
const chainConfig=getBattleConfig('B06');
const chainGateLabel='('+chainConfig.gate!.x+','+chainConfig.gate!.y+')',chainExitLabel='('+chainConfig.exit.x+','+chainConfig.exit.y+')';
const chainGuide=`リセ・ガラン・セナ・イヴァを推奨する4人編成（準備で変更可）。ネイアは離脱中、鎖門操作盤${chainGateLabel}に上下左右隣接・高さ差1以内から1行動で開門を予約し、次R開始に一度だけ開通。予約上書きと再閉門は不可。水位・深水・石橋・高さ・HP・位置は変わりません。開通後、トマに味方戦闘員が上下左右隣接し、敵が隣接せず次セルが空いていれば次R開始に1セル進行。開門発効後、そのRから進行できます。施療士として出撃したセナの手当は隣接生存味方・トマに+6を2回、退避復帰不可。リセとトマが生存して${chainExitLabel}へ護送すると勝利。敵全滅だけでは勝てません。リセかトマHP0、または第${chainConfig.roundLimit}R終了に未達で敗北。`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main class="game-shell"><header class="masthead"><div class="game-title"><span class="seal">澪</span><div><h1>澪を継ぐ者</h1><p>流域盟約戦記</p></div></div><div class="chapter"><b id="chapter-number">第一章</b> <span id="chapter-subtitle">消された水位</span><small id="battle-title"></small></div><button id="campaign-menu" class="quiet">戦闘選択</button><button id="restart" class="quiet">同じ戦闘を再開</button><button id="shorten-presentation" class="quiet" title="攻撃演出の短縮は現在利用できません。" disabled>移動演出を短縮</button></header><section class="objective"><strong>作戦目標</strong><span id="objective-text"></span><span id="records"></span></section><div class="progress-strip"><span id="objective-steps"></span><span id="save-status" role="status" aria-live="polite"></span></div><div id="audio-settings-host"></div><div class="battle-layout"><section class="battlefield"><div class="turn-banner" id="turn"></div><div id="board" aria-label="トルネ渡し場の戦場"></div><div class="map-note" id="map-note"></div></section><aside class="command-panel"><div class="panel-heading">部隊指揮 <small>TACTICAL ORDERS</small></div><div id="escort-status" class="escort-status" role="status"></div><div id="capture-status" class="escort-status" role="status"></div><div id="archive-status" class="escort-status" role="status"></div><div id="evacuation-status" class="escort-status" role="status"></div><div id="repair-status" class="escort-status" role="status"></div><div id="final-control-status" class="escort-status" role="status"></div><section id="read-order-panel" class="escort-status" aria-label="読令の情報" hidden><strong>現在の盤面で、この敵の手番なら</strong><div id="read-order-details"></div><p id="read-order-updates" role="status" aria-live="polite"></p></section><div id="equipment-chest-status" class="escort-status" hidden></div><section id="acting-unit" class="acting-unit" aria-label="行動中の人物" hidden></section><div id="inspection-teams" class="inspection-teams" role="group" aria-label="閲覧する部隊"></div><div id="roster" class="roster" aria-label="閲覧する人物"></div><section id="selection" aria-label="閲覧対象のステータス"></section><div id="commands"></div><p id="message" role="status" aria-live="polite"></p><details id="equipment-collection-panel"><summary>装備の取得一覧</summary><div id="equipment-collection-content"></div></details><details><summary>戦術手引き / キー操作</summary><p>未行動の味方を選び「行動を開始」。移動1回＋行動1回を好きな順に使えます。各人は最後に向きを選び終了。味方は好きな順で操作し、全員終了すると敵全員が順に行動します。味方→敵の一巡で1ラウンドです。</p><p>矢印キー: セル選択 / Enter: 選択 / Esc: 取消。ボタンは Tab と Enter でも操作できます。移動候補の青緑枠を選択し、確認して確定します。</p><p>近接は隣接、高低差1まで。弩は距離2〜4（高所5）、射線が必要。背面近接+2。防御は次の本人の行動開始まで被害−2。</p><p id="battle-guide"></p></details><details id="coordinate-panel"><summary>座標からセルを選ぶ</summary><div id="coordinates" class="coordinate-grid"></div></details></aside></div><footer><span class="log-mark">行動記録</span><div id="logs" aria-live="polite"></div></footer></main><div id="overlay"></div>`;
let campaign: Campaign = createCampaign();
let saveWritable = true;
let saveStatus = '進行は戦闘開始・勝利時に保存。戦闘途中の再開はできません。';
let storage: StorageLike | null = null;
let qaSession: string | null = null;
let startHasCheckpoint = false;
let startQaNotice = '';
try {
  storage = window.localStorage;
  if (import.meta.env.DEV) {
    const selectedStorage = selectProgressStorage(storage, location.search);
    storage = selectedStorage.storage; qaSession = selectedStorage.session;
  }
  const loaded = readStartProgress(storage); campaign = loaded.campaign; saveWritable = loaded.writable; startHasCheckpoint = loaded.hasCheckpoint;
  if (loaded.warning) saveStatus = loaded.warning;
} catch { storage = null; saveWritable = false; saveStatus = '保存領域を利用できません。今回のプレイ中は遊べますが、進行は保存されません。'; }
if (import.meta.env.DEV && new URLSearchParams(location.search).has('qaSession')) {
  const badge = document.createElement('p'); badge.id = 'qa-session-notice'; badge.setAttribute('role', 'note');
  badge.style.cssText = 'margin:0;padding:10px 28px;background:#713d32;color:#fff3d0';
  badge.textContent = qaSession ? `隔離QA: ${qaSession} ／ 保存先 ${qaStorageKey(qaSession)} ／ fixtureによる開始条件は実機合格に数えません。通常URLへ戻る前にQA結果を保存してください。`
    : '隔離QAの指定が不正です。通常保存へ切り替えず、保存を無効にしています。';
  startQaNotice = badge.textContent;
  app.prepend(badge);
}
let state = createPartyBattle(campaign.currentBattle, campaign.parties?.[campaign.currentBattle] ?? defaultParty(campaign.currentBattle), campaign.jobs, commonLevel(campaign.completed), { equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign), combat: campaign.combat });
let selected: string | null = null;
let inspectionTeam: 'player' | 'enemy' = 'player';
let mode = 'inspect';
const readOrderUpdates = new ReadOrderUpdates();
let cursor: Pos = { x: 0, y: 5 };
let screen: 'start' | 'intro' | 'battle' | 'result' = 'start';
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const battleFlow = new BattleFlow({
  scheduler: { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: handle => window.clearTimeout(handle as number) },
  motion: motionPreference, visibility: document,
  status: () => ({ active: screen === 'battle', phase: state.phase, turn: state.turn }),
  clearPresentation: () => board.clearPresentation(), playPresentation: plan => board.playPresentation(plan),
  render: () => render(), finish: () => finish(), runEnemy: () => performEnemyActivation(),
});
const interactionBusy = () => battleFlow.busy;
let dialogOpen = false;
let disposeStory: (() => void) | undefined;
function releaseStory() { disposeStory?.(); disposeStory = undefined; }
let disposeStart: (() => void) | undefined;
function releaseStart() { disposeStart?.(); disposeStart = undefined; }
let restoreModalBackground: (() => void) | undefined;
function releaseModalBackground() { restoreModalBackground?.(); restoreModalBackground = undefined; }
let pendingFocus: string | null = null;
let modalReturnFocus: string | null = null;
let message = '未行動の味方を選んで行動を開始してください。';
const finalConfig=getBattleConfig('B12'),finalPosLabel=(p:{x:number;y:number})=>'('+p.x+','+p.y+')',finalALabel=finalPosLabel(finalConfig.controlPoints![0].pos),finalBLabel=finalPosLabel(finalConfig.controlPoints![1].pos);
const finalGuide = `リセ・ガラン・ネイア・イヴァを推奨する4人編成（準備で変更可）、手当は施療士を出撃させた場合に使用可。技師と保守員は場外運用、トマと代表は裁定所保護下。北操作点A${finalALabel}と南操作点B${finalBLabel}へ別々の生存味方戦闘員を立たせます。操作行動や予約は不要、両点同時占有のR終了で共有保持+1、片方でも欠ければ0。敵の隣接は保持を妨げません。制圧前も保持を積めます。ヴェスクHP0は非致死の制圧済み・保全対象で、セル占有・行動開始・再攻撃・回復対象から外れます。死亡や逃亡ではなく、実拘束は戦後に裁定所命令を首府警備隊が執行します。両点連続2R以上保持とヴェスク制圧が揃ったR終了だけで勝利。保持後の最後の攻撃で制圧してもR終了まで続行します。リセHP0を最優先で即敗北、第8R終了は複合勝利を期限より先に判定し未達なら敗北、R9には進みません。敵全滅・片方占有・制圧だけでは勝てません。水位・地形変更や流体計算はありません。`;
const repairConfig=getBattleConfig('B11'),repairPosLabel=(p:{x:number;y:number})=>'('+p.x+','+p.y+')',repairExitLabel=repairPosLabel(repairConfig.exit);
const repairGuide = `リセ・ガラン・ネイア・イヴァを推奨する4人編成（準備で変更可）、手当は施療士を出撃させた場合に使用可。トマと代表は裁定所保護下。W1北保守員${repairPosLabel(repairConfig.records[0])}・W2南保守員${repairPosLabel(repairConfig.records[1])}に上下左右隣接・高さ差1以内、生存敵の上下左右隣接なしで各1行動の救出。場外の安全な作業場所へ案内する抽象化で、個別HP・盤面護送はありません。救出したセルだけ通行可能。救出は部隊共有、W1→北補助弁A${repairPosLabel(repairConfig.repairSites![0].pos)}、W2→南補助弁B${repairPosLabel(repairConfig.repairSites![1].pos)}。対応する保守員の救出後、弁へ上下左右隣接・高さ差1以内から各1行動で復旧指示。救出と異なり弁への敵の隣接では妨げられません。同Rに別の味方が救出して指示しても可。現場保守員の協力で次R開始に一度だけ復旧、予約上書き・再復旧・予約取消は不可。弁は復旧後も通行不可、水位・地形・HP・位置・射線は変わりません。両W救出と両弁復旧済み・予約なし、生存リセが西退去口${repairExitLabel}に揃うと即勝利。リセが先に退去口にいても最後の次R復旧で勝利。リセHP0を優先して敗北、第12R終了に未達で敗北、架空R13発効なし。敵全滅・救出だけ・予約だけ・片方復旧だけでは勝てません。編成・訓練は戦闘前の「部隊の準備」から変更できます。`;
const portConfig=getBattleConfig('B10'),portSignalLabel='('+portConfig.gate!.x+','+portConfig.gate!.y+')',portCaptureLabel='('+portConfig.capturePoint!.x+','+portConfig.capturePoint!.y+')';
const portGuide = `リセ・ガラン・ネイア・イヴァを推奨する4人編成（準備で変更可）。手当は施療士を出撃させた場合に使用可。トマと代表は裁定所の保護下。信号盤${portSignalLabel}に上下左右隣接・高さ差1以内から1行動で外港鎖門の開通を予約。次R開始に一度だけ開通し、上書き・再閉鎖は不可。信号盤は開通後も通行不可で迂回できます。水位・移動費・高さ・HP・位置・射線は変わりません。開通済み・予約なし・生存味方戦闘員が検問C${portCaptureLabel}上・生存敵がCに上下左右隣接しない状態でR終了時に保持+1、条件不足なら0。連続2Rで即勝利し、場外の救援船団が入港します。リセHP0を優先して敗北、第12R終了は保持達成を期限より先に判定。敵全滅・C到達・開通だけでは勝てません。船の個別HP・操縦・盤面移動は未実装です。編成・訓練は戦闘前の「部隊の準備」から変更できます。`;
const delegationConfig=getBattleConfig('B09'),delegationExitLabel='('+delegationConfig.exit.x+','+delegationConfig.exit.y+')';
const delegationGuide = `リセ・ガラン・ネイア・セナを推奨する4人編成（準備で変更可）。「代表・証人一行」はラウム・ベルカ・トルネ代表とトマら証人を同一セル・共有HP24で抽象化した護送隊です。人物絵は一行の代表アイコンで、トマ単独や個別人物のHP・死亡を表しません。手動での行動開始・移動・攻撃は不可。生存味方戦闘員の上下左右隣接、敵の上下左右隣接なし、次セルが空き・通行可・高さ差1以内なら、次R開始に1セル前進。護衛の隣接は高さ不問、行動消費なし。施療士として出撃したセナの手当は隣接・高さ差1以内に+6を2回、一行も対象。リセと一行が生存し一行が退出口${delegationExitLabel}へ到達すると即勝利。リセ自身の退出は不要。リセか一行HP0、または第${delegationConfig.roundLimit}R終了に未達で敗北。敵全滅・高台占有だけでは勝てません。`;
const archiveRecordText: Record<string, string> = { D: '二年前の薄明放流の指令。貯水池の危険を理由に放流を命じている。必要性と実際の運用は別々に確かめる必要がある。', T: '指令に添付された予定時刻。警告や避難の実施は、現場の記録や証言との照合が要る。', S: 'リセの再認証署名。更新されなかった高低図を承認した責任が、ここに残る。', K: '補償手続に関わる住民の名。被害者全員を網羅するとは限らず、住民側の名簿と照合する手掛かり。' };
const $ = (id: string) => document.getElementById(id)!;
const audio = new GameAudio(updateAudioControls);
const onAudioVisibility = () => audio.setHidden(document.hidden);
onAudioVisibility();
document.addEventListener('visibilitychange', onAudioVisibility);
function updateAudioControls(status: AudioStatus) {
  for (const panel of app.querySelectorAll<HTMLElement>('.audio-controls')) {
    const summary = panel.querySelector('summary')!;
    summary.textContent = `音の設定（${!status.enabled ? 'オフ' : status.muted ? 'ミュート' : status.hidden ? '休止中' : status.contextState !== 'running' ? '再開待ち' : 'オン'}）`;
    const enable = panel.querySelector<HTMLButtonElement>('[data-audio-enable]')!;
    enable.textContent = status.error ? '音の再生を再試行' : status.enabled && status.contextState !== 'running' ? '音を再開する' : '音を有効にする';
    enable.disabled = status.enabled && status.contextState === 'running' && !status.error;
    const mute = panel.querySelector<HTMLButtonElement>('[data-audio-mute]')!;
    mute.textContent = status.muted ? 'ミュートを解除' : 'ミュート';
    mute.disabled = !status.enabled;
    mute.setAttribute('aria-pressed', String(status.muted));
    for (const category of ['bgm', 'se'] as const) {
      const slider = panel.querySelector<HTMLInputElement>(`[data-audio-volume="${category}"]`)!;
      const value = String(Math.round(status[category] * 100));
      if (document.activeElement !== slider) slider.value = value;
      panel.querySelector<HTMLOutputElement>(`[data-audio-output="${category}"]`)!.value = `${value}%`;
    }
    panel.querySelector<HTMLElement>('[data-audio-status]')!.textContent = status.error
      ? status.error + ' 音が出なくてもゲームは続けられます。'
      : status.enabled && status.contextState !== 'running' ? '音の処理が休止しています。「音を再開する」で再試行できます。'
      : status.hidden ? 'ページが非表示のため、音を休止しています。'
      : status.loadingCue ? '音源を読み込んでいます。'
      : status.bgm === 0 && status.se === 0 ? 'BGM・SEの音量がどちらも0%です。'
      : '音量設定は今回のプレイ中だけ有効です。再読込すると音はオフになります。';
    panel.querySelector<HTMLElement>('[data-audio-diagnostic]')!.textContent = [
      `音声版: ${status.version}`, `ページ: ${location.origin}`,
      `音声処理: ${status.contextState} / 時刻: ${status.contextTime.toFixed(3)}秒`,
      `有効: ${status.enabled} / ミュート: ${status.muted} / ページ非表示: ${status.hidden}`,
      `指定曲: ${status.cue ?? 'なし'} / 読込中: ${status.loadingCue ?? 'なし'} / 開始済み: ${status.activeCue ?? 'なし'}`,
      `BGM: ${Math.round(status.bgm * 100)}% / SE: ${Math.round(status.se * 100)}%`,
      `エラー: ${status.error ?? 'なし'}`,
    ].join('\n');
  }
}
function audioControls(): HTMLDetailsElement {
  const panel = document.createElement('details'); panel.className = 'audio-controls';
  const summary = document.createElement('summary'); panel.append(summary);
  const controls = document.createElement('div'); controls.className = 'audio-control-fields';
  const enable = document.createElement('button'); enable.dataset.audioEnable = '';
  enable.onclick = () => { onAudioVisibility(); audio.setMuted(false); void audio.enable(); };
  const mute = document.createElement('button'); mute.dataset.audioMute = '';
  mute.onclick = () => {
    const muted = !audio.status.muted; audio.setMuted(muted);
    if (!muted) void audio.enable();
  };
  const test = document.createElement('button'); test.textContent = '確認音を鳴らす';
  test.onclick = () => {
    onAudioVisibility(); audio.setMuted(false);
    void audio.enable().then(() => { if (audio.status.contextState === 'running') audio.playSE('se-heal'); });
  };
  controls.append(enable, mute, test);
  for (const [category, title] of [['bgm', 'BGM音量'], ['se', 'SE音量']] as const) {
    const label = document.createElement('label'); label.append(document.createTextNode(title));
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
    slider.dataset.audioVolume = category; slider.setAttribute('aria-label', title);
    const output = document.createElement('output'); output.dataset.audioOutput = category;
    slider.oninput = () => audio.setVolumes({ [category]: Number(slider.value) / 100 });
    label.append(slider, output); controls.append(label);
  }
  const note = document.createElement('p'); note.dataset.audioStatus = ''; note.setAttribute('role', 'status');
  const help = document.createElement('details');
  const helpSummary = document.createElement('summary'); helpSummary.textContent = '音が出ないときの情報';
  const diagnostic = document.createElement('pre'); diagnostic.dataset.audioDiagnostic = '';
  const refresh = document.createElement('button'); refresh.textContent = '状態を更新'; refresh.onclick = () => updateAudioControls(audio.status);
  const file = document.createElement('a'); file.href = '/audio/v1/se-heal.wav'; file.target = '_blank'; file.rel = 'noopener'; file.textContent = '確認音ファイルだけを別タブで開く';
  help.append(helpSummary, diagnostic, refresh, document.createTextNode(' '), file);
  help.ontoggle = () => { if (help.open) updateAudioControls(audio.status); };
  panel.append(controls, note, help); return panel;
}
const renderNotice = document.createElement('p');
renderNotice.setAttribute('role', 'status');
renderNotice.textContent = '戦場を準備しています。';
const renderRetry=document.createElement('button');renderRetry.textContent='景観を再読み込み';renderRetry.hidden=true;renderRetry.onclick=()=>{renderRetry.blur();pendingFocus='inspect-unit-picker';board.retryLandscape()};
const renderStatus=document.createElement('section');renderStatus.className='landscape-status';renderStatus.setAttribute('aria-label','戦場の読込み');renderStatus.append(renderNotice,renderRetry);document.querySelector('.command-panel')!.prepend(renderStatus);
let renderReport: BoardRenderReport = { stage: 'game-pending', error: null, warnings: [], drawn: false };
const renderErrorHistory: object[] = [];
let game: Phaser.Game | undefined;
const diagnostics = import.meta.env.DEV ? document.createElement('details') : null;
const diagnosticText = diagnostics ? document.createElement('pre') : null;
if (diagnostics && diagnosticText) {
  diagnostics.id = 'render-diagnostics';
  const summary = document.createElement('summary'); summary.textContent = '描画診断（開発用）';
  diagnostics.append(summary, diagnosticText); $('board').insertAdjacentElement('afterend', diagnostics);
}
function reportRender(report: BoardRenderReport) {
  const readinessChanged=renderReport.drawn!==report.drawn;
  renderReport = report;renderStatus.hidden=report.drawn;renderRetry.hidden=report.stage!=='landscape-failed';
  renderNotice.hidden = report.drawn;
  renderNotice.textContent = report.error ? '戦場を描画できません。描画エラーが発生しました。'
    : '戦場を準備しています。';
  updateRenderDiagnostics();
  if(readinessChanged)queueMicrotask(()=>render());
}
function updateRenderDiagnostics() {
  if (!diagnosticText) return;
  const canvas = game?.canvas, bounds = $('board').getBoundingClientRect();
  const gl = (game?.renderer as Phaser.Renderer.WebGL.WebGLRenderer | undefined)?.gl;
  diagnosticText.textContent = JSON.stringify({ ...renderReport, startupErrors: renderErrorHistory,
    sceneStatus: board?.sys?.settings?.status, renderer: game?.renderer?.type,
    board: [bounds.width, bounds.height], canvas: canvas ? [canvas.width, canvas.height] : null,
    scale: board?.scale ? [board.scale.width, board.scale.height] : null,
    camera: board?.cameras?.main ? [board.cameras.main.width, board.cameras.main.height] : null,
    contextLost: gl?.isContextLost?.() ?? null,
  }, null, 2);
}
const board = new BoardScene(selectBoardCell, reportRender,state.battleId,hd2dWalkTrial(import.meta.env.DEV,qaSession,location.search));
const onRenderError = (event: ErrorEvent) => {
  if (import.meta.env.DEV && renderErrorHistory.length < 8) renderErrorHistory.push({ type: 'error', message: event.message,
    filename: event.filename, line: event.lineno, column: event.colno, stack: event.error instanceof Error ? event.error.stack : null });
  reportRender({ ...renderReport, stage: 'runtime-error', error: event.message, drawn: false });
};
const onRenderRejection = (event: PromiseRejectionEvent) => {
  if (import.meta.env.DEV && renderErrorHistory.length < 8) {
    renderErrorHistory.push({ type: 'unhandledrejection', message: String(event.reason), stack: event.reason instanceof Error ? event.reason.stack : null });
    updateRenderDiagnostics();
  }
};
window.addEventListener('error', onRenderError);
if (import.meta.env.DEV) window.addEventListener('unhandledrejection', onRenderRejection);
try {
  game = new Phaser.Game({ type: Phaser.AUTO, parent: 'board', backgroundColor: '#173b40', scene: board, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, render: { antialias: true }, audio: { noAudio: true }, callbacks: {
    preBoot: () => reportRender({ ...renderReport, stage: 'game-boot' }),
    postBoot: () => updateRenderDiagnostics(),
  } });
} catch (error) { reportRender({ ...renderReport, stage: 'game-failed', error: error instanceof Error ? error.message : String(error), drawn: false }); }
// Shell changes and internal map scrolling also change Phaser's input bounds.
const mapResizeObserver = new ResizeObserver(() => {
  if (!game || !(state.battleId==='B01'||!!registeredLandscape(state.battleId))) return;
  const rect = $('board').getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) { game.scale.getParentBounds(); game.scale.refresh(); }
});
mapResizeObserver.observe($('board'));
const updateMapBounds = () => game?.scale.updateBounds();
document.querySelector('.battlefield')!.addEventListener('scroll', updateMapBounds, { passive: true });
let disposeRenderDiagnostics: (() => void) | undefined;
let disposed = false;
if (import.meta.env.DEV && diagnostics) void import('./view/renderDiagnostics').then(({ installRenderDiagnostics }) => {
  if (game && !disposed) disposeRenderDiagnostics = installRenderDiagnostics(diagnostics, game, board, $('board'));
}).catch(error => { if (!disposed && diagnosticText) diagnosticText.textContent += `\n追加診断の読込失敗: ${String(error)}`; });
if (import.meta.hot) import.meta.hot.dispose(() => { mapResizeObserver.disconnect(); document.querySelector('.battlefield')?.removeEventListener('scroll', updateMapBounds); disposed = true; releaseStart(); releaseStory(); releaseModalBackground(); document.removeEventListener('keydown', onGameKeyDown); battleFlow.dispose(); audio.dispose(); document.removeEventListener('visibilitychange', onAudioVisibility); disposeRenderDiagnostics?.(); game?.destroy(true); window.removeEventListener('error', onRenderError); window.removeEventListener('unhandledrejection', onRenderRejection); });
const button = (label: string, fn: () => void, disabled = false, cls = '', focusKey = label) => { const b = document.createElement('button'); b.textContent = label; b.disabled = disabled; b.className = cls; b.dataset.focusKey = focusKey; b.onclick = fn; return b; };
$('campaign-menu').dataset.focusKey = 'campaign-menu';
$('restart').dataset.focusKey = 'restart';
$('shorten-presentation').dataset.focusKey = 'shorten-presentation';
$('board').dataset.focusKey = 'board';
$('board').tabIndex = 0;
let notebookShell: { inspectionList: HTMLElement; brief: HTMLElement; extras: HTMLDetailsElement; extraBody: HTMLElement; targets: HTMLElement; restore(): void } | undefined;
/** Move the real controls, retaining their listeners and focus identities. */
function mountNotebookShell(enabled: boolean) {
  if (!enabled) { notebookShell?.restore(); notebookShell = undefined; return; }
  if (notebookShell) return;
  const shell = document.querySelector<HTMLElement>('.game-shell')!;
  const header = shell.querySelector<HTMLElement>('.masthead')!, panel = shell.querySelector<HTMLElement>('.command-panel')!;
  const footer = shell.querySelector<HTMLElement>(':scope > footer')!;
  const moved: { node: HTMLElement; marker: Comment }[] = [], added: HTMLElement[] = [];
  const move = (node: HTMLElement, parent: HTMLElement) => {
    const marker = document.createComment('notebook original position'); node.before(marker); moved.push({ node, marker }); parent.append(node);
  };
  const context = document.createElement('div'); context.className = 'notebook-context'; shell.insertBefore(context, header); added.push(context);
  const qaNotice = document.getElementById('qa-session-notice');
  if (qaNotice) {
    const qaDetails = document.createElement('details'); qaDetails.className = 'notebook-qa';
    const qaTitle = document.createElement('summary'); qaTitle.textContent = '隔離QA'; qaTitle.dataset.focusKey = 'qa-session-notice';
    qaTitle.title = qaNotice.textContent ?? ''; qaTitle.setAttribute('aria-label', qaNotice.textContent ?? '隔離QAの注意');
    qaDetails.append(qaTitle); context.append(qaDetails); move(qaNotice, qaDetails);
  }
  const brief = document.createElement('p'); brief.className = 'notebook-brief'; context.append(brief);
  move($('records'), context); move($('turn'), context);
  const tools = document.createElement('details'); tools.className = 'notebook-tools'; tools.id = 'notebook-tools';
  const toolsTitle = document.createElement('summary'); toolsTitle.textContent = '操作・設定'; toolsTitle.dataset.focusKey = 'notebook-tools';
  const toolsBody = document.createElement('div'); toolsBody.className = 'notebook-tools-body'; tools.append(toolsTitle, toolsBody); header.append(tools); added.push(tools);
  for (const id of ['campaign-menu','restart','shorten-presentation','audio-settings-host']) move($(id), toolsBody);
  move(shell.querySelector<HTMLElement>('.objective')!, toolsBody);
  move(shell.querySelector<HTMLElement>('.progress-strip')!, toolsBody);
  for (const id of ['escort-status','capture-status','archive-status','evacuation-status','repair-status','final-control-status','read-order-panel','equipment-chest-status']) move($(id), toolsBody);
  for (const node of [...panel.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node.tagName === 'DETAILS')) move(node, toolsBody);
  move($('roster'), toolsBody);
  const content = document.createElement('div'); content.className = 'notebook-dock-content'; panel.insertBefore(content, $('acting-unit')); added.push(content);
  move($('acting-unit'), content); move($('inspection-teams'), content);
  const inspectionList = document.createElement('div'); inspectionList.className='inspection-list'; inspectionList.dataset.inspectionList='true';
  inspectionList.setAttribute('role','group');inspectionList.setAttribute('aria-label','人物一覧・クリックで詳細');
  content.append(inspectionList); move($('selection'), content);
  const targets = document.createElement('div'); targets.className = 'notebook-target-options'; content.append(targets);
  const extras = document.createElement('details'); extras.className = 'notebook-extra-commands';
  const extrasTitle = document.createElement('summary'); extrasTitle.textContent = '技・水門・資料・宝箱'; extrasTitle.dataset.focusKey = 'notebook-extra-commands';
  const extraBody = document.createElement('div'); extras.append(extrasTitle, extraBody); content.append(extras);
  const log = document.createElement('details'); log.className = 'notebook-log';
  const logTitle = document.createElement('summary'); logTitle.textContent = '行動記録'; logTitle.dataset.focusKey = 'notebook-log'; log.append(logTitle);
  move($('logs'), log); move($('message'), footer); move($('save-status'), footer); footer.append(log); added.push(log);
  notebookShell = { inspectionList, brief, extras, extraBody, targets, restore: () => {
    for (const { node, marker } of [...moved].reverse()) { marker.before(node); marker.remove(); }
    for (const node of added) node.remove();
  } };
}
function updateNotebookControls(playing: boolean) {
  if (!notebookShell) return;
  const { inspectionList, brief, extras, extraBody, targets } = notebookShell;
  brief.textContent = getBattleConfig(state.battleId).intro;
  renderInspectionRoster(inspectionList,state.units.filter(u=>u.team===inspectionTeam),selected,!playing,id=>{
    selected=id; render();
  });
  const commands = $('commands'), grid = commands.querySelector<HTMLElement>('.command-grid');
  extraBody.replaceChildren(); targets.replaceChildren();
  const primary = document.createElement('div'); primary.className = 'notebook-primary-actions';
  for (const name of ['移動先を選ぶ','攻撃する敵を選ぶ','防御','向きを決めて行動を終了']) {
    const control = [...commands.querySelectorAll<HTMLButtonElement>('button')].find(b => b.dataset.focusKey === name);
    if (!control) continue;
    if (name === '攻撃する敵を選ぶ') { control.textContent = 'たたかう'; control.setAttribute('aria-label', name); control.classList.add('notebook-attack-action'); }
    primary.append(control);
  }
  if (grid?.children.length) extraBody.append(grid); else grid?.remove();
  for (const control of [...commands.querySelectorAll<HTMLButtonElement>(':scope > button')]) {
    if (control.classList.contains('target')) targets.append(control);
    else primary.append(control);
  }
  extras.hidden = !extraBody.children.length; targets.hidden = !targets.children.length;
  commands.replaceChildren(primary);
}
function currentFocusKey() {
  const active = document.activeElement as HTMLElement | null;
  return active?.closest('#overlay') ? null : active?.dataset.focusKey ?? null;
}
function restoreFocus(key: string | null) {
  if (!key || dialogOpen) return;
  if (!interactive()) { pendingFocus = key; return; }
  pendingFocus = null;
  const previous = app.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`);
  let next = previous && !(previous instanceof HTMLButtonElement && previous.disabled) ? previous : null;
  if (!next) next = state.activeId
    ? $('commands').querySelector<HTMLButtonElement>('button:not(:disabled)')
    : notebookShell?.inspectionList.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)') ?? $('roster').querySelector<HTMLButtonElement>('button[data-unacted="true"]:not(:disabled)');
  next?.focus({ preventScroll: true });
}
function closeDialog() {
  releaseStart();
  releaseStory();
  const returnTo = modalReturnFocus;
  dialogOpen = false; modalReturnFocus = null; $('overlay').innerHTML = ''; releaseModalBackground();
  render(returnTo);
}
function say(text: string) { message = text; render(); }
function interactive() { return screen === 'battle' && renderReport.drawn && !interactionBusy() && !dialogOpen && state.phase === 'playing' && state.turn === 'player'; }
function dispatch(command: Command) {
  if (!renderReport.drawn || !battleFlow.canDispatch(dialogOpen)) return;
  const previous = state;
  const result = reduce(state, command);
  if (result.error) { say(result.error); return; }
  commitMovementFacing(previous,result.state,command,true);
  state = result.state; mode = 'inspect';
  const effect = soundForTransition(previous, state, command);
  if (effect && state.phase === 'playing') audio.playSE(effect);
  message = command.type === 'move' && previous.activeId && getUnit(previous, previous.activeId)?.plankReady
    ? '移動を確定し、渡り板を消費しました。行動前の移動取消では効果も戻ります。'
    : command.type === 'undoMove' && state.activeId && getUnit(state, state.activeId)?.plankReady
      ? '移動と渡り板の効果を戻しました。付与者の使用回数は戻りません。'
      : state.activeId ? '移動・行動を選ぶか、向きを決めて行動を終了。' : '未行動の味方を選んで行動を開始してください。';
  announceCommittedAttack(previous);
  presentCommitted(previous, [command]);
}
function announceCommittedAttack(previous: typeof state) {
  const attack = committedAttackResolution(previous, state);
  if (!attack) return;
  const actor = getUnit(state, attack.actorId), target = getUnit(state, attack.targetId);
  message = `${actor?.name ?? '人物'} → ${target?.name ?? '対象'}：${attack.hit ? `命中、${attack.damage}ダメージ` : '外れ'}。${target ? `HP ${target.hp}/${target.maxHp}。` : ''}行動を消費しました。`;
}
function presentCommitted(previous: typeof state, commands: readonly Command[]) {
  const plan = board.preparePresentation(createPresentation(previous, state, commands), state);
  battleFlow.presentCommitted(plan);
}
function performEnemyActivation() {
  const previous = state;
  const activation = runEnemyActivationWithTrace(state);
  state = activation.state;
  const effect = soundForTransition(previous, state);
  if (effect && state.phase === 'playing') audio.playSE(effect);
  announceCommittedAttack(previous);
  presentCommitted(previous, activation.commands);
}
function modal(title: string, body: string, yes: string, action: () => void, cancel = true, cancelLabel = '取消') {
  releaseStart();
  releaseStory();
  modalReturnFocus = currentFocusKey() ?? pendingFocus;
  releaseModalBackground();
  restoreModalBackground = makeModalBackgroundInert(app.querySelector<HTMLElement>('main.game-shell')!);
  dialogOpen = true; render();
  $('overlay').innerHTML = `<div class="veil"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><p class="eyebrow">流域盟約戦記</p><h2 id="dialog-title">${title}</h2><div class="dialog-body">${body}</div><div class="dialog-actions"></div></section></div>`;
  $('overlay').querySelector('.dialog-body')!.append(audioControls());
  updateAudioControls(audio.status);
  const actions = $('overlay').querySelector('.dialog-actions')!;
  const settle = createDialogSettlement(() => dialogOpen && actions.isConnected, closeDialog);
  if (cancel) actions.append(button(cancelLabel, () => settle(), false, 'quiet'));
  const primary = button(yes, () => settle(action), false, 'primary'); actions.append(primary); primary.focus();
}
function confirmCommand(title: string, body: string, command: Command) { modal(title, body, command.type === 'attack' ? 'たたかう' : '確定', () => dispatch(command), true, command.type === 'attack' ? 'やめる' : '取消'); }
/** Canvas ambiguity is a view choice; choosing a floor never commits a command. */
function selectBoardCell(pos: Pos, candidates?: Pos[]) {
  if (!interactive()) return;
  const floors = (state.battleId==='B01'||!!registeredLandscape(state.battleId)) ? (candidates?.length ? candidates.map(p => getCell(state, p)!).filter(Boolean).sort((a,b) => a.height - b.height) : b01OverlappingFloors(registeredLandscape(state.battleId)?registeredFloors(registeredLandscape(state.battleId)!,state.cells):state.cells, pos)) : [];
  if (floors.length < 2) { selectCell(pos); return; }
  modal('重なる床を選ぶ', '<p>上の床と、その下を通る床が重なっています。選んだ床を表示します。移動は次の確認で確定します。</p>', '閉じる', () => {}, false);
  const actions = $('overlay').querySelector('.dialog-actions')!;
  for (const floor of floors) {
    const occupant = state.units.find(u => u.hp > 0 && u.pos.x === floor.x && u.pos.y === floor.y);
    const option = button(`${floor.height === 0 ? '下の床' : floor.height === 1 ? '中段の床' : '上の床'} H${floor.height} (${floor.x}, ${floor.y})${occupant ? ' · ' + occupant.name : ''}`, () => {
      if (!dialogOpen || !actions.isConnected) return;
      closeDialog(); selectCell({ x: floor.x, y: floor.y });
    }, false, 'quiet', `floor:${floor.x},${floor.y}`);
    actions.insertBefore(option, actions.lastElementChild);
  }
  (actions.querySelector('button') as HTMLButtonElement).focus();
}
function selectCell(pos: Pos) {
  if (!interactive()) return;
  cursor = pos;
  const unit = state.units.find(u => u.hp > 0 && u.pos.x === pos.x && u.pos.y === pos.y);
  if (mode === 'move' && state.activeId) {
    const candidate = reachable(state, state.activeId).find(r => r.x === pos.x && r.y === pos.y);
    if (!candidate || candidate.cost === 0) { say('そこへは移動できません。現在地以外の青緑の範囲を選んでください。'); return; }
    const cell = getCell(state, pos)!;
    const origin = getUnit(state, state.activeId)!.pos;
    confirmCommand('移動を確定', `<p>現在地 (${origin.x}, ${origin.y}) → 移動先 (${pos.x}, ${pos.y}) ・ 高さ H${cell.height} ・ ${cell.bridge ? '石橋' : cell.shallow ? '浅瀬' : '乾地'}</p><p>この経路の移動費 ${candidate.cost} / 上限 ${getUnit(state, state.activeId)!.move}</p>${getUnit(state, state.activeId)!.plankReady ? '<p>渡り板をこの移動で消費します。乾地だけでも消費し、行動前に移動取消すると効果も戻ります。</p>' : ''}<p>${state.battleId === 'B12' ? '操作点の占有は移動で行い、指示行動や予約は不要です。' : state.battleId === 'B11' ? '保守員救出と補助弁復旧指示は別々の行動です。' : state.battleId === 'B10' ? '港門信号の操作は別の行動です。' : state.battleId === 'B09' ? '護送は行動を消費せず次R開始に判定。次の経路セルを塞がないでください。' : state.battleId === 'B08' ? 'P採取とN/S操作は別々の行動です。' : state.battleId === 'B07' ? '住民避難案内は別の行動です。' : state.battleId === 'B04' || state.battleId === 'B06' ? '' : '採取は別の行動です。'}${state.battleId === 'B12' ? `A${finalALabel}・B${finalBLabel}に別々の生存味方を立たせ連続2R終了を迎え、ヴェスクを制圧してください。敵隣接は保持を妨げません。制圧＋保持2Rの複合判定はR終了だけです。` : state.battleId === 'B11' ? `W1/W2救出とA/B両復旧済み・予約なし、生存リセが西退去口${repairExitLabel}に揃うと即勝利。予約だけでは退去できません。` : state.battleId === 'B10' ? '外港鎖門開通済み・予約なし・検問C上の味方と敵の隣接なしで連続2R終了を迎えてください。到達だけでは勝てません。' : state.battleId === 'B09' ? `生存味方が一行に隣接し、敵の隣接なし・次セル空きで前進します。一行${delegationExitLabel}とリセ生存で勝利、リセ自身の退出は不要。` : state.battleId === 'B08' ? 'P取得・両水路排水済み・予約なし・C上の味方と敵の隣接なしで連続2R終了を迎えてください。到達だけでは勝てません。' : state.battleId === 'B07' ? 'V1・V2の両方を案内しリセが東出口(19,11)へ。住民は案内後に場外係へ引き渡します。' : state.battleId === 'B06' ? `鎖門を開き、トマに隣接して東の保護地点${chainExitLabel}へ護送。次の経路セルを塞がないでください。` : state.battleId === 'B05' ? '必須D・T・Sを揃え、リセが西の退去口' + archiveExitLabel + 'にいると即勝利。任意Kが必要なら先に確保してください。' : state.battleId === 'B03' ? '名簿Mと荷車の搬出が勝利条件。次の経路セルを塞がないようにしてください。' : state.battleId === 'B04' ? '水路を入水させ、予約なし・敵の隣接なしで制圧点Cを連続2R保持してください。移動先への到達だけでは勝てません。' : 'リセが必要記録を持って脱出すると即勝利します。'}</p>`, { type: 'move', to: pos }); return;
  }
  if (mode === 'attack' && state.activeId) {
    if (!unit || unit.team !== 'enemy') { say('生存している敵を選んでください。'); return; }
    const preview = attackPreview(state, state.activeId, unit.id);
    if (!preview.legal) { say(preview.reason || '攻撃できません。'); return; }
    const remaining = Math.max(0, unit.hp - preview.damage), loss = unit.hp - remaining;
    const direction = preview.sector === 'front' ? '正面' : preview.sector === 'rear' ? '背後' : '左右';
    confirmCommand('攻撃を確定', `<p>${unit.name} ／ ${direction} <strong>命中率 ${preview.hitChance}%</strong></p><p>命中時 <strong>${preview.damage} ダメージ</strong>${preview.rear ? ' ・ 近接背後 +2' : ''}</p><p>HP ${unit.hp} → 命中時 ${remaining} ／ 外れ時 ${unit.hp}</p><div class="hp-forecast" role="img" aria-label="現在HP${unit.hp}、命中した場合${remaining}、外れた場合${unit.hp}"><span class="hp-forecast-remaining" style="width:${remaining / unit.maxHp * 100}%"></span><span class="hp-forecast-loss" style="width:${loss / unit.maxHp * 100}%"></span></div><p class="forecast-key">斜線は命中した場合の減少予告です。</p><p>やめる：行動を消費せず、移動後の位置を保ちます。移動取消は別の操作です。</p>${state.battleId === 'B12' && unit.id === getBattleConfig(state.battleId).commanderId ? '<p>ヴェスクHP0は非致死の制圧済み・保全対象です。占有を解除し、再攻撃・回復・行動開始の対象から外れます。死亡や逃亡ではありません。拘束は戦後、裁定所命令に基づき首府警備隊が執行します。制圧後も両点保持2RとR終了が必要です。</p>' : ''}`, { type: 'attack', targetId: unit.id }); return;
  }
  if ((mode === 'survey' || mode === 'protect' || mode === 'plank' || mode === 'readOrder') && state.activeId) {
    if (!unit) { say(mode === 'readOrder' ? '対象の生存敵を選んでください。' : '対象の生存味方を選んでください。'); return; }
    const preview = jobCommandPreview(state, state.activeId, unit.id, mode);
    if (!preview.legal) { say(preview.reason); return; }
    const actor = getUnit(state, state.activeId)!;
    const title = { survey: '測線を確定', protect: '護衛を確定', plank: '渡り板を確定', readOrder: '読令を確定' }[mode];
    const effect = mode === 'readOrder'
      ? 'の現在盤面での優先候補を読みます。盤面全体・遮蔽や高さの制限なし。対象の次の行動終了まで、移動先・経路・攻撃対象・現在の命中率・命中時ダメージを無料更新します。次に必ず動く敵の確約ではありません。行動済みの敵にも使用でき、次Rを越えて持続。別の敵への2回目は可能、同じ敵への重複は不可。ダニ退避後も残り、対象退避・制圧・終戦で終了します。'
      : mode === 'survey'
      ? 'の次の通常攻撃を+2します。射程3・射線が必要。同効果を重ねられません。'
      : mode === 'plank'
        ? 'に渡り板を付与します。隣接・高さ差1以内の他の生存味方戦闘員だけが対象です。次の合法な移動に限り浅瀬の移動費1。乾地だけの移動でも消費します。行動終了・ラウンド経過・付与者退避では失効せず、対象退避・戦闘終了で破棄します。移動取消で対象の効果は戻りますが、付与者の使用回数は戻りません。'
        : 'の次の被ダメージを−2します。隣接・高さ差1以内。護衛者の次の行動開始または退避で終了。通常防御とは大きい効果だけを使います。';
    const remaining = mode === 'readOrder' ? actor.readCharges : mode === 'survey' ? actor.surveyCharges : actor.plankCharges;
    confirmCommand(title, '<p>' + unit.name + effect + '</p><p>行動1回。' + (mode === 'protect' ? '回数制限はありません。' : `残り ${remaining ?? 0} → ${(remaining ?? 0) - 1} 回。`) + '</p>', { type: mode, targetId: unit.id }); return;
  }
  if (mode === 'heal' && state.activeId) {
    if (!unit) { say('手当する生存味方・護送対象を選んでください。'); return; }
    const preview = healPreview(state, state.activeId, unit.id);
    if (!preview.legal) { say(preview.reason); return; }
    const healer = getUnit(state, state.activeId)!;
    confirmCommand('手当を確定', `<p>${unit.name}: HP ${unit.hp} → ${Math.min(unit.maxHp, unit.hp + preview.amount)}（+${preview.amount}）</p><p>隣接・高さ差1まで。行動1回、手当の残り ${healer.healCharges} → ${(healer.healCharges ?? 0) - 1} 回。退避した仲間は復帰できません。</p>`, { type: 'heal', targetId: unit.id }); return;
  }
  if (unit) { selected = unit.id; inspectionTeam = unit.team; message = unit.kind === 'escort' ? `${unit.name}は護送対象です。手動で行動を開始できません。${state.battleId === 'B06' ? '鎖門を開き、' : ''}護送条件を満たすと次ラウンド開始に進みます。` : unit.team === 'player' ? 'この味方の行動を開始して指示できます。' : '敵の能力を確認できます。'; }
  else if (state.battleId === 'B12' && state.finalControl?.commanderSubdued && state.units.some(u => u.id === getBattleConfig(state.battleId).commanderId && u.hp === 0 && u.pos.x === pos.x && u.pos.y === pos.y)) { message = 'ヴェスク 制圧済み・保全対象（非致死）。セル占有なし。再攻撃・回復・行動開始不可、戦後に裁定所命令で首府警備隊が拘束します。'; }
  else { const cell = getCell(state, pos); message = `座標 (${pos.x}, ${pos.y}) / H${cell?.height ?? '?'} / ${state.battleId==='B08'&&getBattleConfig('B08').sluiceGates!.some(g=>g.panel.x===pos.x&&g.panel.y===pos.y)?'水路操作盤・歩行不可':state.battleId==='B04'&&pos.x===getBattleConfig('B04').gate!.x&&pos.y===getBattleConfig('B04').gate!.y?'水門操作盤・歩行不可':state.battleId==='B06'&&pos.x===getBattleConfig('B06').gate!.x&&pos.y===getBattleConfig('B06').gate!.y?'鎖門操作盤・歩行不可':!!registeredLandscape(state.battleId) && cell?.blocked && !getBattleConfig(state.battleId).records.some(r=>r.x===pos.x&&r.y===pos.y) ? '景観境界・歩行不可（登録床を通ってください）' : cell?.water && !cell.bridge ? '深水・歩行不可（橋を通ってください）' : cell?.bridge ? '石橋・移動費1' : cell?.blocked ? (state.battleId === 'B11' ? (getBattleConfig(state.battleId).records.some(r => r.x === pos.x && r.y === pos.y) ? '保守員・救出前は通行不可' : getBattleConfig(state.battleId).repairSites?.some(r => r.pos.x === pos.x && r.pos.y === pos.y) ? '補助弁・復旧後も通行不可' : '低い瓦礫・通行不可／弩の射線は直接遮らない') : state.battleId === 'B07' ? (getBattleConfig(state.battleId).records.some(r => r.x === pos.x && r.y === pos.y) ? '住民集合点・案内前は通行不可' : '景観境界・歩行不可／石垣と段丘の高さで射線を判定') : state.battleId === 'B05' ? '資料卓・歩行不可／石造上段は高さで射線判定' : state.battleId === 'B08' ? `${getBattleConfig(state.battleId).sluiceGates?.find(g => g.panel.x === pos.x && g.panel.y === pos.y)?.id ?? ''} 操作盤・通行不可` : state.battleId === 'B10' ? '外港鎖門の信号盤・開通後も通行不可／水位・地形変更なし' : state.battleId === 'B06' ? '鎖門操作盤・通行不可' : '壁・移動不可') : cell?.shallow ? `浅瀬・移動費${state.activeId ? effectiveShallowCost(getUnit(state, state.activeId)!) : '2（浅瀬適性・渡り板があれば1）'}` : '乾地・移動費1'}`; }
  render();
}
function render(preferredFocus?: string | null) {
  // The notebook follows the two integrated adopted scenes; gameplay handlers remain shared.
  document.body.dataset.uiBattle = state.battleId;
  document.body.dataset.uiScreen = screen;
  const notebook = (state.battleId==='B01'||!!registeredLandscape(state.battleId));
  document.body.dataset.uiNotebook = String(notebook);
  const panelHeading = document.querySelector<HTMLElement>('.panel-heading');
  if (panelHeading) panelHeading.innerHTML = notebook ? '水辺の野帳 <small>FIELD NOTEBOOK</small>' : '部隊指揮 <small>TACTICAL ORDERS</small>';
  const focusKey = preferredFocus ?? currentFocusKey() ?? pendingFocus;
  mountNotebookShell(notebook);
  const playing = interactive();
  ($('shorten-presentation') as HTMLButtonElement).disabled = !battleFlow.canShortenPresentation;
  ($('restart') as HTMLButtonElement).disabled = interactionBusy() || dialogOpen || screen !== 'battle';
  const config = getBattleConfig(state.battleId);
  const escortBattle = getBattleConfig(state.battleId).objective === 'escort';
  const chainBattle = state.battleId === 'B06';
  const delegationBattle = state.battleId === 'B09';
  const portBattle = state.battleId === 'B10';
  const repairBattle = config.objective === 'repair';
  const finalBattle = config.objective === 'finale';
  const captureBattle = state.battleId === 'B04';
  const sluiceBattle = config.objective === 'sluice';
  const archiveBattle = state.battleId === 'B05';
  const evacuationBattle = config.objective === 'evacuate';
  const enemyForce = finalBattle ? 'ヴェスク指揮隊' : repairBattle ? '下層保守路警備隊' : portBattle ? '中央港検問隊' : delegationBattle ? '中央回廊封鎖隊' : sluiceBattle ? '補助堰警備隊' : evacuationBattle ? '中央封鎖兵・下流妨害兵' : captureBattle ? '下流急進派' : '中央警備隊';
  $('chapter-number').textContent = portBattle || repairBattle || finalBattle ? '第四章' : evacuationBattle || sluiceBattle || delegationBattle ? '第三章' : captureBattle || archiveBattle || chainBattle ? '第二章' : '第一章';
  const escort = escortUnit(state);
  ($('campaign-menu') as HTMLButtonElement).disabled = interactionBusy() || dialogOpen;
  $('chapter-subtitle').textContent = config.subtitle;
  $('battle-title').textContent = config.id + ' ─ ' + config.title;
  $('board').setAttribute('aria-label', config.title + 'の戦場');
  $('objective-text').textContent = config.intro;
  $('objective-steps').textContent = finalBattle ? '① ヴェスクをHP0の非致死制圧 → ② A/Bに別々の生存味方を同時配置 → ③ 両点連続2R保持＋制圧済みでR終了（順不同）' : repairBattle ? `① 保守員W1/W2を救出 → ② 対応弁A/Bに復旧指示・次R発効 → ③ 両復旧後リセが西退去口${repairExitLabel}へ` : portBattle ? `① 信号盤${portSignalLabel}から開通予約 → ② 次R開始に外港鎖門開通 → ③ 敵の隣接なしで検問C${portCaptureLabel}を連続2R保持` : delegationBattle ? `① 一行に護衛を隣接 → ② 敵の隣接と次セルの占有を解く → ③ 次R開始に1セルずつ退出口${delegationExitLabel}へ` : sluiceBattle ? '① 保守記録Pを採取 → ② N/S両水路の排水を予約・次R発効 → ③ 予約と敵の隣接なしでCを連続2R保持' : evacuationBattle ? '① 集合点V1・V2に隣接 → ② 敵の隣接を解き住民避難案内（各1行動） → ③ リセが東出口(19,11)へ' : chainBattle ? `① 鎖門の開通を予約 → ② 次R開始に開門 → ③ トマに隣接し東の保護地点${chainExitLabel}へ` : archiveBattle ? '① 必須資料D・T・Sを採取 → ② 任意Kは帰還前に → ③ リセが西の退去口' + archiveExitLabel + 'へ' : state.battleId === 'B01' ? '① 記録A・Bに隣接 → ② 採取（各1行動） → ③ リセが脱出　｜ 水門は任意' : captureBattle ? '① 水門で次Rの再入水を予約 → ② 制圧点Cへ → ③ 敵の隣接・予約なしで連続2R保持' : escortBattle ? '① 名簿Mを確保 → ② 荷車に隣接して護送 → ③ 荷車を搬出（リセ生存）' : '① 観測点Oに隣接 → ② 観測（1行動） → ③ リセが石橋を渡り脱出';
  $('save-status').textContent = saveStatus;
  $('map-note').textContent = finalBattle ? '登録床は乾地・景観境界は通行不可・操作点は通行可能 ｜ 占有だけで保持・敵隣接は妨害しない ｜ 第8R終了期限・制圧対象は非致死保全' : repairBattle ? '登録床は乾地・水路/石壁は通行不可 ｜ 弁は復旧後も通行不可・石壁と段丘は高さで射線判定 ｜ 救出セルだけ開通 ｜ 第12R終了が退去期限' : portBattle ? '登録床は乾地・港面/倉庫壁は通行不可 ｜ 信号盤は開通後も通行不可・迂回可能 ｜ 水位・地形変更なし ｜ 第12R終了が入港確保期限' : delegationBattle ? `登録床は乾地・水路/石壁は通行不可 ｜ 一行の経路を空ける・次R開始に1セル ｜ 第${delegationConfig.roundLimit}R終了が護送期限` : sluiceBattle ? 'N/Sは独立・各4セルのみ次Rに切替 ｜ 操作盤は通行不可・迂回可能 ｜ C保持はR終了時・第12R終了期限' : evacuationBattle ? '登録床は乾地 ｜ 住民集合点は案内まで通行不可・石垣と段丘は高さで射線を判定 ｜ 第10R終了が避難期限' : chainBattle ? `鎖門は次R開始に開通・水位と石橋は変わらない ｜ トマの経路を空ける・第${chainConfig.roundLimit}R終了が護送期限` : archiveBattle ? '資料卓は通行不可・石造上段は高さで射線判定 ｜ 西' + archiveExitLabel + 'へ退去・第10R終了で封鎖' : captureBattle ? '水路8床のみ次Rに切替・石壁は高さで射線判定 ｜ CはR終了時・予約中は保持不可・第10R終了期限' : config.gate ? '浅瀬は移動費2（浅瀬適性があれば1）・水門は任意・高所H2は弩射程5' : escortBattle ? `荷車は次R開始に1セル進行・経路の上を空ける・第${config.roundLimit}R終了が搬出期限` : `登録床と石橋を進む・景観境界は歩行不可・第${config.roundLimit}R終了で閉鎖`;
  $('battle-guide').textContent = finalBattle ? finalGuide : repairBattle ? repairGuide : portBattle ? portGuide : delegationBattle ? delegationGuide : sluiceBattle ? sluiceGuide : evacuationBattle ? 'リセ・ガラン・ネイア・セナを推奨する4人編成（準備で変更可）。V1(4,4)とV2(13,12)に上下左右隣接・高さ差1以内から、各1行動で住民避難案内。集合点に生存敵が上下左右で隣接すると案内不可（敵との高さ差は不問）。案内後は場外の案内係が退避路へ送る抽象化です。住民HP・被ダメージ・盤面上の護送や移動はありません。案内済みの集合点は通行可能。V1・V2の両方と生存リセの東出口(19,11)到達で即勝利。リセが先に出口にいても最後の案内で勝利。リセHP0または第10R終了に未達で敗北。敵全滅だけでは勝てません。中央封鎖兵と下流妨害兵は両方とも調査隊の敵として行動し、相互攻撃しません。施療士として出撃したセナの手当は生存味方に+6を2回。' : chainBattle ? chainGuide : archiveBattle ? '低い書架は通行不可。弩の射線は遮りません。書架越しでも距離・高低差・他の障害による射線判定を満たせば攻撃できます。必須資料D・T・Sは順不同。どの生存味方でも上下左右の隣接・高さ差1以内から1行動で採取し、部隊で共有します。必須3件を揃えリセが西の退去口' + archiveExitLabel + 'にいれば即勝利。リセが先に退去口にいる場合も、最後の必須資料を採取した瞬間に終了します。任意の補償名簿Kを持ち帰るなら先に確保。敵全滅だけでは勝てません。リセHP0または第10R終了に未達で敗北。基本4人、編成は戦闘前に変更できます。新職技は今後拡充します。' : captureBattle ? '水門は上下左右の隣接・高さ差1以内から1行動で再入水/排水を予約。発効は次R開始、予約は1件で上書き不可。対象8セルだけ移動費1↔2（浅瀬適性があれば1）。高さ・HP・位置は変わりません。Cに生存味方戦闘員が立ち、敵が上下左右に隣接せず、水路入水済み・予約なしならR終了に保持+1、条件不足なら0。連続2Rで勝利。リセHP0で敗北、第10R終了は保持達成を先に判定。控えは救護と記録を担います。職固有技は今後拡充します。' : config.gate ? '記録と水門は上下左右に隣接して操作。水門は任意で、対象水路は次ラウンドに移動費2→1（浅瀬適性のある人物は1のまま）。敵全滅だけでは勝てません。第8R終了またはリセ退避で敗北。' : escortBattle ? '名簿Mは上下左右の隣接から1行動で確保。荷車の現位置に味方戦闘員が隣接し、敵が隣接せず、次セルが空いていれば次R開始に1セル進みます。荷車HPは負傷者の安全。リセか荷車が倒れる、第'+config.roundLimit+'R終了までに未達で敗北。セナは隣接生存味方・荷車に手当+6（2回）、退避復帰不可。' : `観測点Oは上下左右に隣接して観測。階段と石橋の登録床を進み、観測後はリセが東端の脱出へ。第${config.roundLimit}R終了に橋が閉鎖し敗北します。敵全滅だけでは勝てません。`;
  $('records').textContent = finalBattle ? `両操作点 連続保持 ${state.finalControl?.heldRounds ?? 0}/2R ｜ ヴェスク ${state.finalControl?.commanderSubdued ? '制圧済み・保全対象' : '未制圧'} ｜ U/Vは勝利時に確保・盤面採取なし` : repairBattle ? `保守員救出 ${config.records.filter(r => state.records.includes(r.id)).length}/2 ｜ 補助弁復旧 ${Object.values(state.repairs ?? {}).filter(r => r.completed).length}/2 ｜ 両復旧＋リセ西${repairExitLabel}で退去` : portBattle ? `検問C 連続保持 ${state.capture?.heldRounds ?? 0}/2R ｜ 入港確認記録C ${state.records.includes('C') ? '確保済み' : '勝利時に確保・盤面採取なし'}` : delegationBattle ? `到着後の記録 J 三都市招集連署 / H 裁定所受理 ｜ ${state.records.includes('J') && state.records.includes('H') ? '確保済み' : '護送到着後に取得・盤面採取なし'}` : sluiceBattle ? `保守記録P ${state.records.includes('P') ? '✓ 確保' : '未取得'} ｜ C保持 ${state.capture?.heldRounds ?? 0}/2R` : evacuationBattle ? `住民避難 ${state.records.filter(id => config.records.some(r => r.id === id)).length}/2 ｜ ${config.records.map(r => r.id + (state.records.includes(r.id) ? ' 案内済み' : ' 未案内')).join('・')}` : chainBattle ? `書記保全記録W ${state.records.includes('W') ? '✓ 確保' : '護送完了で確保'} ｜ 鎖門 ${state.gate.drained ? '開通済み' : state.gate.pendingRound ? '開通予約済み' : '未開通'}` : archiveBattle ? `必須 ${requiredRecords(state.battleId).filter(r => state.records.includes(r.id)).length}/3 ｜ 任意K ${state.records.includes('K') ? '確保' : '未取得'}` : captureBattle ? `制圧C ${state.capture?.heldRounds ?? 0}/${config.requiredHoldRounds ?? 2}R` : '記録 ' + state.records.length + '/' + config.records.length + '　' + config.records.map(r => r.id + (state.records.includes(r.id) ? ' ✓' : ' 未')).join('　');
  $('turn').innerHTML = `<strong>ROUND ${String(state.round).padStart(2, '0')} <small>/ ${String(config.roundLimit).padStart(2, '0')}</small></strong><span class="${state.turn === 'enemy' ? 'enemy-turn' : ''}">${state.turn === 'enemy' ? enemyForce + ' · 敵ターン' : state.activeId ? '味方ターン · 行動中' : '味方ターン · 行動する人物を選択'}</span><small>未行動 味${state.units.filter(u => u.team === 'player' && u.kind !== 'escort' && !u.acted && u.hp > 0).length} / 敵${state.units.filter(u => u.team === 'enemy' && !u.acted && u.hp > 0).length}</small><em class="${(state.battleId === 'B02' && state.round >= config.roundLimit - 2) || ((escortBattle || archiveBattle || evacuationBattle) && state.round >= (state.battleId === 'B03' ? config.roundLimit-2 : chainBattle || delegationBattle ? config.roundLimit - 2 : 8)) || ((captureBattle || finalBattle) && state.round >= 6) || ((portBattle || repairBattle) && state.round >= 10) || (sluiceBattle && state.round >= 10) ? 'deadline' : ''}">${finalBattle ? `分散操作確保期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : repairBattle ? `保守路退去期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : portBattle ? `入港確保期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : delegationBattle ? `護送期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : sluiceBattle ? `補助堰確保期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : evacuationBattle ? `避難期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : chainBattle ? `護送期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R） ｜ 鎖門: ${state.gate.drained ? '開通済み' : state.gate.pendingRound ? `R${state.gate.pendingRound}開始に開通` : '未開通'}` : archiveBattle ? `蔵の封鎖: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : captureBattle ? `制圧期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : escortBattle ? `搬出期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : !config.gate ? `橋閉鎖: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : state.gate.pendingRound ? `水門: R${state.gate.pendingRound}開始に排水` : state.gate.drained ? '水門: 排水済み' : '水門: 浅瀬（操作で次R排水）'}</em>`;
  const finalStatus = $('final-control-status');
  finalStatus.hidden = !finalBattle;
  if (finalBattle) {
    const preview = finalControlPreview(state), commander = getUnit(state, config.commanderId!);
    finalStatus.replaceChildren();
    for (const point of preview.points) {
      const occupant = point.occupantId ? getUnit(state, point.occupantId) : undefined, line = document.createElement('p');
      line.textContent = point.id + ' ' + point.name + '(' + point.pos.x + ',' + point.pos.y + ') ｜ ' + (occupant ? occupant.name + ' 占有中' : '空き・生存味方の占有なし'); finalStatus.append(line);
    }
    const line = document.createElement('p');
    line.textContent = '両点 連続保持 ' + preview.heldRounds + '/' + preview.requiredRounds + 'R ｜ 次のR終了: ' + (preview.eligible ? '保持+1可能' : '保持0へ: ' + preview.reason) + ' ｜ ヴェスク HP ' + (commander?.hp ?? '?') + '/' + (commander?.maxHp ?? '?') + ' ' + (preview.commanderSubdued ? '制圧済み・保全対象（非致死/占有なし）' : '未制圧') + (preview.heldRounds >= preview.requiredRounds && !preview.commanderSubdued ? ' ｜ 保持達成、ヴェスク制圧後のR終了を待つ' : '') + ' ｜ 敵隣接は保持を妨げない・指示行動/予約不要'; finalStatus.append(line);
  }
  const repairStatus = $('repair-status');
  repairStatus.hidden = !repairBattle;
  if (repairBattle) {
    repairStatus.replaceChildren();
    for (const site of config.repairSites ?? []) {
      const worker = config.records.find(r => r.id === site.workerRecordId)!, preview = repairPreview(state, site.id), status = state.repairs![site.id], line = document.createElement('p');
      const rescue = evacuationPreview(state, worker.id);
      line.textContent = `${worker.id} ${worker.name}(${worker.x},${worker.y}) ${state.records.includes(worker.id) ? '救出済み・場外で協力' : '未救出: ' + rescue.reason} → ${site.id} ${site.name}(${site.pos.x},${site.pos.y}) ｜ ${status.completed ? '復旧済み' : status.pendingRound ? `R${status.pendingRound}開始に復旧予約・上書き不可` : `未予約 / 指示するとR${preview.round}開始に復旧`} ｜ ${status.completed ? '再復旧不可' : status.pendingRound ? '発効待ち' : preview.eligible ? '復旧指示可能（1行動）' : preview.reason}`;
      repairStatus.append(line);
    }
    const note = document.createElement('p'); note.textContent = `両W救出・両弁復旧済み・予約なし＋生存リセ西退去口${repairExitLabel}で即勝利。弁は復旧後も通行不可・水位/地形変更なし。`; repairStatus.append(note);
  }
  const evacuationStatus = $('evacuation-status');
  evacuationStatus.hidden = !evacuationBattle;
  if (evacuationBattle) {
    evacuationStatus.replaceChildren();
    for (const record of config.records) {
      const preview = evacuationPreview(state, record.id), line = document.createElement('p');
      line.textContent = `${record.id} ${record.name} (${record.x},${record.y}) ｜ ${state.records.includes(record.id) ? '✓ 案内済み' : preview.eligible ? '案内可能（1行動）' : preview.reason}`;
      evacuationStatus.append(line);
    }
    const note = document.createElement('p'); note.textContent = '案内後は場外係へ引渡し。住民HP・盤面上の護送はありません。両V＋リセ(19,11)で勝利。'; evacuationStatus.append(note);
  }
  const archiveStatus = $('archive-status');
  archiveStatus.hidden = !archiveBattle;
  if (archiveBattle) {
    archiveStatus.replaceChildren();
    for (const record of config.records) {
      const line = document.createElement('p');
      line.textContent = `${record.optional ? '任意' : '必須'} ${record.id} ${record.name} (${record.x},${record.y}) ${state.records.includes(record.id) ? '✓ 確保' : '未取得'}`;
      archiveStatus.append(line);
    }
    const warning = document.createElement('p'); warning.className = 'archive-warning'; warning.textContent = '西の退去口 ' + archiveExitLabel + ' ｜ 必須3件＋リセ退去で即勝利。任意Kは先に確保。'; archiveStatus.append(warning);
  }
  const captureStatus = $('capture-status');
  captureStatus.hidden = !captureBattle && !sluiceBattle && !portBattle;
  if (portBattle) {
    const hold = capturePreview(state), gate = gatePreview(state);
    captureStatus.textContent = `検問C ${portCaptureLabel} 連続保持 ${hold.heldRounds}/${hold.requiredRounds}R ｜ 次のR終了判定: ${hold.eligible ? '保持+1可能' : '保持0へ: ' + hold.reason} ｜ 外港鎖門: ${state.gate.drained ? '開通済み' : '未開通'} ｜ ${state.gate.pendingRound ? `開通信号: R${gate.round}開始に発効（上書き不可）` : state.gate.drained ? '予約なし・再閉鎖不可' : `予約なし / 操作するとR${gate.round}開始に開通`} ｜ 水位・地形変更なし`;
  }
  if (sluiceBattle) {
    const hold = capturePreview(state);
    captureStatus.replaceChildren();
    for (const gate of config.sluiceGates ?? []) {
      const water = state.sluices![gate.id], preview = gatePreview(state, gate.id), line = document.createElement('p');
      line.textContent = `${gate.id} ${gate.name} 操作盤(${gate.panel.x},${gate.panel.y}) ｜ 現在: ${water.drained ? '排水済み・乾地' : '入水・浅瀬'} ｜ ${water.pendingRound ? `予約: R${water.pendingRound}開始に${water.pendingDrained ? '排水' : '再入水'}（上書き不可）` : `予約なし / 次の操作: R${preview.round}開始に${preview.nextDrained ? '排水' : '再入水'}`} ｜ 対象${gate.region.length}セル`;
      captureStatus.append(line);
    }
    const line = document.createElement('p');
    line.textContent = `保守記録P${sluiceRecordLabel}: ${state.records.includes('P') ? '確保済み' : '未取得'} ｜ C${sluiceCaptureLabel} 連続保持${hold.heldRounds}/${hold.requiredRounds}R ｜ 次のR終了判定: ${hold.eligible ? '保持+1可能' : '保持0へ: ' + hold.reason}`;
    captureStatus.append(line);
  }
  if (captureBattle) {
    const hold = capturePreview(state), water = gatePreview(state);
    captureStatus.textContent = `制圧点C (${config.capturePoint!.x},${config.capturePoint!.y}) ｜ 連続保持 ${hold.heldRounds}/${hold.requiredRounds}R ｜ 次のR終了判定: ${hold.eligible ? '保持+1可能' : '保持0へ: ' + hold.reason} ｜ 水路: ${state.gate.drained ? '乾地' : '入水済み'} ｜ ${state.gate.pendingRound ? `予約: R${water.round}開始に${water.nextDrained ? '排水' : '再入水'}・対象${water.region.length}セル（上書き不可）` : `次の操作: ${water.nextDrained ? '排水' : '再入水'}・R${water.round}開始・対象${water.region.length}セル`} `;
  }
  const escortStatus = $('escort-status');
  escortStatus.hidden = !escortBattle;
  if (escortBattle && escort) {
    const preview = escortAdvancePreview(state);
    escortStatus.textContent = `${delegationBattle ? '代表・証人一行（同一セル・共有HP）' : chainBattle ? '書記トマ' : '負傷者の荷車'} HP ${escort.hp}/${escort.maxHp} ｜ ${delegationBattle ? `現在(${escort.pos.x},${escort.pos.y}) ｜ 護送` : chainBattle ? '護送' : '搬出'} ${state.escort?.index ?? 0}/${(state.escort?.route.length ?? 1) - 1} ｜ 次セル ${preview.next ? `(${preview.next.x},${preview.next.y})` : delegationBattle ? (escort.hp > 0 && escort.pos.x === config.exit.x && escort.pos.y === config.exit.y ? '退出口到達' : 'なし') : chainBattle ? '保護地点' : '搬出地点'} ｜ ${preview.canAdvance ? '次R開始に進行可能' : preview.next ? '停止: ' + preview.reason : preview.reason}${delegationBattle ? ` ｜ 第${config.roundLimit}R終了期限・人物絵は一行の代表アイコン` : ''}`;
  }
  renderReadOrders();
  renderEquipment();
  // Browsing is UI state only. It never starts, ends or changes an activation.
  const acting = state.activeId ? getUnit(state, state.activeId) : undefined;
  const actingPanel = $('acting-unit'); actingPanel.replaceChildren(); actingPanel.hidden = !acting;
  if (notebook && acting) actingPanel.dataset.team = acting.team; else delete actingPanel.dataset.team;
  if (acting) {
    const caption = document.createElement('p'); caption.className = 'inspection-label'; caption.textContent = '◆ 行動中の人物';
    const name = document.createElement('p'); name.className = 'activation'; name.textContent = acting.name + ' 行動中';
    const stats = document.createElement('p'); stats.className = 'acting-stats'; stats.textContent = acting.role + ' ／ HP ' + acting.hp + '/' + acting.maxHp + ' ／ 攻 ' + acting.atk + '・防 ' + acting.def;
    const progress = document.createElement('p'); progress.className = 'acting-stats'; progress.textContent = '移動 ' + (state.activation.moved ? '済' : '未') + ' ／ 行動 ' + (state.activation.acted ? '済' : '未');
    if (notebook) {
      caption.textContent = acting.team === 'player' ? '◆ 行動中の味方' : '◆ 行動する敵';
      caption.classList.add('acting-caption');
      stats.classList.add('notebook-acting-stats');
      stats.replaceChildren();
      const role = document.createElement('span'); role.className = 'acting-role'; role.textContent = acting.role;
      const hp = document.createElement('strong'); hp.className = 'acting-hp'; hp.textContent = `HP ${acting.hp} / ${acting.maxHp}`;
      const numbers = document.createElement('span'); numbers.className = 'acting-numbers'; numbers.textContent = `攻撃 ${acting.atk}　防御 ${acting.def}　移動 ${acting.move}`;
      stats.append(role, hp, numbers);
      progress.classList.add('acting-progress');
      const phase = document.createElement('span'); phase.className = 'acting-phase'; phase.textContent = progress.textContent;
      caption.append(phase); progress.hidden = true;
    }
    const inspectActive = button('行動中の人物を見る', () => { selected = acting.id; inspectionTeam = acting.team; cursor = { ...acting.pos }; mode = 'inspect'; render(); }, !playing, 'quiet', 'inspect-active');
    if (notebook) { inspectActive.textContent = '本人を見る'; inspectActive.setAttribute('aria-label', '行動中の人物を見る'); }
    actingPanel.append(caption, name, stats, progress, inspectActive);
  }
  if (['heal', 'survey', 'protect', 'plank'].includes(mode)) inspectionTeam = 'player';
  else if (['attack', 'readOrder'].includes(mode)) inspectionTeam = 'enemy';
  const teams = $('inspection-teams'); teams.replaceChildren();
  for (const team of ['player', 'enemy'] as const) {
    const tab = button(team === 'player' ? '味方を見る' : '敵を見る', () => {
      inspectionTeam = team; mode = 'inspect';
      if (!state.units.some(u => u.id === selected && u.team === team)) selected = state.units.find(u => u.team === team && u.hp > 0)?.id ?? state.units.find(u => u.team === team)?.id ?? null;
      const inspected = selected ? getUnit(state, selected) : undefined; if (inspected) cursor = { ...inspected.pos };
      render();
    }, !playing, inspectionTeam === team ? 'selected' : '', 'inspect-team:' + team);
    tab.setAttribute('aria-pressed', String(inspectionTeam === team)); teams.append(tab);
  }
  const roster = $('roster'); roster.replaceChildren();
  for (const u of state.units.filter(u => u.team === inspectionTeam)) {
    const b = button(`${u.name}　${u.hp}/${u.maxHp}　${u.hp <= 0 ? inspectionUnitStatus(u) : u.kind === 'escort' ? '護送・自動' : u.acted ? '済' : '未行動'}`, () => { if (u.hp > 0 && ['heal', 'survey', 'protect', 'plank', 'attack', 'readOrder'].includes(mode) && state.activeId) { selectCell(u.pos); return; } selected = u.id; inspectionTeam = u.team; cursor = { ...u.pos }; mode = 'inspect'; render(); }, !playing, u.id === selected ? 'selected' : '', `roster:${u.id}`);
    b.dataset.unacted = String(u.team === 'player' && u.kind !== 'escort' && !u.acted && u.hp > 0); b.setAttribute('aria-pressed', String(u.id === selected)); roster.append(b);
  }
  const unit = selected ? getUnit(state, selected) : undefined;
  $('selection').innerHTML = unit ? `<p class="inspection-label">⌖ 閲覧中の${unit.team === 'player' ? '味方' : '敵'}${unit.hp <= 0 ? '・退避／制圧済み' : ''}</p><h2>${unit.name}<small>${unit.role} / ${unit.team === 'player' ? '流域調査隊' : enemyForce}</small></h2><div class="stats"><span>HP <b>${unit.hp}/${unit.maxHp}</b></span><span>攻 ${unit.atk} / 防 ${unit.def}</span><span>${unit.kind === 'escort' ? (delegationBattle ? '一行の共有HP / 手動不可' : chainBattle ? '書記護送 / 手動不可' : '負傷者護送 / 手動不可') : `移動 ${unit.move} / 浅瀬費用 ${effectiveShallowCost(unit)} / ${unit.weapon === 'bow' ? '弩' : '近接'}`}</span>${unit.jobCommand === 'readOrder' ? `<span>読令 ${unit.readCharges ?? 0}/2 回</span>` : unit.jobCommand === 'survey' ? `<span>測線 ${unit.surveyCharges ?? 0}/2 回</span>` : unit.jobCommand === 'protect' ? '<span>主職技: 護衛</span>' : unit.jobCommand === 'plank' ? `<span>渡り板 ${unit.plankCharges ?? 0}/2 回</span>` : ''}${unit.plankReady ? '<span>渡り板: 次の移動だけ浅瀬費用1（乾地移動でも消費）</span>' : ''}${unit.surveyBonus ? '<span>測線: 次の通常攻撃+2</span>' : ''}${unit.protection ? `<span>護衛中: ${getUnit(state, unit.protection.sourceId)?.name ?? '味方'}の次行動開始/退避まで</span>` : ''}${unit.healCharges !== undefined ? `<span>手当 ${unit.healCharges}/2 回</span>` : ''}<span>向き ${unit.facing}${unit.guard ? ' / 防御中' : ''}</span></div>` : '<h2>行動する味方を選択<small>人物か右上の部隊名を選びます</small></h2>';
  if(unit){const heading=$('selection').querySelector('h2');if(heading){const text=document.createElement('span');text.className='inspection-heading-text';text.append(...Array.from(heading.childNodes));heading.replaceChildren(createInspectionFace(unit),text);}}
  if (notebook && unit) {
    const selection = $('selection'); selection.dataset.team = unit.team;
    const stats = selection.querySelector<HTMLElement>('.stats')!;
    const existing = [...stats.children];
    const hp = existing[0] as HTMLElement; hp.classList.add('notebook-inspection-hp');
    const meter = document.createElement('div'); meter.className = 'notebook-hp-meter';
    meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-label', unit.name + 'の現在HP');
    meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', String(unit.maxHp)); meter.setAttribute('aria-valuenow', String(unit.hp));
    const fill = document.createElement('i'); fill.style.width = `${Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100))}%`; meter.append(fill);
    const values = document.createElement('div'); values.className = 'notebook-stat-values';
    for (const [label, value] of [['攻撃', unit.atk], ['防御', unit.def], ['移動', unit.move]] as const) {
      const cell = document.createElement('div'), title = document.createElement('span'), number = document.createElement('b');
      title.textContent = label; number.textContent = String(value); cell.append(title, number); values.append(cell);
    }
    const metadata = document.createElement('div'); metadata.className = 'notebook-inspection-meta';
    // Keep the live job/charge/buff/terrain information already rendered above.
    metadata.append(...existing.slice(2)); stats.replaceChildren(hp, meter, values, metadata);
  } else delete $('selection').dataset.team;
  const commands = $('commands'); commands.replaceChildren();
  if (!state.activeId) commands.append(button('この味方の行動を開始', () => { if (selected) dispatch({ type: 'start', unitId: selected }); }, !playing || !unit || unit.team !== 'player' || unit.kind === 'escort' || unit.acted || unit.hp <= 0, 'primary'));
  if (!state.activeId) {
    const remaining=state.units.filter(u=>u.team==='player'&&u.hp>0&&u.kind!=='escort'&&!u.acted).length;
    commands.append(button('味方ターン終了',()=>modal('味方ターンを終了',`<p>未行動の味方${remaining}人を現在位置・現在の向きで待機にして、敵ターンへ進みます。防御は追加しません。待機者の既存の防御と、その人が付与した護衛は次の行動開始と同じ条件で解除します。測線と渡り板は保持します。</p><p>確定後は取り消せません。</p>`,'ターンを終了',()=>dispatch({type:'endPlayerTurn'})),!playing||remaining===0,'quiet','end-player-turn'));
  }
  if (state.activeId) {
    const active = getUnit(state, state.activeId)!;
    const grid = document.createElement('div'); grid.className = 'command-grid'; commands.append(grid);
    grid.append(button('移動先を選ぶ', () => { mode = 'move'; message = '青緑は到達可能な移動先。現在地は金枠。移動先を選び、経路の移動費を確認して確定します。'; render(); }, !playing || state.activation.moved, mode === 'move' ? 'selected' : ''));
    grid.append(button('攻撃する敵を選ぶ', () => { mode = 'attack'; message = '盤面の敵または下の対象を選ぶとダメージを確認できます。'; render(); }, !playing || state.activation.acted, mode === 'attack' ? 'selected' : ''));
    if (active.healCharges !== undefined) grid.append(button(`手当する味方を選ぶ（残${active.healCharges}回）`, () => { mode = 'heal'; message = '隣接する生存味方を選び、回復量を確認してください。護送対象がいる場合は対象に含みます。'; render(); }, !playing || state.activation.acted || active.healCharges <= 0, mode === 'heal' ? 'selected' : ''));
    if (active.jobCommand) {
      const kind = active.jobCommand;
      grid.append(button(kind === 'readOrder' ? `読令する敵を選ぶ（残${active.readCharges ?? 0}回）` : kind === 'survey' ? `測線する味方を選ぶ（残${active.surveyCharges ?? 0}回）` : kind === 'plank' ? `渡り板を渡す味方を選ぶ（残${active.plankCharges ?? 0}回）` : '護衛する味方を選ぶ', () => {
        mode = kind; message = kind === 'readOrder'
          ? '盤面全体の生存敵1人。遮蔽・高さ不問、行動1回・戦闘2回。現在盤面の候補を対象の次の行動終了まで無料更新。行動済みも可、重複不可。次の敵の確約ではありません。'
          : kind === 'survey'
          ? '味方戦闘員の次の通常攻撃+2。射程3・射線必要、行動1回・戦闘2回。'
          : kind === 'plank' ? '隣接・高さ差1以内の他の生存味方戦闘員。次の移動だけ浅瀬費用1（乾地でも消費）。行動1回・戦闘2回。自己・護送対象・浅瀬適性あり・付与済みには渡せません。'
          : '隣接味方の次の被ダメージ−2。護衛者の次行動開始/退避まで。防御と重ねず、行動1回。'; render();
      }, !playing || state.activation.acted || (kind === 'readOrder' && (active.readCharges ?? 0) <= 0) || (kind === 'survey' && (active.surveyCharges ?? 0) <= 0) || (kind === 'plank' && (active.plankCharges ?? 0) <= 0), mode === kind ? 'selected' : ''));
    }
    for (const record of config.records) {
      if (repairBattle) {
        const preview = evacuationPreview(state, record.id);
        grid.append(button('保守員救出 ' + record.id, () => confirmCommand(record.id + ' ' + record.name + 'を救出', `<p>${record.id} ${record.name}(${record.x},${record.y})に上下左右隣接・高さ差1以内、生存敵の上下左右隣接なしで1行動を使います。</p><p>場外の安全な作業場所へ案内し、この保守員のセルだけ通行可能にします。個別HP・盤面護送はありません。救出は部隊共有で、対応する補助弁の復旧に協力します。同じRに別の味方が復旧指示可能です。</p>`, { type: 'collect', recordId: record.id }), !playing || !preview.eligible));
      } else if (evacuationBattle) {
        const preview = evacuationPreview(state, record.id);
        grid.append(button('住民避難案内 ' + record.id, () => confirmCommand(record.name + 'の避難を案内', '<p>' + record.name + 'を場外の案内係へ引き渡します。上下左右隣接・高さ差1以内、集合点への生存敵の隣接なしで、行動を1回使います。</p><p>案内後は集合点を通行可能にします。住民HP・実移動・盤面上の護送はありません。</p><p><strong>両Vの案内とリセ(19,11)が揃うと即勝利。</strong></p>', { type: 'collect', recordId: record.id }), !playing || !preview.eligible));
      } else grid.append(button(`${archiveBattle ? (record.optional ? '任意資料' : '必須資料') : state.battleId === 'B02' ? '観測' : escortBattle ? '名簿' : '記録'} ${record.id} を${state.battleId === 'B02' ? '確保' : '採取'}`, () => confirmCommand(`${record.name}を${state.battleId === 'B02' ? '観測' : '採取'}`, `<p>${record.name}を記録します。上下左右の隣接・高さ差1以内から、行動を1回使います。</p>${archiveBattle ? '<p>' + archiveRecordText[record.id] + '</p><p><strong>必須3件＋リセ退去が揃うと即勝利。任意Kは先に確保してください。</strong></p>' : ''}`, { type: 'collect', recordId: record.id }), !playing || !canCollect(state, record.id)));
    }
    if (repairBattle) {
      for (const site of config.repairSites ?? []) {
        const preview = repairPreview(state, site.id), status = state.repairs![site.id];
        grid.append(button(`${site.id} ${site.name}の予告`, () => { mode = mode === `repair:${site.id}` ? 'inspect' : `repair:${site.id}`; message = `${site.id} ${site.name}(${site.pos.x},${site.pos.y}) / 必要保守員${site.workerRecordId} / ${status.completed ? '復旧済み・再復旧不可' : status.pendingRound ? `R${status.pendingRound}開始に復旧予約済み・上書き不可` : `指示するとR${preview.round}開始に復旧`}。水位・地形は変わりません。`; render(); }, !playing, mode === `repair:${site.id}` ? 'selected' : ''));
        grid.append(button(`${site.id}: ${status.completed ? '復旧済み' : status.pendingRound ? '復旧予約済み' : '補助弁の復旧を指示'}`, () => { mode = `repair:${site.id}`; confirmCommand(`${site.id} ${site.name}の復旧を指示`, `<p><strong>${site.id} ${site.name}(${site.pos.x},${site.pos.y}) / 必要保守員${site.workerRecordId}</strong></p><p>救出済みの保守員の協力を得て、R${preview.round}開始にこの弁だけを一度復旧します。今Rは未復旧。上下左右隣接・高さ差1以内から1行動、弁への敵の隣接では妨げられません。</p><p>予約上書き・再復旧・確定後の予約取消は不可。水位・地形・HP・位置・射線は変わらず、弁は通行不可のまま。他方の弁には影響しません。</p><p>両W救出・両弁復旧済み・予約なし、生存リセが西${repairExitLabel}に揃うと即勝利。リセが先に退去口にいても最後の次R復旧で勝利します。</p>`, { type: 'repair', siteId: site.id }); }, !playing || !preview.eligible));
        if (!preview.eligible) { const note = document.createElement('p'); note.className = 'activation'; note.textContent = `${site.id} 復旧指示不可: ${preview.reason}`; commands.append(note); }
      }
    }
    if (sluiceBattle) {
      for (const gate of config.sluiceGates ?? []) {
        const water = state.sluices![gate.id], preview = gatePreview(state, gate.id), direction = preview.nextDrained ? '排水' : '再入水';
        const cells = gate.region.map(p => `(${p.x},${p.y})`).join('・');
        grid.append(button(`${gate.id} ${gate.name}の予告`, () => {
          mode = mode === `gate:${gate.id}` ? 'inspect' : `gate:${gate.id}`;
          message = `${gate.id} ${gate.name} 操作盤(${gate.panel.x},${gate.panel.y}) / 対象${gate.region.length}セル: ${cells} / R${preview.round}開始に${direction}。${water.pendingRound ? '予約済み・上書き不可。' : '現在の地形は今R中変わりません。'}他方の領域は変えません。`; render();
        }, !playing, mode === `gate:${gate.id}` ? 'selected' : ''));
        grid.append(button(`${gate.id}: ${water.pendingRound ? direction + '予約済み' : direction + 'を予約'}`, () => {
          mode = `gate:${gate.id}`;
          confirmCommand(`${gate.id} ${gate.name}の${direction}を予約`, `<p><strong>操作盤 ${gate.id} ${gate.name} (${gate.panel.x},${gate.panel.y})</strong></p><p>対象${gate.region.length}セル: ${cells}。R${preview.round}開始に${preview.nextDrained ? '浅瀬→乾地・移動費2→1' : '乾地→浅瀬・移動費1→2'}（浅瀬適性のある人物は1のまま）。今Rは変わりません。他方の領域には影響しません。</p><p>上下左右隣接・高さ差1以内から1行動。予約上書き不可、発効後は再反転可能。高さ・HP・位置・射線は変わりません。予約中はC保持不可、条件を失うと保持0です。</p>`, { type: 'gate', gateId: gate.id });
        }, !playing || !canGate(state, gate.id)));
        if (!canGate(state, gate.id)) { const note = document.createElement('p'); note.className = 'activation'; note.textContent = `${gate.id} 操作不可: ${preview.reason || (water.pendingRound ? '切替予約中（上書き不可）' : state.activation.acted ? 'この手番の行動を使用済み' : '操作盤の上下左右に隣接・高さ差1以内が必要')}`; commands.append(note); }
      }
    } else if (config.gate && portBattle) {
      const gate = gatePreview(state);
      grid.append(button('港門信号の予告を見る', () => { mode = mode === 'gate' ? 'inspect' : 'gate'; message = `信号盤${portSignalLabel}: ${state.gate.drained ? '外港鎖門は開通済み・再閉鎖不可。' : state.gate.pendingRound ? `R${gate.round}開始に開通予約済み・上書き不可。` : `操作するとR${gate.round}開始に外港鎖門が開通します。`}水位・地形は変えません。開通後は検問Cを連続2R保持してください。`; render(); }, !playing, mode === 'gate' ? 'selected' : ''));
      grid.append(button(state.gate.drained ? '港門信号: 開通済み' : state.gate.pendingRound ? '港門信号: 開通予約済み' : '港門の開通信号を予約', () => {
        mode = 'gate';
        confirmCommand('外港鎖門の開通信号を予約', `<p>信号盤${portSignalLabel}に上下左右隣接・高さ差1以内から1行動。R${gate.round}開始に外港鎖門が一度だけ開通します。今Rは未開通のままです。</p><p>予約上書き・再閉鎖は不可。水位・移動費・高さ・HP・位置・射線は変わらず、信号盤は通行不可のままです。</p><p>未開通・予約中はC保持0。開通後、検問C${portCaptureLabel}に生存味方戦闘員が立ち、敵の上下左右隣接なしで連続2R終了を迎えると即勝利し、場外の船団が入港します。</p>`, { type: 'gate' });
      }, !playing || !canGate(state)));
      if (!canGate(state)) { const note = document.createElement('p'); note.className = 'activation'; note.textContent = '港門信号操作不可: ' + (state.gate.drained ? '開通済み（再閉鎖不可）' : state.gate.pendingRound ? '開通予約中（上書き不可）' : state.activation.acted ? 'この手番の行動を使用済み' : '信号盤の上下左右に隣接・高さ差1以内が必要'); commands.append(note); }
    } else if (config.gate && chainBattle) {
      const gate = gatePreview(state);
      grid.append(button('鎖門予告を見る', () => { mode = mode === 'gate' ? 'inspect' : 'gate'; message = `鎖門${chainGateLabel}: ${state.gate.drained ? '開通済み。再閉門はできません。' : state.gate.pendingRound ? `R${gate.round}開始に開通予約済み。上書き不可。` : `操作するとR${gate.round}開始に開通します。`}水位・深水・石橋は変わりません。`; render(); }, !playing, mode === 'gate' ? 'selected' : ''));
      grid.append(button(state.gate.drained ? '鎖門: 開通済み' : state.gate.pendingRound ? '鎖門: 開通予約済み' : '鎖門の開通を予約', () => {
        mode = 'gate';
        confirmCommand('鎖門の開通を予約', `<p>次のラウンド（R${gate.round}）開始に鎖門が開通します。発効後、そのRからトマの進行を判定します。</p><p>水位・深水・石橋・高さ・HP・位置は変わりません。開門だけでは護送は完了しません。</p><p>操作盤${chainGateLabel}に上下左右隣接・高さ差1以内から、行動1回を使います。予約上書き・再閉門はできません。</p>`, { type: 'gate' });
      }, !playing || !canGate(state)));
      if (!canGate(state)) {
        const note = document.createElement('p'); note.className = 'activation';
        note.textContent = '鎖門操作不可: ' + (state.gate.drained ? '開通済み（再閉門不可）' : state.gate.pendingRound ? '開通予約中（上書き不可）' : state.activation.acted ? 'この手番の行動を使用済み' : '操作盤の上下左右に隣接・高さ差1以内が必要');
        commands.append(note);
      }
    } else if (config.gate) {
      const water = gatePreview(state);
      const regionLabel = `x${Math.min(...water.region.map(p=>p.x))}〜${Math.max(...water.region.map(p=>p.x))} / y${Math.min(...water.region.map(p=>p.y))}〜${Math.max(...water.region.map(p=>p.y))}`;
      const direction = water.nextDrained ? '排水' : '再入水';
      grid.append(button('水門予告を見る', () => { mode = mode === 'gate' ? 'inspect' : 'gate'; message = `対象${config.gateRegion.length}セル: ${regionLabel}。金枠はR${water.round}開始に${direction}する水路。${state.gate.pendingRound ? '予約済みのため変更できません。' : captureBattle ? '操作すると次Rに発効し、予約中は制圧保持できません。' : '水門は任意です。'}`; render(); }, !playing || (!captureBattle && state.gate.drained), mode === 'gate' ? 'selected' : ''));
      grid.append(button(captureBattle ? (state.gate.pendingRound ? `${direction} 予約済み` : `水門: ${direction}を予約`) : '水門を操作', () => {
        mode = 'gate';
        confirmCommand(`局所水路の${direction}を予約`, `<p>次のラウンド（R${water.round}）開始に、水路セルが${water.nextDrained ? '浅瀬から乾地' : '乾地から浅瀬'}へ変わります。今ラウンドは変わりません。</p><p><strong>対象${water.region.length}セル: ${regionLabel}</strong>（盤面の金枠）。移動費${water.nextDrained ? '2→1' : '1→2'}、浅瀬適性があれば1のまま。</p><p>高さ・HP・立っている位置は変わりません。操作に行動を1回使います。${captureBattle ? '予約は上書き不可。予約中は制圧保持できません。' : ''}</p>`, { type: 'gate' });
      }, !playing || !canGate(state)));
      if (captureBattle && !canGate(state)) {
        const note = document.createElement('p'); note.className = 'activation';
        note.textContent = '水門操作不可: ' + (state.gate.pendingRound ? '切替予約中（上書き不可）' : state.activation.acted ? 'この手番の行動を使用済み' : '操作盤の上下左右に隣接・高さ差1以内が必要');
        commands.append(note);
      }
    }
    for (const chest of state.equipmentChests ?? []) {
      const item = equipmentDefinition(chest.eventId)!;
      const preview = equipmentPickupPreview(state, chest.eventId);
      grid.append(button(`装備箱: ${item.name}を回収`, () => {
        mode = `loot:${chest.eventId}`;
        confirmCommand('装備を仮回収', `<p>${item.name}（${EQUIPMENT_SLOT_NAMES[item.slot]}） / ${equipmentEffectText(item.bonus)}</p><p>1行動を使い仮回収します。勝利で部隊の所有になり、保存成功後に永続化、次の出撃から使えます。敗北・途中再開・別戦への切替では未確定分を失います。拾った本人の退避では失いません。</p><p>宝箱は任意です。即勝利後の回収はできません。取り逃しは元の戦闘を再挑戦し、回収して勝つと補完できます。</p>`, { type: 'loot', eventId: chest.eventId });
      }, !playing || !preview.eligible, '', `loot:${chest.eventId}`));
    }
    grid.append(button('防御', () => confirmCommand('防御を確定', '<p>次の本人の行動開始まで被ダメージ −2。行動を1回使います。</p>', { type: 'defend' }), !playing || state.activation.acted));
    if (state.activation.moved && !state.activation.acted) commands.append(button('移動を取り消す', () => dispatch({ type: 'undoMove' }), !playing, 'quiet'));
    if (mode === 'attack') for (const enemy of state.units.filter(u => u.team === 'enemy' && u.hp > 0)) {
      const preview = attackPreview(state, active.id, enemy.id);
      commands.append(button(`${enemy.name}: ${preview.legal ? `命中率${preview.hitChance}%・命中時${preview.damage}ダメージ` : preview.reason}`, () => selectCell(enemy.pos), !playing || !preview.legal, 'target', `target:${enemy.id}`));
    }
    if (mode === 'survey' || mode === 'protect' || mode === 'plank') for (const ally of state.units.filter(u => u.team === 'player' && u.hp > 0)) {
      const preview = jobCommandPreview(state, active.id, ally.id, mode);
      commands.append(button(`${ally.name}: ${preview.legal ? mode === 'survey' ? '次の通常攻撃+2' : mode === 'plank' ? '次の移動だけ浅瀬費用1' : '次の被ダメージ−2' : preview.reason}`, () => selectCell(ally.pos), !playing || !preview.legal, 'target', `job:${mode}:${ally.id}`));
    }
    if (mode === 'readOrder') for (const enemy of state.units.filter(u => u.team === 'enemy' && u.hp > 0)) {
      const preview = jobCommandPreview(state, active.id, enemy.id, 'readOrder');
      commands.append(button(`${enemy.name}: ${preview.legal ? '現在盤面の候補を読む' : preview.reason}`, () => selectCell(enemy.pos), !playing || !preview.legal, 'target', `job:readOrder:${enemy.id}`));
    }
    if (mode === 'heal') for (const ally of state.units.filter(u => u.team === 'player' && u.id !== active.id)) {
      const preview = healPreview(state, active.id, ally.id);
      commands.append(button(`${ally.name}: ${preview.legal ? `HP ${ally.hp} → ${Math.min(ally.maxHp, ally.hp + preview.amount)} (+${preview.amount})` : preview.reason}`, () => selectCell(ally.pos), !playing || !preview.legal, 'target', `heal:${ally.id}`));
    }
    commands.append(button('向きを決めて行動を終了', () => facingDialog(), !playing, 'primary'));
  }
  updateNotebookControls(playing);
  $('message').textContent = state.phase === 'playing' && state.turn === 'enemy'
    && message === '未行動の味方を選んで行動を開始してください。'
    ? '敵の行動中です。敵全員の行動が終わると操作できます。' : message;
  $('logs').replaceChildren(...state.log.slice(-3).map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
  const coordinates = $('coordinates'); coordinates.replaceChildren();
  for (let y = 0; y < config.height; y++) for (let x = 0; x < config.width; x++) { const b = button(`${x},${y}`, () => selectCell({ x, y }), !playing, '', `cell:${x},${y}`); b.setAttribute('aria-label', `セル ${x},${y}`); coordinates.append(b); }
  board.display({ state, selected, cursor, reachable: state.activeId ? reachable(state, state.activeId).filter(r => r.cost > 0) : [], mode, enabled: playing });
  restoreFocus(focusKey);
}
function renderEquipment() {
  const equipment = campaign.equipment ?? createEquipment();
  const rows = equipmentCollectionRows(campaign.completed, equipment, getConfirmedEquipmentEvents(campaign), state.phase === 'playing' ? state.pendingEquipment : []);
  const content = $('equipment-collection-content'); content.replaceChildren(...rows.map(row => {
    const line = document.createElement('p');
    line.textContent = `${row.event.battleId} ${row.event.source === 'clear' ? 'クリア基本' : '任意箱'} / ${row.item.name}（${EQUIPMENT_SLOT_NAMES[row.item.slot]}） / ${equipmentEffectText(row.item.bonus)} / ${row.status}`;
    return line;
  }));
  const closing = document.createElement('p'); closing.textContent = 'B12は新しい装備取得なし。宝箱は攻略・証拠・終幕の必須条件ではありません。'; content.append(closing);
  const chests = state.equipmentChests ?? [], chestStatus = $('equipment-chest-status'); chestStatus.hidden = !chests.length;
  chestStatus.replaceChildren(...chests.map(chest => {
    const item = equipmentDefinition(chest.eventId)!, line = document.createElement('p');
    const preview = equipmentPickupPreview(state, chest.eventId);
    line.textContent = `任意装備箱 (${chest.pos.x},${chest.pos.y}) ${item.name} / ${state.pendingEquipment?.includes(chest.eventId) ? '仮回収・勝利で持帰り' : preview.eligible ? '回収可能（1行動）' : preview.reason}`;
    return line;
  }));
}
function renderReadOrders() {
  const panel = $('read-order-panel'), details = $('read-order-details'), updates = $('read-order-updates');
  const visible = screen === 'battle' && state.phase === 'playing' && Boolean(state.readOrders?.length);
  panel.hidden = !visible;
  if (!visible) { details.replaceChildren(); updates.textContent = ''; readOrderUpdates.clear(); return; }
  if (interactionBusy() || state.turn === 'enemy') {
    details.textContent = '敵ターン・演出処理中。候補の詳細は処理終了後に更新します。';
    updates.textContent = ''; return;
  }
  const rows = readOrderRows(state, getEnemyDecisionSnapshot(state));
  details.replaceChildren(...rows.map(row => {
    const entry = document.createElement('div');
    const title = document.createElement('p'); title.textContent = row.name + ' — ' + row.relation;
    const detail = document.createElement('p'); detail.textContent = row.detail;
    entry.append(title, detail); return entry;
  }));
  const announcement = readOrderUpdates.observe(rows);
  if (announcement) updates.textContent = announcement;
}
function facingDialog() {
  modal('終了時の向き', '<p>近接攻撃を背後から受けるとダメージ +2。敵に向き合う方向を選びます。</p><div id="facings" class="facing-grid"></div>', '取消', () => {}, false);
  const container = document.getElementById('facings')!;
  for (const facing of ['N', 'E', 'S', 'W'] as Facing[]) container.append(button(({ N: '北 N ↗', E: '東 E ↘', S: '南 S ↙', W: '西 W ↖' })[facing], () => { closeDialog(); dispatch({ type: 'end', facing }); }));
}
function persist() {
  if (!saveWritable || !storage) { if (getUnconfirmedEquipmentEvents(campaign).length) saveStatus = '装備に勝利未保存の取得があります。今回のプレイ中のみ保持し、保存は利用できません。'; return; }
  const result = writeCampaign(storage, campaign);
  if (result.ok && result.campaign) campaign = result.campaign;
  saveStatus = result.ok ? '進行を保存済み（戦闘途中の状態は保存しません）' : '進行の保存に失敗しました。' + (result.error ?? '') + (getUnconfirmedEquipmentEvents(campaign).length ? ' 装備の新取得は勝利未保存で、今回のプレイ中のみ保持します。' : '');
}
function clearBattleTimers() { battleFlow.clear(); }
function finish() {
  clearBattleTimers(); screen = 'result';
  audio.beginScene('bgm-briefing');
  const won = state.phase === 'won', config = getBattleConfig(state.battleId);
  audio.playSE(won ? 'se-victory' : 'se-defeat');
  if (won) { campaign = completeBattle(campaign, state); persist(); }
  render();
  finishResult(won);
}
function finishResult(readStory = false) {
  const won = state.phase === 'won', config = getBattleConfig(state.battleId);
  const retreat = state.units.filter(u => u.team === 'player' && u.hp <= 0).map(u => u.name).join('・');
  modal(won ? (state.battleId === 'B12' ? '同じ杭に、別々の記録を。' : state.battleId === 'B11' ? '設備を、人の手で守る。' : state.battleId === 'B10' ? '救援船を、暮らしへ。' : state.battleId === 'B09' ? '証言を、公開の場へ。' : state.battleId === 'B08' ? '保守と責任を、分けて記す。' : state.battleId === 'B07' ? '告白の先に、救助を。' : state.battleId === 'B01' ? '記録は、消させない。' : state.battleId === 'B02' ? '旧堤を越えて。' : state.battleId === 'B03' ? '名簿と、人を守る。' : state.battleId === 'B06' ? '証言を、岸へ届ける。' : state.battleId === 'B05' ? '署名は、消せない。' : '水は、下流にも続く。') : '調査隊は撤退した。',
    won ? '<p class="result-stamp">' + (state.battleId === 'B12' ? '第4章 完了・12戦の試作シナリオ区切り' : state.battleId === 'B03' ? '第1章 完了' : state.battleId === 'B06' ? '第2章 完了' : state.battleId === 'B09' ? '第3章 完了' : '作戦達成') + '</p><p>' + config.result + '</p>' + '<p>退避: ' + (retreat || 'なし') + '。' + (state.battleId === 'B12' ? '同じB12への再挑戦は4人を全快、ヴェスク未制圧・保持0・戦闘内記録なしの初期配置へ戻します。既得の証拠と完了記録、終幕の再読は保持します。' : state.battleId === 'B11' ? '同じB11への再挑戦は選択済みの出撃者を全快、両保守員未救出・両弁未復旧・予約なし・戦闘内記録なしの初期配置に戻します。既得の証拠と完了記録は保持します。' : state.battleId === 'B10' ? '同じB10への再挑戦は選択済みの出撃者を全快、外港鎖門未開通・予約なし・保持0・戦闘内記録なしの初期配置に戻します。既得の証拠と完了記録は保持します。' : state.battleId === 'B09' ? '同じB09への再挑戦は選択済みの出撃者と一行を全快、施療士がいれば手当2回・護送進捗0・初期配置に戻します。既得の証拠と完了記録は保持します。' : state.battleId === 'B08' ? '同じB08への再挑戦は選択済みの出撃者を全快、両水路は浅瀬・予約なし・保持0・P未取得の初期配置に戻します。' : state.battleId === 'B07' ? '同じB07への再挑戦は選択済みの出撃者を全快・未案内の初期配置に戻します。' : state.battleId === 'B05' ? '同じB05への再挑戦は離脱前の出撃可能者から選んだ4人を全快して再現します。次のB06にはネイアは出撃しません。' : state.battleId === 'B06' ? '同じB06への再挑戦は選択済みの出撃者とトマを初期配置・全快に戻します。ネイアの離脱は継続します。' : '次戦・再挑戦は選択済みの編成で全快します。物語上の離脱は継続します。') + '</p>'
      : '<p class="result-stamp defeat">作戦失敗</p><p>' + (getUnit(state, 'ally-lise')!.hp <= 0 ? 'リセが戦闘不能になりました。仲間の防御と射程を使い、退路を確保しましょう。' : state.battleId === 'B09' && (escortUnit(state)?.hp ?? 1) <= 0 ? '代表・証人一行の共有HPが0になり、護送を継続できません。個別人物の死亡を表す判定ではありません。護衛と施療士として出撃したセナの手当で守りましょう。' : state.battleId === 'B06' && (escortUnit(state)?.hp ?? 1) <= 0 ? '書記トマが戦闘不能になりました。隣接する護送役と施療士として出撃したセナの手当で守りましょう。' : state.battleId === 'B03' && (escortUnit(state)?.hp ?? 1) <= 0 ? '負傷者の荷車が破壊されました。護送役と手当で荷車を守りましょう。' : config.defeatMessage) + '</p>',
    '同じ作戦に再挑戦', restart, false);
  const equipmentResult = document.createElement('div'); equipmentResult.dataset.equipmentResult = '';
  if (won) {
    for (const row of equipmentCollectionRows(campaign.completed, campaign.equipment ?? createEquipment(), getConfirmedEquipmentEvents(campaign)).filter(row => row.event.battleId === state.battleId)) {
      const line = document.createElement('p');
      line.textContent = `装備 / ${row.event.source === 'clear' ? '基本支給' : '任意箱'}: ${row.item.name} / ${row.status}。取得分は次の出撃から使用できます。`;
      equipmentResult.append(line);
    }
    if (state.battleId === 'B12') equipmentResult.textContent = '最終戦の新しい装備報酬・宝箱はありません。終幕へ進めます。';
  } else if (state.pendingEquipment?.length) equipmentResult.textContent = '仮回収した装備は持ち帰れません。再挑戦で回収し、勝利すると取得できます。';
  $('overlay').querySelector('.dialog-body')!.append(equipmentResult);
  const actions = $('overlay').querySelector('.dialog-actions')!;
  fieldDialog();
  const pages = readAuthoredStory('<p>' + config.result + '</p>' + resultStoryHtml(state.battleId, state.records));
  if (won) actions.append(button('物語を読み返す', () => finishResult(true), false, 'quiet'));
  actions.append(button('部隊の準備・訓練', preparation, false, 'quiet'));
  if (won && state.battleId === 'B01') actions.append(button('B02 旧セラ堤へ', () => chooseBattle('B02'), false, 'primary'));
  if (won && state.battleId === 'B02') actions.append(button('B03 ラウム救護倉へ', () => chooseBattle('B03'), false, 'primary'));
  if (won && state.battleId === 'B03') actions.append(button('B04 乾いた支渠へ', () => chooseBattle('B04'), false, 'primary'));
  if (won && state.battleId === 'B05') actions.append(button('B06 ケスト運河鎖門へ', () => chooseBattle('B06'), false, 'primary'));
  if (won && state.battleId === 'B06') actions.append(button('B07 ヴァセル段丘村へ', () => chooseBattle('B07'), false, 'primary'));
  if (won && state.battleId === 'B07') actions.append(button('B08 ベルカ補助堰へ', () => chooseBattle('B08'), false, 'primary'));
  if (won && state.battleId === 'B08') actions.append(button('B09 水段回廊へ', () => chooseBattle('B09'), false, 'primary'));
  if (won && state.battleId === 'B09') actions.append(button('B10 首府外港へ', () => chooseBattle('B10'), false, 'primary'));
  if (won && state.battleId === 'B10') actions.append(button('B11 中枢水門・下層保守路へ', () => chooseBattle('B11'), false, 'primary'));
  if (won && state.battleId === 'B11') actions.append(button('B12 中枢水門・上層操作台へ', () => chooseBattle('B12'), false, 'primary'));
  if (won && state.battleId === 'B12') actions.append(button('終幕を読む', () => showEnding(), false, 'primary'));
  if (won && state.battleId === 'B04') actions.append(button('B05 イェルン文書蔵へ', () => chooseBattle('B05'), false, 'primary'));
  if (won && readStory) storyOverlay(config.title + ' / 戦闘後', pages, '結果を見る', () => finishResult(false));
}
function showEnding(readStory = true) {
  if (!campaign.completed.includes('B12')) return;
  clearBattleTimers();
  audio.beginScene('bgm-ending');
  modal('終幕 ─ 同じ杭に、別々の記録を。', endingContent(campaign.evidence), '戦闘選択へ', campaignMenu, false);
  fieldDialog();
  $('overlay').querySelector('.dialog-actions')!.append(button('B12を初期配置から再挑戦', () => chooseBattle('B12'), false, 'quiet'));
  $('overlay').querySelector('.dialog-actions')!.append(button('終幕を読み返す', () => showEnding(true), false, 'quiet'));
  if (readStory) storyOverlay('終幕 ─ 同じ杭に、別々の記録を。', readAuthoredStory(endingContent(campaign.evidence)), '読了・選択へ', () => showEnding(false));
}
function restart() {
  releaseStart();
  releaseStory();
  clearBattleTimers(); dialogOpen = false; $('overlay').innerHTML = ''; releaseModalBackground();
  campaign = selectBattle(campaign, state.battleId); persist();
  state = createPartyBattle(state.battleId, campaign.parties?.[state.battleId] ?? defaultParty(state.battleId), campaign.jobs, commonLevel(campaign.completed), { equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign), combat: campaign.combat }); selected = 'ally-lise'; inspectionTeam = 'player'; mode = 'inspect';
  cursor = { ...getUnit(state, selected)!.pos }; screen = 'battle';
  audio.beginScene('bgm-tactics');
  message = getBattleConfig(state.battleId).intro; pendingFocus = null; modalReturnFocus = null;
  render('この味方の行動を開始');
}
function chooseBattle(id: BattleId) {
  if (!campaign.unlocked.includes(id)) return;
  releaseStart();
  releaseStory();
  clearBattleTimers(); campaign = selectBattle(campaign, id); persist();
  state = createPartyBattle(id, campaign.parties?.[id] ?? defaultParty(id), campaign.jobs, commonLevel(campaign.completed), { equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign), combat: campaign.combat }); selected = null; inspectionTeam = 'player'; mode = 'inspect'; cursor = {x:0,y:5}; screen = 'intro';
  dialogOpen = false; pendingFocus = null; modalReturnFocus = null; $('overlay').innerHTML = ''; releaseModalBackground(); intro();
}
function storyOverlay(title: string, pages: readonly StoryPage[], label: string, complete: () => void) {
  releaseStart();
  releaseStory(); releaseModalBackground();
  modalReturnFocus = currentFocusKey() ?? pendingFocus;
  restoreModalBackground = makeModalBackgroundInert(app.querySelector<HTMLElement>('main.game-shell')!);
  dialogOpen = true; render();
  disposeStory = mountStoryPanel($('overlay'), { title, pages, completeLabel: label,
    findSpeaker: storySpeakerFace, complete: () => { closeDialog(); complete(); } });
}
function guardDialogEntry(veil: HTMLElement) {
  const opened = performance.now();
  veil.addEventListener('click', event => {
    if (!veil.isConnected || !dialogOpen || event.detail > 1 || performance.now() - opened < 240) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  veil.addEventListener('keydown', event => {
    if (!veil.isConnected || !dialogOpen || ((event.key === 'Enter' || event.key === ' ') && (event.repeat || performance.now() - opened < 240))) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
}
function fieldDialog() {
  const veil = $('overlay').querySelector<HTMLElement>('.veil')!;
  veil.classList.add('field-veil'); guardDialogEntry(veil);
  $('overlay').querySelector('.dialog')?.classList.add('field-dialog');
}
function intro() {
  audio.beginScene('bgm-briefing');
  const config = getBattleConfig(state.battleId); render();
  const story = introStoryHtml(state.battleId);
  storyOverlay(config.title, readAuthoredStory(story), '作戦説明へ', briefing);
}
function showStartScreen() {
  releaseStart(); releaseStory(); releaseModalBackground();
  screen = 'start'; dialogOpen = true;
  restoreModalBackground = makeModalBackgroundInert(app.querySelector<HTMLElement>('main.game-shell')!);
  render();
  disposeStart = mountStartScreen($('overlay'), {
    hasCheckpoint: startHasCheckpoint,
    battleLabel: `${state.battleId} ${getBattleConfig(state.battleId).title}`,
    warning: saveWritable ? undefined : saveStatus,
    qaNotice: startQaNotice,
    start: () => {
      closeDialog(); screen = 'intro'; intro();
      // A second click/keyup from the title must not consume the first authored block.
      guardDialogEntry($('overlay').querySelector<HTMLElement>('.story-shield')!);
    },
  });
}
function defeatSummary() {
  const config = getBattleConfig(state.battleId);
  const escort = state.battleId === 'B03' ? '荷車HP0でも敗北。' : state.battleId === 'B06' ? 'トマHP0でも敗北。' : state.battleId === 'B09' ? '代表・証人一行の共有HP0でも敗北。' : '';
  return 'リセが倒れると敗北。' + escort + '第' + config.roundLimit + 'ラウンド終了までに作戦未達で敗北。判定の順序と詳細は上記の条件全文を確認してください。';
}
function briefing() {
  const config = getBattleConfig(state.battleId);
  modal(config.title, '<p class="eyebrow">' + (state.battleId === 'B10' || state.battleId === 'B11' || state.battleId === 'B12' ? '第四章　' : state.battleId === 'B07' || state.battleId === 'B08' || state.battleId === 'B09' ? '第三章　' : state.battleId === 'B04' || state.battleId === 'B05' || state.battleId === 'B06' ? '第二章　' : '第一章　') + config.subtitle + '</p>' + '<section class="briefing"><h3>勝利条件・作戦目標</h3><p><b>' + config.intro + '</b></p><h3>作戦手順・条件の全文</h3><p>' + briefingRulesText(state.battleId, config, { finalGuide, repairGuide, portGuide, delegationGuide, sluiceGuide, chainGuide, archiveExitLabel }) + '</p></section><section><h3>敗北条件</h3><p>' + defeatSummary() + '</p></section><p>クリア済み: ' + (campaign.completed.join('・') || 'なし') + ' ／ 証拠: ' + (campaign.evidence.join('・') || 'なし') + '</p><p>進行の保存は戦闘開始と勝利のチェックポイントです。</p>', campaign.completed.length ? `続き: ${config.id}を初期配置から` : `${config.id} 調査隊を指揮する`, restart, false);
  fieldDialog();
  $('overlay').querySelector('.dialog-actions')!.append(button('導入を読み返す', intro, false, 'quiet'));
  $('overlay').querySelector('.dialog-actions')!.append(button('部隊の準備・訓練', preparation, false, 'quiet'));
  $('overlay').querySelector('.dialog-actions')!.append(button('戦闘選択・進行管理', campaignMenu, false, 'quiet'));
}
function preparation() {
  if (screen === 'battle' || interactionBusy() || !campaign.growth || !campaign.jobs) return;
  campaign = editPreparation(campaign, { growth: returnFromAbsence(campaign.growth, state.battleId) });
  modal('部隊の準備・訓練', '<p>現在の戦闘: ' + state.battleId + '。次の出撃から準備が反映されます。戦闘途中の状態は保存しません。</p><div id="preparation-fields"></div>', '導入へ戻る', intro, false);
  mountPreparation($('preparation-fields'), state.battleId, {
    growth: campaign.growth!, jobs: campaign.jobs!, parties: campaign.parties ?? {}, completed: campaign.completed, equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign),
  }, next => {
    campaign = editPreparation(campaign, { growth: next.growth, jobs: next.jobs, parties: next.parties, equipment: next.equipment });
    persist();
    return { notice: saveWritable && storage ? saveStatus : '今回のプレイ中だけ準備を保持します。保存は利用できません。', data: { growth: campaign.growth!, jobs: campaign.jobs!, parties: campaign.parties ?? {}, completed: campaign.completed, equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign) } };
  });
}
function campaignMenu() {
  if (interactionBusy()) return;
  if (screen !== 'battle') audio.beginScene('bgm-briefing');
  modal('戦闘選択・進行管理', '<p>再開は戦闘の初期配置からです。戦闘途中のHP・手番は保存されません。</p><p>解除済み: ' + campaign.unlocked.join('・') + ' ／ クリア済み: ' + (campaign.completed.join('・') || 'なし') + '</p><div id="battle-choices" class="campaign-choices"></div>', screen === 'battle' ? '戦闘に戻る' : '導入に戻る', () => { if (screen !== 'battle') intro(); }, false);
  const choices = $('battle-choices');
  choices.append(button('部隊の準備・訓練', preparation, screen === 'battle', 'quiet'));
  for (const id of ['B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12'] as BattleId[]) choices.append(button(id + ' ' + getBattleConfig(id).title + (campaign.completed.includes(id) ? ' ✓' : ''), () => {
    if (screen === 'battle') modal('戦闘を切り替える', '<p>現在の戦闘途中の状態は失われます。</p>', '切り替える', () => chooseBattle(id)); else chooseBattle(id);
  }, !campaign.unlocked.includes(id)));
  if (campaign.completed.includes('B12')) choices.append(button('終幕を読み返す', () => showEnding(), false, 'primary'));
  choices.append(button('進行をリセット', () => modal('進行をリセットしますか', '<p>このゲーム専用の進行記録だけを削除します。解除済み戦闘・証拠・現在の戦闘は初期状態に戻ります。</p>', '進行を削除する', () => {
    clearBattleTimers();
    if (!storage) { saveStatus = '保存領域を利用できないため、保存データの削除はできません。'; intro(); return; }
    const result = resetCampaign(storage);
    if (!result.ok) { saveStatus = '進行の削除に失敗しました。' + (result.error ?? ''); intro(); return; }
    saveWritable = true; campaign = createCampaign(); saveStatus = '進行をリセットしました。'; chooseBattle('B01');
  }), false, 'quiet'));
}
$('campaign-menu').onclick = () => { if (!dialogOpen && !interactionBusy()) campaignMenu(); };
$('shorten-presentation').onclick = () => battleFlow.finishNow();
$('restart').onclick = () => { if (dialogOpen) return; modal('作戦をやり直す', '<p>現在の戦闘を破棄し、同じ初期配置から再開します。</p>', '再開する', restart); };
function onGameKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') { if (dialogOpen && screen === 'battle') { closeDialog(); } else if (interactive()) { mode = 'inspect'; render(); } return; }
  if (dialogOpen) { const dialog = $('overlay').querySelector<HTMLElement>('[role="dialog"]'); if (dialog) trapModalTab(event, dialog); return; }
  if (!interactive() || (event.target instanceof HTMLElement && event.target.closest('.audio-controls'))) return;
  if (event.target instanceof HTMLElement && event.target.closest('[data-inspection-list]')) return;
  if (event.key === 'Enter' && event.target instanceof HTMLElement && ['BUTTON', 'SUMMARY'].includes(event.target.tagName)) return;
  const delta: Record<string, Pos> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
  if (delta[event.key]) { event.preventDefault(); cursor = { x: Math.max(0, Math.min(getBattleConfig(state.battleId).width - 1, cursor.x + delta[event.key].x)), y: Math.max(0, Math.min(getBattleConfig(state.battleId).height - 1, cursor.y + delta[event.key].y)) }; render(); }
  if (event.key === 'Enter') { event.preventDefault(); selectCell(cursor); }
}
document.addEventListener('keydown', onGameKeyDown);
if (import.meta.env.DEV) (window as unknown as { __TACTICS__: object }).__TACTICS__ = { getState: () => structuredClone(state), getCampaign: () => structuredClone(campaign), getBattleId: () => state.battleId, dispatch, screen: () => screen, selectCell, restart, getMode: () => mode, isBusy: () => interactionBusy()||!renderReport.drawn, isDialogOpen: () => dialogOpen };
$('audio-settings-host').append(audioControls());
updateAudioControls(audio.status);
showStartScreen();
