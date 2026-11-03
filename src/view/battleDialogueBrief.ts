import type { BattleDialogue } from './battleDialogues';
export interface BriefClock { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }
/** A reserved strip, not a modal or game timer. A stale timeout can never clear newer text. */
export function mountBattleDialogueBrief(host: HTMLElement, clock: BriefClock): { show(row: BattleDialogue): void; clear(): void; dispose(): void } {
  const doc = host.ownerDocument; let timer: unknown, epoch = 0, disposed = false;
  const content = doc.createElement('p'); content.className = 'battle-dialogue-words'; content.setAttribute('role','status'); content.setAttribute('aria-live','polite');
  const dismiss = doc.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '閉じる'; dismiss.setAttribute('aria-label','短い会話を閉じる');
  host.replaceChildren(content,dismiss); host.hidden = true;
  const clear = () => { ++epoch; if (timer !== undefined) clock.clearTimeout(timer); timer = undefined; host.hidden = true; content.textContent = ''; };
  dismiss.onclick = clear;
  return {
    show(row) { if (disposed) return; clear(); const token = epoch; content.textContent = row.pages.map(page => `${page.speaker?.name ?? '語り'} ${page.text}`).join('　'); host.hidden = false; timer = clock.setTimeout(() => { if (!disposed && epoch === token) clear(); }, Math.max(6500,Math.min(11000,content.textContent.length * 90))); },
    clear,
    dispose() { disposed = true; clear(); dismiss.onclick = null; host.replaceChildren(); },
  };
}
