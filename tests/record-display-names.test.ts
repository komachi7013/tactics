import {describe,it,expect} from 'vitest';
import {BATTLE_IDS,defaultParty} from '../src/progression';
import {createPartyBattle} from '../src/party';
import {getBattleConfig} from '../src/domain/battles';
import {mapObjectPlacements} from '../src/view/mapObjectAssets';
import {cellInspection} from '../src/view/cellInspection';
import {battleObjectiveCopy} from '../src/view/battleObjectiveCopy';
describe('record names without implementation IDs',()=>{
 it.each(BATTLE_IDS)('%s keeps IDs in rules but excludes them from item labels',id=>{
  const s=createPartyBattle(id,defaultParty(id)),config=getBattleConfig(id);
  for(const r of config.records){
   expect(r.id).toBeTruthy();expect(r.name).not.toMatch(/[A-Z]/);
   expect(cellInspection(s,r).title).not.toMatch(/[A-Z]/);
  }
  for(const p of mapObjectPlacements(s).filter(p=>p.kind==='record'))expect(p.label).not.toMatch(/[A-Z]/);
  for(const r of battleObjectiveCopy(id).records)expect(r.marker).toBe(r.name);
 });
});
