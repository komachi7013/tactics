import type { BattleState } from '../domain/types';
import type { PresentationPlan } from './presentation';
import { PlaybackGate, type PlaybackScheduler } from './playbackGate';

// Temporary product policy. Re-enable in code only after attack shortening is
// ready for review; user preferences or saved settings cannot override this.
const ATTACK_SHORTENING_ENABLED = false;

interface MotionSource {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}
interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}
export interface BattleFlowDependencies {
  scheduler: PlaybackScheduler;
  motion: MotionSource;
  visibility: VisibilitySource;
  status(): { active: boolean; phase: BattleState['phase']; turn: BattleState['turn'] };
  clearPresentation(completed?: boolean): void;
  playPresentation(plan: PresentationPlan): void;
  render(): void;
  /** Optional dialogue between completed playback and normal UI/AI continuation. */
  afterPresentation?(resume: () => void): void;
  finish(): void;
  runEnemy(): void;
}

/** The live UI's presentation/continuation wiring. Never commits a rule command. */
export class BattleFlow {
  private readonly gate: PlaybackGate;
  private enemyBusy = false;
  private continuationBusy = false;
  private epoch = 0;
  private enemyTimer: unknown;
  private disposed = false;
  private attackShorteningLocked = false;
  private readonly onMotion = () => { if (this.deps.motion.matches) this.finishNow(); };
  private readonly onVisibility = () => { if (this.deps.visibility.hidden) this.finishNow(); };

  constructor(private readonly deps: BattleFlowDependencies) {
    this.gate = new PlaybackGate(deps.scheduler);
    deps.motion.addEventListener('change', this.onMotion);
    deps.visibility.addEventListener('visibilitychange', this.onVisibility);
  }
  get busy(): boolean { return this.enemyBusy || this.gate.busy || this.continuationBusy; }
  get presentationBusy(): boolean { return this.gate.busy; }
  get canShortenPresentation(): boolean { return this.gate.busy && !this.attackShorteningLocked; }
  canDispatch(dialogOpen: boolean): boolean {
    const status = this.deps.status();
    return !this.disposed && status.active && status.phase === 'playing' && !dialogOpen && !this.busy;
  }
  presentCommitted(plan: PresentationPlan | null): boolean {
    if (this.disposed || this.busy) return false;
    const token = ++this.epoch;
    const current = () => !this.disposed && token === this.epoch;
    const settled = () => {
      if (!current()) return;
      const proceed = () => {
        if (!current()) return;
        this.continuationBusy = false;
        if (this.deps.status().phase !== 'playing') this.deps.finish();
        else { this.deps.render(); if (current()) this.scheduleEnemy(); }
      };
      if (this.deps.status().phase !== 'playing' || !this.deps.afterPresentation) { proceed(); return; }
      this.continuationBusy = true;
      let resumed = false;
      const resume = () => {
        if (resumed || !current()) return;
        resumed = true;
        proceed();
      };
      try { this.deps.afterPresentation(resume); }
      catch { resume(); }
    };
    let completed = false;
    const done = () => {
      if (!current() || completed) return;
      completed = true;
      this.attackShorteningLocked = false;
      // Keep the lock across clearPresentation and the dialogue callback.
      this.continuationBusy = !!this.deps.afterPresentation;
      this.deps.clearPresentation(true);
      settled();
    };
    // Mixed attack/move/escort plans retain their full timeline as one gate.
    this.attackShorteningLocked = !!plan?.attack && !ATTACK_SHORTENING_ENABLED;
    if (!plan || (!this.attackShorteningLocked && (this.deps.motion.matches || this.deps.visibility.hidden))) { done(); return true; }
    this.gate.start(plan.durationMs, done);
    // Zero-duration playback may have synchronously entered the new dialogue.
    if (this.deps.afterPresentation && completed) return true;
    try { this.deps.playPresentation(plan); this.deps.render(); }
    catch { this.gate.finishNow(); }
    return true;
  }
  private scheduleEnemy(): void {
    const status = this.deps.status();
    if (this.disposed || !status.active || status.phase !== 'playing' || status.turn !== 'enemy' || this.busy) return;
    const token = this.epoch;
    this.enemyBusy = true;
    this.deps.render();
    if (this.disposed || token !== this.epoch) return;
    let delivered = false;
    this.enemyTimer = this.deps.scheduler.setTimeout(() => {
      if (delivered || token !== this.epoch || !this.deps.status().active || this.disposed) return;
      delivered = true;
      this.enemyTimer = undefined;
      this.enemyBusy = false;
      this.deps.runEnemy();
    }, this.deps.motion.matches ? 150 : 620);
  }
  finishNow(): void { if (this.canShortenPresentation) this.gate.finishNow(); }
  clear(): void {
    // Invalidate held dialogue resumes before invoking any external cleanup.
    ++this.epoch;
    this.gate.cancel();
    this.attackShorteningLocked = false;
    this.continuationBusy = false;
    if (this.enemyTimer !== undefined) this.deps.scheduler.clearTimeout(this.enemyTimer);
    this.enemyTimer = undefined;
    this.enemyBusy = false;
    this.deps.clearPresentation();
  }
  dispose(): void {
    this.disposed = true;
    this.clear();
    this.deps.motion.removeEventListener('change', this.onMotion);
    this.deps.visibility.removeEventListener('visibilitychange', this.onVisibility);
  }
}
