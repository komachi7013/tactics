import {describe,expect,it} from 'vitest';
import {createPartyBattle} from '../src/party';
import {defaultParty} from '../src/progression';
import {createJobs} from '../src/jobs';
import {createCombatRandomConfig} from '../src/domain/combatRandom';
import {getEnemyDecisionSnapshot} from '../src/domain/ai';
import {attackPreview} from '../src/domain/engine';
import {readOrderRows} from '../src/view/readOrder';

describe('probabilistic read-order information',()=>{
 it('uses the shared candidate position and preview without drawing or exposing the result',()=>{
  const s=createPartyBattle('B01',defaultParty('B01'),createJobs(),1,{combat:createCombatRandomConfig()});
  s.units.find(u=>u.id==='ally-lise')!.pos={x:4,y:5};
  const enemy=s.units.find(u=>u.id==='enemy-melee-01')!;s.readOrders=[enemy.id];
  const snapshot=getEnemyDecisionSnapshot(s),intent=snapshot.byActor[enemy.id];
  expect(intent.action).toBe('attack');
  const projected={...s,units:s.units.map(u=>u.id===enemy.id?{...u,pos:intent.destination}:u)};
  const p=attackPreview(projected,enemy.id,intent.targetId!);expect(p.legal).toBe(true);
  const before=JSON.stringify(s);
  for(let i=0;i<5;i++){
   const row=readOrderRows(s,snapshot)[0];
   expect(row.detail).toContain(`命中率${p.hitChance}%・命中時${p.damage}ダメージ（外れ時0）`);
   expect(row.detail).not.toContain(String(s.combatRandom!.state));
  }
  expect(JSON.stringify(s)).toBe(before);expect(s.combatRandom!.draws).toBe(0);expect(s.lastAttack).toBeUndefined();
 });
 it('retains the former fixed-damage label for explicit legacy oracles',()=>{
  const s=createPartyBattle('B01',defaultParty('B01'),createJobs());
  const enemy=s.units.find(u=>u.team==='enemy')!,ally=s.units.find(u=>u.team==='player')!;s.readOrders=[enemy.id];
  const intent={actorId:enemy.id,destination:enemy.pos,path:[],targetId:ally.id,damage:5,action:'attack' as const,moveCost:0};
  expect(readOrderRows(s,{byActor:{[enemy.id]:intent},next:intent})[0].detail).toContain('現在の予測 5 ダメージ');
  expect(s.combatRandom).toBeUndefined();
 });
});
