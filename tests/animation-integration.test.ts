import route01 from './fixtures/progression-v2/b01-route.json';
import route02 from './fixtures/progression-v2/b02-route.json';
import route03 from './fixtures/progression-v2/b03-route.json';
import route04 from './fixtures/progression-v2/b04-route.json';
import route05 from './fixtures/progression-v2/b05-route.json';
import route06 from './fixtures/progression-v2/b06-route.json';
import route07 from './fixtures/progression-v2/b07-route.json';
import route08 from './fixtures/progression-v2/b08-route.json';
import route09 from './fixtures/progression-v2/b09-route.json';
import route10 from './fixtures/progression-v2/b10-route.json';
import route11 from './fixtures/progression-v2/b11-route.json';
import route12 from './fixtures/progression-v2/b12-route.json';
import { describe, expect, it } from 'vitest';
import { reduce } from '../src/domain/engine';
import { runEnemyActivationWithTrace } from '../src/domain/ai';
import { createPartyBattle } from '../src/party';
import { createCampaign, completeBattle, selectBattle } from '../src/campaign';
import { BATTLE_IDS, defaultParty, commonLevel } from '../src/progression';
import { createJobs } from '../src/jobs';
import { withDedicatedAttack } from '../src/view/dedicatedAttack';
import { createPresentation, samplePresentation } from '../src/view/presentation';
import { PlaybackGate } from '../src/view/playbackGate';
import type { BattleState, Command } from '../src/domain/types';
const routes = [route01,route02,route03,route04,route05,route06,route07,route08,route09,route10,route11,route12];
function clock() {
  const callbacks: (() => void)[] = [];
  const gate = new PlaybackGate({setTimeout: fn => { callbacks.push(fn); return callbacks.length; }, clearTimeout: () => {}});
  return { gate, callbacks };
}
describe('committed simulation and disposable presentation integration', () => {
  it('presents all twelve real-AI victories under delayed frames without changing any committed result', () => {
    let campaign = createCampaign(), plans = 0, attacks = 0, moves = 0, dedicated = 0;
    const {gate,callbacks} = clock();
    function present(before: BattleState, after: BattleState, commands: readonly Command[]) {
      const beforeSnapshot=structuredClone(before),afterSnapshot=structuredClone(after);
      const plan=withDedicatedAttack(createPresentation(before,after,commands),after,()=>true);
      if(plan) {
        plans++;dedicated+=Number(!!plan.attack?.bodyId);attacks+=Number(!!plan.attack);moves+=plan.moves.length;let settled=0;
        expect(gate.start(plan.durationMs,()=>{settled++;})).toBe(true);
        expect(gate.start(0,()=>{settled++;})).toBe(false);
        for(const elapsed of [0,plan.durationMs/2,plan.durationMs+60000]) {
          const frame=samplePresentation(plan,elapsed);
          for(const position of Object.values(frame.positions)) expect(Number.isFinite(position.t)).toBe(true);
        }
        const final=samplePresentation(plan,plan.durationMs+60000);expect(final.complete).toBe(true);
        for(const motion of plan.moves) expect(final.positions[motion.unitId].to).toEqual(motion.path.at(-1));
        const timer=callbacks.at(-1)!;gate.finishNow();timer();timer();expect(settled).toBe(1);expect(gate.busy).toBe(false);
      }
      expect(before).toEqual(beforeSnapshot);expect(after).toEqual(afterSnapshot);
    }
    for(const [index,id] of BATTLE_IDS.entries()) {
      campaign=selectBattle(campaign,id);let state=createPartyBattle(id,defaultParty(id),campaign.jobs,commonLevel(campaign.completed));
      for(const command of routes[index].commands as Command[]) {
        expect(gate.busy).toBe(false);const old=state,result=reduce(state,command);expect(result.error).toBeUndefined();state=result.state;present(old,state,[command]);
        let limit=0;while(state.phase==='playing'&&state.turn==='enemy') {
          expect(++limit).toBeLessThanOrEqual(10);const old=state,activation=runEnemyActivationWithTrace(state);state=activation.state;present(old,state,activation.commands);
        }
      }
      expect(state.phase).toBe('won');expect(state.round).toBe(routes[index].round);expect(state.records).toEqual(routes[index].records);
      expect(state.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])).toEqual(routes[index].playerHp);
      campaign=completeBattle(campaign,state);
    }
    expect(campaign.completed).toEqual(BATTLE_IDS);expect(dedicated).toBeGreaterThan(0);expect(plans).toBeGreaterThan(100);expect(attacks).toBeGreaterThan(20);expect(moves).toBeGreaterThan(50);
  });
  it('rejects a second command while presentation is busy and cannot revive an old scene on late completion', () => {
    const {gate,callbacks}=clock();let state=createPartyBattle('B01',defaultParty('B01'),createJobs()),commits=0,settled=0;
    function submit(command:Command) {
      if(gate.busy)return false;
      const previous=state,result=reduce(state,command);if(result.error)return false;state=result.state;commits++;
      const plan=createPresentation(previous,state,[command]);if(plan)gate.start(plan.durationMs,()=>{settled++;});return true;
    }
    expect(submit({type:'start',unitId:'ally-lise'})).toBe(true);
    expect(submit({type:'move',to:{x:1,y:5}})).toBe(true);
    const committed=structuredClone(state);expect(submit({type:'end',facing:'E'})).toBe(false);expect(state).toEqual(committed);expect(commits).toBe(2);
    const oldTimer=callbacks[0];gate.cancel();state=createPartyBattle('B02',defaultParty('B02'),createJobs());const replacement=structuredClone(state);
    oldTimer();expect(settled).toBe(0);expect(state).toEqual(replacement);expect(gate.busy).toBe(false);
    expect(submit({type:'start',unitId:'ally-garan'})).toBe(true);expect(submit({type:'move',to:{x:2,y:1}})).toBe(true);
    oldTimer();expect(gate.busy).toBe(true);gate.finishNow();callbacks.at(-1)!();expect(settled).toBe(1);expect(gate.busy).toBe(false);expect(commits).toBe(4);
  });
});
