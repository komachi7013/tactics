import { describe,it,expect,vi } from 'vitest';
import ts from 'typescript';
import source from '../src/main.ts?raw';
import {BattleDialogueJournal} from '../src/view/battleDialogues';
import {createInitialState} from '../src/domain/engine';
const sf=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const actual=sf.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='showPendingBattleDialogue')!.getText(sf);
const js=ts.transpileModule(actual,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup(){
 const b=createInitialState('B01'),a=structuredClone(b);b.records=['A'];a.records=['A','B'];const journal=new BattleDialogueJournal('B01');journal.observe(b,a);
 const shell={replaceChildren:vi.fn()},callbacks:(()=>void)[]=[];
 const ctx:any={screen:'battle',state:a,dialogueJournal:journal,dialogueBrief:{show:vi.fn()},dialogOpen:false,releaseStory:vi.fn(),releaseModalBackground:vi.fn(),$:()=>shell,
 storyOverlay:vi.fn((_title:string,_pages:unknown,_label:string,done:()=>void)=>{ctx.dialogOpen=true;callbacks.push(done);})};
 const run=new Function('ctx',`with(ctx){${js};return showPendingBattleDialogue;}`)(ctx) as (resume:()=>void)=>void;
 return{ctx,callbacks,shell,run,resume:vi.fn()};
}
describe('actual main post-presentation dialogue hook',()=>{
 it('holds continuation until important dialogue completes; reading never changes committed rule state',()=>{
  const h=setup(),snapshot=structuredClone(h.ctx.state);h.run(h.resume);expect(h.resume).not.toHaveBeenCalled();expect(h.ctx.storyOverlay).toHaveBeenCalledOnce();expect(h.ctx.dialogueJournal.history).toHaveLength(1);
  h.callbacks[0]();expect(h.resume).toHaveBeenCalledOnce();expect(h.ctx.state).toEqual(snapshot);
  h.run(h.resume);expect(h.ctx.storyOverlay).toHaveBeenCalledOnce();expect(h.resume).toHaveBeenCalledTimes(2);
 });
 it('does not drain queued enemy events until player control returns',()=>{
  const h=setup();h.ctx.state.turn='enemy';h.run(h.resume);expect(h.resume).toHaveBeenCalledOnce();expect(h.ctx.dialogueJournal.history).toHaveLength(0);
  h.ctx.state.turn='player';h.run(h.resume);expect(h.ctx.storyOverlay).toHaveBeenCalledOnce();
 });
 it('recovers modal state and inert cleanup if the actual dialogue mount throws',()=>{
  const h=setup();h.ctx.storyOverlay=()=>{h.ctx.dialogOpen=true;throw new Error('portrait DOM failed');};
  h.run(h.resume);expect(h.ctx.releaseStory).toHaveBeenCalledOnce();expect(h.ctx.releaseModalBackground).toHaveBeenCalledOnce();expect(h.shell.replaceChildren).toHaveBeenCalledOnce();expect(h.ctx.dialogOpen).toBe(false);expect(h.resume).toHaveBeenCalledOnce();
 });
 it('does not let a stale completion display brief text in a different battle state',()=>{
  const h=setup();h.run(h.resume);h.ctx.state=createInitialState('B02');h.callbacks[0]();expect(h.ctx.dialogueBrief.show).not.toHaveBeenCalled();expect(h.resume).toHaveBeenCalledOnce();
 });
});
