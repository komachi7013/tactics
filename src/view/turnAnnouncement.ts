import type { BattleState } from '../domain/types';
import type { BriefClock } from './battleDialogueBrief';
import './turnAnnouncement.css';

/** A continuation barrier: the next side cannot act until its notice has ended. */
export function mountTurnAnnouncement(host: HTMLElement, clock: BriefClock) {
 let timer: unknown, epoch = 0, lastTurn = '', disposed = false;
 host.className = 'turn-start-overlay'; host.hidden = true;
 host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'assertive'); host.setAttribute('aria-atomic', 'true');
 const clear = () => {
  ++epoch;
  if (timer !== undefined) clock.clearTimeout(timer);
  timer = undefined; host.hidden = true; host.replaceChildren(); lastTurn = '';
 };
 return {
  showClear(resume: () => void, options: { reducedMotion?: boolean; hidden?: boolean } = {}): void {
   if (disposed) return;
   if (timer !== undefined) clock.clearTimeout(timer);
   const token = ++epoch;
   host.replaceChildren(); host.hidden = true;
   if (options.hidden) { resume(); return; }
   host.dataset.turn = 'clear';
   const card = host.ownerDocument.createElement('div'); card.className = 'turn-start-card';
   const title = host.ownerDocument.createElement('strong'); title.textContent = 'Stage Clear';
   const subtitle = host.ownerDocument.createElement('span'); subtitle.textContent = 'ステージクリア';
   card.append(title, subtitle); host.replaceChildren(card); host.hidden = false;
   timer = clock.setTimeout(() => {
    if (disposed || epoch !== token) return;
    ++epoch; timer = undefined; host.hidden = true; host.replaceChildren(); resume();
   }, options.reducedMotion ? 900 : 1800);
  },
  show(state: Pick<BattleState, 'battleId' | 'round' | 'turn'>, resume: () => void, options: { reducedMotion?: boolean; hidden?: boolean } = {}): void {
   if (disposed) return;
   const key = `${state.battleId}:${state.round}:${state.turn}`;
   if (key === lastTurn) { resume(); return; }
   if (timer !== undefined) clock.clearTimeout(timer);
   const token = ++epoch; lastTurn = key;
   if (options.hidden) { host.hidden = true; host.replaceChildren(); resume(); return; }
   host.dataset.turn = state.turn;
   const card = host.ownerDocument.createElement('div'); card.className = 'turn-start-card';
   const title = host.ownerDocument.createElement('strong'); title.textContent = state.turn === 'player' ? 'Player Turn' : 'Enemy Turn';
   const subtitle = host.ownerDocument.createElement('span'); subtitle.textContent = state.turn === 'player' ? '味方のターン' : '敵のターン';
   card.append(title, subtitle); host.replaceChildren(card); host.hidden = false;
   timer = clock.setTimeout(() => {
    if (disposed || epoch !== token) return;
    ++epoch; timer = undefined; host.hidden = true; host.replaceChildren(); resume();
   }, options.reducedMotion ? 450 : 1050);
  },
  hasShown(state: Pick<BattleState, 'battleId' | 'round' | 'turn'>) { return lastTurn === `${state.battleId}:${state.round}:${state.turn}`; },
  clear,
  dispose() { disposed = true; clear(); },
 };
}
