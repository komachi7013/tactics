import { describe, expect, it, vi } from 'vitest';
import { mountPrologue, PROLOGUE_PARAGRAPHS, shouldShowPrologue } from '../src/view/prologue';

class NodePort {
  children: NodePort[] = []; parentElement: NodePort | null = null; attrs = new Map<string, string>();
  className = ''; id = ''; textContent = ''; hidden = false; disabled = false; type = ''; tabIndex = 0;
  isContentEditable = false; dataset: Record<string, string> = {}; scrollTop = 0; scrollHeight = 800; clientHeight = 240;
  onclick: ((event: MouseEvent) => void) | null = null;
  listeners = new Map<string, Set<(event: never) => void>>();
  constructor(readonly ownerDocument: DocumentPort, readonly tagName = 'DIV') {}
  get isConnected(): boolean { return this === this.ownerDocument.root || !!this.parentElement?.isConnected; }
  append(...nodes: NodePort[]) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  remove() { if (!this.parentElement) return; this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = null; }
  setAttribute(key: string, value: string) { this.attrs.set(key, value); }
  getAttribute(key: string) { return this.attrs.get(key) ?? null; }
  hasAttribute(key: string) { return this.attrs.has(key); }
  removeAttribute(key: string) { this.attrs.delete(key); }
  contains(node: NodePort): boolean { return node === this || this.children.some(n => n.contains(node)); }
  closest(selector: string): NodePort | null { return selector === '[inert]' && this.hasAttribute('inert') ? this : this.parentElement?.closest(selector) ?? null; }
  matches(selector: string) { return selector.includes(':disabled') && this.disabled; }
  getClientRects() { return this.isConnected && !this.hidden ? [{}] : []; }
  querySelectorAll() { return this.all().slice(1).filter(n => n.tagName === 'BUTTON' || n.className === 'prologue-reader'); }
  all(): NodePort[] { return [this, ...this.children.flatMap(n => n.all())]; }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(key: string, handler: (event: never) => void) { if (!this.listeners.has(key)) this.listeners.set(key, new Set()); this.listeners.get(key)!.add(handler); }
  removeEventListener(key: string, handler: (event: never) => void) { this.listeners.get(key)?.delete(handler); }
  emit(key: string, event: object = {}) { for (const listener of this.listeners.get(key) ?? []) listener(event as never); }
}
class DocumentPort {
  root = new NodePort(this); activeElement: NodePort | null = null; hidden = false;
  frames = new Map<number, (time: number) => void>(); frameId = 0;
  media = { matches: false, change: undefined as ((event: { matches: boolean }) => void) | undefined,
    addEventListener: (_key: string, fn: (event: { matches: boolean }) => void) => { this.media.change = fn; },
    removeEventListener: () => { this.media.change = undefined; } };
  defaultView = {
    matchMedia: () => this.media, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    requestAnimationFrame: (fn: (time: number) => void) => { this.frames.set(++this.frameId, fn); return this.frameId; },
    cancelAnimationFrame: (id: number) => { this.frames.delete(id); },
  };
  createElement(tag: string) { return new NodePort(this, tag.toUpperCase()); }
  step(time: number) { const frames = [...this.frames.values()]; this.frames.clear(); frames.forEach(fn => fn(time)); }
}
function setup(reduced = false, fixedPreference?: boolean, labels: { continueLabel?: string; skipLabel?: string } = {}) {
  const doc = new DocumentPort(); doc.media.matches = reduced;
  const background = doc.createElement('main'), host = doc.createElement('aside'), original = doc.createElement('button');
  background.append(original); doc.root.append(background, host); original.focus();
  const complete = vi.fn();
  const dispose = mountPrologue(host as unknown as HTMLElement, { background: background as unknown as HTMLElement, onComplete: complete, reducedMotion: fixedPreference, ...labels });
  const all = host.all(), root = all.find(n => n.className === 'prologue-screen')!, reader = all.find(n => n.className === 'prologue-reader')!;
  const control = (label: string) => host.all().find(n => n.tagName === 'BUTTON' && n.textContent === label)!;
  const click = (node: NodePort, detail = 1) => node.onclick?.({ detail, stopPropagation: vi.fn() } as unknown as MouseEvent);
  return { doc, host, background, original, root, reader, complete, dispose, control, click };
}

describe('opening prologue routing and authored context', () => {
  it('automatically opens only before a new B01, without a persisted marker or save mutation', () => {
    expect(shouldShowPrologue(false, 'B01')).toBe(true);
    expect(shouldShowPrologue(true, 'B01')).toBe(false);
    expect(shouldShowPrologue(true, 'B12')).toBe(false);
    expect(shouldShowPrologue(false, 'B02')).toBe(false);
  });
  it('explains records, central confiscation and the three people without revealing later guilt', () => {
    const text = PROLOGUE_PARAGRAPHS.join('');
    for (const word of ['七つの水門都市', '下流', '水位痕', '住民名簿', '接収', '測量官リセ', '渡し守ネイア', 'ガラン', '退路']) expect(text).toContain(word);
    expect(text).not.toMatch(/再認証署名|薄明放流|ヴェスク|裁判の結末/);
  });
});

describe('prologue DOM lifecycle (not a browser layout claim)', () => {
  it('keeps background inert, reading focus inside, accessible names and all completion controls visible', () => {
    const s = setup();
    expect(s.background.hasAttribute('inert')).toBe(true); expect(s.doc.activeElement).toBe(s.reader);
    expect(s.root.getAttribute('role')).toBe('dialog'); expect(s.root.getAttribute('aria-modal')).toBe('true');
    expect(s.root.getAttribute('aria-labelledby')).toBe('prologue-title');
    expect(s.control('読み終えて作戦説明へ').disabled).toBe(false);
    expect(s.control('導入をスキップ').hidden).toBe(false);
    expect(s.host.all().find(n => n.className === 'prologue-first-mission')!.textContent).toContain('水位記録 A・B');
    const preventDefault = vi.fn(), stopPropagation = vi.fn();
    s.root.emit('keydown', { key: 'Tab', shiftKey: false, ctrlKey: false, metaKey: false, preventDefault, stopPropagation });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(stopPropagation).toHaveBeenCalledOnce();
    expect(s.doc.activeElement?.tagName).toBe('BUTTON'); s.dispose();
  });
  it('scrolls slowly, pauses/resumes, offers static reading/replay, and never advances after time or reaching the end', () => {
    const s = setup(); expect(s.root.dataset.readingMode).toBe('scrolling');
    for (let t = 0; t <= 1000; t += 20) s.doc.step(t);
    expect(s.reader.scrollTop).toBeCloseTo(7, 1); expect(s.complete).not.toHaveBeenCalled();
    s.click(s.control('一時停止')); const position = s.reader.scrollTop;
    s.doc.step(2000); expect(s.reader.scrollTop).toBe(position); expect(s.doc.frames.size).toBe(0);
    s.click(s.control('再開')); s.doc.step(3000); s.doc.step(3040); expect(s.reader.scrollTop).toBeGreaterThan(position);
    s.click(s.control('静止表示')); expect(s.root.dataset.readingMode).toBe('static'); expect(s.doc.frames.size).toBe(0);
    s.click(s.control('はじめから読む')); expect(s.reader.scrollTop).toBe(0); expect(s.doc.activeElement).toBe(s.reader);
    s.click(s.control('文章を流す')); s.reader.scrollHeight = s.reader.clientHeight; s.doc.step(4000);
    expect(s.complete).not.toHaveBeenCalled(); expect(s.doc.frames.size).toBe(0); s.dispose();
  });
  it('uses static mode for reduced motion and responds safely to a live preference change', () => {
    const s = setup(true); expect(s.root.dataset.readingMode).toBe('static'); expect(s.doc.frames.size).toBe(0);
    expect(s.control('文章を流す').disabled).toBe(true); s.doc.media.change!({ matches: false });
    s.click(s.control('文章を流す')); expect(s.doc.frames.size).toBe(1);
    s.doc.media.change!({ matches: true }); expect(s.doc.frames.size).toBe(0); expect(s.root.dataset.readingMode).toBe('static');
    s.dispose(); expect(s.doc.media.change).toBeUndefined();
  });
  it('pauses on manual reading and does not jump forward after a hidden tab resumes', () => {
    const s = setup(); s.doc.step(0); s.doc.step(20);
    s.doc.hidden = true; s.doc.step(10000); const before = s.reader.scrollTop;
    s.doc.hidden = false; s.doc.step(20000); expect(s.reader.scrollTop).toBe(before);
    s.doc.step(20020); s.reader.emit('wheel'); expect(s.doc.frames.size).toBe(0); expect(s.root.dataset.readingMode).toBe('paused');
    s.click(s.control('再開')); s.reader.emit('keydown', { key: 'ArrowDown' }); expect(s.doc.frames.size).toBe(0); s.dispose();
  });
  it('settles only one explicit completion and restores background/focus, rejecting stale clicks after disposal', () => {
    const s = setup(), next = s.control('読み終えて作戦説明へ'), stale = next.onclick!;
    s.click(next, 2); expect(s.complete).not.toHaveBeenCalled(); s.click(next);
    expect(s.complete).toHaveBeenCalledExactlyOnceWith('continue'); expect(s.background.hasAttribute('inert')).toBe(false);
    expect(s.doc.activeElement).toBe(s.original); expect(s.host.children).toHaveLength(0); expect(s.doc.frames.size).toBe(0);
    stale({ detail: 1, stopPropagation: vi.fn() } as unknown as MouseEvent); s.dispose(); expect(s.complete).toHaveBeenCalledOnce();
    const t = setup(true); t.click(t.control('導入をスキップ')); expect(t.complete).toHaveBeenCalledExactlyOnceWith('skip');
  });
  it('labels a replay as returning to the caller and retains the same one-shot completion/focus contract', () => {
    const s = setup(true, undefined, { continueLabel: '閉じて元の画面へ戻る', skipLabel: '再読を終了' });
    expect(s.control('読み終えて作戦説明へ')).toBeUndefined();
    s.click(s.control('閉じて元の画面へ戻る'));
    expect(s.complete).toHaveBeenCalledExactlyOnceWith('continue');
    expect(s.doc.activeElement).toBe(s.original); expect(s.background.hasAttribute('inert')).toBe(false);
    const t = setup(true, undefined, { continueLabel: ' ', skipLabel: '' });
    expect(t.control('読み終えて作戦説明へ')).toBeDefined(); expect(t.control('導入をスキップ')).toBeDefined(); t.dispose();
  });
  it('connects the first mission to the actual adjacent one-action collection and living Lise exit conditions', () => {
    const s = setup(true), note = s.host.all().find(n => n.className === 'prologue-first-mission')!.textContent;
    for (const phrase of ['水位記録 A・B', '上下左右に隣接', '高さ差1以内', '各1行動で採取', '2件を確保', 'リセを生存させて東の脱出地点']) expect(note).toContain(phrase);
    expect(note).not.toContain('名簿を採取'); s.dispose();
  });
  it('does not complete through a held Escape, and guards invalid inert nesting without changing the background', () => {
    const s = setup(); s.root.emit('keydown', { key: 'Escape', repeat: true, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(s.complete).not.toHaveBeenCalled();
    s.root.emit('keydown', { key: 'Escape', repeat: false, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(s.complete).toHaveBeenCalledExactlyOnceWith('skip');
    const doc = new DocumentPort();
    expect(() => mountPrologue(doc.root as unknown as HTMLElement, { background: doc.root as unknown as HTMLElement, onComplete: vi.fn() })).toThrow('背景の外');
    expect(doc.root.hasAttribute('inert')).toBe(false);
  });
});
