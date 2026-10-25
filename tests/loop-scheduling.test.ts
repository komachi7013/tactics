import EventEmitter from 'eventemitter3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeScheduling } from '../src/view/renderDiagnostics';

// @ts-expect-error Phaser ships its real internal CJS scheduler without TS declarations.
import TimeStep from 'phaser/src/core/TimeStep.js';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('actual Phaser 3.90 first-frame ambiguity', () => {
  function setup(callback: () => void) {
    let id = 0;
    const requests = new Map<number, (time: number) => void>();
    vi.stubGlobal('window', { performance: { now: () => 100 },
      requestAnimationFrame: (fn: (time: number) => void) => { requests.set(++id, fn); return id; },
      cancelAnimationFrame: (key: number) => requests.delete(key) });
    const loop = new TimeStep({}, { smoothStep: false }); loop.start(callback);
    return { loop, requests, deliver: () => { const [key, fn] = [...requests][0]; requests.delete(key); fn(166); } };
  }
  it('can remain running at frame zero when the first RAF is never delivered', () => {
    const h = setup(vi.fn());
    expect(h.loop).toMatchObject({ running: true, frame: 0, now: 0, framesThisSecond: 0 });
    expect(h.requests.size).toBe(1); h.loop.destroy();
  });
  it('also remains running at frame zero if the first game callback throws before RAF re-registration', () => {
    const h = setup(() => { throw new Error('first Game.step failed'); });
    expect(h.deliver).toThrow('first Game.step failed');
    expect(h.loop).toMatchObject({ running: true, frame: 0, now: 166, framesThisSecond: 1 });
    expect(h.loop.raf.isRunning).toBe(true); expect(h.requests.size).toBe(0); h.loop.destroy();
  });
  it('increments the frame and schedules another RAF after a successful callback', () => {
    const callback = vi.fn(), h = setup(callback); h.deliver();
    expect(callback).toHaveBeenCalledTimes(1); expect(h.loop.frame).toBe(1); expect(h.requests.size).toBe(1); h.loop.destroy();
  });
});

describe('independent scheduler observation', () => {
  function setup() {
    vi.useFakeTimers(); const events = new EventEmitter(); let native: ((time: number) => void) | undefined;
    const cancelFrame = vi.fn(), read = vi.fn(() => ({ frame: 0 })), done = vi.fn();
    const cancel = observeScheduling({ events, read, requestFrame: fn => { native = fn; return 42; }, cancelFrame }, done);
    return { events, cancelFrame, read, done, cancel, native: () => native?.(123) };
  }
  it('distinguishes a delivered independent RAF from a stalled Phaser loop', () => {
    const h = setup(); h.native(); vi.runAllTimers();
    expect(h.done).toHaveBeenCalledExactlyOnceWith({ status: 'scheduling-observed', before: { frame: 0 }, after: { frame: 0 },
      nativeFrame: { status: 'delivered', timestamp: 123 }, events: { prestep: 0, step: 0, poststep: 0, prerender: 0, postrender: 0 } });
    expect(h.cancelFrame).not.toHaveBeenCalled(); expect(h.events.eventNames()).toEqual([]);
  });
  it('records incomplete game stages and cancels an undelivered native request', () => {
    const h = setup(); h.events.emit('prestep'); h.events.emit('step'); vi.runAllTimers();
    expect(h.done.mock.calls[0][0]).toMatchObject({ nativeFrame: { status: 'not-delivered-within-timeout' }, events: { prestep: 1, step: 1, postrender: 0 } });
    expect(h.cancelFrame).toHaveBeenCalledExactlyOnceWith(42); expect(h.events.eventNames()).toEqual([]);
  });
  it('cleans up the timer, stage observers and independent RAF on HMR disposal', () => {
    const h = setup(); h.cancel(); vi.runAllTimers();
    expect(h.read).toHaveBeenCalledTimes(1); expect(h.done).not.toHaveBeenCalled();
    expect(h.cancelFrame).toHaveBeenCalledExactlyOnceWith(42); expect(h.events.eventNames()).toEqual([]);
  });
});
