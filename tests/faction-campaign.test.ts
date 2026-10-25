import {describe,it,expect} from 'vitest';
import {createCampaign,completeBattle,selectBattle,readCampaign,writeCampaign} from '../src/campaign';
import {createPartyBattle} from '../src/party';
import {BATTLE_IDS,commonLevel,defaultParty} from '../src/progression';
import {reduce} from '../src/domain/engine';
import {runEnemyActivationWithTrace} from '../src/domain/ai';
import type {Command} from '../src/domain/types';
import b01 from './fixtures/expanded-b01-roots.json';
import b02 from './fixtures/expanded-b02-roots.json';
import b03 from './fixtures/expanded-b03-roots.json';
import b04 from './fixtures/expanded-b04-roots.json';
import b05 from './fixtures/expanded-b05-roots.json';
import b06 from './fixtures/expanded-b06-roots.json';
import b07 from './fixtures/expanded-b07-roots.json';
import b08 from './fixtures/expanded-b08-roots.json';
import b09 from './fixtures/expanded-b09-roots.json';
import b10 from './fixtures/expanded-b10-roots.json';
import b11 from './fixtures/expanded-b11-roots.json';
import b12 from './fixtures/expanded-b12-roots.json';
const fixtures=[b01,b02,b03,b04,b05,b06,b07,b08.results,b09.results,b10.results,b11.results,b12.results];
describe('faction turn twelve-stage v4 campaign with actual AI',()=>{
 it.each([1835626289,0,1,4294967295])('wins all twelve with unchanged deadlines and reloads every checkpoint at root %s',root=>{
  let campaign=createCampaign();campaign.combat={version:1,rootSeed:root};let raw:string|null=null;
  const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v},removeItem:()=>{raw=null}},results=[];
  // Load a valid initial v4 fixture so the replay root is tracked, never overwritten by save.
  raw=JSON.stringify(campaign);campaign=readCampaign(storage).campaign;
  for(const [index,id]of BATTLE_IDS.entries()){
   campaign=selectBattle(campaign,id);const route=fixtures[index].find(r=>r.root===root)!;
   let s=createPartyBattle(id,defaultParty(id),campaign.jobs,commonLevel(campaign.completed),{equipment:campaign.equipment,combat:campaign.combat});
   for(const command of route.commands as Command[]){expect(s.turn).toBe('player');expect(s.phase).toBe('playing');const r=reduce(s,command);expect(r.error,`${id} ${JSON.stringify(command)}`).toBeUndefined();s=r.state;let n=0;while(s.turn==='enemy'&&s.phase==='playing'){expect(++n).toBeLessThanOrEqual(3);const next=runEnemyActivationWithTrace(s);expect(next.state).not.toBe(s);s=next.state;}}
   expect(s.phase).toBe('won');expect(s.round).toBe(route.round);expect(s.units.filter(u=>u.team==='player').map(u=>[u.id,u.hp])).toEqual(route.playerHp);
   campaign=completeBattle(campaign,s);expect(writeCampaign(storage,campaign).ok).toBe(true);const loaded=readCampaign(storage);expect(loaded.warning).toBeNull();expect(loaded.campaign.completed).toEqual(BATTLE_IDS.slice(0,index+1));expect(loaded.campaign.combat).toEqual({version:1,rootSeed:root});campaign=loaded.campaign;
   results.push({battle:id,round:s.round,hp:route.playerHp});
  }
  expect(campaign.completed).toEqual(BATTLE_IDS);console.log('FACTION_CAMPAIGN '+JSON.stringify({root,results}));
 });
});
