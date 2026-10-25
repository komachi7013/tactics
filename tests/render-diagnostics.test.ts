import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeNextRender, readPixelBuffer } from '../src/view/renderDiagnostics';

function emitter() {
  let handler: (() => void) | undefined;
  return { once: vi.fn((_name: string, fn: () => void) => { handler = fn; }),
    off: vi.fn(() => { handler = undefined; }), emit: () => handler?.() };
}
afterEach(() => vi.useRealTimers());
describe('one-shot render observation', () => {
  it('waits for actual post-render and reads exactly once, cancelling timeout', () => {
    vi.useFakeTimers(); const events = emitter(), read = vi.fn(() => ({ pixels: 42 })), done = vi.fn();
    observeNextRender(events as any, read, done);
    expect(read).not.toHaveBeenCalled(); events.emit(); events.emit(); vi.runAllTimers();
    expect(read).toHaveBeenCalledTimes(1); expect(done).toHaveBeenCalledExactlyOnceWith({ status: 'captured', frame: { pixels: 42 } });
  });
  it('reports a stalled loop without reading a stale buffer and removes observer', () => {
    vi.useFakeTimers(); const events = emitter(), read = vi.fn(), done = vi.fn();
    observeNextRender(events as any, read, done); vi.runAllTimers(); events.emit();
    expect(read).not.toHaveBeenCalled(); expect(done).toHaveBeenCalledExactlyOnceWith({ status: 'no-post-render-within-timeout' });
  });
  it('cancels pending reads on disposal', () => {
    vi.useFakeTimers(); const events = emitter(), read = vi.fn(), done = vi.fn();
    observeNextRender(events as any, read, done)(); events.emit(); vi.runAllTimers();
    expect(read).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
  });
  it('contains diagnostic errors without changing the render loop', () => {
    vi.useFakeTimers(); const events = emitter(), done = vi.fn();
    observeNextRender(events as any, () => { throw new Error('readback failed'); }, done);
    expect(() => events.emit()).not.toThrow(); vi.runAllTimers();
    expect(done).toHaveBeenCalledExactlyOnceWith({ status: 'diagnostic-error', error: 'Error: readback failed' });
  });
});

describe('WebGL readback validity', () => {
  function gl(fail: boolean) {
    let error = 0;
    return { NO_ERROR: 0, RGBA: 6408, UNSIGNED_BYTE: 5121, getError: () => { const value = error; error = 0; return value; },
      isContextLost: () => false, readPixels: (_x: number, _y: number, _w: number, _h: number, _format: number, _type: number, data: Uint8Array) => {
        if (fail) { error = 1282; return; }
        data.set([23, 59, 64, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
      } } as unknown as WebGLRenderingContext;
  }
  it('separates background, visible and transparent pixels in a valid readback', () => {
    expect(readPixelBuffer(gl(false), 3, 1)).toMatchObject({ status: 'readback-returned', total: 3, nonBackground: 1, transparent: 1, center: [255,255,255,255] });
  });
  it('does not misreport a GL error and unfilled buffer as an all-transparent frame', () => {
    const result = readPixelBuffer(gl(true), 3, 1);
    expect(result).toMatchObject({ status: 'readback-error', readErrors: [1282] });
    expect(result).not.toHaveProperty('transparent'); expect(result).not.toHaveProperty('nonBackground');
  });
});
