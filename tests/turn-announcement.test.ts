import { describe, expect, it, vi } from 'vitest';
import { BattleFlow } from '../src/view/battleFlow';
import { mountTurnAnnouncement } from '../src/view/turnAnnouncement';
import { InspectionDocument } from './helpers/inspectionDom';
import { createInitialState } from '../src/domain/engine';

function setup() {
 const host = new InspectionDocument().createElement('div');
 const timers: { fn: () => void; canceled: boolean; ms: number }[] = [];
 const clock = { setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, canceled: false, ms }); return timers.length - 1; }, clearTimeout: (id: unknown) => { timers[id as number].canceled = true; } };
 return { host, timers, clock, notice: mountTurnAnnouncement(host as unknown as HTMLElement, clock) };
}

describe('turn announcements before control passes', () => {
 it('shows Stage Clear over the board before continuing, once only',()=>{
  const h=setup(),resume=vi.fn();h.notice.showClear(resume);
  expect(h.host.textContent).toBe('Stage Clearステージクリア');expect(h.host.hidden).toBe(false);
  expect(resume).not.toHaveBeenCalled();expect(h.timers[0].ms).toBe(1800);
  h.timers[0].fn();h.timers[0].fn();expect(resume).toHaveBeenCalledOnce();expect(h.host.hidden).toBe(true);
 });
 it('cancels stale clear continuations and supports reduced motion and hidden tabs',()=>{
  const h=setup(),old=vi.fn(),next=vi.fn();h.notice.showClear(old);h.notice.clear();h.timers[0].fn();expect(old).not.toHaveBeenCalled();
  h.notice.showClear(next,{reducedMotion:true});expect(h.timers[1].ms).toBe(900);h.timers[1].fn();expect(next).toHaveBeenCalledOnce();
  h.notice.showClear(next,{hidden:true});expect(h.host.hidden).toBe(true);expect(next).toHaveBeenCalledTimes(2);
 });
 it('holds enemy continuation until Enemy Turn ends, then holds player control for Player Turn', () => {
  const h = setup(), state = createInitialState(); state.turn = 'enemy';
  const runEnemy = vi.fn(() => { state.round++; state.turn = 'player'; flow.presentCommitted(null); });
  const signals = { matches: false, hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const flow = new BattleFlow({ scheduler: h.clock, motion: signals, visibility: signals,
   status: () => ({ active: true, phase: state.phase, turn: state.turn }), render: vi.fn(), clearPresentation: vi.fn(), playPresentation: vi.fn(),
   finish: vi.fn(), runEnemy, afterPresentation: resume => h.notice.show(state, resume),
  });
  flow.presentCommitted(null);
  expect(h.host.textContent).toBe('Enemy Turn敵のターン'); expect(flow.canDispatch(false)).toBe(false); expect(runEnemy).not.toHaveBeenCalled();
  h.timers[0].fn(); expect(h.host.hidden).toBe(true); expect(runEnemy).not.toHaveBeenCalled();
  h.timers[1].fn(); expect(runEnemy).toHaveBeenCalledOnce(); expect(h.host.textContent).toBe('Player Turn味方のターン');
  expect(flow.canDispatch(false)).toBe(false); h.timers[2].fn(); expect(flow.canDispatch(false)).toBe(true);
  const resume = vi.fn(); h.notice.show(state, resume); expect(resume).toHaveBeenCalledOnce(); expect(h.host.hidden).toBe(true);
  flow.dispose(); h.notice.dispose();
 });
 it('shows the initial player phase and cancels stale continuation on restart', () => {
  const h = setup(), state = createInitialState(), old = vi.fn(), current = vi.fn();
  h.notice.show(state, old); expect(h.host.textContent).toContain('Player Turn');
  h.notice.clear(); h.notice.show(state, current); h.timers[0].fn(); expect(old).not.toHaveBeenCalled(); expect(h.host.hidden).toBe(false);
  h.timers[1].fn(); h.timers[1].fn(); expect(current).toHaveBeenCalledOnce();
 });
 it('respects reduced motion and hidden tabs while preserving one notice per side and round', () => {
  const h = setup(), state = createInitialState(), resume = vi.fn();
  h.notice.show(state, resume, { reducedMotion: true }); expect(h.timers[0].ms).toBe(450); h.timers[0].fn();
  state.turn = 'enemy'; h.notice.show(state, resume, { hidden: true }); expect(h.host.hidden).toBe(true); expect(resume).toHaveBeenCalledTimes(2);
  state.round++; state.turn = 'player'; h.notice.show(state, resume); expect(h.host.hidden).toBe(false);
  h.notice.dispose(); h.timers[1].fn(); expect(resume).toHaveBeenCalledTimes(2);
 });
});
