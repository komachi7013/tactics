import { makeModalBackgroundInert, trapModalTab } from './modalFocus';

export interface UtilityMenuOptions {
  onOpen?: () => void;
  onClose?: () => void;
}

export interface UtilityMenuController {
  open(): void;
  close(): void;
  dispose(): void;
}

let nextMenuId = 0;
const navigationSelector = '#campaign-menu, #restart, #opening-guide, #shorten-presentation, #battle-dialogue-log';

/** Portal only the existing contents: no game commands, state or save ownership. */
export function mountUtilityMenu(
  trigger: HTMLElement, content: HTMLElement, background: HTMLElement, options: UtilityMenuOptions = {},
): UtilityMenuController {
  const doc = trigger.ownerDocument;
  if (content.ownerDocument !== doc || background.ownerDocument !== doc || background === doc.body) {
    throw new Error('Utility menu requires one document and a background below body');
  }
  const originalParent = content.parentNode;
  if (!originalParent) throw new Error('Utility menu contents must have an original position');
  const marker = doc.createComment('utility menu original position'); content.before(marker);
  const detailsCandidate = trigger.closest('details');
  const details = detailsCandidate?.contains(content) ? detailsCandidate : null;
  const originalDetailsOpen = details?.getAttribute('open') ?? null;
  details?.removeAttribute('open');
  const previousTrigger = new Map(['aria-haspopup', 'aria-expanded', 'aria-controls']
    .map(attribute => [attribute, trigger.getAttribute(attribute)]));
  const shield = doc.createElement('div'); shield.className = 'utility-menu-shield'; shield.hidden = true;
  const panel = doc.createElement('section'); panel.className = 'utility-menu'; panel.tabIndex = -1;
  panel.id = `utility-menu-${++nextMenuId}`;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', `${panel.id}-heading`);
  const header = doc.createElement('header'); header.className = 'utility-menu-heading';
  const title = doc.createElement('h2'); title.id = `${panel.id}-heading`;
  title.textContent = trigger.textContent?.trim() || '操作・設定';
  const closeButton = doc.createElement('button'); closeButton.type = 'button';
  closeButton.className = 'utility-menu-close'; closeButton.textContent = '閉じる';
  closeButton.setAttribute('aria-label', '操作・設定を閉じる');
  const scroll = doc.createElement('div'); scroll.className = 'utility-menu-scroll';
  header.append(title, closeButton); panel.append(header, scroll); shield.append(panel);
  // The shield is a sibling, never a descendant of the node made inert.
  (background.parentElement ?? doc.body).append(shield);
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', panel.id);
  trigger.setAttribute('aria-expanded', 'false');
  let opened = false, disposed = false, closing = false, restoreBackground: (() => void) | undefined;
  let previousOverflow = '';

  const close = () => {
    if (!opened || closing) return;
    closing = true; opened = false; shield.hidden = true;
    if (marker.parentNode) marker.before(content); else originalParent.appendChild(content);
    restoreBackground?.(); restoreBackground = undefined;
    doc.body.style.overflow = previousOverflow;
    trigger.setAttribute('aria-expanded', 'false'); details?.removeAttribute('open');
    if (trigger.isConnected) trigger.focus();
    try { options.onClose?.(); } finally { closing = false; }
  };
  const open = () => {
    if (disposed || opened || closing || !trigger.isConnected || !marker.isConnected
      || trigger.matches(':disabled') || trigger.getAttribute('aria-disabled') === 'true') return;
    opened = true; scroll.append(content); shield.hidden = false;
    previousOverflow = doc.body.style.overflow; doc.body.style.overflow = 'hidden';
    restoreBackground = makeModalBackgroundInert(background);
    trigger.setAttribute('aria-expanded', 'true');
    try { options.onOpen?.(); } catch (error) { close(); throw error; }
    if (opened) closeButton.focus();
  };
  const triggerClick = (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (event.detail > 1) return;
    if (opened) close(); else open();
  };
  const outsideClick = (event: MouseEvent) => { if (event.target === shield) close(); };
  const closeClick = () => close();
  const keys = (event: KeyboardEvent) => {
    if (!opened) return;
    // Keep game shortcuts out of this modal while leaving native control keys intact.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    trapModalTab(event, panel);
  };
  const focus = (event: FocusEvent) => {
    if (opened && !panel.contains(event.target as Node | null)) closeButton.focus();
  };
  const beforeNavigate = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const action = target?.closest?.(navigationSelector);
    if (opened && action && panel.contains(action) && !action.matches(':disabled')) {
      // Preserve the event path/default action. Restore dialogOpen in onClose
      // before the original campaign/restart/guide onclick observes it.
      close();
    }
  };
  trigger.addEventListener('click', triggerClick);
  closeButton.addEventListener('click', closeClick);
  shield.addEventListener('click', beforeNavigate, true);
  shield.addEventListener('click', outsideClick);
  shield.addEventListener('keydown', keys);
  doc.addEventListener('focusin', focus, true);
  const dispose = () => {
    if (disposed) return;
    disposed = true; close();
    trigger.removeEventListener('click', triggerClick);
    closeButton.removeEventListener('click', closeClick);
    shield.removeEventListener('click', beforeNavigate, true);
    shield.removeEventListener('click', outsideClick);
    shield.removeEventListener('keydown', keys);
    doc.removeEventListener('focusin', focus, true);
    shield.remove(); marker.remove();
    for (const [attribute, previous] of previousTrigger) {
      if (previous === null) trigger.removeAttribute(attribute); else trigger.setAttribute(attribute, previous);
    }
    if (details && originalDetailsOpen !== null) details.setAttribute('open', originalDetailsOpen);
  };
  return { open, close, dispose };
}
