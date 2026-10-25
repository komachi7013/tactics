export interface PlaybackScheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
/** Owns presentation lifetime only. Domain state must already be committed. */
export class PlaybackGate {
  private generation = 0;
  private handle: unknown;
  private pending: (() => void) | null = null;
  constructor(private readonly scheduler: PlaybackScheduler) {}
  get busy(): boolean { return this.pending !== null; }
  start(durationMs: number, onDone: () => void): boolean {
    if (this.busy || !Number.isFinite(durationMs) || durationMs < 0) return false;
    const generation = ++this.generation;
    this.pending = onDone;
    if (durationMs === 0) this.finishNow();
    else this.handle = this.scheduler.setTimeout(() => {
      if (this.generation === generation) this.finishNow();
    }, durationMs);
    return true;
  }
  finishNow(): void {
    const done = this.pending;
    this.cancel();
    done?.();
  }
  cancel(): void {
    ++this.generation;
    if (this.handle !== undefined) this.scheduler.clearTimeout(this.handle);
    this.handle = undefined;
    this.pending = null;
  }
}
