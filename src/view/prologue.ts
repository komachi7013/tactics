import type { BattleId } from '../domain/types';
import { makeModalBackgroundInert, trapModalTab } from './modalFocus';
import { mountStoryPanel } from './storyPanel';
import { readAuthoredStory, storySpeakerFace } from './storyScript';

/** Opening context from game-plan §§5–7; later revelations are intentionally withheld. */
export const PROLOGUE_PARAGRAPHS = [
  '川の流れを分かち合う、七つの水門都市。セヴラ流域盟約のもと、水議会が水の配分を決めてきた。けれど、下流の村や流民には、その議場で暮らしを訴える代表がいなかった。',
  '雨期を前に、トルネ渡し場の取水杭が抜かれようとしていた。杭に残る水位痕は、水がどこまで来たかを教えてくれる。住民名簿には、その岸で暮らしてきた人々の名がある。村人たちは、自分たちの暮らしの証まで消されるのではないかと声を上げた。',
  '測量官リセは、現場の高さが地図と合わないことに気づく。渡し守ネイアは、前から異常を知らせていたと言う。だが、中央の警備兵は記録を接収しようとしていた。確かめるなら、今しかない。',
  'リセ「地図の高さと合わない……。もう一度、ここを測らせてください。」',
  'ネイア「私たちも何度も確かめて、知らせたよ。今度は、こちらの話も聞いてくれる？」',
  'ガラン「調べるなら、記録を持ち帰るところまでだ。退路は私が守ろう。」',
  'リセ「水位の記録を二つ。それと、水が来た時刻を教えてください。あなたの話も、一緒に残したいんです。」',
  'ネイア「なら、水路は私が案内する。地図だけじゃ分からない岸を見せるよ。」',
  'ガラン「記録も、ここで話した人も、無事に帰す。離れすぎるなよ。」',
  '水路を知るネイアと、退路を守るガラン。二人の力を借り、リセは杭に残る記録を持ち帰ろうとしていた。',
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

/** Shared scene reader: title, central narration and portrait dialogue, advanced by input. */
export function mountPrologue(host: HTMLElement, options: PrologueOptions): () => void {
  if (options.background === host || options.background.contains(host)) {
    throw new Error('プロローグの表示先は背景の外に置いてください。');
  }
  const doc = host.ownerDocument;
  const returnFocus = options.returnFocus === undefined ? doc.activeElement as HTMLElement | null : options.returnFocus;
  const restoreBackground = makeModalBackgroundInert(options.background);
  const authored = readAuthoredStory(PROLOGUE_PARAGRAPHS.map((text, index) => index >= 3 && index <= 8
    ? `<blockquote>${text}</blockquote>` : `<p>${text}</p>`).join(''));
  const pages = [...authored.filter(page => !page.speaker), ...authored.filter(page => page.speaker)];
  let settled = false, disposed = false;
  const finish = (action: PrologueCompletion) => {
    if (disposed || settled || !host.isConnected) return;
    settled = true; dispose(); options.onComplete(action);
  };
  const release = mountStoryPanel(host, {
    title: '序章：水が残した記録', pages, findSpeaker: storySpeakerFace,
    scenery: { background: '/assets/story/prologue.jpg', chapterTitle: '序章：水が残した記録' },
    completeLabel: options.continueLabel?.trim() || '読み終えて次へ',
    skipLabel: options.skipLabel?.trim() || '導入をスキップ', complete: () => finish('continue'), skip: () => finish('skip'),
  });
  const root = host.querySelector<HTMLElement>('.story-shield')!;
  root.classList.add('prologue-screen');
  const keys = (event: KeyboardEvent) => { if (trapModalTab(event, root)) event.stopPropagation(); };
  root.addEventListener('keydown', keys);
  const dispose = () => {
    if (disposed) return;
    disposed = true; release(); root.removeEventListener('keydown', keys); root.remove(); restoreBackground();
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus();
  };
  return dispose;
}
