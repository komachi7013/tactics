import { mountTurnAnnouncement } from './view/turnAnnouncement';
import { mountMapDrag } from './view/mapDrag';
import { renderUnitInspection } from './view/unitInspection';
import { battleObjectiveCopy } from './view/battleObjectiveCopy';
import { cellInspection, renderCellInspection } from './view/cellInspection';
import Phaser from 'phaser';
import './style.css';
import './view/prologue.css';
import './view/battleDialogue.css';
import { BattleDialogueJournal, type BattleDialogue } from './view/battleDialogues';
import { mountBattleDialogueBrief } from './view/battleDialogueBrief';
import './view/audioControls.css';
import './view/utilityMenu.css';
import './view/preparationGuide.css';
import './view/uiRecovery.css';
import { attackAvailability } from './view/attackAvailability';
import { selectionCommandState, reduceSelectionCommand } from './view/selectionCommands';
import { mountPrologue } from './view/prologue';
import { mountUtilityMenu } from './view/utilityMenu';
import { nearbyInteraction } from './view/nearbyInteraction';
import { mapObjectCellStatus } from './view/mapObjectInspection';
import { createAttackTargets } from './view/attackTargets';
import { createSkillTargets, unitSkill, skillUses, SKILL_EFFECTS } from './view/skillTargets';
import { renderCommandPaletteIdentity } from './view/commandPalette';
import {registeredLandscape,registeredFloors} from './view/registeredLandscape';
import { endingContent } from './ending';
import { arrivalInteraction } from './view/arrivalInteraction';
import { choosingTarget } from './view/commandSelection';
import { castIdle } from './view/castMotion';
import { mountStoryPanel, type StoryPage } from './view/storyPanel';
import { storyScenery } from './view/storyScenery';
import { mountStartScreen, readStartProgress } from './view/startScreen';
import { introStoryHtml, resultStoryHtml, battleResultSummary } from './view/storyContent';
import { readAuthoredStory, storySpeakerFace } from './view/storyScript';
import { briefingRulesText } from './view/briefingContent';
import { GameAudio, type AudioStatus } from './audio';
import { soundsForTransition, resultSounds } from './audio-events';
import { battleMusic } from './audio-cues';
import { reduce, canUndoMove, getCell, isMovementBlocked, getUnit, reachable, attackPreview, canCollect, canGate, healPreview, escortAdvancePreview, escortUnit, gatePreview, capturePreview, evacuationPreview, repairPreview, finalControlPreview, jobCommandPreview, effectiveShallowCost, equipmentPickupPreview, defendAvailability, pushCartPreview } from './domain/engine';
import { runEnemyActivationWithTrace, getEnemyDecisionSnapshot } from './domain/ai';
import { createPresentation, committedAttackResolution } from './view/presentation';
import { BattleFlow } from './view/battleFlow';
import {commitMovementFacing} from './view/commitMovementFacing';
import { createInspectionFace, inspectionUnitStatus } from './view/inspectionRoster';
import { makeModalBackgroundInert, trapModalTab, createDialogSettlement } from './view/modalFocus';
import { readOrderRows, ReadOrderUpdates } from './view/readOrder';
import { getBattleConfig, requiredRecords } from './domain/battles';
import { createCampaign, completeBattle, selectBattle, writeCampaign, resetCampaign, editPreparation, getConfirmedEquipmentEvents, getUnconfirmedEquipmentEvents } from './campaign';
import type { Campaign, StorageLike } from './campaign';
import { defaultParty, commonLevel } from './progression';
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
const sluiceGuide = briefingRulesText('B08', getBattleConfig('B08'));
const chainConfig=getBattleConfig('B06');
const chainGateLabel='('+chainConfig.gate!.x+','+chainConfig.gate!.y+')',chainExitLabel='('+chainConfig.exit.x+','+chainConfig.exit.y+')';
const chainGuide = briefingRulesText('B06', getBattleConfig('B06'));
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main class="game-shell"><header class="masthead"><div class="game-title"><span class="seal">澪</span><div><h1>澪を継ぐ者</h1><p>流域盟約戦記</p></div></div><div class="chapter"><b id="chapter-number">第一章</b> <span id="chapter-subtitle">消された水位</span><small id="battle-title"></small></div><button id="campaign-menu" class="quiet">作戦・出撃準備</button><button id="opening-guide" class="quiet">物語の前提を読む</button><button id="restart" class="quiet">同じ戦闘を再開</button><button id="shorten-presentation" class="quiet" title="攻撃演出の短縮は現在利用できません。" disabled>移動演出を短縮</button></header><section class="objective"><strong>作戦目標</strong><span id="objective-text"></span><span id="records"></span></section><div class="progress-strip"><span id="objective-steps"></span><span id="save-status" role="status" aria-live="polite"></span></div><div id="audio-settings-host"></div><div class="battle-layout"><section class="battlefield"><div class="turn-banner" id="turn"></div><div id="board" aria-label="トルネ渡し場の戦場"></div><div class="map-note" id="map-note"></div></section><aside class="command-panel"><div class="panel-heading">部隊指揮 <small>TACTICAL ORDERS</small></div><div id="escort-status" class="escort-status" role="status"></div><div id="capture-status" class="escort-status" role="status"></div><div id="archive-status" class="escort-status" role="status"></div><div id="evacuation-status" class="escort-status" role="status"></div><div id="repair-status" class="escort-status" role="status"></div><div id="final-control-status" class="escort-status" role="status"></div><section id="read-order-panel" class="escort-status" aria-label="読令の情報" hidden><strong>今、この敵が動くなら</strong><div id="read-order-details"></div><p id="read-order-updates" role="status" aria-live="polite"></p></section><div id="equipment-chest-status" class="escort-status" hidden></div><section id="acting-unit" class="acting-unit" aria-label="行動中の人物" hidden></section><div id="inspection-teams" class="inspection-teams" role="group" aria-label="閲覧する部隊"></div><div id="roster" class="roster" aria-label="閲覧する人物"></div><section id="selection" aria-label="閲覧対象のステータス"></section><div id="commands"></div><p id="message" role="status" aria-live="polite"></p><details id="equipment-collection-panel" hidden><summary>装備の取得一覧</summary><div id="equipment-collection-content"></div></details><details><summary>戦術手引き / キー操作</summary><p>味方を選び「移動する」「たたかう」などを選びます。移動した後でも、移動する前でも、攻撃や技を使えます。移動、攻撃か技、宝箱や記録の取得は、それぞれ一度ずつできます。攻撃・技・防御・操作は、どれか一つを選びます。各人は最後に「行動終了」から向きを選んで確定します。味方は好きな順で操作し、全員終了すると敵全員が順に行動します。味方→敵の一巡で1ラウンドです。</p><p>矢印キー: マスを選択 / Enter: 選択 / Esc: 取消。ボタンは Tab と Enter でも操作できます。青緑の有効な移動先をクリックすると移動します。「移動をキャンセル」で元の場所へ戻れます。移動後の取得や操作も取り消します。移動後に攻撃や技を使った場合は戻せません。</p><p>近接は隣接、高低差1まで。弩は距離2〜4（高所5）、射線が必要。背面近接+2。防御は次の本人の行動開始まで被害−2。</p><p id="battle-guide"></p></details><details id="coordinate-panel"><summary>座標からマスを選ぶ</summary><div id="coordinates" class="coordinate-grid"></div></details></aside></div><div id="battle-dialogue-live" hidden></div><footer></footer></main><div id="overlay"></div>`;
const passabilityDebug = import.meta.env.DEV && new URLSearchParams(location.search).get('debugWalk') === '1';
let editPassability = false;
let campaign: Campaign = createCampaign();
let saveWritable = true;
let saveStatus = '進行は戦闘開始・勝利時に保存。戦闘途中の再開はできません。';
let storage: StorageLike | null = null;
let qaSession: string | null = null;
let startHasCheckpoint = false;
let startQaNotice = '';
let startWarning: string | undefined;
try {
  storage = window.localStorage;
  if (import.meta.env.DEV) {
    const selectedStorage = selectProgressStorage(storage, location.search);
    storage = selectedStorage.storage; qaSession = selectedStorage.session;
  }
  const loaded = readStartProgress(storage); campaign = loaded.campaign; saveWritable = loaded.writable; startHasCheckpoint = loaded.hasCheckpoint;
  if (loaded.warning) { saveStatus = loaded.warning; startWarning = loaded.warning; }
} catch { storage = null; saveWritable = false; saveStatus = '保存領域を利用できません。今回のプレイ中は遊べますが、進行は保存されません。'; }
if (passabilityDebug) {
  storage = null;
  saveWritable = false;
  saveStatus = '通行デバッグでは進行を保存しません。';
}
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
let commandOwner: string | null = null;
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
  clearPresentation: completed => board.clearPresentation(completed), playPresentation: plan => board.playPresentation(plan),
  render: () => render(), finish: () => finish(), runEnemy: () => performEnemyActivation(),
  afterPresentation: resume => showTurnStart(() => showPendingBattleDialogue(() => { resume(); showArrivalInteraction(); })),
});
const interactionBusy = () => battleFlow.busy;
let dialogOpen = false;
let disposeStory: (() => void) | undefined;
function releaseStory() { disposeStory?.(); disposeStory = undefined; }
let disposeStart: (() => void) | undefined;
function releaseStart() { disposeStart?.(); disposeStart = undefined; }
let disposePrologue: (() => void) | undefined;
function releasePrologue() { disposePrologue?.(); disposePrologue = undefined; }
let restoreModalBackground: (() => void) | undefined;
function releaseModalBackground() { restoreModalBackground?.(); restoreModalBackground = undefined; }
let pendingFocus: string | null = null;
let modalReturnFocus: string | null = null;
let message = '未行動の味方を選んでください。';
let attackAnnouncementTimer: number | undefined;
let pendingArrival: { snapshot: typeof state; actorId: string } | null = null;
const finalConfig=getBattleConfig('B12'),finalPosLabel=(p:{x:number;y:number})=>'('+p.x+','+p.y+')',finalALabel=finalPosLabel(finalConfig.controlPoints![0].pos),finalBLabel=finalPosLabel(finalConfig.controlPoints![1].pos);
const finalGuide = briefingRulesText('B12', getBattleConfig('B12'));
const repairConfig=getBattleConfig('B11'),repairPosLabel=(p:{x:number;y:number})=>'('+p.x+','+p.y+')',repairExitLabel=repairPosLabel(repairConfig.exit);
const repairGuide = briefingRulesText('B11', getBattleConfig('B11'));
const portConfig=getBattleConfig('B10'),portSignalLabel='('+portConfig.gate!.x+','+portConfig.gate!.y+')',portCaptureLabel='('+portConfig.capturePoint!.x+','+portConfig.capturePoint!.y+')';
const portGuide = briefingRulesText('B10', getBattleConfig('B10'));
const delegationConfig=getBattleConfig('B09'),delegationExitLabel='('+delegationConfig.exit.x+','+delegationConfig.exit.y+')';
const delegationGuide = briefingRulesText('B09', getBattleConfig('B09'));
const archiveRecordText: Record<string, string> = { D: '二年前の薄明放流の指令。貯水池の危険を理由に放流を命じている。必要性と実際の運用は別々に確かめる必要がある。', T: '指令に添付された予定時刻。警告や避難の実施は、現場の記録や証言との照合が要る。', S: 'リセの再認証署名。更新されなかった高低図を承認した責任が、ここに残る。', K: '補償手続に関わる住民の名。被害者全員を網羅するとは限らず、住民側の名簿と照合する手掛かり。' };
const $ = (id: string) => document.getElementById(id)!;
const mapScroll = document.createElement('div'); mapScroll.className = 'map-scroll'; $('board').before(mapScroll); mapScroll.append($('board'));
const mapDrag = mountMapDrag(mapScroll);
const dialogueJournal = new BattleDialogueJournal(state.battleId);
const dialogueBrief = mountBattleDialogueBrief($('battle-dialogue-live'), { setTimeout: (fn,ms) => window.setTimeout(fn,ms), clearTimeout: handle => window.clearTimeout(handle as number) });
const turnHost = document.createElement('div'); app.append(turnHost);
const turnAnnouncement = mountTurnAnnouncement(turnHost, { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: handle => window.clearTimeout(handle as number) });
const audio = new GameAudio(updateAudioControls);
const onAudioVisibility = () => audio.setHidden(document.hidden);
onAudioVisibility();
document.addEventListener('visibilitychange', onAudioVisibility);
function updateAudioControls(status: AudioStatus) {
  for (const panel of app.querySelectorAll<HTMLElement>('.audio-controls')) {
    panel.querySelector('summary')!.textContent = `音の設定（${status.muted ? 'オフ' : 'オン'}）`;
    const toggle=panel.querySelector<HTMLButtonElement>('[data-audio-mute]')!;
    toggle.textContent=status.muted ? '音をオンにする' : '音をオフにする';
    toggle.setAttribute('aria-pressed',String(!status.muted));
    for(const category of ['bgm','se'] as const) {
      const slider=panel.querySelector<HTMLInputElement>(`[data-audio-volume="${category}"]`)!;
      const value=String(Math.round(status[category]*100));
      if(document.activeElement!==slider)slider.value=value;
      panel.querySelector<HTMLOutputElement>(`[data-audio-output="${category}"]`)!.value=`${value}%`;
    }
  }
}
function audioControls(): HTMLDetailsElement {
  const panel=document.createElement('details');panel.className='audio-controls';
  panel.append(document.createElement('summary'));
  const controls=document.createElement('div');controls.className='audio-control-fields';
  const toggle=document.createElement('button');toggle.dataset.audioMute='';
  toggle.onclick=()=>{audio.setMuted(!audio.status.muted);if(!audio.status.muted)void audio.enable();};
  controls.append(toggle);
  for(const [category,title] of [['bgm','BGM音量'],['se','SE音量']] as const) {
    const label=document.createElement('label');label.append(document.createTextNode(title));
    const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='100';slider.step='1';
    slider.dataset.audioVolume=category;slider.setAttribute('aria-label',title);
    slider.oninput=()=>audio.setVolumes({[category]:Number(slider.value)/100});
    const output=document.createElement('output');output.dataset.audioOutput=category;
    label.append(slider,output);controls.append(label);
  }
  panel.append(controls);return panel;
}
// Unlock default-on audio with the first actual player gesture. A muted game stays muted.
const onAudioGesture=()=>{if(!audio.status.muted&&audio.status.contextState!=='running')void audio.enable();};
document.addEventListener('pointerdown',onAudioGesture,true);
document.addEventListener('keydown',onAudioGesture,true);
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
const passabilityControls = document.createElement('div');
passabilityControls.className = 'passability-debug';
const passabilityToggle = document.createElement('button');
const passabilityReset = document.createElement('button');
passabilityReset.textContent = '通行判定を元に戻す';
const passabilityHint = document.createElement('span');
passabilityHint.setAttribute('role', 'status');
passabilityToggle.addEventListener('click', () => {
  if (!interactive()) return;
  editPassability = !editPassability;
  mode = 'inspect';
  floorSelection = undefined;
  render();
});
passabilityReset.addEventListener('click', () => {
  if (!interactive()) return;
  for (const cell of state.cells) delete cell.debugBlocked;
  render();
});
if (passabilityDebug) {
  passabilityControls.append(passabilityToggle, passabilityReset, passabilityHint);
  $('board').before(passabilityControls);
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
document.querySelector('.battlefield')!.addEventListener('scroll', updateMapBounds, { passive: true, capture: true });
let disposeRenderDiagnostics: (() => void) | undefined;
let disposed = false;
if (import.meta.env.DEV && diagnostics) void import('./view/renderDiagnostics').then(({ installRenderDiagnostics }) => {
  if (game && !disposed) disposeRenderDiagnostics = installRenderDiagnostics(diagnostics, game, board, $('board'));
}).catch(error => { if (!disposed && diagnosticText) diagnosticText.textContent += `\n追加診断の読込失敗: ${String(error)}`; });
if (import.meta.hot) import.meta.hot.dispose(() => { mapDrag.dispose(); mapResizeObserver.disconnect(); document.querySelector('.battlefield')?.removeEventListener('scroll', updateMapBounds, true); disposed = true; if(attackAnnouncementTimer!==undefined)window.clearTimeout(attackAnnouncementTimer); turnAnnouncement.dispose(); dialogueBrief.dispose(); releaseStart(); releaseStory(); releasePrologue(); releaseModalBackground(); document.removeEventListener('keydown', onGameKeyDown); battleFlow.dispose(); audio.dispose(); document.removeEventListener('visibilitychange', onAudioVisibility); document.removeEventListener('pointerdown',onAudioGesture,true); document.removeEventListener('keydown',onAudioGesture,true); disposeRenderDiagnostics?.(); game?.destroy(true); window.removeEventListener('error', onRenderError); window.removeEventListener('unhandledrejection', onRenderRejection); });
const button = (label: string, fn: () => void, disabled = false, cls = '', focusKey = label) => { const b = document.createElement('button'); b.textContent = label; b.disabled = disabled; b.className = cls; b.dataset.focusKey = focusKey; b.onclick = () => { if (!b.closest('.command-confirmation') || /キャンセル|閉じる/.test(label)) audio.playSE(/キャンセル|取消|閉じる/.test(label) ? 'se-cancel' : 'se-ui'); fn(); }; return b; };
$('campaign-menu').dataset.focusKey = 'campaign-menu';
$('restart').dataset.focusKey = 'restart';
$('shorten-presentation').dataset.focusKey = 'shorten-presentation';
$('board').dataset.focusKey = 'board';
$('board').tabIndex = 0;
let utilityMenuOpen = false;
let notebookShell: { toolsTitle: HTMLElement; brief: HTMLElement; extras: HTMLElement; extraBody: HTMLElement; targets: HTMLElement; restore(): void } | undefined;
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
  for (const id of ['campaign-menu','opening-guide','restart','shorten-presentation','audio-settings-host']) move($(id), toolsBody);
  const dialogueLog = button('戦闘中の会話を読む', replayBattleDialogue, false, 'quiet', 'battle-dialogue-log'); dialogueLog.id = 'battle-dialogue-log'; toolsBody.append(dialogueLog); added.push(dialogueLog);
  move(shell.querySelector<HTMLElement>('.objective')!, toolsBody);
  move(shell.querySelector<HTMLElement>('.progress-strip')!, toolsBody);
  for (const id of ['escort-status','capture-status','archive-status','evacuation-status','repair-status','final-control-status','read-order-panel','equipment-chest-status']) move($(id), toolsBody);
  for (const node of [...panel.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node.tagName === 'DETAILS')) move(node, toolsBody);
  move($('roster'), toolsBody);
  const content = document.createElement('div'); content.className = 'notebook-dock-content'; panel.insertBefore(content, $('acting-unit')); added.push(content);
  move($('inspection-teams'), content);
  move($('selection'), content); content.prepend($('selection'));
  const targets = document.createElement('div'); targets.className = 'notebook-target-options'; content.append(targets);
  const extras = document.createElement('div'); extras.className = 'notebook-extra-commands';
  const extraBody = document.createElement('div'); extras.append(extraBody); content.append(extras);
  move($('message'), $('map-note')); move($('save-status'), toolsBody);
  const palette = document.createElement('section'); palette.className = 'command-palette'; palette.setAttribute('aria-label', '操作キャラのコマンド');
  const paletteControls = document.createElement('div'); paletteControls.className = 'palette-controls';
  shell.insertBefore(palette, footer); palette.append(paletteControls); added.push(palette);
  move($('acting-unit'), palette); palette.prepend($('acting-unit')); move($('commands'), paletteControls);
  const paletteOptions = document.createElement('div'); paletteOptions.className = 'palette-options'; paletteOptions.append(targets, extras); palette.append(paletteOptions);
  const endTurn=button('味方のターン終了',()=>confirmEndPlayerTurn(),false,'quiet','end-player-turn');endTurn.id='end-player-turn';endTurn.classList.add('end-player-turn');palette.append(endTurn);
  const utilityMenu = mountUtilityMenu(toolsTitle, toolsBody, shell, { onOpen: () => { utilityMenuOpen = true; dialogOpen = true; }, onClose: () => { utilityMenuOpen = false; dialogOpen = false; render(); } });
  notebookShell = { toolsTitle, brief, extras, extraBody, targets, restore: () => {
    utilityMenu.dispose();
    for (const { node, marker } of [...moved].reverse()) { marker.before(node); marker.remove(); }
    for (const node of added) node.remove();
  } };
}
function updateNotebookControls(playing: boolean) {
  if (!notebookShell) return;
  const { brief, extras, extraBody, targets } = notebookShell;
  brief.textContent = battleObjectiveCopy(state.battleId).summary;
  const commands = $('commands'), grid = commands.querySelector<HTMLElement>('.command-grid');
  extraBody.replaceChildren(); targets.replaceChildren();
  const primary = document.createElement('div'); primary.className = 'notebook-primary-actions';
  const actorId = selectionCommandState(state, commandOwner ?? selected).activeId;
  if (actorId) { const caption = document.createElement('p'); caption.className = 'acting-command-label'; caption.textContent = `${getUnit(state,actorId)?.name ?? '選択中の人物'}の操作`; primary.append(caption); }
  for (const name of ['移動する','たたかう','固有技','防御','行動終了']) {
    const control = [...commands.querySelectorAll<HTMLButtonElement>('button')].find(b => b.dataset.focusKey === name);
    if (!control) continue;
    if (name === 'たたかう') { control.setAttribute('aria-label', control.textContent === 'たたかう' ? 'たたかう（攻撃対象を選ぶ）' : control.textContent!); control.classList.add('notebook-attack-action'); }
    primary.append(control);
  }
  for (const context of commands.querySelectorAll<HTMLElement>('[data-context-control]')) {
    const note = context.querySelector<HTMLElement>('.context-reason'); if (note) commands.append(note);
    primary.append(context);
  }
  for (const choices of commands.querySelectorAll<HTMLElement>('[data-attack-targets], [data-skill-targets], [data-skill-menu], [data-floor-controls]')) targets.append(choices);
  if (grid?.children.length) extraBody.append(grid); else grid?.remove();
  for (const control of [...commands.querySelectorAll<HTMLButtonElement>(':scope > button')]) {
    if (control.classList.contains('target')) targets.append(control);
    else primary.append(control);
  }
  extras.hidden = !extraBody.children.length; targets.hidden = !targets.children.length;
  for (const reason of commands.querySelectorAll<HTMLElement>('[data-attack-availability]')) primary.append(reason);
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
  if (!next) next = $('commands').querySelector<HTMLButtonElement>('button:not(:disabled)') ?? $('board');
  next?.focus({ preventScroll: true });
}
function closeDialog() {
  releasePrologue();
  releaseStart();
  releaseStory();
  const returnTo = modalReturnFocus;
  dialogOpen = false; modalReturnFocus = null; $('overlay').innerHTML = ''; releaseModalBackground();
  render(returnTo);
}
function say(text: string) { message = text; render(); }
function interactive() { return screen === 'battle' && renderReport.drawn && !interactionBusy() && !dialogOpen && state.phase === 'playing' && state.turn === 'player'; }
function dispatch(command: Command) {
  if (editPassability || !renderReport.drawn || !battleFlow.canDispatch(dialogOpen)) return;
  const previous = state;
  const commandBefore = selectionCommandState(state, commandOwner ?? selected);
  const result = reduceSelectionCommand(state, commandOwner ?? selected, command);
  if (result.error) { audio.playSE('se-invalid'); say(result.error); return; }
  commitMovementFacing(commandBefore,result.state,command,true);
  state = result.state; mode = 'inspect'; floorSelection = undefined;
  pendingArrival = command.type === 'move' && state.activeId ? {snapshot:state,actorId:state.activeId} : null;
  message = command.type === 'gate' && state.battleId === 'B01'
    ? state.gate.drained ? '水が引き、水路を歩きやすくなりました。' : '水路に水が戻りました。'
    : command.type === 'move' && previous.activeId && getUnit(previous, previous.activeId)?.plankReady
    ? '渡り板を使って移動しました。移動を取り消すと、渡り板の効果も戻ります。'
    : command.type === 'undoMove' && state.activeId && getUnit(state, state.activeId)?.plankReady
      ? '移動を取り消し、渡り板を使う前の状態に戻しました。'
      : command.type === 'undoMove' ? '移動と、その後の取得・操作を取り消しました。' : state.activeId ? '移動・行動を選ぶか、「行動終了」で向きを決めてください。' : '未行動の味方を選んでください。';
  presentCommitted(previous, result.commands);
}
function showArrivalInteraction() {
  const pending=pendingArrival;pendingArrival=null;
  if(!pending||state!==pending.snapshot||state.activeId!==pending.actorId||screen!=='battle'||dialogOpen)return;
  const interaction=arrivalInteraction(state);
  if(interaction){
    if(interaction.command.type==='gate')mode=interaction.command.gateId ? `gate:${interaction.command.gateId}` : 'gate';
    confirmCommand(interaction.title,interaction.body,interaction.command);
  }
}
function showTurnStart(resume: () => void) {
  if (screen !== 'battle' || state.phase !== 'playing') { resume(); return; }
  const newTurn = !turnAnnouncement.hasShown(state);
  turnAnnouncement.show(state, resume, { reducedMotion: motionPreference.matches, hidden: document.hidden });
  if (newTurn && !document.hidden) render();
}
function announceCommittedAttack(previous: typeof state) {
  const attack = committedAttackResolution(previous, state);
  if (!attack) return;
  const actor = getUnit(state, attack.actorId), target = getUnit(state, attack.targetId);
  message = `${actor?.name ?? '人物'} → ${target?.name ?? '対象'}：${attack.hit ? `命中、${attack.damage}ダメージ` : '外れ'}。${target ? `HP ${target.hp}/${target.maxHp}。` : ''}`;
}
function presentCommitted(previous: typeof state, commands: readonly Command[]) {
  dialogueBrief.clear(); dialogueJournal.observe(previous,state);
  const plan = board.preparePresentation(createPresentation(previous, state, commands), state);
  if(attackAnnouncementTimer!==undefined)window.clearTimeout(attackAnnouncementTimer);
  attackAnnouncementTimer=undefined;
  if(plan?.attack&&plan.moveDuration>0){
    const snapshot=state;attackAnnouncementTimer=window.setTimeout(()=>{attackAnnouncementTimer=undefined;if(state===snapshot&&screen==='battle'){announceCommittedAttack(previous);render();}},plan.moveDuration);
  }else announceCommittedAttack(previous);
  const soundCommand=commands.find(command=>command.type==='attack')??commands.at(-1);
  const sounds=soundsForTransition(previous,state,soundCommand);
  audio.playSESequence(plan?.attack?sounds.map(sound=>({...sound,delayMs:sound.delayMs+plan.moveDuration})):sounds);
  battleFlow.presentCommitted(plan);
}
function performEnemyActivation() {
  const previous = state;
  const activation = runEnemyActivationWithTrace(state);
  state = activation.state;
  presentCommitted(previous, activation.commands);
}
function modal(title: string, body: string, yes: string, action: () => void, cancel = true, cancelLabel = 'キャンセル', commandType?: Command['type'], cancelAction?: () => void) {
  releasePrologue();
  releaseStart();
  releaseStory();
  modalReturnFocus = currentFocusKey() ?? pendingFocus;
  releaseModalBackground();
  restoreModalBackground = makeModalBackgroundInert(app.querySelector<HTMLElement>('main.game-shell')!);
  dialogOpen = true; render();
  $('overlay').innerHTML = `<div class="veil"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><p class="eyebrow">流域盟約戦記</p><h2 id="dialog-title">${title}</h2><div class="dialog-body">${body}</div><div class="dialog-actions"></div></section></div>`;
  const commandDialog = $('overlay').querySelector<HTMLElement>('.dialog')!;
  if (commandType) { commandDialog.classList.add('command-confirmation'); commandDialog.dataset.commandType = commandType; }
  guardDialogEntry($('overlay').querySelector<HTMLElement>('.veil')!);
  updateAudioControls(audio.status);
  const actions = $('overlay').querySelector('.dialog-actions')!;
  const settle = createDialogSettlement(() => dialogOpen && actions.isConnected, closeDialog);
  const back = cancel ? button(cancelLabel, () => settle(cancelAction), false, 'quiet') : null;
  if (back) actions.append(back);
  const primary = button(yes, () => settle(action), false, 'primary'); actions.append(primary);
  if (cancelAction) $('overlay').querySelector('.veil')!.addEventListener('keydown', event => {
    const key = event as KeyboardEvent;
    if (key.key === 'Escape' && !key.repeat) { key.preventDefault(); key.stopPropagation(); settle(cancelAction); }
  }, true);
  ((commandType === 'attack' || cancelAction) && back ? back : primary).focus();
}
function confirmCommand(title: string, body: string, command: Command) {
  const snapshot = state, actorId = selectionCommandState(state, commandOwner ?? selected).activeId;
  modal(title, body, command.type === 'attack' ? '攻撃を確定' : command.type === 'defend' ? '防御を確定' : '確定', () => {
    if (state !== snapshot || selectionCommandState(state, commandOwner ?? selected).activeId !== actorId) { say('状況が変わりました。対象を選び直してください。'); return; }
    if (command.type === 'attack' && !attackAvailability(selectionCommandState(state, commandOwner ?? selected)).targets.some(target => target.targetId === command.targetId)) { say('この敵には今は攻撃できません。対象を選び直してください。'); return; }
    dispatch(command);
  }, true, 'キャンセル', command.type, () => {
    if(['collect','gate','repair','loot'].includes(command.type))mode='inspect';
    render();
  });
}
type FloorSelection = { floors: Pos[]; index: number; snapshot: typeof state; actorId: string | null; mode: string; key: string };
let floorSelection: FloorSelection | undefined;
function cycleFloor() {
  if (!floorSelection || floorSelection.snapshot !== state) return;
  floorSelection.index = (floorSelection.index + 1) % floorSelection.floors.length;
  cursor = { ...floorSelection.floors[floorSelection.index] };
  if (mode === 'move') selected = null;
  render();
}
/** Movement commits on the map; repeated inspection clicks can cycle surfaces. */
function selectBoardCell(pos: Pos, candidates?: Pos[]) {
  if (mapDrag.suppressSelection || !interactive()) return;
  if (editPassability) { selectCell(pos); return; }
  const floors = (state.battleId === 'B01' || !!registeredLandscape(state.battleId))
    ? (candidates?.length ? candidates.map(p => getCell(state, p)!).filter(Boolean).sort((a,b) => a.height - b.height)
      : b01OverlappingFloors(registeredLandscape(state.battleId) ? registeredFloors(registeredLandscape(state.battleId)!, state.cells) : state.cells, pos)) : [];
  if (mode === 'move') {
    floorSelection = undefined;
    const commandState = selectionCommandState(state, commandOwner ?? selected);
    const destinations = commandState.activeId ? reachable(commandState, commandState.activeId) : [];
    const legal = (floor: Pos) => destinations.some(cell => cell.x === floor.x && cell.y === floor.y && cell.cost > 0);
    const occupied = state.units.some(unit => unit.hp > 0 && unit.pos.x === pos.x && unit.pos.y === pos.y);
    const destination = occupied || legal(pos) ? pos : floors.find(legal) ?? pos;
    selectCell({x: destination.x, y: destination.y});
    return;
  }
  if (floors.length < 2) { floorSelection = undefined; selectCell(pos); return; }
  const key = floors.map(p => `${p.x},${p.y}`).join('|');
  const commandState = selectionCommandState(state, commandOwner ?? selected);
  if (floorSelection?.key === key && floorSelection.snapshot === state && floorSelection.mode === mode && floorSelection.actorId === commandState.activeId) {
    cycleFloor();
  } else {
    floorSelection = { floors, index: Math.max(0, floors.findIndex(p => p.x === pos.x && p.y === pos.y)), snapshot: state, actorId: commandState.activeId, mode, key };
    cursor = { ...floors[floorSelection.index] };
  }
  const selection = floorSelection;
  selectCell(selection!.floors[selection!.index]);
  // Inspection can change the command owner; retain the cycle for that owner.
  if (floorSelection) floorSelection.actorId = selectionCommandState(state, commandOwner ?? selected).activeId;
}
function inspectUnit(id: string) {
  const unit = getUnit(state, id); if (!unit) return;
  const lockedActorId = mode !== 'inspect' ? selectionCommandState(state, commandOwner ?? selected).activeId : null;
  selected = id; inspectionTeam = unit.team;
  if (!lockedActorId) {
    cursor = { ...unit.pos }; mode = 'inspect';
    if ((!state.activeId || state.activation.moveCancelled && !state.activation.moved && !state.activation.acted && !state.activation.collected) && unit.team === 'player' && unit.hp > 0 && !unit.acted && unit.kind !== 'escort') commandOwner = unit.id;
  } else commandOwner = lockedActorId;
  const actorId = selectionCommandState(state, commandOwner ?? selected).activeId;
  const acting = actorId ? getUnit(state, actorId) : undefined;
  message = lockedActorId ? `${acting?.name ?? '操作中の人物'}：${mode === 'move' ? '移動先' : mode === 'attack' ? '攻撃対象' : '対象'}を選択中（${unit.name}を参照）。選択中のボタンでキャンセルできます。`
    : unit.kind === 'escort' ? `${unit.name}は護送対象です。${state.battleId === 'B03' ? '隣接する味方の「荷車を押す」で進めます。' : '護送条件で自動的に進みます。'}`
    : acting && acting.id !== id ? `${acting.name}の行動中です。移動・行動済みの状態はそのままです。${acting.name}の「行動終了」で向きを決めてください。`
    : unit.team === 'enemy' ? '敵の能力を確認しています。攻撃するには操作キャラの「たたかう」から対象を選びます。'
    : unit.acted ? `${unit.name}はこのラウンドの行動を終えています。`
    : `${unit.name}を選択中。移動・たたかうなどを選んでください。`;
  const site = mapObjectCellStatus(state, unit.pos);
  const selectedSkill=unitSkill(acting ?? unit);
  if(selectedSkill&&mode===selectedSkill)message=`${SKILL_EFFECTS[selectedSkill].name}：${SKILL_EFFECTS[selectedSkill].effect} ${skillUses(acting ?? unit,selectedSkill)}。対象を選んでください。`;
  else if (site) message += ` ／ ${site}`;
  render();
}
function selectCell(pos: Pos) {
  if (!interactive()) return;
  if(mode==='heal'){
    const view=selectionCommandState(state,commandOwner??selected),target=state.units.find(unit=>unit.hp>0&&unit.pos.x===pos.x&&unit.pos.y===pos.y);
    if(!view.activeId||!target||!healPreview(view,view.activeId,target.id).legal)return;
  }
  cursor = pos;
  if (editPassability) {
    const cell = getCell(state, pos);
    if (!cell) return;
    const blocked = !isMovementBlocked(cell);
    if (blocked === cell.blocked) delete cell.debugBlocked;
    else cell.debugBlocked = blocked;
    render();
    return;
  }
  const actionState = selectionCommandState(state, commandOwner ?? selected);
  const unit = state.units.find(u => u.hp > 0 && u.pos.x === pos.x && u.pos.y === pos.y);
  commandOwner ??= actionState.activeId; selected = unit?.id ?? null;
  if (unit?.team === 'player' && ['inspect','move','attack'].includes(mode) && unit.id !== actionState.activeId) { inspectUnit(unit.id); return; }
  if (mode === 'move' && actionState.activeId) {
    if (unit && unit.id !== actionState.activeId) { inspectUnit(unit.id); return; }
    const candidate = reachable(actionState, actionState.activeId).find(r => r.x === pos.x && r.y === pos.y);
    if (!candidate || candidate.cost === 0) { say('そこへは移動できません。現在地以外の青緑の範囲を選んでください。'); return; }
    dispatch({ type: 'move', to: pos }); return;
  }
  if (mode === 'attack' && actionState.activeId) {
    if (!unit || unit.team !== 'enemy') { say('生存している敵を選んでください。'); return; }
    const preview = attackPreview(actionState, actionState.activeId, unit.id);
    if (!preview.legal) { say(preview.reason || '攻撃できません。'); return; }
    const remaining = Math.max(0, unit.hp - preview.damage), loss = unit.hp - remaining;
    const direction = preview.sector === 'front' ? '正面' : preview.sector === 'rear' ? '背後' : '左右';
    confirmCommand('攻撃を確定', `<p>${unit.name} ／ ${direction} <strong>命中率 ${preview.hitChance}%</strong></p><p>命中時 <strong>${preview.damage} ダメージ</strong>${preview.rear ? ' ・ 近接背後 +2' : ''}</p><p>HP ${unit.hp} → 命中時 ${remaining} ／ 外れ時 ${unit.hp}</p><div class="hp-forecast" role="img" aria-label="現在HP${unit.hp}、命中した場合${remaining}、外れた場合${unit.hp}"><span class="hp-forecast-remaining" style="width:${remaining / unit.maxHp * 100}%"></span><span class="hp-forecast-loss" style="width:${loss / unit.maxHp * 100}%"></span></div><p class="forecast-key">斜線は命中した場合の減少予告です。</p><p>キャンセルすると、攻撃せずに対象選択へ戻ります。</p>${state.battleId === 'B12' && unit.id === getBattleConfig(state.battleId).commanderId ? '<p>ヴェスクは倒しても命を落としません。捕らえた後は、北と南の操作台を守ることに集中しましょう。</p>' : ''}`, { type: 'attack', targetId: unit.id }); return;
  }
  if ((mode === 'survey' || mode === 'protect' || mode === 'plank' || mode === 'readOrder') && actionState.activeId) {
    if (!unit) { say(mode === 'readOrder' ? '敵を選んでください。' : '味方を選んでください。'); return; }
    const preview = jobCommandPreview(actionState, actionState.activeId, unit.id, mode);
    if (!preview.legal) { say(preview.reason); return; }
    const actor = getUnit(actionState, actionState.activeId)!;
    const title = { survey: '測線を確定', protect: '護衛を確定', plank: '渡り板を確定', readOrder: '読令を確定' }[mode];
    const effect = mode === 'readOrder' ? 'の動きを読み、向かう場所や狙っている相手を確かめます。'
      : mode === 'survey' ? 'が次に攻撃するときのダメージを2増やします。'
      : mode === 'plank' ? 'が次に移動するとき、水の浅い場所を歩きやすくします。'
      : 'が次に受けるダメージを2減らします。';
    const remaining = mode === 'readOrder' ? actor.readCharges : mode === 'survey' ? actor.surveyCharges : actor.plankCharges;
    confirmCommand(title, '<p>' + unit.name + effect + '</p><p>' + (mode === 'protect' ? '回数制限はありません。' : `残り ${remaining ?? 0} → ${(remaining ?? 0) - 1} 回。`) + '</p>', { type: mode, targetId: unit.id }); return;
  }
  if (mode === 'heal' && actionState.activeId) {
    if (!unit) { say('手当する生存味方・護送対象を選んでください。'); return; }
    const preview = healPreview(actionState, actionState.activeId, unit.id);
    if (!preview.legal) { say(preview.reason); return; }
    const healer = getUnit(actionState, actionState.activeId)!;
    confirmCommand('手当を確定', `<p>${unit.name}: HP ${unit.hp} → ${Math.min(unit.maxHp, unit.hp + preview.amount)}（+${preview.amount}）</p><p>手当の残り ${healer.healCharges} → ${(healer.healCharges ?? 0) - 1} 回。退避した仲間は復帰できません。</p>`, { type: 'heal', targetId: unit.id }); return;
  }
  if (mode === 'inspect' && actionState.activeId) {
    const interaction=arrivalInteraction(actionState);
    const actor=getUnit(actionState,actionState.activeId)!;
    if(interaction&&actor.pos.x===pos.x&&actor.pos.y===pos.y){confirmCommand(interaction.title,interaction.body,interaction.command);return;}
  }
  if (unit) { inspectUnit(unit.id); return; }
  else if (mapObjectCellStatus(state, pos)) { message = mapObjectCellStatus(state, pos)!; }
  else if (state.battleId === 'B12' && state.finalControl?.commanderSubdued && state.units.some(u => u.id === getBattleConfig(state.battleId).commanderId && u.hp === 0 && u.pos.x === pos.x && u.pos.y === pos.y)) { message = 'ヴェスクは捕らえました。引き続き、二つの操作台を守りましょう。'; }
  else { const info = cellInspection(state, pos); message = [info.title, ...info.lines].join(' ／ '); }
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
  const canPick = interactive();
  const playing = canPick && !editPassability;
  if (passabilityDebug) {
    passabilityToggle.disabled = !canPick;
    passabilityToggle.textContent = editPassability ? '編集を終了して移動を試す' : '通行マスを編集';
    passabilityToggle.setAttribute('aria-pressed', String(editPassability));
    passabilityReset.disabled = !canPick || !state.cells.some(cell => cell.debugBlocked !== undefined);
    const cell = getCell(state, cursor);
    passabilityHint.textContent = editPassability
      ? ` 緑＝通行可、赤＝通行不可。マスを選んで反転。 ${cell ? posLabel(cell) + (isMovementBlocked(cell) ? ' 通行不可' : ' 通行可') : ''}`
      : ' 変更は現在の戦闘のみ有効。進行は保存されません。';
  }
  const dialogueLog = document.getElementById('battle-dialogue-log') as HTMLButtonElement | null;
  if (dialogueLog) dialogueLog.disabled = screen !== 'battle' || interactionBusy() || state.turn !== 'player' || (dialogOpen && !utilityMenuOpen) || !dialogueJournal.history.length;
  const commandState = selectionCommandState(state, commandOwner ?? selected);
  ($('shorten-presentation') as HTMLButtonElement).disabled = !battleFlow.canShortenPresentation;
  ($('restart') as HTMLButtonElement).disabled = interactionBusy() || (dialogOpen && !utilityMenuOpen) || screen !== 'battle';
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
  ($('campaign-menu') as HTMLButtonElement).disabled = interactionBusy() || (dialogOpen && !utilityMenuOpen);
  ($('opening-guide') as HTMLButtonElement).disabled = interactionBusy() || (dialogOpen && !utilityMenuOpen);
  notebookShell?.toolsTitle.setAttribute('aria-disabled', String(interactionBusy() || state.turn !== 'player' || screen !== 'battle' || (dialogOpen && !utilityMenuOpen)));
  $('chapter-subtitle').textContent = config.subtitle;
  $('battle-title').textContent = config.id + ' ─ ' + config.title;
  $('board').setAttribute('aria-label', config.title + 'の戦場');
  $('objective-text').textContent = battleObjectiveCopy(state.battleId).summary;
  $('objective-steps').textContent = battleObjectiveCopy(state.battleId).steps.join(' → ');
  $('save-status').textContent = saveStatus;
  $('battle-guide').textContent = briefingRulesText(state.battleId, config);
  $('records').textContent = finalBattle ? `両操作点 連続保持 ${state.finalControl?.heldRounds ?? 0}/2R ｜ ヴェスク ${state.finalControl?.commanderSubdued ? '制圧済み・保全対象' : '未制圧'}` : repairBattle ? `保守員救出 ${config.records.filter(r => state.records.includes(r.id)).length}/2 ｜ 補助弁復旧 ${Object.values(state.repairs ?? {}).filter(r => r.completed).length}/2` : portBattle ? `検問C 連続保持 ${state.capture?.heldRounds ?? 0}/2R ｜ 入港確認記録 ${state.records.includes('C') ? '確保済み' : '入港後に確保'}` : delegationBattle ? `三都市招集連署・裁定所受理記録 ｜ ${state.records.includes('J') && state.records.includes('H') ? '確保済み' : '到着後に確保'}` : sluiceBattle ? `保守記録 ${state.records.includes('P') ? '✓ 確保' : '未取得'} ｜ C保持 ${state.capture?.heldRounds ?? 0}/2R` : evacuationBattle ? `住民避難 ${state.records.filter(id => config.records.some(r => r.id === id)).length}/2 ｜ ${config.records.map(r => r.name + (state.records.includes(r.id) ? ' 案内済み' : ' 未案内')).join('・')}` : chainBattle ? `書記保全記録 ${state.records.includes('W') ? '✓ 確保' : '護送完了で確保'} ｜ 鎖門 ${state.gate.drained ? '開通済み' : state.gate.pendingRound ? '開通予約済み' : '未開通'}` : archiveBattle ? `必須 ${requiredRecords(state.battleId).filter(r => state.records.includes(r.id)).length}/3 ｜ 補償名簿 ${state.records.includes('K') ? '確保' : '未取得'}` : captureBattle ? `制圧C ${state.capture?.heldRounds ?? 0}/${config.requiredHoldRounds ?? 2}R` : state.battleId==='B02' ? `観測地点 ${state.records.includes('O') ? '調査済み' : '未調査'}` : '記録 ' + state.records.length + '/' + config.records.length;
  $('turn').innerHTML = `<strong>ROUND ${String(state.round).padStart(2, '0')} <small>/ ${String(config.roundLimit).padStart(2, '0')}</small></strong><span class="${state.turn === 'enemy' ? 'enemy-turn' : ''}">${state.turn === 'enemy' ? enemyForce + ' · 敵ターン' : state.activeId ? '味方ターン · 行動中' : '味方ターン · 行動する人物を選択'}</span><small>未行動 味${state.units.filter(u => u.team === 'player' && u.kind !== 'escort' && !u.acted && u.hp > 0).length} / 敵${state.units.filter(u => u.team === 'enemy' && !u.acted && u.hp > 0).length}</small><em class="${(state.battleId === 'B02' && state.round >= config.roundLimit - 2) || ((escortBattle || archiveBattle || evacuationBattle) && state.round >= (state.battleId === 'B03' ? config.roundLimit-2 : chainBattle || delegationBattle ? config.roundLimit - 2 : 8)) || ((captureBattle || finalBattle) && state.round >= 6) || ((portBattle || repairBattle) && state.round >= 10) || (sluiceBattle && state.round >= 10) ? 'deadline' : ''}">${finalBattle ? `分散操作確保期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : repairBattle ? `保守路退去期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : portBattle ? `入港確保期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : delegationBattle ? `護送期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : sluiceBattle ? `補助堰確保期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : evacuationBattle ? `避難期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : chainBattle ? `護送期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R） ｜ 鎖門: ${state.gate.pendingRound ? `R${state.gate.pendingRound}開始に${state.gate.pendingDrained === false ? '閉門' : '開通'}` : state.gate.drained ? '開通済み' : '閉門'}` : archiveBattle ? `蔵の封鎖: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : captureBattle ? `制圧期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : escortBattle ? `搬出期限: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : !config.gate ? `橋閉鎖: 第${config.roundLimit}R終了（残り${config.roundLimit - state.round + 1}R）` : state.gate.pendingRound ? `水門: R${state.gate.pendingRound}開始に${state.gate.pendingDrained === false ? '再入水' : '排水'}` : state.gate.drained ? '水門: 排水済み（再操作で再入水）' : (state.battleId === 'B01' ? '水門: 浅瀬（操作で即時排水）' : '水門: 浅瀬（操作で次R排水）')}</em>`;
  const finalStatus = $('final-control-status');
  finalStatus.hidden = !finalBattle;
  if (finalBattle) {
    const preview = finalControlPreview(state), commander = getUnit(state, config.commanderId!);
    finalStatus.replaceChildren();
    for (const point of preview.points) {
      const occupant = point.occupantId ? getUnit(state, point.occupantId) : undefined, line = document.createElement('p');
      line.textContent = point.name + '：' + (occupant ? occupant.name + 'が守っています' : '味方を向かわせてください'); finalStatus.append(line);
    }
    const line = document.createElement('p');
    line.textContent = `操作台の防衛 ${preview.heldRounds}/${preview.requiredRounds}ラウンド ／ ヴェスク ${preview.commanderSubdued ? '捕縛済み' : 'HP ' + (commander?.hp ?? '?') + '/' + (commander?.maxHp ?? '?')}`; finalStatus.append(line);
  }
  const repairStatus = $('repair-status');
  repairStatus.hidden = !repairBattle;
  if (repairBattle) {
    repairStatus.replaceChildren();
    for (const site of config.repairSites ?? []) {
      const worker = config.records.find(r => r.id === site.workerRecordId)!, preview = repairPreview(state, site.id), status = state.repairs![site.id], line = document.createElement('p');
      const rescue = evacuationPreview(state, worker.id);
      line.textContent = `${worker.name}：${state.records.includes(worker.id) ? '救出済み' : '救助を待っています'} ／ ${site.name}：${status.completed ? '復旧済み' : status.pendingRound ? '次のラウンドに復旧します' : '未復旧'}`;
      repairStatus.append(line);
    }
    const note = document.createElement('p'); note.textContent = '二人の保守員を救い、二つの補助弁を直したら、リセを西の退去口へ移動させましょう。'; repairStatus.append(note);
  }
  const evacuationStatus = $('evacuation-status');
  evacuationStatus.hidden = !evacuationBattle;
  if (evacuationBattle) {
    evacuationStatus.replaceChildren();
    for (const record of config.records) {
      const preview = evacuationPreview(state, record.id), line = document.createElement('p');
      line.textContent = `${record.name}：${state.records.includes(record.id) ? '避難済み' : '避難を待っています'}`;
      evacuationStatus.append(line);
    }
    const note = document.createElement('p'); note.textContent = '二組の住民を案内したら、リセも東の脱出地点へ向かいましょう。'; evacuationStatus.append(note);
  }
  const archiveStatus = $('archive-status');
  archiveStatus.hidden = !archiveBattle;
  if (archiveBattle) {
    archiveStatus.replaceChildren();
    for (const record of config.records) {
      const line = document.createElement('p');
      line.textContent = `${record.name}：${state.records.includes(record.id) ? '取得済み' : record.optional ? '任意の資料' : '必要な資料'}`;
      archiveStatus.append(line);
    }
    const warning = document.createElement('p'); warning.className = 'archive-warning'; warning.textContent = '必要な三つの資料を取得したら、リセを西の退去口へ。補償名簿も持ち帰る場合は、その前に取得してください。'; archiveStatus.append(warning);
  }
  const captureStatus = $('capture-status');
  captureStatus.hidden = !captureBattle && !sluiceBattle && !portBattle;
  if (portBattle) {
    const hold = capturePreview(state), gate = gatePreview(state);
    captureStatus.textContent = `検問の防衛 ${hold.heldRounds}/${hold.requiredRounds}ラウンド ／ 港の門：${state.gate.drained ? '開いています' : state.gate.pendingRound ? '次のラウンドに切り替わります' : '閉じています'}`;
  }
  if (sluiceBattle) {
    const hold = capturePreview(state);
    captureStatus.replaceChildren();
    for (const gate of config.sluiceGates ?? []) {
      const water = state.sluices![gate.id], preview = gatePreview(state, gate.id), line = document.createElement('p');
      line.textContent = `${gate.name}：${water.drained ? '水が引いています' : '水が流れています'}${water.pendingRound ? '（次のラウンドに切り替わります）' : ''}`;
      captureStatus.append(line);
    }
    const line = document.createElement('p');
    line.textContent = `保守記録：${state.records.includes('P') ? '取得済み' : '未取得'} ／ 操作所の防衛 ${hold.heldRounds}/${hold.requiredRounds}ラウンド`;
    captureStatus.append(line);
  }
  if (captureBattle) {
    const hold = capturePreview(state), water = gatePreview(state);
    captureStatus.textContent = `操作所の防衛 ${hold.heldRounds}/${hold.requiredRounds}ラウンド ／ 水路：${state.gate.drained ? '水が引いています' : '水が流れています'}${state.gate.pendingRound ? '（次のラウンドに切り替わります）' : ''}`;
  }
  const escortStatus = $('escort-status');
  escortStatus.hidden = !escortBattle;
  if (escortBattle && escort) {
    const preview = escortAdvancePreview(state);
    if (state.battleId === 'B03') {
      const push = pushCartPreview(commandState);
      escortStatus.textContent = `負傷者の荷車 HP ${escort.hp}/${escort.maxHp} ／ 搬出 ${state.escort?.index ?? 0}/${(state.escort?.route.length ?? 1) - 1} ／ ${push.legal ? '「荷車を押す」で1マス進行（1ラウンドに一度）' : push.reason}`;
    } else {
    escortStatus.textContent = `${delegationBattle ? '代表と証人の一行' : chainBattle ? '書記トマ' : '負傷者の荷車'} HP ${escort.hp}/${escort.maxHp} ／ ${preview.canAdvance ? '次のラウンドに進めます' : preview.next ? '近くの敵や進路を確認してください' : '目的地に到着しました'}`;
    }
  }
  renderReadOrders();
  renderEquipment();
  const acting = commandState.activeId ? getUnit(commandState, commandState.activeId) : undefined;
  renderCommandPaletteIdentity($('acting-unit'), acting, mode, !playing && screen === 'battle');
  const teams = $('inspection-teams'); teams.replaceChildren(); teams.hidden = true;
  const roster = $('roster'); roster.replaceChildren(); roster.hidden = true;
  const unit = selected ? getUnit(state, selected) : undefined;
  if (unit) renderUnitInspection($('selection'), state, unit, enemyForce);
  else renderCellInspection($('selection'), state, cursor);
  const commands = $('commands'); commands.replaceChildren();
  if (commandState.activeId) {
    const active = getUnit(commandState, commandState.activeId)!;
    const attack = attackAvailability(commandState);
    const grid = document.createElement('div'); grid.className = 'command-grid'; commands.append(grid);
    const selecting=choosingTarget(mode), skill=unitSkill(active);
    const skillActive=!!skill&&mode===skill;
    const cancelSelection=()=>{mode='inspect';floorSelection=undefined;message=`${active.name}：コマンドを選択してください。`;render();};
    const appendNearby = (pos: Pos, command: Command, control: HTMLButtonElement) => {
      const availability=nearbyInteraction(commandState,pos,command,playing&&!selecting);
      if(!availability.visible)return;
      const context=document.createElement('div');context.className='context-control';context.dataset.contextControl='';
      control.disabled ||= !availability.enabled;
      context.append(control);grid.append(context);
    };
    const canUndo=canUndoMove(commandState);
    grid.append(button(mode==='move'||canUndo?'移動をキャンセル':commandState.activation.moved?'移動済み':'移動する',()=>{
      if(mode==='move')cancelSelection();
      else if(canUndo)dispatch({type:'undoMove'});
      else {mode='move';floorSelection=undefined;message='青緑のマスから移動先を選んでください。';render();}
    },!playing||(selecting&&mode!=='move')||(commandState.activation.moved&&!canUndo),mode==='move'?'selected':'','移動する'));
    const skillName=skill?SKILL_EFFECTS[skill].name:active.id==='ally-neia'?'浅瀬適性':'技なし';
    grid.append(button(skillActive?'固有技をキャンセル':skillName,()=>{
      if(skillActive)cancelSelection();
      else if(skill){mode=skill;message=`${skillName}：${SKILL_EFFECTS[skill].effect} ${skillUses(active,skill)}。対象を選んでください。`;render();}
    },!playing||!skill||(selecting&&!skillActive)||commandState.activation.acted||(!!skill&&skill!=='protect'&&skillUses(active,skill).startsWith('残り0回')),skillActive?'selected':'','固有技'));
    grid.append(button(mode==='attack'?'たたかうをキャンセル':'たたかう',()=>{
      if(mode==='attack')cancelSelection();else{mode='attack';message='攻撃する敵を選んでください。';render();}
    },!playing||(selecting&&mode!=='attack')||!attack.enabled,mode==='attack'?'selected':'','たたかう'));
    const defense=defendAvailability(commandState,active.id);
    grid.append(button('防御',()=>confirmCommand('防御する','<p>次にこの人物を動かすまで、受けるダメージを減らします。</p><p>次のターンは続けて防御できません。</p>',{type:'defend'}),!playing||selecting||!defense.legal));
    if (state.battleId === 'B03') {
      const cart = escortUnit(commandState), push = pushCartPreview(commandState);
      if (cart) appendNearby(cart.pos, { type: 'pushCart' }, button('荷車を押す', () => confirmCommand('荷車を押す', `<p>${active.name}が荷車を次の目印まで押します。</p><p>荷車を進められるのは、1ラウンドに一度です。近くの敵や、行く手をふさぐ人物がいる間は押せません。</p>`, { type: 'pushCart' }), !playing || !push.legal, '', 'push-cart'));
    }
    if (mode === 'attack') commands.append(createAttackTargets(commandState, {
      disabled: !playing,
      onSelect: id => { const enemy = getUnit(commandState, id); if (enemy) selectCell(enemy.pos); },
    }));
    if (mode === 'survey' || mode === 'protect' || mode === 'plank' || mode === 'readOrder' || mode === 'heal') {
      commands.append(createSkillTargets(commandState, active, mode, !playing, id => {
        const target = getUnit(commandState, id); if (target) selectCell(target.pos);
      }));
    }
    commands.append(button('行動終了', () => facingDialog(), !playing || selecting, 'primary'));
  }
  updateNotebookControls(playing);
  const endTurn=document.getElementById('end-player-turn') as HTMLButtonElement | null;
  if(endTurn)endTurn.disabled=screen!=='battle'||state.phase!=='playing'||state.turn!=='player'||!!state.activeId||choosingTarget(mode)||interactionBusy()||dialogOpen;
  $('message').textContent = state.phase === 'playing' && state.turn === 'enemy'
    && message === '未行動の味方を選んでください。'
    ? '敵の行動中です。敵全員の行動が終わると操作できます。' : message;
  const coordinates = $('coordinates'); coordinates.replaceChildren();
  for (let y = 0; y < config.height; y++) for (let x = 0; x < config.width; x++) { const b = button(`${x},${y}`, () => selectCell({ x, y }), !canPick, '', `cell:${x},${y}`); b.setAttribute('aria-label', `セル ${x},${y}`); coordinates.append(b); }
  board.display({ state, selected, commandActorId: commandState.activeId, cursor, reachable: commandState.activeId ? reachable(commandState, commandState.activeId).filter(r => r.cost > 0) : [], mode, enabled: canPick, editPassability });
  restoreFocus(focusKey);
  if (screen === 'battle' && renderReport.drawn && state.phase === 'playing' && !dialogOpen && !interactionBusy() && !turnAnnouncement.hasShown(state)) {
    queueMicrotask(() => {
      if (screen === 'battle' && renderReport.drawn && state.phase === 'playing' && !dialogOpen && !interactionBusy() && !turnAnnouncement.hasShown(state)) battleFlow.presentCommitted(null);
    });
  }
}
function renderEquipment() {
  const commandState = selectionCommandState(state, commandOwner ?? selected);
  const equipment = campaign.equipment ?? createEquipment();
  const rows = equipmentCollectionRows(campaign.completed, equipment, getConfirmedEquipmentEvents(campaign), state.phase === 'playing' ? state.pendingEquipment : []);
  const content = $('equipment-collection-content'); content.replaceChildren(...rows.map(row => {
    const line = document.createElement('p');
    line.textContent = `${row.event.battleId} ${row.event.source === 'clear' ? 'クリア基本' : '任意箱'} / ${row.item.name}（${EQUIPMENT_SLOT_NAMES[row.item.slot]}） / ${equipmentEffectText(row.item.bonus)} / ${row.status}`;
    return line;
  }));
  const closing = document.createElement('p'); closing.textContent = '最後の戦いには宝箱はありません。箱を開けなくても、物語は最後まで進められます。'; content.append(closing);
  const chests = state.equipmentChests ?? [], chestStatus = $('equipment-chest-status'); chestStatus.hidden = !chests.length;
  chestStatus.replaceChildren(...chests.map(chest => {
    const item = equipmentDefinition(chest.eventId)!, line = document.createElement('p');
    const preview = equipmentPickupPreview(commandState, chest.eventId);
    line.textContent = `宝箱：${item.name} ／ ${state.pendingEquipment?.includes(chest.eventId) ? '回収済み。勝利すると持ち帰れます' : preview.eligible ? '開けられます' : '宝箱のマスへ移動すると開けられます'}`;
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
function confirmEndPlayerTurn() {
  if(screen!=='battle'||state.turn!=='player'||state.activeId||choosingTarget(mode)||!interactive())return;
  modal('味方のターンを終了','<p>まだ動かしていない味方も、その場で待機して敵のターンへ進みます。よろしいですか？</p>','ターンを終了',()=>dispatch({type:'endPlayerTurn'}));
}
function facingDialog() {
  const view = selectionCommandState(state, commandOwner ?? selected), actor = view.activeId ? getUnit(view, view.activeId) : undefined;
  if (!actor) return;
  const snapshot = state; let direction = actor.facing;
  modal('行動終了', '<p>終了時の向きを選び、確定してください。防御効果は付きません。</p><div id="facings" class="facing-grid" role="group" aria-label="終了時の向き"></div>', '向きを確定して終了', () => {
    if (state !== snapshot || selectionCommandState(state, commandOwner ?? selected).activeId !== actor.id) { say('状況が変わりました。もう一度選んでください。'); return; }
    dispatch({ type: 'end', facing: direction });
  }, true, 'キャンセル', 'end');
  const container = document.getElementById('facings')!;
  const names: Record<Facing, string> = { N:'北 N ↗', E:'東 E ↘', S:'南 S ↙', W:'西 W ↖' };
  const screenDirection: Record<Facing, string> = { N:'画面右上', E:'画面右下', S:'画面左下', W:'画面左上' };
  const status = document.createElement('p'); status.className = 'facing-selection'; status.setAttribute('role','status');
  container.before(status);
  const paint = () => {
    status.textContent = `選択中：${names[direction]}（${screenDirection[direction]}）`;
    for (const control of container.querySelectorAll<HTMLButtonElement>('button')) {
      const facing = control.dataset.facing as Facing, chosen = facing === direction;
      control.querySelector('.facing-label')!.textContent = `${chosen ? '✓ ' : ''}${names[facing]}`;
      control.setAttribute('aria-pressed', String(chosen)); control.classList.toggle('selected', chosen);
    }
  };
  for (const facing of ['W','N','S','E'] as Facing[]) {
    const control = button('', () => { direction = facing; paint(); });
    const pose = castIdle(actor, facing);
    if(pose){
      const image = document.createElement('img'); image.className = 'facing-pose';
      image.src = pose.path; image.alt = ''; image.draggable = false; control.append(image);
    }
    const label = document.createElement('span'); label.className = 'facing-label'; control.append(label);
    const hint = document.createElement('span'); hint.className = 'facing-screen-direction'; hint.textContent = screenDirection[facing]; control.append(hint);
    control.setAttribute('aria-label', `${actor.name}：${names[facing]}（${screenDirection[facing]}）`);
    control.dataset.facing = facing; container.append(control);
  }
  paint();
}

function persist() {
  if (!saveWritable || !storage) { if (getUnconfirmedEquipmentEvents(campaign).length) saveStatus = '装備に勝利未保存の取得があります。今回のプレイ中のみ保持し、保存は利用できません。'; return; }
  const result = writeCampaign(storage, campaign);
  if (result.ok && result.campaign) campaign = result.campaign;
  saveStatus = result.ok ? '進行を保存済み（戦闘途中の状態は保存しません）' : '進行の保存に失敗しました。' + (result.error ?? '') + (getUnconfirmedEquipmentEvents(campaign).length ? ' 装備の新取得は勝利未保存で、今回のプレイ中のみ保持します。' : '');
}
function clearBattleTimers() { if(attackAnnouncementTimer!==undefined)window.clearTimeout(attackAnnouncementTimer);attackAnnouncementTimer=undefined;pendingArrival = null; turnAnnouncement.clear(); commandOwner = null; dialogueBrief.clear(); dialogueJournal.discardPending(); battleFlow.clear(); }
function finish() {
  clearBattleTimers(); screen = 'result';
  audio.beginScene(null);
  const won = state.phase === 'won', config = getBattleConfig(state.battleId);
  audio.playSESequence(resultSounds(state.battleId, won));
  if (won) { campaign = completeBattle(campaign, state); persist(); }
  render();
  if(won)turnAnnouncement.showClear(()=>finishResult(true),{reducedMotion:motionPreference.matches,hidden:document.hidden});
  else finishResult(false);
}
function finishResult(readStory = false) {
  const won = state.phase === 'won', config = getBattleConfig(state.battleId);
  const retreat = state.units.filter(u => u.team === 'player' && u.hp <= 0).map(u => u.name).join('・');
  modal(won ? (state.battleId === 'B12' ? '同じ杭に、別々の記録を。' : state.battleId === 'B11' ? '設備を、人の手で守る。' : state.battleId === 'B10' ? '救援船を、暮らしへ。' : state.battleId === 'B09' ? '証言を、公開の場へ。' : state.battleId === 'B08' ? '保守と責任を、分けて記す。' : state.battleId === 'B07' ? '告白の先に、救助を。' : state.battleId === 'B01' ? '記録は、消させない。' : state.battleId === 'B02' ? '旧堤を越えて。' : state.battleId === 'B03' ? '名簿と、人を守る。' : state.battleId === 'B06' ? '証言を、岸へ届ける。' : state.battleId === 'B05' ? '署名は、消せない。' : '水は、下流にも続く。') : '調査隊は撤退した。',
    won ? '<p class="result-stamp">' + (state.battleId === 'B12' ? '第4章 完了' : state.battleId === 'B03' ? '第1章 完了' : state.battleId === 'B06' ? '第2章 完了' : state.battleId === 'B09' ? '第3章 完了' : '作戦達成') + '</p><p>' + battleResultSummary(state.battleId) + '</p>' + '<p>退避: ' + (retreat || 'なし') + '。' + 'もう一度遊ぶときは、仲間が回復した状態で戦闘の最初から始まります。見つけた証拠と物語の進み具合は残ります。' + '</p>'
      : '<p class="result-stamp defeat">作戦失敗</p><p>' + (getUnit(state, 'ally-lise')!.hp <= 0 ? 'リセが戦闘不能になりました。仲間の防御と射程を使い、退路を確保しましょう。' : state.battleId === 'B09' && (escortUnit(state)?.hp ?? 1) <= 0 ? '代表と証人の一行を守り切れませんでした。味方をそばに置き、セナの「手当」も使って進みましょう。' : state.battleId === 'B06' && (escortUnit(state)?.hp ?? 1) <= 0 ? '書記トマが戦闘不能になりました。隣接する護送役とセナの手当で守りましょう。' : state.battleId === 'B03' && (escortUnit(state)?.hp ?? 1) <= 0 ? '負傷者の荷車が破壊されました。護送役と手当で荷車を守りましょう。' : config.defeatMessage) + '</p>',
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
  const pages = readAuthoredStory(resultStoryHtml(state.battleId, state.records));
  if (dialogueJournal.history.length) actions.append(button('戦闘中の会話を読む', replayBattleDialogue, false, 'quiet'));
  if (won) actions.append(button('物語を読み返す', () => finishResult(true), false, 'quiet'));
  actions.append(button('出撃準備', preparation, false, 'quiet'));
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
  if (won && readStory) storyOverlay(config.title + ' / 戦闘後', pages, '結果を見る', () => finishResult(false), 'result');
}
function showEnding(readStory = true) {
  if (!campaign.completed.includes('B12')) return;
  clearBattleTimers();
  audio.beginScene('bgm-ending');
  modal('終幕 ─ 同じ杭に、別々の記録を。', endingContent(campaign.evidence), '戦闘選択へ', campaignMenu, false);
  fieldDialog();
  $('overlay').querySelector('.dialog-actions')!.append(button('B12を初期配置から再挑戦', () => chooseBattle('B12'), false, 'quiet'));
  $('overlay').querySelector('.dialog-actions')!.append(button('終幕を読み返す', () => showEnding(true), false, 'quiet'));
  if (readStory) storyOverlay('終幕 ─ 同じ杭に、別々の記録を。', readAuthoredStory(endingContent(campaign.evidence)), '読了・選択へ', () => showEnding(false), 'ending');
}
function restart() {
  dialogueJournal.reset(state.battleId);
  releaseStart();
  releaseStory();
  clearBattleTimers(); dialogOpen = false; $('overlay').innerHTML = ''; releaseModalBackground();
  campaign = selectBattle(campaign, state.battleId); persist();
  editPassability = false;
  state = createPartyBattle(state.battleId, campaign.parties?.[state.battleId] ?? defaultParty(state.battleId), campaign.jobs, commonLevel(campaign.completed), { equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign), combat: campaign.combat }); selected = 'ally-lise'; inspectionTeam = 'player'; mode = 'inspect';
  cursor = { ...getUnit(state, selected)!.pos }; screen = 'battle';
  audio.beginScene(battleMusic(state.battleId));
  message = battleObjectiveCopy(state.battleId).summary; pendingFocus = null; modalReturnFocus = null;
  render('移動する');
  board.focusUnitInViewport?.(selected!);
}
function chooseBattle(id: BattleId) {
  if (!campaign.unlocked.includes(id)) return;
  dialogueJournal.reset(id);
  releaseStart();
  releaseStory();
  clearBattleTimers(); campaign = selectBattle(campaign, id); persist();
  editPassability = false;
  state = createPartyBattle(id, campaign.parties?.[id] ?? defaultParty(id), campaign.jobs, commonLevel(campaign.completed), { equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign), combat: campaign.combat }); selected = null; inspectionTeam = 'player'; mode = 'inspect'; cursor = {x:0,y:5}; screen = 'intro';
  dialogOpen = false; pendingFocus = null; modalReturnFocus = null; $('overlay').innerHTML = ''; releaseModalBackground(); intro();
}
function storyOverlay(title: string, pages: readonly StoryPage[], label: string, complete: () => void, presentation: 'intro' | 'result' | 'ending' | 'field' = 'field') {
  releasePrologue();
  releaseStart();
  releaseStory(); releaseModalBackground();
  modalReturnFocus = currentFocusKey() ?? pendingFocus;
  restoreModalBackground = makeModalBackgroundInert(app.querySelector<HTMLElement>('main.game-shell')!);
  dialogOpen = true; render();
  disposeStory = mountStoryPanel($('overlay'), { title, pages: presentation === 'field' ? pages : [...pages.filter(page => !page.speaker), ...pages.filter(page => page.speaker)], completeLabel: label, scenery: storyScenery(state.battleId, presentation),
    findSpeaker: storySpeakerFace, skipLabel: '会話をスキップ', complete: () => { closeDialog(); complete(); } });
}
/** Only entered by BattleFlow after a committed presentation is completely settled. */
function showPendingBattleDialogue(resume: () => void) {
  if (screen !== 'battle' || state.phase !== 'playing' || state.turn !== 'player') { resume(); return; }
  const snapshot = state, rows = dialogueJournal.drain();
  const important = rows.filter(row => row.kind === 'important'), brief = rows.filter(row => row.kind === 'brief').at(-1);
  const finishDialogue = () => { if (screen === 'battle' && state === snapshot && brief) dialogueBrief.show(brief); resume(); };
  const show = (index: number) => {
    if (screen !== 'battle' || state !== snapshot || index >= important.length) { finishDialogue(); return; }
    const row = important[index];
    try { storyOverlay(row.title, row.pages, '戦闘に戻る', () => show(index + 1)); }
    catch {
      // A failed portrait/DOM mount must not leave a permanent modal input lock.
      if (screen === 'battle' && state === snapshot) { releaseStory(); $('overlay').replaceChildren(); dialogOpen = false; releaseModalBackground(); }
      finishDialogue();
    }
  };
  show(0);
}
function replayBattleDialogue() {
  if (interactionBusy() || (dialogOpen && screen !== 'result' && !utilityMenuOpen)) return;
  const returnScreen = screen, returnKey = currentFocusKey(); dialogueBrief.clear();
  const pages: StoryPage[] = dialogueJournal.history.flatMap(row => [{ text: row.title }, ...row.pages]);
  if (!pages.length) return;
  storyOverlay(getBattleConfig(state.battleId).title + ' / 戦闘中の会話', pages, '読み終えて戻る', () => {
    if (returnScreen === 'result') finishResult(false); else render(returnKey);
  });
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
  veil.classList.add('field-veil');
  $('overlay').querySelector('.dialog')?.classList.add('field-dialog');
}
function intro() {
  audio.beginScene('bgm-briefing');
  const config = getBattleConfig(state.battleId); render();
  const story = introStoryHtml(state.battleId);
  storyOverlay(config.title, readAuthoredStory(story), '作戦説明へ', briefing, 'intro');
}
function showOpeningContext(complete: () => void, replay = false) {
  const returnCue = audio.status.cue;
  audio.beginScene('bgm-prologue');
  releaseStart(); releaseStory(); releasePrologue(); releaseModalBackground();
  $('overlay').replaceChildren();
  dialogOpen = true; render();
  disposePrologue = mountPrologue($('overlay'), { background: app.querySelector<HTMLElement>('main.game-shell')!, returnFocus: null,
    continueLabel: replay ? '閉じて元の画面へ戻る' : '第1戦の物語へ進む', skipLabel: replay ? '閉じる' : '序章をスキップ',
    onComplete: () => { closeDialog(); if (replay) audio.beginScene(returnCue); complete(); } });
}
function beginNewGame() {
  const begin = () => {
    if (storage && (startHasCheckpoint || startWarning)) {
      const result = resetCampaign(storage);
      if (!result.ok) { startWarning = result.error ?? '保存を初期化できませんでした。'; showStartScreen('new'); return; }
    }
    clearBattleTimers(); dialogueJournal.reset('B01'); campaign = createCampaign(); startHasCheckpoint = false; startWarning = undefined;
    if (storage) saveWritable = true;
    editPassability = false;
    state = createPartyBattle('B01', defaultParty('B01'), campaign.jobs, 1, { equipment: campaign.equipment, combat: campaign.combat });
    selected = null; inspectionTeam = 'player'; mode = 'inspect'; cursor = { x: 0, y: 5 }; screen = 'intro';
    saveStatus = storage ? '戦闘開始時に新しい進行を保存します。' : '今回のプレイ中は遊べますが、進行は保存されません。';
    showOpeningContext(() => { intro(); guardDialogEntry($('overlay').querySelector<HTMLElement>('.story-shield')!); });
  };
  if (startHasCheckpoint || startWarning) {
    modal('最初から始めますか？', '<p>保存済みの進行・編成・装備を初期状態に戻し、プロローグから始めます。</p><p>今の保存から続ける場合は、キャンセルしてください。確認するまで保存は変更しません。</p>', '最初から始める', begin, true, 'キャンセル', undefined, () => showStartScreen('new'));
  } else begin();
}
function showStartScreen(initialFocus?: 'new' | 'continue') {
  releaseStart(); releaseStory(); releaseModalBackground();
  screen = 'start'; dialogOpen = true;
  audio.beginScene('bgm-title');
  restoreModalBackground = makeModalBackgroundInert(app.querySelector<HTMLElement>('main.game-shell')!);
  render();
  disposeStart = mountStartScreen($('overlay'), {
    hasCheckpoint: startHasCheckpoint,
    battleLabel: `${state.battleId} ${getBattleConfig(state.battleId).title}`,
    warning: startWarning ?? (saveWritable ? undefined : saveStatus),
    qaNotice: startQaNotice,
    initialFocus,
    onNewGame: beginNewGame,
    onContinue: () => {
      if (!startHasCheckpoint) return;
      closeDialog(); screen = 'intro';
      intro(); guardDialogEntry($('overlay').querySelector<HTMLElement>('.story-shield')!);
    },
  });
}
function defeatSummary() {
  const config = getBattleConfig(state.battleId);
  const escort = state.battleId === 'B03' ? '荷車も守って進みましょう。' : state.battleId === 'B06' ? 'トマが倒れても、やり直しになります。' : state.battleId === 'B09' ? '代表と証人の一行も守って進みましょう。' : '';
  return 'リセが倒れると、やり直しになります。' + escort + '第' + config.roundLimit + 'ラウンドが終わるまでに目標を達成しましょう。';
}
function briefing() {
  const config = getBattleConfig(state.battleId);
  modal(config.title, '<p class="eyebrow">' + (state.battleId === 'B10' || state.battleId === 'B11' || state.battleId === 'B12' ? '第四章　' : state.battleId === 'B07' || state.battleId === 'B08' || state.battleId === 'B09' ? '第三章　' : state.battleId === 'B04' || state.battleId === 'B05' || state.battleId === 'B06' ? '第二章　' : '第一章　') + config.subtitle + '</p>' + '<section class="briefing"><h3>今回の目標</h3><p><b>' + battleObjectiveCopy(state.battleId).summary + '</b></p><details><summary>操作のヒント</summary><p style="white-space:pre-line">' + briefingRulesText(state.battleId, config, { finalGuide, repairGuide, portGuide, delegationGuide, sluiceGuide, chainGuide, archiveExitLabel }) + '</p></details></section><section><h3>気をつけること</h3><p>' + defeatSummary() + '</p></section><p>クリア済み: ' + (campaign.completed.join('・') || 'なし') + ' ／ 証拠: ' + (campaign.evidence.length + '件') + '</p><p>戦闘の開始時と、クリアしたときに進み具合を保存します。</p>', campaign.completed.length ? `続き: ${config.id}を初期配置から` : `${config.id} 調査隊を指揮する`, restart, false);
  fieldDialog();
  $('overlay').querySelector('.dialog-actions')!.append(button('導入を読み返す', intro, false, 'quiet'));
  $('overlay').querySelector('.dialog-actions')!.append(button('出撃準備', preparation, false, 'quiet'));
  $('overlay').querySelector('.dialog-actions')!.append(button('戦闘選択・進行管理', campaignMenu, false, 'quiet'));
}
function preparation() {
  if (screen === 'battle' || interactionBusy() || !campaign.growth || !campaign.jobs) return;
  modal('出撃準備', '<div id="preparation-fields"></div>', '作戦説明へ戻る', briefing, false);
  $('overlay').querySelector('.dialog')!.classList.add('preparation-dialog');
  mountPreparation($('preparation-fields'), state.battleId, {
    growth: campaign.growth!, jobs: campaign.jobs!, parties: campaign.parties ?? {}, completed: campaign.completed, equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign),
  }, next => {
    campaign = editPreparation(campaign, { parties: next.parties, equipment: next.equipment });
    persist();
    return { notice: saveWritable && storage ? saveStatus : '今回のプレイ中だけ準備を保持します。保存は利用できません。', data: { growth: campaign.growth!, jobs: campaign.jobs!, parties: campaign.parties ?? {}, completed: campaign.completed, equipment: campaign.equipment, confirmedEquipmentEvents: getConfirmedEquipmentEvents(campaign) } };
  });
}
function campaignMenu() {
  if (interactionBusy()) return;
  if (screen !== 'battle') audio.beginScene('bgm-briefing');
  modal('戦闘選択・進行管理', '<p>再開は戦闘の初期配置からです。戦闘途中のHP・手番は保存されません。</p><p>解除済み: ' + campaign.unlocked.join('・') + ' ／ クリア済み: ' + (campaign.completed.join('・') || 'なし') + '</p><div id="battle-choices" class="campaign-choices"></div>', screen === 'battle' ? '戦闘に戻る' : '作戦説明へ戻る', () => { if (screen !== 'battle') briefing(); }, false);
  const choices = $('battle-choices');
  choices.append(button('出撃準備', preparation, screen === 'battle', 'quiet'));
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
$('opening-guide').onclick = () => { if (!dialogOpen && !interactionBusy()) { const returnKey = currentFocusKey(); showOpeningContext(() => { render(returnKey); }, true); } };
$('campaign-menu').onclick = () => { if (!dialogOpen && !interactionBusy()) campaignMenu(); };
$('shorten-presentation').onclick = () => battleFlow.finishNow();
$('restart').onclick = () => { if (dialogOpen) return; modal('作戦をやり直す', '<p>現在の戦闘を破棄し、同じ初期配置から再開します。</p>', '再開する', restart); };
function onGameKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') { if (dialogOpen && screen === 'battle') { closeDialog(); } else if (interactive()) { editPassability = false; mode = 'inspect'; message='コマンドを選択してください。'; render(); } return; }
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
