import {describe,it,expect} from 'vitest';
import {createCampaign,completeBattle,selectBattle,readCampaign,CAMPAIGN_KEY} from '../src/campaign';
import {createPartyBattle} from '../src/party';
import {defaultParty} from '../src/progression';
import {reduce} from '../src/domain/engine';
import {runEnemyActivationWithTrace} from '../src/domain/ai';
import type {BattleState,Command} from '../src/domain/types';
import b01 from './fixtures/progression-v2/b01-route.json';
import roots from './fixtures/expanded-b02-roots.json';
function replay(s:BattleState,commands:Command[]){for(const c of commands){const r=reduce(s,c);expect(r.error,JSON.stringify(c)).toBeUndefined();s=r.state;while(s.phase==='playing'&&s.turn==='enemy')s=runEnemyActivationWithTrace(s).state;}return s;}
function earned(){const c=createCampaign(),s=replay(createPartyBattle('B01',defaultParty('B01'),c.jobs,1,{equipment:c.equipment}),b01.commands as Command[]);expect(s.phase).toBe('won');return selectBattle(completeBattle(c,s),'B02');}
describe('expanded adopted B02 runtime contracts',()=>{
 it.each(roots)('wins the long bridge and optional chest against real AI at root $root',r=>{const c=earned(),s=createPartyBattle('B02',defaultParty('B02'),c.jobs,1,{equipment:c.equipment,combat:{version:1,rootSeed:r.root}}),won=replay(s,r.commands as Command[]);expect(won.phase).toBe('won');expect(won.round).toBe(r.round);expect(won.records).toEqual(['O']);expect(won.pendingEquipment).toEqual(['chest:B02']);expect(won.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])).toEqual(r.playerHp);expect(completeBattle(c,won).unlocked).toContain('B03');});
 it.each([1,2,3,4])('reads v%s without writes and restarts B02 on the registered map',version=>{
  const c=earned();c.combat={version:1,rootSeed:123456789};
  const rawObject=structuredClone(c) as unknown as Record<string,unknown>;rawObject.version=version;
  if(version<4)delete rawObject.combat;if(version<3)delete rawObject.equipment;
  if(version===1)for(const key of ['growth','jobs','parties'])delete rawObject[key];
  const raw=JSON.stringify(rawObject),calls:string[]=[];
  const loaded=readCampaign({getItem:key=>{expect(key).toBe(CAMPAIGN_KEY);calls.push('read');return raw},setItem:()=>{throw Error('migration write')},removeItem:()=>{throw Error('migration remove')}});
  expect(loaded.writable).toBe(true);expect(calls).toEqual(['read']);expect(loaded.campaign.completed).toEqual(['B01']);expect(loaded.campaign.evidence).toEqual(c.evidence);if(version===4)expect(loaded.campaign.combat).toEqual(c.combat);if(version>=3)expect(loaded.campaign.equipment).toEqual(c.equipment);
  const s=createPartyBattle('B02',defaultParty('B02'),loaded.campaign.jobs,1,{equipment:loaded.campaign.equipment,combat:loaded.campaign.combat});expect(s.cells).toHaveLength(99);expect(s.cells.filter(c=>c.bridge)).toHaveLength(18);expect(s.units.find(u=>u.id==='ally-lise')!.pos).toEqual({x:0,y:1});expect(s.combatRandom!.draws).toBe(0);expect(s.records).toEqual([]);expect(s.units.every(u=>u.hp===u.maxHp)).toBe(true);
 });
});
