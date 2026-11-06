import { createInspectionFace } from './inspectionRoster';
import type { Unit } from '../domain/types';

/** Authored blocks, never inferred by splitting punctuation or guessing a speaker. */
export interface StoryPage { text: string; speaker?: { name: string; unitId?: string }; sourceText?: string }
export const B01_INTRO: readonly StoryPage[] = [
  { text: '「杭は流されていない。\n……地図のほうが、書き換えられている。」', speaker: { name: 'リセ', unitId: 'ally-lise' } },
  { text: '測量官リセは、警備隊が接収する前に水位痕と住民名簿を確保しようと決めた。渡し守ネイアが水路を指し、ガランは退路に立つ。' },
];
export const B01_GUIDE = '2つの水位記録を取得し、リセを脱出地点まで移動させる。記録のあるマスへ移動し、確認画面で「確定」を選ぶと取得できます。';

/** One deliberate input per block, including the final transition. */
export class StoryCursor {
  index = 0;
  finished = false;
  private lastInput = -Infinity;
  constructor(readonly length: number) { if (length < 1) throw new Error('Story requires a block'); }
  input(direction: 'next' | 'back', now: number, repeat = false): 'ignored' | 'page' | 'complete' {
    if (this.finished || repeat || now - this.lastInput < 220) return 'ignored';
    this.lastInput = now;
    if (direction === 'back') { this.index = Math.max(0, this.index - 1); return 'page'; }
    if (this.index < this.length - 1) { this.index++; return 'page'; }
    this.finished = true; return 'complete';
  }
}

export function mountStoryPanel(host: HTMLElement, options: {
  title: string; pages: readonly StoryPage[]; completeLabel: string;
  findSpeaker: (id: string) => Pick<Unit, 'id' | 'weapon'> | undefined; complete: () => void; skipLabel?: string; skip?: () => void;
  scenery?: { background: string; chapterTitle?: string };
}): () => void {
  const pages = options.scenery?.chapterTitle ? [{ text: options.scenery.chapterTitle }, ...options.pages] : options.pages;
  const doc = host.ownerDocument, cursor = new StoryCursor(pages.length);
  const shield = doc.createElement('div'); shield.className = 'story-shield';
  if (options.scenery) {
    shield.dataset.scenic = 'true';
    const backdrop = doc.createElement('img'); backdrop.className = 'story-backdrop';
    backdrop.src = options.scenery.background; backdrop.alt = ''; backdrop.draggable = false;
    backdrop.onerror = () => { backdrop.hidden = true; };
    shield.append(backdrop);
  }
  const panel = doc.createElement('section'); panel.className = 'story-panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'story-heading');
  const heading = doc.createElement('h2'); heading.id = 'story-heading'; heading.textContent = options.title;
  const content = doc.createElement('div'); content.className = 'story-content';
  const portrait = doc.createElement('div'); portrait.className = 'story-portrait';
  const words = doc.createElement('div'); words.className = 'story-words';
  const name = doc.createElement('strong'); name.className = 'story-speaker';
  const text = doc.createElement('p'); text.className = 'story-text'; text.tabIndex = 0;
  const live = doc.createElement('div'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); live.append(name, text);
  const count = doc.createElement('p'); count.className = 'story-count';
  words.append(live, count); content.append(portrait, words);
  const actions = doc.createElement('div'); actions.className = 'story-actions';
  const back = doc.createElement('button'); back.type = 'button'; back.textContent = '戻る';
  const next = doc.createElement('button'); next.type = 'button';
  actions.append(back, next); panel.append(heading, content, actions); shield.append(panel); host.replaceChildren(shield);
  let disposed = false, settled = false;
  const complete = (skipped = false) => { if (disposed || settled || !shield.isConnected) return; settled = true; (skipped && options.skip ? options.skip : options.complete)(); };
  const skip = options.skipLabel ? doc.createElement('button') : null;
  if (skip) { skip.type = 'button'; skip.className = 'story-skip'; skip.textContent = options.skipLabel!; skip.onclick = event => { event.stopPropagation(); if (event.detail < 2) complete(true); }; actions.append(skip); }
  const paint = () => {
    const page = pages[cursor.index];
    const titleCard = !!options.scenery?.chapterTitle && cursor.index === 0;
    shield.dataset.page = titleCard ? 'title' : page.speaker ? 'dialogue' : 'narration';
    name.textContent = page.speaker?.name ?? '語り'; text.textContent = page.text;
    name.hidden = titleCard || (!!options.scenery && !page.speaker);
    portrait.replaceChildren();
    const unit = page.speaker?.unitId ? options.findSpeaker(page.speaker.unitId) : undefined;
    if (unit) portrait.append(createInspectionFace(unit));
    portrait.hidden = !unit;
    back.disabled = cursor.index === 0;
    if (back.disabled && doc.activeElement === back) next.focus();
    next.textContent = cursor.index === pages.length - 1 ? options.completeLabel : titleCard ? '物語を読む' : '次へ';
    count.textContent = titleCard ? 'クリック・タップ / Enter・Spaceで物語へ' : `${cursor.index + 1 - (options.scenery?.chapterTitle ? 1 : 0)} / ${options.pages.length}　クリック・タップ / Enter・Spaceで次へ`;
    text.scrollTop = 0;
  };
  const act = (direction: 'next' | 'back', repeat = false) => {
    if (disposed || !shield.isConnected) return;
    const result = cursor.input(direction, performance.now(), repeat);
    if (result === 'complete') complete();
    else if (result === 'page') paint();
  };
  const clickNext = (event: MouseEvent) => { event.stopPropagation(); if (event.detail < 2) act('next'); };
  next.onclick = clickNext;
  back.onclick = event => { event.stopPropagation(); if (event.detail < 2) act('back'); };
  // Reading the last block never silently enters battle; use the labelled final button.
  text.onclick = event => { event.stopPropagation(); if (cursor.index < pages.length - 1 && event.detail < 2 && !doc.getSelection()?.toString()) act('next'); };
  shield.onclick = event => { if (options.scenery && (event.target === shield || (event.target as HTMLElement).className === 'story-backdrop') && cursor.index < pages.length - 1 && event.detail < 2) act('next'); };
  const keys = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') return;
    if (['Enter', ' ', 'ArrowRight', 'ArrowLeft', 'Escape'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.target === skip && ['Enter',' '].includes(event.key)) { if (!event.repeat) complete(true); return; }
      if (event.key === 'Escape' || event.key === 'ArrowLeft' || (['Enter', ' '].includes(event.key) && event.target === back)) act('back', event.repeat);
      else if (cursor.index < pages.length - 1
        || (event.target === next && ['Enter', ' '].includes(event.key))) act('next', event.repeat);
    }
  };
  shield.addEventListener('keydown', keys);
  paint(); next.focus();
  return () => { disposed = true; shield.removeEventListener('keydown', keys); shield.onclick = null; next.onclick = null; back.onclick = null; text.onclick = null; if (skip) skip.onclick = null; };
}
