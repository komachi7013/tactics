import { describe, expect, it } from 'vitest';
import { attackPreview, createInitialState, getCell, getUnit, jobCommandPreview, reduce } from '../src/domain/engine';
import { runEnemyActivation } from '../src/domain/ai';
import type { BattleState, Command } from '../src/domain/types';
const actor='ally-lise',target='ally-garan',enemy='enemy-melee-01';
function fixture(kind:'survey'|'protect'='survey'):BattleState {
 const s=createInitialState();s.cells.forEach(c=>{c.height=0;c.blocked=false;c.shallow=false;});
 getUnit(s,actor)!.pos={x:1,y:1};getUnit(s,actor)!.jobCommand=kind;getUnit(s,actor)!.surveyCharges=2;
 getUnit(s,target)!.pos={x:2,y:1};getUnit(s,enemy)!.pos={x:3,y:1};getUnit(s,enemy)!.facing='W';
 return reduce(s,{type:'start',unitId:actor}).state;
}
function apply(s:BattleState,cmd:Command):BattleState {const r=reduce(s,cmd);expect(r.error).toBeUndefined();return r.state;}
function rejected(s:BattleState,kind:'survey'|'protect'='survey',id=target){const before=structuredClone(s);expect(jobCommandPreview(s,actor,id,kind).legal).toBe(false);const r=reduce(s,{type:kind,targetId:id});expect(r.error).toBeTruthy();expect(r.state).toBe(s);expect(s).toEqual(before);}
describe('main-job commands',()=>{
 it('survey costs one action and one charge, clones input, adds 2 only to next legal attack',()=>{
  const s=fixture(),before=structuredClone(s);const n=apply(s,{type:'survey',targetId:target});expect(s).toEqual(before);expect(n.activation.acted).toBe(true);expect(getUnit(n,actor)!.surveyCharges).toBe(1);expect(getUnit(n,target)!.surveyBonus).toBe(true);
  const p=attackPreview(s,target,enemy);expect(attackPreview(n,target,enemy).damage).toBe(p.damage+2);
  const ready={...n,activeId:target,activation:{moved:false,acted:false,moveOrigin:null}};
  expect(reduce(ready,{type:'attack',targetId:actor}).error).toBeTruthy();expect(getUnit(ready,target)!.surveyBonus).toBe(true);
  const hit=apply(ready,{type:'attack',targetId:enemy});expect(getUnit(hit,target)!.surveyBonus).toBeUndefined();expect(getUnit(hit,enemy)!.hp).toBe(getUnit(ready,enemy)!.hp-p.damage-2);
 });
 it.each(['ended','enemy-turn','inactive','acted','activation-acted','wrong-job','dead-actor','escort-actor','no-charges','missing-charges'] as const)('rejects invalid actor state %s without mutation',condition=>{
  const s=fixture();switch(condition){case'ended':s.phase='won';break;case'enemy-turn':s.turn='enemy';break;case'inactive':s.activeId=null;break;case'acted':getUnit(s,actor)!.acted=true;break;case'activation-acted':s.activation.acted=true;break;case'wrong-job':getUnit(s,actor)!.jobCommand='protect';break;case'dead-actor':getUnit(s,actor)!.hp=0;break;case'escort-actor':getUnit(s,actor)!.kind='escort';break;case'no-charges':getUnit(s,actor)!.surveyCharges=0;break;case'missing-charges':delete getUnit(s,actor)!.surveyCharges;break;}rejected(s);
 });
 it.each(['self','enemy','unknown','dead','npc','distance','blocked-los','duplicate','outside'] as const)('rejects invalid survey target %s',condition=>{
  const s=fixture();let id=target;switch(condition){case'self':id=actor;break;case'enemy':id=enemy;break;case'unknown':id='missing';break;case'dead':getUnit(s,target)!.hp=0;break;case'npc':getUnit(s,target)!.kind='escort';break;case'distance':getUnit(s,target)!.pos={x:5,y:1};break;case'blocked-los':getUnit(s,target)!.pos={x:3,y:1};getCell(s,{x:2,y:1})!.height=2;break;case'duplicate':getUnit(s,target)!.surveyBonus=true;break;case'outside':getUnit(s,target)!.pos={x:20,y:1};break;}rejected(s,'survey',id);
 });
 it('survey allows exactly two uses across activations and rejects a third without spending action',()=>{
  let s=fixture();for(let i=0;i<2;i++){
   s=apply(s,{type:'survey',targetId:target});expect(getUnit(s,actor)!.surveyCharges).toBe(1-i);
   delete getUnit(s,target)!.surveyBonus;s.activeId=actor;s.activation={moved:false,acted:false,moveOrigin:null};
  }rejected(s);expect(s.activation.acted).toBe(false);
 });
 it('survey survives movement, defend, and end until a normal attack',()=>{
  let s=apply(fixture(),{type:'survey',targetId:target});s.activeId=target;s.activation={moved:false,acted:false,moveOrigin:null};
  s=apply(s,{type:'move',to:{x:2,y:2}});s=apply(s,{type:'defend'});s=apply(s,{type:'end',facing:'N'});expect(getUnit(s,target)!.surveyBonus).toBe(true);
 });
 it('protect accepts height difference one and an invalid source activation preserves it',()=>{
  const s=fixture('protect');getCell(s,getUnit(s,target)!.pos)!.height=1;
  const n=apply(s,{type:'protect',targetId:target});expect(reduce(n,{type:'start',unitId:actor}).error).toBeTruthy();expect(getUnit(n,target)!.protection).toEqual({sourceId:actor});
 });
 it('survey accepts boundary range 3 with clear LOS, not a height-difference cap',()=>{const s=fixture();getUnit(s,target)!.pos={x:4,y:1};getCell(s,getUnit(s,target)!.pos)!.height=2;expect(jobCommandPreview(s,actor,target,'survey').legal).toBe(true);});
 it('protect consumes action without charges and accepts escorts',()=>{const s=fixture('protect');getUnit(s,target)!.kind='escort';const n=apply(s,{type:'protect',targetId:target});expect(getUnit(n,target)!.protection).toEqual({sourceId:actor});expect(getUnit(n,actor)!.surveyCharges).toBe(2);expect(n.activation.acted).toBe(true);});
 it.each(['distance','height','duplicate','self','enemy','dead','wrong-job','action-spent'] as const)('rejects invalid protect %s',condition=>{const s=fixture('protect');let id=target;switch(condition){case'distance':getUnit(s,target)!.pos={x:3,y:1};break;case'height':getCell(s,getUnit(s,target)!.pos)!.height=2;break;case'duplicate':getUnit(s,target)!.protection={sourceId:actor};break;case'self':id=actor;break;case'enemy':id=enemy;break;case'dead':getUnit(s,target)!.hp=0;break;case'wrong-job':getUnit(s,actor)!.jobCommand='survey';break;case'action-spent':s.activation.acted=true;break;}rejected(s,'protect',id);});
 it('protection uses max with defend and consumes only on a legal received attack',()=>{
  let s=apply(fixture('protect'),{type:'protect',targetId:target});const baseline=structuredClone(s);delete getUnit(baseline,target)!.protection;
  const damage=attackPreview(baseline,enemy,target).damage;expect(attackPreview(s,enemy,target).damage).toBe(damage-2);getUnit(s,target)!.guard=true;expect(attackPreview(s,enemy,target).damage).toBe(damage-2);
  s={...s,turn:'enemy',activeId:enemy,activation:{moved:false,acted:false,moveOrigin:null}};
  const miss=reduce(s,{type:'attack',targetId:actor});expect(miss.error).toBeTruthy();expect(getUnit(s,target)!.protection).toBeDefined();
  const hit=apply(s,{type:'attack',targetId:target});expect(getUnit(hit,target)!.protection).toBeUndefined();expect(getUnit(hit,target)!.guard).toBe(true);
 });
 it('expires on source next activation, but not target activation or source end',()=>{
  const s=apply(fixture('protect'),{type:'protect',targetId:target});let ended=apply(s,{type:'end',facing:'E'});expect(getUnit(ended,target)!.protection).toBeDefined();
  ended.turn='player';ended=apply(ended,{type:'start',unitId:target});expect(getUnit(ended,target)!.protection).toBeDefined();ended=apply(ended,{type:'end',facing:'E'});ended.turn='player';getUnit(ended,actor)!.acted=false;
  const again=apply(ended,{type:'start',unitId:actor});expect(getUnit(again,target)!.protection).toBeUndefined();
 });
 it('source evacuation immediately removes every protection it supplied',()=>{
  let s=apply(fixture('protect'),{type:'protect',targetId:target});getUnit(s,actor)!.hp=1;getUnit(s,enemy)!.pos={x:1,y:2};s={...s,turn:'enemy',activeId:enemy,activation:{moved:false,acted:false,moveOrigin:null}};
  const n=apply(s,{type:'attack',targetId:actor});expect(getUnit(n,target)!.protection).toBeUndefined();expect(getUnit(n,actor)!.hp).toBe(0);
 });
 it('target evacuation removes both buffs and damage has a minimum of one',()=>{let s=fixture();getUnit(s,target)!.surveyBonus=true;getUnit(s,target)!.protection={sourceId:actor};getUnit(s,target)!.hp=1;getUnit(s,target)!.def=999;s={...s,turn:'enemy',activeId:enemy};expect(attackPreview(s,enemy,target).damage).toBe(1);const n=apply(s,{type:'attack',targetId:target});expect(getUnit(n,target)!.protection).toBeUndefined();expect(getUnit(n,target)!.surveyBonus).toBeUndefined();});
 it('enemy AI scores protection through attackPreview and does not use ally commands',()=>{const s=fixture('protect');s.activeId=null;s.turn='enemy';s.units=s.units.filter(u=>[actor,target,enemy].includes(u.id));getUnit(s,actor)!.pos={x:3,y:2};getUnit(s,enemy)!.move=0;getUnit(s,actor)!.def=0;getUnit(s,target)!.def=0;getUnit(s,actor)!.protection={sourceId:target};const hp=getUnit(s,target)!.hp;const n=runEnemyActivation(s);expect(getUnit(n,target)!.hp).toBeLessThan(hp);expect(n.log.some(l=>l.includes('が')&&(l.includes('へ測線')||l.includes('を護衛')))).toBe(false);});
 it('fresh battle does not carry transient buffs or charges from previous state',()=>{const s=apply(fixture(),{type:'survey',targetId:target});const fresh=createInitialState();expect(getUnit(s,target)!.surveyBonus).toBe(true);expect(fresh.units.every(u=>!u.surveyBonus&&!u.protection&&u.surveyCharges===undefined)).toBe(true);});
});
