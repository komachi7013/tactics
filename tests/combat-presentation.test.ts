// Animation unit fixtures supply their own ready material port; asynchronous stage IO is tested separately.
vi.mock('../src/view/landscapeAssets',()=>({landscapeMaterials:()=>[],prepareLandscape:()=>{},releaseLandscape:()=>{}}));
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {},
  Geom: { Point: class { constructor(public x: number, public y: number) {} }, Polygon: Object.assign(class {}, { Contains: () => true }) },
} }));
import { createInitialState, getUnit, reduce } from '../src/domain/engine';
import { nextCombatRoll } from '../src/domain/combatRandom';
import type { BattleState, Command } from '../src/domain/types';
import { committedAttackResolution, createPresentation, samplePresentation } from '../src/view/presentation';
import { withDedicatedAttack } from '../src/view/dedicatedAttack';
import { BoardScene } from '../src/view/BoardScene';
import { soundForTransition } from '../src/audio-events';
import { PlaybackGate } from '../src/view/playbackGate';

function attackCase(hit: boolean, lethal = false, weapon: 'melee'|'bow' = 'melee') {
  let before = createInitialState('B01');
  before.cells.forEach(c => { c.height = 0; c.blocked = false; c.shallow = false; });
  before.units = before.units.filter(u => u.id === 'ally-lise' || u.id === 'enemy-melee-01');
  const actor=getUnit(before,'ally-lise')!,target=getUnit(before,'enemy-melee-01')!;
  actor.pos={x:4,y:5};actor.weapon=weapon;target.pos={x:weapon==='melee'?5:6,y:5};target.facing='W';
  if(lethal)target.hp=1;
  let state=0;while((nextCombatRoll({version:1,state,draws:0}).roll<.9)!==hit)state++;
  before.combatRandom={version:1,state,draws:0};
  before=reduce(before,{type:'start',unitId:actor.id}).state;
  const command:Command={type:'attack',targetId:target.id}, result=reduce(before,command);
  expect(result.error).toBeUndefined();expect(result.state.lastAttack!.hit).toBe(hit);
  return {before,after:result.state,command};
}

class DisplayObject {
  x=0;y=0;alpha=1;visible=true;destroyed=false;children:DisplayObject[]=[];
  constructor(public value='',x=0,y=0){this.x=x;this.y=y;}
  add(child:DisplayObject){this.children.push(child);return this;}
  destroy(recursive?:boolean){this.destroyed=true;if(recursive)this.children.forEach(x=>x.destroy(true));}
  setPosition(x:number,y:number){this.x=x;this.y=y;return this;}
  setAlpha(n:number){this.alpha=n;return this;}
  setVisible(v:boolean){this.visible=v;return this;}
  setOrigin(){return this;} setDisplaySize(){return this;} setInteractive(){return this;} setTexture(){return this;}
  setRotation(){return this;}setScale(){return this;}on(){return this;}
  fillStyle(){return this;}fillPoints(){return this;}lineStyle(){return this;}strokePoints(){return this;}
  lineBetween(){return this;}fillRect(){return this;}fillRoundedRect(){return this;}fillCircle(){return this;}
  fillEllipse(){return this;}strokeEllipse(){return this;}strokeRect(){return this;}
}
function sceneHarness(state:BattleState){
  let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
  const labels:DisplayObject[]=[],errors:string[]=[];
  const scene=new BoardScene(()=>{},r=>{if(r.error)errors.push(r.error);});
  Object.assign(scene,{sys:{isActive:()=>true},scale:{width:1000,height:650},textures:{exists:()=>false},add:{
    container:(x:number,y:number)=>new DisplayObject('',x,y),graphics:()=>new DisplayObject(),zone:()=>new DisplayObject(),image:()=>new DisplayObject(),
    text:(x:number,y:number,value:string)=>{const t=new DisplayObject(value,x,y);labels.push(t);return t;},
  }});
  scene.display({state,selected:null,cursor:{x:0,y:0},reachable:[],mode:'inspect',enabled:false});
  return {scene,labels,errors,time:(n:number)=>{now=n;scene.update();},actors:()=>((scene as unknown as {actors:Map<string,{group:DisplayObject;ghost:boolean}>}).actors)};
}
afterEach(()=>vi.restoreAllMocks());

describe('committed combat result presentation without rerolls',()=>{
  it('keeps a missed attack visible although HP is unchanged, with a detached committed result',()=>{
    const {before,after,command}=attackCase(false),snapshot=JSON.stringify({before,after});
    const plan=createPresentation(before,after,[command])!;
    expect(plan.attack?.resolution).toMatchObject({hit:false,damage:0,hitChance:90});
    expect(plan.attackDuration).toBe(220);expect(plan.durationMs).toBe(220);
    for(let n=0;n<=100;n++)samplePresentation(plan,n*3);
    expect(JSON.stringify({before,after})).toBe(snapshot);
    plan.attack!.resolution!.damage=999;expect(after.lastAttack!.damage).toBe(0);
    expect(soundForTransition(before,after,command)).toBeNull();
  });
  it('uses the same 400ms dedicated body on a miss, with generic duration retained when assets are unavailable',()=>{
    const {before,after,command}=attackCase(false),plan=createPresentation(before,after,[command])!;
    expect(withDedicatedAttack(plan,after,()=>true)).toMatchObject({attackDuration:400,durationMs:400,attack:{resolution:{hit:false}}});
    expect(withDedicatedAttack(plan,after,()=>false)).toBe(plan);expect(plan.attackDuration).toBe(220);
  });
  it('uses one committed hit and its actual capped HP damage for lethal feedback and impact',()=>{
    const {before,after,command}=attackCase(true,true),plan=createPresentation(before,after,[command])!;
    expect(plan.attack?.resolution).toMatchObject({hit:true,damage:1});
    expect(plan.attack!.resolution!.damageOnHit).toBeGreaterThan(1);
    expect(plan.attack!.targetBefore.hp).toBe(1);expect(soundForTransition(before,after,command)).toBe('se-impact');
  });
  it('never replays stale results or substitutes HP changes for a missing new result',()=>{
    const {after,command}=attackCase(false),later=structuredClone(after);
    getUnit(later,'enemy-melee-01')!.hp--;
    expect(createPresentation(after,later,[command])).toBeNull();
    expect(soundForTransition(after,later,command)).toBeNull();
    expect(soundForTransition(after,later)).toBeNull();
    expect(committedAttackResolution(after,later)).toBeUndefined();
  });
  it('matches event sequence, actor and target instead of guessing from an attack command',()=>{
    const {before,after}=attackCase(false);
    expect(committedAttackResolution(before,after,'ally-garan')).toBeUndefined();
    expect(committedAttackResolution(before,after,'ally-lise','other')).toBeUndefined();
    const wrong=structuredClone(after);wrong.combatRandom!.draws++;
    expect(committedAttackResolution(before,wrong)).toBeUndefined();
    const switched=structuredClone(after);switched.battleId='B02';
    expect(committedAttackResolution(before,switched)).toBeUndefined();
  });
  it('keeps explicit legacy factory HP-difference behavior intact',()=>{
    const {before,command}=attackCase(true);delete before.combatRandom;
    const after=reduce(before,command).state,plan=createPresentation(before,after,[command])!;
    expect(plan.attack).toBeDefined();expect(plan.attack?.resolution).toBeUndefined();
    expect(plan.attackDuration).toBe(220);expect(soundForTransition(before,after,command)).toBe('se-impact');
  });
  it('prioritizes terminal audio over either combat result',()=>{
    const {before,after,command}=attackCase(false);
    const won=structuredClone(after);won.phase='won';expect(soundForTransition(before,won,command)).toBe('se-victory');
    const lost=structuredClone(after);lost.phase='lost';expect(soundForTransition(before,lost,command)).toBe('se-defeat');
    expect(soundForTransition(won,structuredClone(won),command)).toBeNull();
  });
  it.each(['melee','bow'] as const)('draws %s miss feedback without a target hit pulse or ghost and clears it on settle',weapon=>{
    const {before,after,command}=attackCase(false,false,weapon),snapshot=JSON.stringify(after),h=sceneHarness(after);
    const plan=createPresentation(before,after,[command])!;h.scene.playPresentation(plan);h.time(110);
    const target=h.actors().get(command.type==='attack'?command.targetId:'')!;
    expect(target.ghost).toBe(false);expect(target.group.alpha).toBe(1);
    const feedback=h.labels.filter(x=>x.value==='外れ').at(-1)!;expect(feedback.visible).toBe(true);
    expect(h.errors).toEqual([]);expect(JSON.stringify(after)).toBe(snapshot);
    h.time(220);expect(feedback.visible).toBe(false);h.scene.clearPresentation();expect(feedback.destroyed).toBe(true);
  });
  it('retains hit ghost behavior and shows actual damage on a lethal hit',()=>{
    const {before,after,command}=attackCase(true,true),h=sceneHarness(after),plan=createPresentation(before,after,[command])!;
    h.scene.playPresentation(plan);h.time(110);
    const target=h.actors().get(plan.attack!.targetId)!;expect(target.ghost).toBe(true);expect(target.group.alpha).toBeLessThan(1);
    expect(h.labels.filter(x=>x.value==='命中 −1').at(-1)?.visible).toBe(true);
    h.time(220);expect(target.group.visible).toBe(false);h.scene.clearPresentation();expect(h.actors().has(plan.attack!.targetId)).toBe(false);
    expect(h.errors).toEqual([]);
  });
  it('lets shortening or stale timers settle the already committed miss only once',()=>{
    const {before,after,command}=attackCase(false),plan=createPresentation(before,after,[command])!,snapshot=JSON.stringify(after);
    let timer:()=>void=()=>{};const settled=vi.fn(),gate=new PlaybackGate({setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{}});
    expect(gate.start(plan.durationMs,settled)).toBe(true);expect(gate.start(plan.durationMs,settled)).toBe(false);
    gate.finishNow();timer();gate.finishNow();expect(settled).toHaveBeenCalledTimes(1);expect(JSON.stringify(after)).toBe(snapshot);
  });
});
