/** The dialog owns Tab traversal instead of relying on browser-specific control skipping. */
const candidateSelector = 'button, input, select, textarea, a[href], area[href], summary, [tabindex], [contenteditable]:not([contenteditable="false"])';

export function modalFocusCandidates(dialog: HTMLElement): HTMLElement[] {
  const visible = (element: HTMLElement): boolean => {
    if ((element.tabIndex < 0 && (element.hasAttribute('tabindex') || !element.isContentEditable)) || element.matches(':disabled, input[type="hidden"]')) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.hidden || ancestor.hasAttribute('inert')) return false;
      const style = ancestor.ownerDocument.defaultView?.getComputedStyle(ancestor);
      if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
      if (ancestor.tagName === 'DETAILS' && !ancestor.hasAttribute('open')) {
        const summary = [...ancestor.children].find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(element)) return false;
      }
    }
    return element.getClientRects().length > 0;
  };
  return [...dialog.querySelectorAll<HTMLElement>(candidateSelector)].filter(visible).map((element, order) => ({ element, order }))
    .sort((a, b) => {
      const aIndex = Math.max(0, a.element.tabIndex), bIndex = Math.max(0, b.element.tabIndex);
      if (aIndex > 0 && bIndex <= 0) return -1;
      if (bIndex > 0 && aIndex <= 0) return 1;
      return aIndex - bIndex || a.order - b.order;
    }).map(item => item.element);
}

export function trapModalTab(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'preventDefault'>, dialog: HTMLElement): boolean {
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey) return false;
  event.preventDefault();
  const candidates = modalFocusCandidates(dialog);
  if (!candidates.length) { dialog.tabIndex = -1; dialog.focus(); return true; }
  const current = candidates.indexOf(dialog.ownerDocument.activeElement as HTMLElement);
  const index = current < 0 ? event.shiftKey ? candidates.length - 1 : 0
    : (current + (event.shiftKey ? -1 : 1) + candidates.length) % candidates.length;
  candidates[index].focus();
  return true;
}

/** Preserve the exact original attribute, including an already inert background. */
export function makeModalBackgroundInert(background: HTMLElement): () => void {
  const previous = background.getAttribute('inert');
  background.setAttribute('inert', '');
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (previous === null) background.removeAttribute('inert');
    else background.setAttribute('inert', previous);
  };
}
/** A removed/replaced dialog must never dispatch a queued second confirmation. */
export function createDialogSettlement(isCurrent: () => boolean, close: () => void): (action?: () => void) => void {
  let settled = false;
  return action => {
    if (settled || !isCurrent()) return;
    settled = true;
    close();
    action?.();
  };
}

