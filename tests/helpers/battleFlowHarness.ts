import { vi } from 'vitest';
import { createInitialState, reduce } from '../../src/domain/engine';
import { runEnemyActivationWithTrace } from '../../src/domain/ai';
import type { BattleState, Command } from '../../src/domain/types';
import { BattleFlow } from '../../src/view/battleFlow';
import { createPresentation } from '../../src/view/presentation';
import { withDedicatedAttack } from '../../src/view/dedicatedAttack';

export class MotionSignals extends EventTarget {
  matches = false;
  hidden = false;
  preference(matches: boolean) { this.matches = matches; this.dispatchEvent(new Event('change')); }
  visibility(hidden: boolean) { this.hidden = hidden; this.dispatchEvent(new Event('visibilitychange')); }
}
export function battleFlowHarness(initial = createInitialState('B01'), onFinish: (state: BattleState) => void = () => {}) {
  let state = initial, active = true, dialog = false;
  const signals = new MotionSignals();
  const timers: { fn: () => void; ms: number; canceled: boolean; delivered: boolean }[] = [];
  const render = vi.fn(), clearPresentation = vi.fn(), playPresentation = vi.fn();
  const prepared = (before: BattleState, commands: readonly Command[]) => withDedicatedAttack(createPresentation(before, state, commands), state, () => true);
  const runEnemy = vi.fn(() => {
    const before = state, result = runEnemyActivationWithTrace(state);
    state = result.state;
    flow.presentCommitted(prepared(before, result.commands));
  });
  const finish = vi.fn(() => { flow.clear(); active = false; onFinish(state); });
  const flow = new BattleFlow({
    scheduler: {
      setTimeout(fn, ms) { timers.push({ fn, ms, canceled: false, delivered: false }); return timers.length - 1; },
      clearTimeout(id) { timers[id as number].canceled = true; },
    },
    motion: signals, visibility: signals,
    status: () => ({ active, phase: state.phase, turn: state.turn }),
    clearPresentation, playPresentation, render, finish, runEnemy,
  });
  return {
    flow, signals, timers, render, clearPresentation, playPresentation, finish, runEnemy,
    state: () => state,
    active: (value: boolean) => { active = value; },
    dialog: (value: boolean) => { dialog = value; },
    pending: () => timers.map((timer, id) => ({ ...timer, id })).filter(t => !t.canceled && !t.delivered),
    deliver(id: number) { timers[id].delivered = true; timers[id].fn(); },
    replace(next: BattleState) { flow.clear(); state = next; active = true; dialog = false; },
    submit(command: Command) {
      if (!flow.canDispatch(dialog)) return false;
      const before = state, result = reduce(state, command);
      if (result.error) return false;
      state = result.state;
      flow.presentCommitted(prepared(before, [command]));
      return true;
    },
  };
}
