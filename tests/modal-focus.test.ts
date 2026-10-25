import { describe, expect, it, vi } from 'vitest';
import { makeModalBackgroundInert, modalFocusCandidates, trapModalTab } from '../src/view/modalFocus';

/** Minimal DOM port; real selector/layout behavior is covered by browser QA. */
class Node {
  tagName = 'BUTTON'; tabIndex = 0; isContentEditable = false; hidden = false; disabled = false; inputHidden = false;
  parentElement: Node | null = null; children: Node[] = []; attributes = new Map<string, string>();
  style = { display: 'block', visibility: 'visible' }; rects = 1;
  ownerDocument: { activeElement: Node | null; defaultView: { getComputedStyle: (node: Node) => Node['style'] } };
  constructor(readonly name: string, doc?: Node['ownerDocument']) {
    this.ownerDocument = doc ?? { activeElement: null, defaultView: { getComputedStyle: node => node.style } };
  }
  add(node: Node) { node.parentElement = this; node.ownerDocument = this.ownerDocument; this.children.push(node); return node; }
  querySelectorAll(): Node[] { return this.children.flatMap(child => [child, ...child.querySelectorAll()]); }
  matches() { return this.disabled || this.inputHidden; }
  getClientRects() { return Array(this.rects); }
  hasAttribute(name: string) { return this.attributes.has(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  contains(node: Node): boolean { return this === node || this.children.some(child => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
  html() { return this as unknown as HTMLElement; }
}
function setup() { const dialog = new Node('dialog'); const first = dialog.add(new Node('first')), middle = dialog.add(new Node('middle')), last = dialog.add(new Node('last')); return { dialog, first, middle, last }; }
const event = (overrides: Partial<KeyboardEvent> = {}) => ({ key: 'Tab', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn(), ...overrides });
const names = (dialog: Node) => modalFocusCandidates(dialog.html()).map(node => (node as unknown as Node).name);

describe('modal focus traversal', () => {
  it('owns every intermediate Tab, wraps both ends, and reverses from the middle', () => {
    const { dialog, first, middle, last } = setup(); first.focus();
    const forward = event(); expect(trapModalTab(forward, dialog.html())).toBe(true);
    expect(forward.preventDefault).toHaveBeenCalledOnce(); expect(dialog.ownerDocument.activeElement).toBe(middle);
    trapModalTab(event(), dialog.html()); expect(dialog.ownerDocument.activeElement).toBe(last);
    trapModalTab(event(), dialog.html()); expect(dialog.ownerDocument.activeElement).toBe(first);
    trapModalTab(event({ shiftKey: true }), dialog.html()); expect(dialog.ownerDocument.activeElement).toBe(last);
    trapModalTab(event({ shiftKey: true }), dialog.html()); expect(dialog.ownerDocument.activeElement).toBe(middle);
  });
  it('recovers missing or background focus to first/last including Option+Tab', () => {
    const { dialog, first, last } = setup();
    trapModalTab(event({ altKey: true }), dialog.html()); expect(dialog.ownerDocument.activeElement).toBe(first);
    dialog.ownerDocument.activeElement = new Node('background');
    trapModalTab(event({ altKey: true, shiftKey: true }), dialog.html()); expect(dialog.ownerDocument.activeElement).toBe(last);
  });
  it('leaves browser Ctrl/Meta+Tab and non-Tab keys untouched', () => {
    const { dialog, middle } = setup(); middle.focus();
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { key: 'Enter' }, { key: 'Escape' }]) {
      const key = event(modifiers); expect(trapModalTab(key, dialog.html())).toBe(false);
      expect(key.preventDefault).not.toHaveBeenCalled(); expect(dialog.ownerDocument.activeElement).toBe(middle);
    }
  });
  it('focuses the dialog itself when no sequential candidate is available', () => {
    const dialog = new Node('empty'); trapModalTab(event(), dialog.html());
    expect(dialog.tabIndex).toBe(-1); expect(dialog.ownerDocument.activeElement).toBe(dialog);
  });
  it('sorts positive tabindex before DOM order and excludes disabled, negative and invisible controls', () => {
    const { dialog, first, middle, last } = setup(); first.tabIndex = 2; middle.tabIndex = 1;
    const equal = dialog.add(new Node('equal')); equal.tabIndex = 1;
    for (const [name, change] of [
      ['disabled-fieldset-child', (n: Node) => { n.disabled = true; }],
      ['negative', (n: Node) => { n.tabIndex = -1; }],
      ['hidden-input', (n: Node) => { n.inputHidden = true; }],
      ['no-rect', (n: Node) => { n.rects = 0; }],
    ] as const) { change(dialog.add(new Node(name))); }
    expect(names(dialog)).toEqual(['middle', 'equal', 'first', last.name]);
  });
  it('includes natural contenteditable at normal order while honoring explicit negative tabindex', () => {
    const { dialog } = setup(), editable = dialog.add(new Node('editable')); editable.isContentEditable = true; editable.tabIndex = -1;
    expect(names(dialog)).toEqual(['first', 'middle', 'last', 'editable']);
    editable.setAttribute('tabindex', '-1'); expect(names(dialog)).toEqual(['first', 'middle', 'last']);
  });
  it('excludes hidden, inert and visibility-hidden ancestors', () => {
    const dialog = new Node('dialog');
    for (const [name, change] of [
      ['hidden', (n: Node) => { n.hidden = true; }],
      ['inert', (n: Node) => { n.setAttribute('inert', ''); }],
      ['visibility', (n: Node) => { n.style.visibility = 'hidden'; }],
      ['display', (n: Node) => { n.style.display = 'none'; }],
    ] as const) { const parent = dialog.add(new Node(name)); change(parent); parent.add(new Node(name + '-child')); }
    expect(names(dialog)).toEqual([]);
  });
  it('keeps the first closed-details summary but excludes its hidden content and nested closed content', () => {
    const dialog = new Node('dialog'), details = dialog.add(new Node('details')); details.tagName = 'DETAILS'; details.tabIndex = -1;
    const summary = details.add(new Node('summary')); summary.tagName = 'SUMMARY'; details.add(new Node('inside'));
    expect(names(dialog)).toEqual(['summary']);
    details.setAttribute('open', ''); expect(names(dialog)).toEqual(['summary', 'inside']);
  });
});
describe('modal background ownership', () => {
  it('restores an originally interactive background once', () => {
    const background = new Node('background'), restore = makeModalBackgroundInert(background.html());
    expect(background.hasAttribute('inert')).toBe(true); restore(); expect(background.hasAttribute('inert')).toBe(false);
    background.setAttribute('inert', 'later-owner'); restore(); expect(background.getAttribute('inert')).toBe('later-owner');
  });
  it('preserves existing inert values over replacement lifetimes', () => {
    const background = new Node('background'); background.setAttribute('inert', 'original');
    const first = makeModalBackgroundInert(background.html()); first();
    const replacement = makeModalBackgroundInert(background.html()); replacement();
    expect(background.getAttribute('inert')).toBe('original');
  });
});
