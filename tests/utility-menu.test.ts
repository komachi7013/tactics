import { describe, expect, it, vi } from 'vitest';
import { mountUtilityMenu, type UtilityMenuController } from '../src/view/utilityMenu';

/** Lifecycle/event/focus port only; viewport/CSS layout is checked in the browser. */
class PortEvent {
  key = ''; shiftKey = false; ctrlKey = false; metaKey = false; altKey = false; detail = 1; stopped = false;
  preventDefault = vi.fn(); stopPropagation = vi.fn(() => { this.stopped = true; });
  constructor(readonly type: string, readonly target: NodePort) {}
}
type Handler = (event: PortEvent) => void;
class EventPort {
  listeners = new Map<string, { handler: Handler; capture: boolean }[]>();
  addEventListener(type: string, handler: Handler, options: boolean | { capture?: boolean } = false) {
    const capture = typeof options === 'boolean' ? options : !!options.capture;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { handler, capture }]);
  }
  removeEventListener(type: string, handler: Handler, options: boolean | { capture?: boolean } = false) {
    const capture = typeof options === 'boolean' ? options : !!options.capture;
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(entry => entry.handler !== handler || entry.capture !== capture));
  }
  invoke(event: PortEvent, capture: boolean) {
    for (const entry of [...(this.listeners.get(event.type) ?? [])]) {
      if (event.stopped) return;
      if (entry.capture === capture) entry.handler(event);
    }
  }
}
class NodePort extends EventPort {
  children: NodePort[] = []; parentElement: NodePort | null = null;
  attrs = new Map<string, string>(); className = ''; id = ''; textContent = ''; hidden = false; disabled = false;
  tabIndex: number; isContentEditable = false; style = { overflow: '', display: 'block', visibility: 'visible' };
  onclick: Handler | null = null;
  constructor(readonly ownerDocument: DocumentPort, readonly tagName: string, readonly nodeType = 1) {
    super(); this.tabIndex = ['BUTTON', 'SUMMARY', 'INPUT'].includes(tagName) ? 0 : -1;
  }
  get parentNode() { return this.parentElement; }
  get isConnected(): boolean { return this === this.ownerDocument.body || !!this.parentElement?.isConnected; }
  append(...nodes: NodePort[]) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  appendChild(node: NodePort) { this.append(node); return node; }
  insertBefore(node: NodePort, before: NodePort) { node.remove(); node.parentElement = this; this.children.splice(this.children.indexOf(before), 0, node); }
  before(node: NodePort) { this.parentElement?.insertBefore(node, this); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  hasAttribute(name: string) { return this.attrs.has(name); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  contains(node: NodePort | null): boolean { return node !== null && (node === this || this.children.some(child => child.contains(node))); }
  matches(selector: string): boolean {
    if (selector.includes(':disabled')) return this.disabled || (this.tagName === 'INPUT' && this.getAttribute('type') === 'hidden');
    return selector.split(',').some(part => part.trim().startsWith('#') ? this.id === part.trim().slice(1) : this.tagName === part.trim().toUpperCase());
  }
  closest(selector: string): NodePort | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  all(): NodePort[] { return [this, ...this.children.flatMap(child => child.all())]; }
  querySelectorAll(): NodePort[] {
    return this.all().slice(1).filter(node => ['BUTTON', 'INPUT', 'SUMMARY', 'SELECT', 'TEXTAREA', 'A', 'AREA'].includes(node.tagName) || node.hasAttribute('tabindex'));
  }
  getClientRects() { return [1]; }
  focus() {
    this.ownerDocument.activeElement = this;
    this.ownerDocument.invoke(new PortEvent('focusin', this), true);
  }
  html() { return this as unknown as HTMLElement; }
}
class DocumentPort extends EventPort {
  body = new NodePort(this, 'BODY'); activeElement: NodePort | null = null;
  defaultView = { getComputedStyle: (node: NodePort) => node.style };
  createElement(tag: string) { return new NodePort(this, tag.toUpperCase()); }
  createComment() { return new NodePort(this, '#COMMENT', 8); }
}
function dispatch(target: NodePort, type: string, changes: Partial<PortEvent> = {}) {
  const event = Object.assign(new PortEvent(type, target), changes), path: EventPort[] = [];
  for (let node: NodePort | null = target; node; node = node.parentElement) path.push(node);
  path.push(target.ownerDocument);
  // Capture/bubble paths remain fixed even when the callback restores a node.
  for (const node of [...path].reverse()) node.invoke(event, true);
  for (const node of path) {
    if (event.stopped) break;
    if (type === 'click' && node instanceof NodePort) node.onclick?.(event);
    node.invoke(event, false);
  }
  return event;
}
function setup(originallyOpen = false) {
  const doc = new DocumentPort(), background = doc.createElement('main'), details = doc.createElement('details');
  const trigger = doc.createElement('summary'), content = doc.createElement('div'), after = doc.createElement('p');
  trigger.textContent = '操作・設定'; content.className = 'notebook-tools-body';
  doc.body.append(background); background.append(details); details.append(trigger, content, after);
  if (originallyOpen) details.setAttribute('open', '');
  const actions = ['campaign-menu', 'restart', 'opening-guide', 'shorten-presentation', 'audio-enable'].map(id => {
    const button = doc.createElement('button'); button.id = id; content.append(button); return button;
  });
  const nestedDetails = doc.createElement('details'), nestedSummary = doc.createElement('summary');
  nestedDetails.append(nestedSummary); content.append(nestedDetails);
  let dialogOpen = false;
  const onOpen = vi.fn(() => { dialogOpen = true; }), onClose = vi.fn(() => { dialogOpen = false; });
  const menu = mountUtilityMenu(trigger.html(), content.html(), background.html(), { onOpen, onClose });
  const shield = doc.body.children.find(node => node.className === 'utility-menu-shield')!;
  const panel = shield.children[0], close = panel.children[0].children[1], scroll = panel.children[1];
  return { doc, background, details, trigger, content, after, actions, nestedSummary, menu, shield, panel, close, scroll, onOpen, onClose, dialogOpen: () => dialogOpen };
}

describe('utility menu lifecycle and controls (not browser layout)', () => {
  it('starts closed, leaves content in place and mounts a non-inert sibling dialog', () => {
    const s = setup();
    expect(s.content.parentElement).toBe(s.details); expect(s.shield.parentElement).toBe(s.background.parentElement);
    expect(s.shield.hidden).toBe(true); expect(s.background.hasAttribute('inert')).toBe(false);
    expect(s.trigger.getAttribute('aria-haspopup')).toBe('dialog'); expect(s.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(s.panel.getAttribute('role')).toBe('dialog'); expect(s.panel.getAttribute('aria-modal')).toBe('true');
    expect(s.panel.getAttribute('aria-labelledby')).toBe(s.panel.children[0].children[0].id);
  });

  it('moves the same nodes on open and restores their order, focus and exact inert/scroll values on close', () => {
    const s = setup(); s.background.setAttribute('inert', 'prior-owner'); s.doc.body.style.overflow = 'clip';
    s.menu.open(); s.menu.open();
    expect(s.content.parentElement).toBe(s.scroll); expect(s.panel.contains(s.content)).toBe(true);
    expect(s.shield.hidden).toBe(false); expect(s.doc.body.style.overflow).toBe('hidden');
    expect(s.doc.activeElement).toBe(s.close); expect(s.dialogOpen()).toBe(true); expect(s.onOpen).toHaveBeenCalledOnce();
    s.menu.close(); s.menu.close();
    expect(s.details.children.filter(node => node.nodeType === 1)).toEqual([s.trigger, s.content, s.after]);
    expect(s.doc.activeElement).toBe(s.trigger); expect(s.background.getAttribute('inert')).toBe('prior-owner');
    expect(s.doc.body.style.overflow).toBe('clip'); expect(s.dialogOpen()).toBe(false); expect(s.onClose).toHaveBeenCalledOnce();
  });

  it('suppresses native summary toggling and ignores the second click of a double-click', () => {
    const s = setup(); const event = dispatch(s.trigger, 'click');
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(s.details.hasAttribute('open')).toBe(false);
    dispatch(s.trigger, 'click', { detail: 2 }); expect(s.shield.hidden).toBe(false); expect(s.onOpen).toHaveBeenCalledOnce();
  });

  it('traps forward/backward Tab and recovers focus moved outside the modal', () => {
    const s = setup(); s.menu.open(); const last = s.nestedSummary; last.focus();
    expect(dispatch(last, 'keydown', { key: 'Tab' }).preventDefault).toHaveBeenCalledOnce(); expect(s.doc.activeElement).toBe(s.close);
    dispatch(s.close, 'keydown', { key: 'Tab', shiftKey: true }); expect(s.doc.activeElement).toBe(last);
    s.trigger.focus(); expect(s.doc.activeElement).toBe(s.close);
    const shortcut = dispatch(s.close, 'keydown', { key: 'Tab', metaKey: true }); expect(shortcut.preventDefault).not.toHaveBeenCalled();
  });

  it.each(['Escape', 'outside', 'close-button'])('closes by %s without forwarding keys or a game command', method => {
    const s = setup(), gameKey = vi.fn(); s.doc.addEventListener('keydown', gameKey); s.menu.open();
    if (method === 'Escape') {
      const event = dispatch(s.close, 'keydown', { key: 'Escape' }); expect(event.preventDefault).toHaveBeenCalledOnce();
    } else dispatch(method === 'outside' ? s.shield : s.close, 'click');
    expect(s.shield.hidden).toBe(true); expect(s.dialogOpen()).toBe(false); expect(s.doc.activeElement).toBe(s.trigger);
    expect(gameKey).not.toHaveBeenCalled(); expect(s.onClose).toHaveBeenCalledOnce();
  });

  it.each(['campaign-menu', 'restart', 'opening-guide', 'shorten-presentation'])('restores state in capture before the original %s handler', id => {
    const s = setup(), action = s.actions.find(node => node.id === id)!, log: string[] = [];
    action.onclick = () => {
      expect(s.dialogOpen()).toBe(false); expect(s.background.hasAttribute('inert')).toBe(false);
      expect(s.content.parentElement).toBe(s.details); log.push('original-handler');
    };
    s.menu.open(); const child = s.doc.createElement('span'); action.append(child);
    // A child click keeps the original button's bubble handler in the event path.
    const event = dispatch(child, 'click');
    expect(event.preventDefault).not.toHaveBeenCalled(); expect(s.onClose).toHaveBeenCalledOnce();
    expect(log).toEqual(['original-handler']); expect(s.shield.hidden).toBe(true);
  });

  it('keeps audio and nested details usable without closing the menu', () => {
    const s = setup(), audio = s.actions.find(node => node.id === 'audio-enable')!, changed = vi.fn(); audio.onclick = changed;
    s.menu.open(); dispatch(audio, 'click'); dispatch(s.nestedSummary, 'click');
    expect(changed).toHaveBeenCalledOnce(); expect(s.shield.hidden).toBe(false); expect(s.onClose).not.toHaveBeenCalled();
    const disabled = s.actions[0]; disabled.disabled = true; dispatch(disabled, 'click');
    expect(s.shield.hidden).toBe(false); expect(s.onClose).not.toHaveBeenCalled();
  });

  it('disposes an open menu once, restores the original summary state and ignores stale or detached activation', () => {
    const s = setup(true); s.menu.open(); s.menu.dispose(); s.menu.dispose();
    expect(s.onClose).toHaveBeenCalledOnce(); expect(s.content.parentElement).toBe(s.details); expect(s.shield.isConnected).toBe(false);
    expect(s.details.hasAttribute('open')).toBe(true); expect(s.trigger.hasAttribute('aria-expanded')).toBe(false);
    expect(s.background.hasAttribute('inert')).toBe(false); expect(s.doc.activeElement).toBe(s.trigger);
    s.menu.open(); dispatch(s.trigger, 'click'); expect(s.onOpen).toHaveBeenCalledOnce();
    const t = setup(); t.trigger.remove(); t.menu.open(); expect(t.shield.hidden).toBe(true); t.menu.dispose();
  });

  it('rejects a programmatic reopen while close is restoring owner state', () => {
    const s = setup(); s.menu.dispose();
    let menu: UtilityMenuController;
    const onOpen = vi.fn(), onClose = vi.fn(() => menu.open());
    menu = mountUtilityMenu(s.trigger.html(), s.content.html(), s.background.html(), { onOpen, onClose });
    menu.open(); menu.close(); expect(onOpen).toHaveBeenCalledOnce(); expect(onClose).toHaveBeenCalledOnce();
    expect(s.background.hasAttribute('inert')).toBe(false); menu.dispose();
  });
});
