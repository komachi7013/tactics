import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, getUnit } from '../src/domain/engine';
import { battleFlowHarness, MotionSignals } from './helpers/battleFlowHarness';

afterEach(() => vi.restoreAllMocks());

function attackHarness() {
  const state = createInitialState('B01');
  // Last allied and last enemy activation: preserve this timer-boundary test's scope.
  state.units.forEach(u=>u.acted=u.id!=='ally-lise'&&u.id!=='enemy-melee-01');
  getUnit(state, 'ally-lise')!.pos = { x: 2, y: 5 };
  getUnit(state, 'enemy-melee-01')!.pos = { x: 3, y: 5 };
  const h = battleFlowHarness(state);
  expect(h.submit({ type: 'start', unitId: 'ally-lise' })).toBe(true);
  return h;
}
describe('live battle continuation and event wiring', () => {
  it.each(['hidden', 'reduced-motion', 'manual'] as const)('%s cannot shorten an attack; its normal timer settles once and restores commands', event => {
    const h = attackHarness();
    expect(h.submit({ type: 'attack', targetId: 'enemy-melee-01' })).toBe(true);
    expect(h.pending().map(t => t.ms)).toEqual([400]);
    const old = h.pending()[0].id, committed = structuredClone(h.state());
    expect(h.flow.presentationBusy).toBe(true);
    expect(h.flow.canShortenPresentation).toBe(false);
    h.signals.visibility(false); h.signals.preference(false);
    expect(h.flow.presentationBusy).toBe(true);
    expect(h.flow.presentCommitted(null)).toBe(false);
    expect(h.submit({ type: 'end', facing: 'E' })).toBe(false);
    if (event === 'hidden') h.signals.visibility(true);
    else if (event === 'reduced-motion') h.signals.preference(true);
    else h.flow.finishNow();
    h.signals.visibility(true); h.signals.preference(true); h.flow.finishNow();
    expect(h.flow.presentationBusy).toBe(true);
    expect(h.pending().map(t => t.ms)).toEqual([400]);
    expect(h.submit({ type: 'end', facing: 'E' })).toBe(false);
    expect(h.state()).toEqual(committed);
    h.deliver(old); h.deliver(old);
    expect(h.state()).toEqual(committed);
    expect(h.flow.busy).toBe(false); expect(h.finish).not.toHaveBeenCalled();
    expect(h.runEnemy).not.toHaveBeenCalled(); expect(h.pending()).toEqual([]);
    expect(h.submit({ type: 'end', facing: 'E' })).toBe(true);
    expect(h.pending().map(t => t.ms)).toEqual([150]);
    h.flow.dispose();
  });
  it.each(['hidden', 'reduced-motion'] as const)('keeps full attack playback even when %s is already active', flag => {
    const h = attackHarness();
    if (flag === 'hidden') h.signals.visibility(true); else h.signals.preference(true);
    h.submit({ type: 'attack', targetId: 'enemy-melee-01' });
    expect(h.playPresentation).toHaveBeenCalledTimes(1); expect(h.flow.busy).toBe(true);
    expect(h.pending().map(t => t.ms)).toEqual([400]);
    h.flow.finishNow(); expect(h.flow.busy).toBe(true);
    h.deliver(h.pending()[0].id); expect(h.flow.busy).toBe(false);
    expect(h.state().activation.acted).toBe(true); expect(h.state().log.filter(l => l.includes('ダメージ'))).toHaveLength(1);
    h.flow.dispose();
  });
  it.each(['manual','hidden','reduced-motion'] as const)('preserves movement-only shortening after an attack is cleared: %s', event => {
    const h=attackHarness(); h.submit({type:'attack',targetId:'enemy-melee-01'});
    const attackTimer=h.pending()[0].id; h.flow.clear();
    const plan={moves:[{unitId:'ally-lise',path:[{x:2,y:5},{x:1,y:5}]}],moveDuration:180,attackDuration:0,durationMs:180};
    expect(h.flow.presentCommitted(plan)).toBe(true);
    expect(h.flow.canShortenPresentation).toBe(true);
    h.deliver(attackTimer); expect(h.flow.presentationBusy).toBe(true);
    if(event==='manual')h.flow.finishNow();else if(event==='hidden')h.signals.visibility(true);else h.signals.preference(true);
    expect(h.flow.presentationBusy).toBe(false);expect(h.pending()).toEqual([]);h.flow.dispose();
  });
  it.each(['hidden','reduced-motion'] as const)('preserves initially shortened movement-only plans for %s', event => {
    const h=attackHarness();if(event==='hidden')h.signals.visibility(true);else h.signals.preference(true);
    h.flow.presentCommitted({moves:[{unitId:'ally-lise',path:[{x:2,y:5},{x:1,y:5}]}],moveDuration:180,attackDuration:0,durationMs:180});
    expect(h.playPresentation).not.toHaveBeenCalled();expect(h.flow.busy).toBe(false);h.flow.dispose();
  });
  it('protects the complete mixed move/attack/escort timeline from every shortening request',()=>{
    const h=attackHarness();h.submit({type:'attack',targetId:'enemy-melee-01'});
    const attackPlan=h.playPresentation.mock.calls[0][0];h.flow.clear();
    const plan={...attackPlan,moves:[{unitId:'ally-lise',path:[{x:2,y:5},{x:3,y:5}]},{unitId:'escort-cart',path:[{x:1,y:4},{x:2,y:4}],afterAttack:true}],moveDuration:180,afterMoveDuration:180,durationMs:760};
    h.signals.preference(true);h.signals.visibility(true);expect(h.flow.presentCommitted(plan)).toBe(true);
    const timer=h.pending()[0].id,committed=structuredClone(h.state());
    expect(h.pending()[0].ms).toBe(760);expect(h.flow.canShortenPresentation).toBe(false);
    h.flow.finishNow();h.signals.preference(true);h.signals.visibility(true);
    expect(h.flow.presentationBusy).toBe(true);expect(h.state()).toEqual(committed);
    h.deliver(timer);expect(h.flow.busy).toBe(false);expect(h.state()).toEqual(committed);h.flow.dispose();
  });
  it.each(['normal', 'reduced-motion'] as const)('schedules a single %s enemy continuation and rejects stale timers after battle replacement', mode => {
    const h = attackHarness(); if (mode === 'reduced-motion') h.signals.preference(true);
    expect(h.submit({ type: 'end', facing: 'E' })).toBe(true);
    expect(h.pending().map(t => t.ms)).toEqual([mode === 'normal' ? 620 : 150]);
    expect(h.flow.busy).toBe(true); expect(h.submit({ type: 'start', unitId: 'ally-garan' })).toBe(false);
    const old = h.pending()[0].id;
    h.replace(createInitialState('B02')); const fresh = structuredClone(h.state());
    h.deliver(old);
    expect(h.runEnemy).not.toHaveBeenCalled(); expect(h.state()).toEqual(fresh);
    expect(h.finish).not.toHaveBeenCalled(); expect(h.pending()).toEqual([]);
    expect(h.flow.canDispatch(false)).toBe(true); h.flow.dispose();
  });
  it('a rendering exception settles once and the actual enemy activation follows only once', () => {
    const h = attackHarness(); h.playPresentation.mockImplementation(() => { throw Error('renderer unavailable'); });
    h.submit({ type: 'attack', targetId: 'enemy-melee-01' });
    const committed = structuredClone(h.state()), old = h.timers[0];
    expect(h.flow.busy).toBe(false); old.fn(); expect(h.state()).toEqual(committed);
    expect(h.submit({ type: 'end', facing: 'E' })).toBe(true);
    expect(h.pending().map(t => t.ms)).toEqual([620]);
    h.deliver(h.pending()[0].id);
    expect(h.runEnemy).toHaveBeenCalledTimes(1); expect(h.state().turn).toBe('player');
    expect(h.flow.busy).toBe(false); expect(h.pending()).toEqual([]); h.flow.dispose();
  });
  it('visibility and preference changes cannot duplicate an already pending enemy activation', () => {
    const h = attackHarness(); h.submit({ type: 'end', facing: 'E' });
    const enemy = h.pending()[0].id;
    h.signals.visibility(true); h.signals.preference(true); h.signals.preference(true);
    // A new preference does not retroactively replace an existing 620ms timer.
    expect(h.pending().map(t => t.ms)).toEqual([620]);
    h.deliver(enemy);
    expect(h.runEnemy).toHaveBeenCalledTimes(1); expect(h.state().turn).toBe('player');
    // This enemy committed an attack. A hidden/reduced-motion preference no
    // longer skips it, but natural completion must not schedule the AI twice.
    expect(h.pending().map(t=>t.ms)).toEqual([220]);
    const attackTimer=h.pending()[0].id,committed=structuredClone(h.state());
    h.signals.visibility(true);h.signals.preference(true);h.flow.finishNow();
    expect(h.flow.presentationBusy).toBe(true);expect(h.flow.canShortenPresentation).toBe(false);
    h.deliver(attackTimer);h.deliver(attackTimer);
    expect(h.state()).toEqual(committed);expect(h.runEnemy).toHaveBeenCalledTimes(1);
    expect(h.pending()).toEqual([]); h.flow.dispose();
  });
  it.each(['B01', 'B02'] as const)('an old enemy timer cannot release a new %s presentation after restart/switch', id => {
    const h = attackHarness(); h.submit({ type: 'end', facing: 'E' });
    const old = h.pending()[0].id, next = createInitialState(id);
    getUnit(next, 'ally-lise')!.pos = id==='B02'?{ x: 8, y: 1 }:{ x: 2, y: 5 }; getUnit(next, 'enemy-melee-01')!.pos = id==='B02'?{ x: 9, y: 1 }:{ x: 3, y: 5 };
    h.replace(next); h.submit({ type: 'start', unitId: 'ally-lise' }); h.submit({ type: 'attack', targetId: 'enemy-melee-01' });
    const current = h.pending()[0].id, committed = structuredClone(h.state());
    expect(h.pending()[0].ms).toBe(400); h.deliver(old);
    expect(h.state()).toEqual(committed); expect(h.flow.presentationBusy).toBe(true);
    expect(h.runEnemy).not.toHaveBeenCalled(); h.deliver(current);
    expect(h.flow.busy).toBe(false); h.flow.dispose();
  });
  it('disposal unregisters motion/visibility and cancels both presentation and enemy callbacks', () => {
    const added = vi.spyOn(MotionSignals.prototype, 'addEventListener');
    const removed = vi.spyOn(MotionSignals.prototype, 'removeEventListener');
    const h = attackHarness(); h.submit({ type: 'attack', targetId: 'enemy-melee-01' });
    const old = h.pending()[0].id; h.flow.dispose(); const clearCount = h.clearPresentation.mock.calls.length;
    expect(added.mock.calls.map(([type, listener]) => [type, listener])).toHaveLength(2);
    expect(removed.mock.calls.map(([type, listener]) => [type, listener])).toEqual(added.mock.calls.map(([type, listener]) => [type, listener]));
    h.signals.visibility(true); h.signals.preference(true); h.deliver(old);
    expect(h.clearPresentation).toHaveBeenCalledTimes(clearCount); expect(h.flow.canDispatch(false)).toBe(false);
    expect(h.finish).not.toHaveBeenCalled(); expect(h.runEnemy).not.toHaveBeenCalled();
  });
  it('dialog and non-battle screens do not accept rule commands', () => {
    const h = attackHarness(), before = structuredClone(h.state());
    h.dialog(true); expect(h.submit({ type: 'defend' })).toBe(false); h.dialog(false);
    h.active(false); expect(h.submit({ type: 'defend' })).toBe(false);
    expect(h.state()).toEqual(before); h.flow.dispose();
  });
});

describe('consecutive faction AI presentation',()=>{
 it.each(['normal','reduced-motion','hidden','manual']as const)('%s completes each enemy once and blocks commands until R2',mode=>{
  const h=battleFlowHarness(createInitialState());if(mode==='reduced-motion')h.signals.preference(true);if(mode==='hidden')h.signals.visibility(true);
  expect(h.submit({type:'endPlayerTurn'})).toBe(true);const actors:string[]=[];let guard=0;
  while(h.pending().length){expect(h.pending()).toHaveLength(1);expect(h.submit({type:'start',unitId:'ally-lise'})).toBe(false);const count=h.runEnemy.mock.calls.length;h.deliver(h.pending()[0].id);if(h.runEnemy.mock.calls.length>count){const acted=h.state().units.filter(u=>u.team==='enemy'&&u.acted).map(u=>u.id);if(h.state().round===1)for(const id of acted)if(!actors.includes(id))actors.push(id);}if(mode==='manual')h.flow.finishNow();expect(++guard).toBeLessThan(12);}
  expect(h.runEnemy).toHaveBeenCalledTimes(3);expect(h.state().round).toBe(2);expect(h.state().turn).toBe('player');expect(h.flow.busy).toBe(false);expect(h.finish).not.toHaveBeenCalled();h.flow.dispose();
 });
});
