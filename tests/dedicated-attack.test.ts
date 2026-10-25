import { describe, expect, it } from 'vitest';
import { createInitialState, reduce } from '../src/domain/engine';
import { createPresentation, samplePresentation } from '../src/view/presentation';
import { ATTACK_BODIES, dedicatedAttackFrame, withDedicatedAttack } from '../src/view/dedicatedAttack';
import { PlaybackGate } from '../src/view/playbackGate';

function committed(id = 'ally-lise') {
  let state = createInitialState('B01');
  const actor = state.units.find(u => u.id === id)!;
  actor.pos = { x: 2, y: 5 };
  const target = state.units.find(u => u.id === 'enemy-melee-01')!;
  target.pos = { x: id === 'ally-neia' ? 4 : 3, y: 5 };
  state = reduce(state, { type: 'start', unitId: id }).state;
  const result = reduce(state, { type: 'attack', targetId: target.id });
  expect(result.error).toBeUndefined();
  return { state: result.state, before: state, plan: createPresentation(state, result.state, [{ type: 'attack', targetId: target.id }])! };
}
describe('limited dedicated attacks', () => {
  it.each(['ally-lise', 'ally-neia'])('selects only the loaded standard %s body, without changing a committed result', id => {
    const { state, before, plan } = committed(id), frozen = JSON.stringify({ before, state, plan });
    const dedicated = withDedicatedAttack(plan, state, () => true)!;
    expect(dedicated.attackDuration).toBe(400); expect(dedicated.durationMs).toBe(400); expect(dedicated.attack!.bodyId).toBeDefined();
    expect(JSON.stringify({ before, state, plan })).toBe(frozen);
    expect(withDedicatedAttack(plan, state, () => false)).toBe(plan);
    const fallback = (patch: object) => { const copy = structuredClone(state); Object.assign(copy.units.find(u => u.id === id)!, patch); expect(withDedicatedAttack(plan, copy, () => true)).toBe(plan); };
    fallback({ role: '堤防衛士' }); fallback({ weapon: id === 'ally-lise' ? 'bow' : 'melee' });
    for (const pos of [{ ...plan.attack!.targetBefore.pos }, { x: 2, y: 4 }, { x: 2, y: 6 }]) fallback({ pos });
    expect(withDedicatedAttack({ ...plan, attack: { ...plan.attack!, actorId: 'ally-garan' } }, state, () => true)!.attackDuration).toBe(220);
  });
  it('samples each 100ms phase and restores idle at400 or on delayed frames, with unchanged turn/HP', () => {
    const { plan, state } = committed(), frozen = structuredClone(state), p = withDedicatedAttack(plan, state, () => true)!;
    for (const [ms, frame] of [[0,0],[99,0],[100,1],[199,1],[200,2],[299,2],[300,3],[399,3],[400,null],[9000,null]] as const) expect(dedicatedAttackFrame(samplePresentation(p, ms).attackProgress)).toBe(frame);
    expect(dedicatedAttackFrame(null)).toBeNull(); expect(dedicatedAttackFrame(NaN)).toBeNull();
    expect(state).toEqual(frozen);
  });
  it('retains approach/400ms attack/following escort order in the same gate duration', () => {
    const { state, plan } = committed(); const p = withDedicatedAttack({ ...plan, moveDuration: 110, afterMoveDuration: 220, durationMs: 550 }, state, () => true)!;
    expect(p.durationMs).toBe(730); expect(samplePresentation(p, 109).attackProgress).toBeNull();
    expect(dedicatedAttackFrame(samplePresentation(p, 110).attackProgress)).toBe(0);
    expect(dedicatedAttackFrame(samplePresentation(p, 510).attackProgress)).toBeNull();
    expect(samplePresentation(p, 729).complete).toBe(false); expect(samplePresentation(p, 730).complete).toBe(true);
  });
  it('locks the entire400ms, shortens once, and rejects stale cancellation completions', () => {
    const { plan, state } = committed(); const p = withDedicatedAttack(plan, state, () => true)!;
    let timeout = 0, finish = () => {}, settled = 0;
    const gate = new PlaybackGate({ setTimeout: (fn, ms) => { finish = fn; timeout = ms; return 1; }, clearTimeout: () => {} });
    gate.start(p.durationMs, () => settled++); expect(timeout).toBe(400); expect(gate.busy).toBe(true); expect(gate.start(220, () => settled++)).toBe(false);
    const old = finish; gate.finishNow(); old(); expect(settled).toBe(1); expect(gate.busy).toBe(false);
    gate.start(400, () => settled++); const canceled = finish; gate.cancel(); canceled(); expect(settled).toBe(1); expect(gate.busy).toBe(false);
  });
});


describe('cardinal direction isolation', () => {
  it.each(Object.keys(ATTACK_BODIES) as (keyof typeof ATTACK_BODIES)[])('selects precisely %s from committed geometry, independent of idle facing', id => {
    const body = ATTACK_BODIES[id], { state, plan } = committed(body.actorId);
    const actor = state.units.find(u => u.id === body.actorId)!;
    actor.facing = body.direction === 'N' ? 'S' : 'N';
    const vectors = { N: [0,-1], E: [1,0], S: [0,1], W: [-1,0] } as const;
    const [dx,dy] = vectors[body.direction], distance = body.weapon === 'bow' ? 2 : 1;
    const directional = { ...plan, attack: { ...plan.attack!, targetBefore: { ...plan.attack!.targetBefore, pos: { x: actor.pos.x + dx * distance, y: actor.pos.y + dy * distance } } } };
    const frozen = JSON.stringify({state,directional});
    expect(withDedicatedAttack(directional,state,readyId => readyId === id)!.attack!.bodyId).toBe(id);
    expect(withDedicatedAttack(directional,state,readyId => readyId !== id)).toBe(directional);
    for (const [x,y] of [[1,1],[1,-1],[-1,1],[-1,-1],[0,0]]) {
      const fallback = { ...directional, attack: { ...directional.attack, targetBefore: { ...directional.attack.targetBefore, pos: { x: actor.pos.x+x, y: actor.pos.y+y } } } };
      expect(withDedicatedAttack(fallback,state,() => true)).toBe(fallback);
    }
    for (const patch of [{role:'堤防衛士'},{weapon:body.weapon === 'bow' ? 'melee' : 'bow'}]) {
      const other = structuredClone(state); Object.assign(other.units.find(u=>u.id===body.actorId)!,patch);
      expect(withDedicatedAttack(directional,other,()=>true)).toBe(directional);
    }
    for (const otherId of state.units.filter(u=>u.id!==body.actorId).map(u=>u.id)) {
      const other = { ...directional, attack: { ...directional.attack, actorId:otherId } };
      expect(withDedicatedAttack(other,state,()=>true)).toBe(other);
    }
    expect(JSON.stringify({state,directional})).toBe(frozen);
    const wrongWeapon = { ...directional, attack: { ...directional.attack, weapon: body.weapon === 'bow' ? 'melee' as const : 'bow' as const } };
    expect(withDedicatedAttack(wrongWeapon,state,() => true)).toBe(wrongWeapon);
  });
});
