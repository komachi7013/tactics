import { describe, expect, it, vi } from 'vitest';
import { PlaybackGate } from '../src/view/playbackGate';
function setup() {
  const callbacks: (() => void)[] = [], clearTimeout = vi.fn();
  const gate = new PlaybackGate({ setTimeout: fn => { callbacks.push(fn); return callbacks.length; }, clearTimeout });
  return { gate, callbacks, clearTimeout };
}
describe('presentation lifetime without simulation callbacks', () => {
  it('rejects double starts and finishes once even if delayed timer repeats', () => {
    const { gate, callbacks } = setup(), done = vi.fn();
    expect(gate.start(440, done)).toBe(true); expect(gate.busy).toBe(true);
    expect(gate.start(1, done)).toBe(false); callbacks[0](); callbacks[0]();
    expect(done).toHaveBeenCalledTimes(1); expect(gate.busy).toBe(false);
  });
  it('manual shorten settles once, old timer cannot end next playback', () => {
    const { gate, callbacks } = setup(), first = vi.fn(), next = vi.fn();
    gate.start(440, first); gate.finishNow(); gate.finishNow(); gate.start(220, next);
    callbacks[0](); expect(first).toHaveBeenCalledTimes(1); expect(next).not.toHaveBeenCalled();
    expect(gate.busy).toBe(true); callbacks[1](); expect(next).toHaveBeenCalledTimes(1);
  });
  it('scene switch cancels without callbacks and ignores stale timer', () => {
    const { gate, callbacks, clearTimeout } = setup(), done = vi.fn();
    gate.start(660, done); gate.cancel(); gate.cancel(); callbacks[0]();
    expect(done).not.toHaveBeenCalled(); expect(gate.busy).toBe(false); expect(clearTimeout).toHaveBeenCalledTimes(1);
  });
  it('supports synchronous zero duration and reentrant next presentation', () => {
    const { gate, callbacks } = setup(), second = vi.fn();
    expect(gate.start(0, () => { expect(gate.busy).toBe(false); gate.start(220, second); })).toBe(true);
    expect(gate.busy).toBe(true); callbacks[0](); expect(second).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid durations without locking', () => {
    const { gate } = setup(), done = vi.fn();
    for (const duration of [NaN, Infinity, -1]) expect(gate.start(duration, done)).toBe(false);
    expect(gate.busy).toBe(false); expect(done).not.toHaveBeenCalled();
  });
});
