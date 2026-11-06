import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPrologue, PROLOGUE_PARAGRAPHS, shouldShowPrologue } from '../src/view/prologue';

class NodePort {
  classList = { add: (name: string) => { this.className += ' ' + name; } };
  children: NodePort[] = []; parentElement: NodePort | null = null; attrs = new Map<string, string>();
  className = ''; id = ''; textContent = ''; hidden = false; disabled = false; type = ''; tabIndex = 0;
  isContentEditable = false; dataset: Record<string, string> = {}; scrollTop = 0; scrollHeight = 800; clientHeight = 240;
  onclick: ((event: MouseEvent) => void) | null = null;
  listeners = new Map<string, Set<(event: never) => void>>();
  constructor(readonly ownerDocument: DocumentPort, readonly tagName = 'DIV') {}
  get isConnected(): boolean { return this === this.ownerDocument.root || !!this.parentElement?.isConnected; }
  append(...nodes: NodePort[]) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes: NodePort[]) { this.children.forEach(n => n.parentElement = null); this.children = []; this.append(...nodes); }
  querySelector<T>(selector: string): T | null { return this.all().find(n => n.className.split(' ').includes(selector.slice(1))) as T ?? null; }
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
  getSelection() { return null; }
  createElement(tag: string) { return new NodePort(this, tag.toUpperCase()); }
  step(time: number) { const frames = [...this.frames.values()]; this.frames.clear(); frames.forEach(fn => fn(time)); }
}
let now = 1000;
function setup() {
  now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now);
  const doc = new DocumentPort(); vi.stubGlobal('document', doc);
  const background = doc.createElement('main'), host = doc.createElement('aside'), original = doc.createElement('button');
  background.append(original); doc.root.append(background, host); original.focus();
  const complete = vi.fn();
  const dispose = mountPrologue(host as unknown as HTMLElement, { background: background as unknown as HTMLElement, onComplete: complete });
  const control = (label: string) => host.all().find(n => n.tagName === 'BUTTON' && n.textContent === label)!;
  const click = (node: NodePort, detail = 1) => { now += 300; node.onclick?.({ detail, stopPropagation: vi.fn(), target: node } as unknown as MouseEvent); };
  const next = () => click(host.all().filter(n => n.tagName === 'BUTTON')[1]);
  const page = () => host.all().find(n => n.className === 'story-text')!.textContent;
  return { doc, host, background, original, complete, dispose, control, click, next, page };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

describe('cinematic prologue lifecycle', () => {
  it('shows title, then central narration, then explicitly authored portrait dialogue', () => {
    const s = setup();
    expect(s.background.hasAttribute('inert')).toBe(true);
    expect(s.page()).toBe('序章：水が残した記録');
    s.next(); expect(s.page()).toBe(PROLOGUE_PARAGRAPHS[0]);
    expect(s.host.all().find(n => n.className.includes('story-shield'))!.dataset.page).toBe('narration');
    s.next(); s.next(); s.next(); s.next();
    expect(s.host.all().find(n => n.className.includes('story-shield'))!.dataset.page).toBe('dialogue');
    expect(s.host.all().find(n => n.className === 'story-speaker')!.textContent).toBe('リセ');
    expect(s.host.all().some(n => n.dataset.faceAsset === 'lise')).toBe(true);
    expect(s.complete).not.toHaveBeenCalled(); s.dispose();
  });
  it('requires deliberate input, completes once and restores background and focus', () => {
    const s = setup();
    s.doc.step(60000); expect(s.page()).toBe('序章：水が残した記録');
    for (let n = 0; n < PROLOGUE_PARAGRAPHS.length; n++) s.next();
    const final = s.control('読み終えて次へ'), stale = final.onclick!;
    s.click(final, 2); expect(s.complete).not.toHaveBeenCalled(); s.click(final);
    expect(s.complete).toHaveBeenCalledExactlyOnceWith('continue');
    stale({ detail: 1, stopPropagation: vi.fn() } as unknown as MouseEvent);
    expect(s.complete).toHaveBeenCalledOnce(); expect(s.host.children).toHaveLength(0);
    expect(s.background.hasAttribute('inert')).toBe(false); expect(s.doc.activeElement).toBe(s.original);
  });
  it('skips without a timer, and disposed callbacks cannot advance', () => {
    const s = setup(), skip = s.control('導入をスキップ'), stale = skip.onclick!;
    s.click(skip); expect(s.complete).toHaveBeenCalledExactlyOnceWith('skip');
    stale({ detail: 1, stopPropagation: vi.fn() } as unknown as MouseEvent); expect(s.complete).toHaveBeenCalledOnce();
    const t = setup(), next = t.control('物語を読む'), queued = next.onclick!; t.dispose();
    queued({ detail: 1, stopPropagation: vi.fn() } as unknown as MouseEvent); expect(t.complete).not.toHaveBeenCalled();
  });
});
