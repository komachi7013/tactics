import type { BattleId } from '../domain/types';
import { makeModalBackgroundInert, trapModalTab } from './modalFocus';

/** Opening context from game-plan §§5–7; later revelations are intentionally withheld. */
export const PROLOGUE_PARAGRAPHS = [
  '七つの水門都市が結ぶ、セヴラ流域盟約。都市の水議会が取水と堤防の負担を決める一方、下流の村や流民には、自分たちの暮らしを訴え、議決票を持つ代表が水議会にいない。',
  '雨期を前に、トルネ渡し場の取水杭が撤去されようとしていた。水位痕は、実際に水が達した高さを伝える。住民名簿は、そこで暮らしてきた人々を記録する。住民たちは、杭と記録が失われれば、自分たちの権利も消されると抗議している。',
  '再検測に来た測量官リセは、現場の水位と公図の食い違いに出会う。渡し守ネイアは、以前から異常を申告してきたと訴えた。しかし中央の警備兵は、水位痕と名簿を接収しようとしている。現場から手掛かりがなくなれば、食い違いを確かめることも難しくなる。',
  'リセ「図には、この高さまで水が来るとは書かれていない。現場を測って、何が違うか確かめます。」',
  'ネイア「私たちも確かめて、知らせてきた。今度は、違うと言っている人の話も残して。」',
  'ガラン「接収されてから探すより、今ここで残せるものを守ろう。だが、帰る道も必要だ。」',
  'リセ「水位痕の記録を二件。あなたが見た時刻も聞かせてください。図だけを見て終わる仕事にはしません。」',
  'ネイア「なら水路を案内する。地図にない暮らしがあることを、自分の目で見て。」',
  'ガラン「記録を持ち帰り、それを語れる人も無事に帰す。先へ出る者も、退路を守る者も、一人にしない。」',
  'リセは、接収される前に記録を確かめ、手元に残すことを選ぶ。水路を知るネイアが道を示し、護衛隊長ガランが退路を守る。三人は記録を持ち帰るため、トルネ渡し場へ踏み出す。',
] as const;

/** Existing checkpoints are never rewritten or forced through the opening. */
export function shouldShowPrologue(hasCheckpoint: boolean, battleId: BattleId): boolean {
  return !hasCheckpoint && battleId === 'B01';
}

export type PrologueCompletion = 'continue' | 'skip';
export interface PrologueOptions {
  /** A sibling of host, never an ancestor containing the prologue itself. */
  background: HTMLElement;
  onComplete: (action: PrologueCompletion) => void;
  /** A replay can return to its caller instead of promising entry to B01. */
  continueLabel?: string;
  skipLabel?: string;
  reducedMotion?: boolean;
  returnFocus?: HTMLElement | null;
}

/** Mount in a sibling overlay host; import prologue.css from the application entry. */
export function mountPrologue(host: HTMLElement, options: PrologueOptions): () => void {
  if (options.background === host || options.background.contains(host)) {
    throw new Error('プロローグの表示先は背景の外に置いてください。');
  }
  const doc = host.ownerDocument, view = doc.defaultView;
  const preference = options.reducedMotion === undefined ? view?.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
  let reduced = options.reducedMotion ?? preference?.matches ?? false;
  const returnFocus = options.returnFocus === undefined ? doc.activeElement as HTMLElement | null : options.returnFocus;
  const root = doc.createElement('section'); root.className = 'prologue-screen';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'prologue-title');
  const panel = doc.createElement('div'); panel.className = 'prologue-panel';
  const kicker = doc.createElement('p'); kicker.className = 'prologue-kicker'; kicker.textContent = '序章';
  const title = doc.createElement('h1'); title.id = 'prologue-title'; title.textContent = '水が残した記録';
  const reader = doc.createElement('div'); reader.className = 'prologue-reader'; reader.tabIndex = 0;
  reader.setAttribute('role', 'region'); reader.setAttribute('aria-label', '物語の前提');
  for (const words of PROLOGUE_PARAGRAPHS) { const p = doc.createElement('p'); p.textContent = words; reader.append(p); }
  const firstMission = doc.createElement('p'); firstMission.className = 'prologue-first-mission';
  firstMission.textContent = '最初の作戦：味方が水位記録 A・B の上下左右に隣接し（高さ差1以内）、各1行動で採取。2件を確保したら、リセを生存させて東の脱出地点へ。';
  reader.append(firstMission);
  const note = doc.createElement('p'); note.className = 'prologue-note';
  note.textContent = '読む速さは自由です。スクロールや矢印キーで読むと、文章の自動送りは止まります。';
  const status = doc.createElement('p'); status.className = 'prologue-status'; status.setAttribute('role', 'status');
  const controls = doc.createElement('div'); controls.className = 'prologue-reading-controls';
  const motion = doc.createElement('button'); motion.type = 'button';
  const still = doc.createElement('button'); still.type = 'button'; still.textContent = '静止表示';
  const replay = doc.createElement('button'); replay.type = 'button'; replay.textContent = 'はじめから読む';
  controls.append(motion, still, replay);
  const actions = doc.createElement('div'); actions.className = 'prologue-actions';
  const skip = doc.createElement('button'); skip.type = 'button'; skip.textContent = options.skipLabel?.trim() || '導入をスキップ';
  const next = doc.createElement('button'); next.type = 'button'; next.className = 'prologue-continue'; next.textContent = options.continueLabel?.trim() || '読み終えて作戦説明へ';
  actions.append(skip, next); panel.append(kicker, title, reader, note, status, controls, actions); root.append(panel); host.append(root);
  const restoreBackground = makeModalBackgroundInert(options.background);
  let disposed = false, settled = false, running = !reduced, staticMode = reduced, lastTime: number | null = null, frame: number | undefined;
  const paint = () => {
    root.dataset.readingMode = running ? 'scrolling' : staticMode ? 'static' : 'paused';
    motion.textContent = running ? '一時停止' : staticMode ? '文章を流す' : '再開';
    motion.disabled = reduced;
    motion.setAttribute('aria-pressed', String(running));
    still.setAttribute('aria-pressed', String(staticMode));
    status.textContent = reduced ? '静止表示（端末の省モーション設定に対応）' : running ? '文章をゆっくり送っています。自動では次の画面へ進みません。' : staticMode ? '静止表示。時間制限はありません。' : '一時停止中。時間制限はありません。';
  };
  const cancelFrame = () => { if (frame !== undefined) view?.cancelAnimationFrame(frame); frame = undefined; lastTime = null; };
  const step = (time: number) => {
    frame = undefined;
    if (disposed || !root.isConnected || !running) return;
    if (doc.hidden) { lastTime = null; schedule(); return; }
    const elapsed = lastTime === null ? 0 : Math.min(80, Math.max(0, time - lastTime)); lastTime = time;
    const end = Math.max(0, reader.scrollHeight - reader.clientHeight);
    reader.scrollTop = Math.min(end, reader.scrollTop + elapsed * .007);
    if (reader.scrollTop >= end) { running = false; paint(); return; }
    schedule();
  };
  const schedule = () => { if (!disposed && running && frame === undefined && view?.requestAnimationFrame) frame = view.requestAnimationFrame(step); };
  const pause = () => { if (!running) return; running = false; cancelFrame(); paint(); };
  motion.onclick = () => {
    if (disposed || reduced) return;
    if (running) pause();
    else { staticMode = false; running = true; lastTime = null; paint(); schedule(); }
  };
  still.onclick = () => { if (disposed) return; running = false; staticMode = true; cancelFrame(); paint(); };
  replay.onclick = () => { if (disposed) return; reader.scrollTop = 0; lastTime = null; paint(); schedule(); reader.focus(); };
  reader.addEventListener('wheel', pause, { passive: true }); reader.addEventListener('touchstart', pause, { passive: true });
  const readerKeys = (event: KeyboardEvent) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) pause(); };
  reader.addEventListener('keydown', readerKeys);
  const changed = (event: MediaQueryListEvent) => {
    reduced = event.matches;
    if (reduced) { running = false; staticMode = true; cancelFrame(); }
    paint();
  };
  preference?.addEventListener('change', changed);
  const dispose = () => {
    if (disposed) return;
    disposed = true; cancelFrame(); preference?.removeEventListener('change', changed);
    reader.removeEventListener('wheel', pause); reader.removeEventListener('touchstart', pause); reader.removeEventListener('keydown', readerKeys);
    root.removeEventListener('keydown', keys); motion.onclick = still.onclick = replay.onclick = skip.onclick = next.onclick = null;
    root.remove(); restoreBackground();
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus();
  };
  const complete = (action: PrologueCompletion) => {
    if (disposed || settled || !root.isConnected) return;
    settled = true; dispose(); options.onComplete(action);
  };
  skip.onclick = event => { event.stopPropagation(); if (event.detail < 2) complete('skip'); };
  next.onclick = event => { event.stopPropagation(); if (event.detail < 2) complete('continue'); };
  const keys = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (trapModalTab(event, root)) return;
    if (event.key === 'Escape' && !event.repeat) { event.preventDefault(); complete('skip'); }
  };
  root.addEventListener('keydown', keys); paint(); schedule(); reader.focus();
  return dispose;
}
