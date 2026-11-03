import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/domain/engine';
import type { BattleState } from '../src/domain/types';
import { BattleFlow } from '../src/view/battleFlow';
import type { PresentationPlan } from '../src/view/presentation';
import { MotionSignals } from './helpers/battleFlowHarness';

type Hook = (resume: () => void) => void;
function setup(hook?: Hook | false) {
  const status: { active: boolean; phase: BattleState['phase']; turn: BattleState['turn'] } = { active: true, phase: 'playing', turn: 'player' };
  const signals = new MotionSignals(), resumes: (() => void)[] = [], events: string[] = [];
  const timers: { fn: () => void; ms: number; canceled: boolean; delivered: boolean }[] = [];
  const render = vi.fn(() => { events.push('render'); });
  const clearPresentation = vi.fn((completed?: boolean) => { events.push(completed ? 'clear-completed' : 'clear'); });
  const playPresentation = vi.fn((_plan: PresentationPlan) => { events.push('play'); });
  const finish = vi.fn(() => { events.push('finish'); });
  const runEnemy = vi.fn(() => { events.push('enemy'); status.turn = 'player'; });
  const afterPresentation = vi.fn((resume: () => void) => { events.push('dialogue'); resumes.push(resume); if (hook) hook(resume); });
  const flow = new BattleFlow({
    scheduler: {
      setTimeout(fn, ms) { timers.push({ fn, ms, canceled: false, delivered: false }); return timers.length - 1; },
      clearTimeout(id) { timers[id as number].canceled = true; },
    },
    motion: signals, visibility: signals, status: () => status,
    clearPresentation, playPresentation, render, finish, runEnemy,
    ...(hook === false ? {} : { afterPresentation }),
  });
  return { flow, status, signals, resumes, events, timers, render, clearPresentation, playPresentation, finish, runEnemy, afterPresentation,
    pending: () => timers.map((timer, id) => ({ ...timer, id })).filter(timer => !timer.canceled && !timer.delivered),
    deliver(id: number) { timers[id].delivered = true; timers[id].fn(); },
  };
}
function movement(durationMs = 180): PresentationPlan {
  return { moves: [{ unitId: 'ally-lise', path: [{ x: 0, y: 5 }, { x: 1, y: 5 }] }], moveDuration: durationMs, attackDuration: 0, durationMs };
}
function attack(): PresentationPlan {
  return { moves: [], attack: { actorId: 'ally-lise', targetId: 'enemy-melee-01', weapon: 'melee', targetBefore: createInitialState().units.find(unit => unit.id === 'enemy-melee-01')! }, moveDuration: 0, attackDuration: 400, durationMs: 400 };
}

describe('optional post-presentation dialogue continuation', () => {
  it('waits for completed playback, clears the visual before dialogue, and locks input until one resume', () => {
    const h = setup();
    expect(h.flow.presentCommitted(movement())).toBe(true);
    const timer = h.pending()[0].id;
    expect(h.afterPresentation).not.toHaveBeenCalled();
    expect(h.flow.presentationBusy).toBe(true);
    h.deliver(timer);
    expect(h.events).toEqual(['play', 'render', 'clear-completed', 'dialogue']);
    expect(h.flow.presentationBusy).toBe(false); expect(h.flow.busy).toBe(true);
    expect(h.flow.canDispatch(false)).toBe(false); expect(h.flow.canShortenPresentation).toBe(false);
    expect(h.flow.presentCommitted(null)).toBe(false);
    expect(h.pending()).toEqual([]);
    h.resumes[0](); h.resumes[0](); h.deliver(timer);
    expect(h.render).toHaveBeenCalledTimes(2); expect(h.afterPresentation).toHaveBeenCalledOnce();
    expect(h.flow.busy).toBe(false); expect(h.flow.canDispatch(false)).toBe(true);
    expect(h.flow.canDispatch(true)).toBe(false); expect(h.runEnemy).not.toHaveBeenCalled();
    h.flow.dispose();
  });

  it.each(['normal', 'reduced-motion'] as const)('resumes into precisely one %s enemy delay', mode => {
    const h = setup(); h.status.turn = 'enemy';
    if (mode === 'reduced-motion') h.signals.preference(true);
    h.flow.presentCommitted(null);
    expect(h.pending()).toEqual([]); expect(h.flow.busy).toBe(true);
    h.resumes[0]();
    expect(h.pending().map(timer => timer.ms)).toEqual([mode === 'normal' ? 620 : 150]);
    expect(h.flow.busy).toBe(true); expect(h.flow.canDispatch(false)).toBe(false);
    const enemy = h.pending()[0].id;
    h.resumes[0](); h.signals.visibility(true); h.signals.preference(true); h.flow.finishNow();
    expect(h.pending()).toHaveLength(1);
    h.deliver(enemy); h.deliver(enemy);
    expect(h.runEnemy).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(false);
    expect(h.finish).not.toHaveBeenCalled(); h.flow.dispose();
  });

  it('uses the current motion preference when the dialogue closes, without retiming an existing enemy delay', () => {
    const h = setup(); h.status.turn = 'enemy'; h.flow.presentCommitted(null);
    h.signals.preference(true); expect(h.pending()).toEqual([]);
    h.resumes[0](); expect(h.pending().map(timer => timer.ms)).toEqual([150]);
    h.signals.preference(false); h.resumes[0]();
    expect(h.pending().map(timer => timer.ms)).toEqual([150]); h.flow.dispose();
  });

  it.each(['manual', 'hidden', 'reduced-motion'] as const)('still shortens movement by %s, but never bypasses the dialogue lock', event => {
    const h = setup(); h.flow.presentCommitted(movement()); const timer = h.pending()[0].id;
    if (event === 'manual') h.flow.finishNow();
    else if (event === 'hidden') h.signals.visibility(true);
    else h.signals.preference(true);
    expect(h.afterPresentation).toHaveBeenCalledOnce(); expect(h.flow.presentationBusy).toBe(false);
    expect(h.flow.busy).toBe(true); expect(h.flow.canDispatch(false)).toBe(false);
    h.flow.finishNow(); h.signals.visibility(true); h.signals.preference(true); h.deliver(timer);
    expect(h.afterPresentation).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(true);
    expect(h.runEnemy).not.toHaveBeenCalled();
    h.resumes[0](); expect(h.flow.busy).toBe(false); h.flow.dispose();
  });

  it.each(['hidden', 'reduced-motion'] as const)('enters dialogue immediately for already-shortened movement: %s', event => {
    const h = setup();
    if (event === 'hidden') h.signals.visibility(true); else h.signals.preference(true);
    h.flow.presentCommitted(movement());
    expect(h.playPresentation).not.toHaveBeenCalled(); expect(h.pending()).toEqual([]);
    expect(h.afterPresentation).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(true);
    h.resumes[0](); expect(h.flow.busy).toBe(false); h.flow.dispose();
  });

  it('does not interrupt an attack, even for visibility, motion preference or repeated shortening requests', () => {
    const h = setup(); h.status.turn = 'enemy'; h.flow.presentCommitted(attack());
    const timer = h.pending()[0].id;
    h.signals.visibility(true); h.signals.preference(true); h.flow.finishNow(); h.flow.finishNow();
    expect(h.pending().map(item => item.ms)).toEqual([400]);
    expect(h.flow.canShortenPresentation).toBe(false); expect(h.afterPresentation).not.toHaveBeenCalled();
    h.deliver(timer); h.deliver(timer);
    expect(h.afterPresentation).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(true);
    expect(h.pending()).toEqual([]); expect(h.runEnemy).not.toHaveBeenCalled();
    h.resumes[0](); expect(h.pending().map(item => item.ms)).toEqual([150]); h.flow.dispose();
  });

  it.each(['clear', 'dispose'] as const)('invalidates a held resume and presentation callback on %s', action => {
    const h = setup(); h.status.turn = 'enemy'; h.flow.presentCommitted(movement());
    const timer = h.pending()[0].id; h.deliver(timer); const staleResume = h.resumes[0];
    if (action === 'clear') h.flow.clear(); else h.flow.dispose();
    const events = [...h.events];
    staleResume(); staleResume(); h.deliver(timer); h.signals.visibility(true); h.signals.preference(true);
    expect(h.events).toEqual(events); expect(h.pending()).toEqual([]); expect(h.flow.busy).toBe(false);
    expect(h.runEnemy).not.toHaveBeenCalled(); expect(h.finish).not.toHaveBeenCalled();
    expect(h.flow.canDispatch(false)).toBe(action === 'clear'); h.flow.dispose();
  });

  it('old resumes cannot release a newly started presentation or its new dialogue after restart', () => {
    const h = setup(); h.flow.presentCommitted(movement()); h.deliver(h.pending()[0].id);
    const staleResume = h.resumes[0]; h.flow.clear();
    h.flow.presentCommitted(attack()); const currentTimer = h.pending()[0].id;
    staleResume(); expect(h.flow.presentationBusy).toBe(true); expect(h.render).toHaveBeenCalledTimes(2);
    h.deliver(currentTimer); expect(h.resumes).toHaveLength(2);
    staleResume(); expect(h.flow.busy).toBe(true); expect(h.render).toHaveBeenCalledTimes(2);
    h.resumes[1](); expect(h.flow.busy).toBe(false); expect(h.render).toHaveBeenCalledTimes(3); h.flow.dispose();
  });

  it('clear cancels a resumed enemy delay and its stale timer cannot disturb the next dialogue', () => {
    const h = setup(); h.status.turn = 'enemy'; h.flow.presentCommitted(null); h.resumes[0]();
    const staleTimer = h.pending()[0].id; h.flow.clear(); h.status.turn = 'player';
    h.flow.presentCommitted(null); const events = [...h.events];
    h.deliver(staleTimer); h.resumes[0]();
    expect(h.events).toEqual(events); expect(h.runEnemy).not.toHaveBeenCalled(); expect(h.flow.busy).toBe(true);
    h.resumes[1](); expect(h.flow.busy).toBe(false); h.flow.dispose();
  });

  it('does not schedule an old enemy when rendering its busy state replaces the battle', () => {
    const h = setup(); h.status.turn = 'enemy'; h.flow.presentCommitted(null);
    h.render.mockImplementationOnce(() => {}).mockImplementationOnce(() => {
      h.flow.clear(); h.status.turn = 'player';
    });
    h.resumes[0]();
    expect(h.pending()).toEqual([]); expect(h.flow.busy).toBe(false);
    expect(h.runEnemy).not.toHaveBeenCalled(); h.flow.dispose();
  });

  it.each(['won', 'lost'] as const)('sends terminal %s directly to finish after full playback, without dialogue or AI', phase => {
    const h = setup(); h.status.phase = phase; h.status.turn = 'enemy';
    h.flow.presentCommitted(attack()); const timer = h.pending()[0].id;
    expect(h.finish).not.toHaveBeenCalled(); expect(h.afterPresentation).not.toHaveBeenCalled();
    h.signals.visibility(true); h.signals.preference(true); h.flow.finishNow();
    expect(h.finish).not.toHaveBeenCalled();
    h.deliver(timer); h.deliver(timer); h.flow.finishNow();
    expect(h.finish).toHaveBeenCalledOnce(); expect(h.afterPresentation).not.toHaveBeenCalled();
    expect(h.runEnemy).not.toHaveBeenCalled(); expect(h.pending()).toEqual([]); expect(h.flow.busy).toBe(false);
    h.flow.dispose();
  });

  it('rechecks the terminal phase when resuming and finishes once instead of scheduling an enemy', () => {
    const h = setup(); h.status.turn = 'enemy'; h.flow.presentCommitted(null);
    h.status.phase = 'lost'; h.resumes[0](); h.resumes[0]();
    expect(h.finish).toHaveBeenCalledOnce(); expect(h.render).not.toHaveBeenCalled();
    expect(h.pending()).toEqual([]); expect(h.runEnemy).not.toHaveBeenCalled(); h.flow.dispose();
  });

  it.each(['before-resume', 'after-resume'] as const)('recovers from a hook exception %s without hanging or double scheduling', when => {
    const h = setup(resume => { if (when === 'after-resume') resume(); throw Error('dialogue unavailable'); });
    h.status.turn = 'enemy'; expect(h.flow.presentCommitted(null)).toBe(true);
    expect(h.render).toHaveBeenCalledTimes(2); expect(h.pending().map(timer => timer.ms)).toEqual([620]);
    h.resumes[0](); expect(h.pending()).toHaveLength(1); h.deliver(h.pending()[0].id);
    expect(h.runEnemy).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(false); h.flow.dispose();
  });

  it('invalidates the resume before external clearPresentation cleanup can call it', () => {
    const h = setup(); h.flow.presentCommitted(null); const staleResume = h.resumes[0];
    h.clearPresentation.mockImplementation(completed => { if (!completed) staleResume(); });
    h.flow.clear();
    expect(h.render).not.toHaveBeenCalled(); expect(h.flow.busy).toBe(false);
    expect(h.runEnemy).not.toHaveBeenCalled(); h.flow.dispose();
  });

  it('does not continue an old dialogue when its hook clears the battle and throws', () => {
    let clear = () => {};
    const h = setup(() => { clear(); throw Error('scene replaced'); }); clear = () => h.flow.clear();
    h.status.turn = 'enemy'; h.flow.presentCommitted(null);
    expect(h.afterPresentation).toHaveBeenCalledOnce(); expect(h.render).not.toHaveBeenCalled();
    expect(h.pending()).toEqual([]); expect(h.flow.busy).toBe(false); h.flow.dispose();
  });

  it('rejects a reentrant presentation while the hook owns the continuation', () => {
    let reenter = () => true, accepted: boolean | undefined;
    const h = setup(() => { accepted = reenter(); }); reenter = () => h.flow.presentCommitted(null);
    h.flow.presentCommitted(null); expect(accepted).toBe(false);
    expect(h.afterPresentation).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(true);
    h.resumes[0](); expect(h.flow.busy).toBe(false); h.flow.dispose();
  });

  it('handles synchronous zero-duration completion without playing old visuals over dialogue', () => {
    const h = setup(); h.flow.presentCommitted(movement(0));
    expect(h.playPresentation).not.toHaveBeenCalled(); expect(h.render).not.toHaveBeenCalled();
    expect(h.afterPresentation).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(true);
    h.resumes[0](); expect(h.render).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(false); h.flow.dispose();
  });

  it('retains the immediate render and enemy delay when the hook is omitted', () => {
    const h = setup(false); h.status.turn = 'enemy'; h.flow.presentCommitted(null);
    expect(h.afterPresentation).not.toHaveBeenCalled(); expect(h.render).toHaveBeenCalledTimes(2);
    expect(h.pending().map(timer => timer.ms)).toEqual([620]); h.deliver(h.pending()[0].id);
    expect(h.runEnemy).toHaveBeenCalledOnce(); expect(h.flow.busy).toBe(false); h.flow.dispose();
  });
});
