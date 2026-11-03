import {describe,it,expect} from 'vitest';
import {createInitialState,reduce} from '../src/domain/engine';
import {runEnemyActivation} from '../src/domain/ai';
import {createPartyBattle} from '../src/party';
import {defaultParty} from '../src/progression';
import {createJobs} from '../src/jobs';
import {createCombatRandomConfig} from '../src/domain/combatRandom';
import {BATTLE_DIALOGUES,BattleDialogueJournal} from '../src/view/battleDialogues';
import type {BattleId,Command} from '../src/domain/types';
import b01 from './fixtures/routes.json';
import b02 from './fixtures/defend-cooldown-v1/b02-route.json';
import b03 from './fixtures/manual-cart-v1/b03-route.json';
import b04 from './fixtures/defend-cooldown-v1/b04-route.json';
import b05 from './fixtures/defend-cooldown-v1/b05-route.json';
import b06 from './fixtures/defend-cooldown-v1/b06-route.json';
import b07 from './fixtures/defend-cooldown-v1/b07-route.json';
import b08 from './fixtures/defend-cooldown-v1/b08-route.json';
import b09 from './fixtures/defend-cooldown-v1/b09-route.json';
import b10 from './fixtures/defend-cooldown-v1/b10-route.json';
import b11 from './fixtures/defend-cooldown-v1/b11-route.json';
import b12 from './fixtures/b12-fixed-role-friendly-pass-route.json';
const routes={B01:b01.gate.commands,B02:b02.commands,B03:b03.commands,B04:b04.commands,B05:b05.optional.commands,B06:b06.victory.commands,B07:b07.victory.commands,B08:b08.victory.commands,B09:b09.victory.commands,B10:b10.victory.commands,B11:b11.victory.commands,B12:b12.victory.commands};
describe('dialogue reachability through existing legal command routes and unchanged AI (not browser play)',()=>{
 for(const id of Object.keys(routes) as BattleId[]){it(id,()=>{
  let state=id==='B12'?createPartyBattle(id,defaultParty(id),createJobs(),b12.setup.commonLevel,{combat:createCombatRandomConfig()}):createInitialState(id);
  const journal=new BattleDialogueJournal(id);const emitted:string[]=[];
  const observe=(before:typeof state)=>{journal.observe(before,state);emitted.push(...journal.drain().map(row=>row.id));};
  for(const command of routes[id] as Command[]){const before=state;const result=reduce(state,command);expect(result.error,JSON.stringify(command)).toBeUndefined();state=result.state;observe(before);
   let budget=3;while(state.phase==='playing'&&state.turn==='enemy'){if(--budget<0)throw Error('AI stalled');const prior=state;state=runEnemyActivation(state);observe(prior);}
  }
  expect(state.phase).toBe('won');expect(new Set(emitted).size).toBe(emitted.length);
  // Every authored trigger for this route must be a genuinely reachable rule fact.
  expect(emitted.sort()).toEqual(BATTLE_DIALOGUES.filter(row=>row.battleId===id).map(row=>id+':'+row.key).sort());
 },15000);}
});
