import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import mainSource from '../src/main.ts?raw';
import { BattleDialogueJournal } from '../src/view/battleDialogues';
import { mountStoryPanel } from '../src/view/storyPanel';
import { mountStartScreen, readStartProgress } from '../src/view/startScreen';
import { mountPrologue, shouldShowPrologue } from '../src/view/prologue';
import { selectionCommandState } from '../src/view/selectionCommands';
import { readAuthoredStory, storySpeakerFace } from '../src/view/storyScript';
import { introStoryHtml, resultStoryHtml } from '../src/view/storyContent';
import { briefingRulesText } from '../src/view/briefingContent';
import { makeModalBackgroundInert, createDialogSettlement } from '../src/view/modalFocus';
import { getBattleConfig } from '../src/domain/battles';
import { CAMPAIGN_KEY, createCampaign, completeBattle, selectBattle, readCampaign, writeCampaign, resetCampaign } from '../src/campaign';
import { createPartyBattle } from '../src/party';
import { commonLevel, defaultParty } from '../src/progression';
import { createEquipment } from '../src/equipment';
import { battleMusic } from '../src/audio-cues';
import { resultSounds } from '../src/audio-events';
import { endingContent } from '../src/ending';
import type { BattleId } from '../src/domain/types';

// Run the actual named main functions, not a reimplementation of their routing.
// Graphics/audio/render and DOM layout are ports; no browser or ordinary storage is used.
const names = ['releaseStart','releaseStory','releasePrologue','releaseModalBackground','closeDialog','modal','persist','finish','finishResult',
  'showEnding','restart','chooseBattle','storyOverlay','guardDialogEntry','fieldDialog','intro','showOpeningContext','beginNewGame','showStartScreen','defeatSummary','briefing'];
const RETIRED_SEEN_KEY='mio-tactics.prologue.v1';
const sourceFile=ts.createSourceFile('main.ts',mainSource,ts.ScriptTarget.Latest,true);
const actualFunctions=names.map(name=>{
  const node=sourceFile.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);
  if(!node) throw new Error(`Missing main function: ${name}`);
  return node.getText(sourceFile);
}).join('\n');
const js=ts.transpileModule(actualFunctions,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;

class NodePort {
  children:NodePort[]=[];parent:NodePort|null=null;attrs:Record<string,string>={};dataset:Record<string,string>={};
  className='';id='';textContent='';hidden=false;disabled=false;tabIndex=-1;scrollTop=0;scrollHeight=800;clientHeight=240;
  isContentEditable=false;
  rawHTML='';
  onclick:((e:MouseEvent)=>void)|null=null;onerror:(()=>void)|null=null;
  listeners=new Map<string,{fn:(e:any)=>void;capture:boolean}[]>();
  classList={add:(s:string)=>{this.className+=' '+s;}};
  constructor(readonly ownerDocument:DocumentPort,readonly tagName='DIV'){this.tabIndex=tagName==='BUTTON'?0:-1;}
  get isConnected():boolean{return this===this.ownerDocument.host||!!this.parent?.isConnected;}
  get parentElement():NodePort|null{return this.parent;}
  append(...nodes:NodePort[]){for(const n of nodes){n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes:NodePort[]){this.children.forEach(n=>n.parent=null);this.children=[];this.append(...nodes);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
  contains(node:NodePort):boolean{return node===this||this.children.some(n=>n.contains(node));}
  set innerHTML(value:string){
    this.rawHTML=value;
    this.replaceChildren();
    // The modal template's structural selectors are the only HTML queried here.
    if(value.includes('class="veil"')){
      const veil=this.ownerDocument.createElement('div');veil.className='veil';
      const dialog=this.ownerDocument.createElement('section');dialog.className='dialog';dialog.setAttribute('role','dialog');
      for(const c of ['dialog-body','dialog-actions']){const n=this.ownerDocument.createElement('div');n.className=c;dialog.append(n);}
      veil.append(dialog);this.append(veil);
    }
  }
  setAttribute(k:string,v:string){this.attrs[k]=v;}
  getAttribute(k:string){return this.attrs[k]??null;}
  hasAttribute(k:string){return Object.prototype.hasOwnProperty.call(this.attrs,k);}
  removeAttribute(k:string){delete this.attrs[k];}
  addEventListener(k:string,fn:(e:any)=>void,options:boolean|AddEventListenerOptions=false){const capture=typeof options==='boolean'?options:!!options.capture;this.listeners.set(k,[...(this.listeners.get(k)??[]),{fn,capture}]);}
  removeEventListener(k:string,fn:(e:any)=>void){this.listeners.set(k,(this.listeners.get(k)??[]).filter(x=>x.fn!==fn));}
  closest(selector:string):NodePort|null{return selector==='[inert]'&&this.hasAttribute('inert')?this:this.parent?.closest(selector)??null;}
  matches(selector:string){return selector.includes(':disabled')&&this.disabled;}
  getClientRects(){return this.isConnected&&!this.hidden?[{}]:[];}
  focus(){this.ownerDocument.activeElement=this;}
  all():NodePort[]{return[this,...this.children.flatMap(c=>c.all())];}
  querySelectorAll(){return this.all().slice(1).filter(n=>n.tagName==='BUTTON'||n.tabIndex>=0);}
  querySelector(selector:string):NodePort|null{
    return this.all().find(n=>selector.startsWith('.')?n.className.split(' ').includes(selector.slice(1)):
      selector==='main.game-shell'?n.tagName==='MAIN':selector==='[role="dialog"]'?n.attrs.role==='dialog':false)??null;
  }
}
class DocumentPort {
  host=new NodePort(this);activeElement:NodePort|null=null;hidden=false;
  defaultView={matchMedia:()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}),getComputedStyle:()=>({display:'block',visibility:'visible'})};
  createElement(tag:string){return new NodePort(this,tag.toUpperCase());}
  getSelection(){return null;}
}

function harness(id:BattleId='B01',phase:'playing'|'won'|'lost'='playing',options:{freshStart?:boolean;prologueSeen?:boolean}={}){
  let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
  const doc=new DocumentPort();vi.stubGlobal('document',doc);
  const shell=doc.createElement('main'),overlay=doc.createElement('div');shell.className='game-shell';overlay.id='overlay';doc.host.append(shell,overlay);
  const memory=new Map<string,string>();let writes=0,preferenceWrites=0,deletions=0;
  if(options.prologueSeen)memory.set(RETIRED_SEEN_KEY,'1');
  const storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{if(k===CAMPAIGN_KEY)writes++;else preferenceWrites++;memory.set(k,v);},removeItem:(k:string)=>{deletions++;memory.delete(k);}};
  // Planned terminal fixtures isolate main routing; this is not an AI victory replay.
  const evidence:Record<BattleId,string[]>={B01:['A','B'],B02:['O'],B03:['M'],B04:['C'],B05:['D','T','S'],B06:['W'],B07:['V1','V2'],B08:['P','C'],B09:['J','H'],B10:['C'],B11:['W1','W2','A','B'],B12:['U','V']};
  let campaign=createCampaign();
  for(const prior of Object.keys(evidence) as BattleId[]){
    if(prior===id)break;
    const battle=createPartyBattle(prior,defaultParty(prior),campaign.jobs,commonLevel(campaign.completed));
    battle.phase='won';battle.records=evidence[prior];campaign=completeBattle(campaign,battle);
  }
  campaign=selectBattle(campaign,id);if(!options.freshStart)memory.set(CAMPAIGN_KEY,JSON.stringify(campaign));
  const state=createPartyBattle(id,defaultParty(id),campaign.jobs,commonLevel(campaign.completed));state.phase=phase;
  if(phase==='won')state.records=evidence[id];
  const events:string[]=[];
  const context:Record<string,unknown>={
    dialogueJournal:new BattleDialogueJournal(id),replayBattleDialogue:()=>{},
    state,campaign,screen:phase==='playing'?'intro':'battle',selected:null,inspectionTeam:'player',mode:'inspect',cursor:{x:0,y:5},
    disposeStart:undefined,startHasCheckpoint:readStartProgress(storage).hasCheckpoint,startWarning:undefined,startQaNotice:'',disposeStory:undefined,disposePrologue:undefined,restoreModalBackground:undefined,dialogOpen:false,modalReturnFocus:null,pendingFocus:null,message:'',saveStatus:'',saveWritable:true,storage,
    app:doc.host,$:(key:string)=>{if(key!=='overlay')throw new Error(`Unexpected DOM #${key}`);return overlay;},
    currentFocusKey:()=>null,render:()=>events.push('render'),clearBattleTimers:()=>events.push('clear'),
    audio:{beginScene:()=>{},playSE:()=>{},playSESequence:()=>{},status:{}},battleMusic,resultSounds,mountSceneAudioControls:()=>{},audioControls:()=>doc.createElement('details'),updateAudioControls:()=>{},
    button:(label:string,fn:()=>void,disabled=false,cls='')=>{const b=doc.createElement('button');b.textContent=label;b.onclick=fn;b.disabled=disabled;b.className=cls;return b;},
    getBattleConfig,readAuthoredStory,storySpeakerFace,introStoryHtml,resultStoryHtml,briefingRulesText,mountStoryPanel,mountStartScreen,mountPrologue,shouldShowPrologue,selectionCommandState,makeModalBackgroundInert,createDialogSettlement,
    completeBattle:(...args:Parameters<typeof completeBattle>)=>{events.push('completeBattle');return completeBattle(...args);},
    writeCampaign:(...args:Parameters<typeof writeCampaign>)=>{events.push('write');return writeCampaign(...args);},
    createCampaign,createPartyBattle,selectBattle,commonLevel,defaultParty,getConfirmedEquipmentEvents:()=>[],getUnconfirmedEquipmentEvents:()=>[],
    resetCampaign:(...args:Parameters<typeof resetCampaign>)=>{events.push('reset');return resetCampaign(...args);},
    equipmentCollectionRows:()=>[],createEquipment,endingContent,
    getUnit:(s:typeof state,unitId:string)=>s.units.find(u=>u.id===unitId),escortUnit:()=>undefined,
    preparation:()=>events.push('preparation'),campaignMenu:()=>events.push('menu'),
    finalGuide:'final',repairGuide:'repair',portGuide:'port',delegationGuide:'delegation',sluiceGuide:'sluice',chainGuide:'chain',archiveExitLabel:'(10,22)',
  };
  // with() supplies only controlled UI ports; function declarations are the actual AST nodes above.
  const build=new Function('ctx',`with(ctx){${js}\nreturn {${names.join(',')}, snapshot:()=>({state,campaign,screen,dialogOpen,saveStatus})};}`);
  const api=build(context) as Record<string,any>;
  const buttons=()=>overlay.all().filter(n=>n.tagName==='BUTTON');
  const find=(label:string)=>{const n=buttons().find(n=>n.textContent===label);if(!n)throw new Error(`Missing ${label}: ${buttons().map(n=>n.textContent).join('/')}`);return n;};
  const fire=(target:NodePort,key?:string,repeat=false,detail=1)=>{
    let stopped=false,immediate=false;
    const event={target,key,repeat,detail,ctrlKey:false,metaKey:false,altKey:false,preventDefault:vi.fn(),
      stopPropagation:()=>{stopped=true;},stopImmediatePropagation:()=>{stopped=true;immediate=true;}};
    const path:NodePort[]=[];for(let n:NodePort|null=target;n;n=n.parent)path.push(n);
    const type=key?'keydown':'click';
    for(const n of [...path].reverse())for(const l of n.listeners.get(type)??[])if(l.capture){l.fn(event);if(immediate)return event;}
    if(!key)target.onclick?.(event as unknown as MouseEvent);
    for(const n of path){if(stopped)break;for(const l of n.listeners.get(type)??[])if(!l.capture)l.fn(event);}
    return event;
  };
  const advance=()=>{now+=300;fire(buttons().filter(b=>b.className!=='story-skip').at(-1)!);};
  const finishStory=()=>{let budget=100;while(overlay.querySelector('.story-shield')){if(--budget===0)throw new Error('story did not terminate');advance();}};
  return{api,context,doc,shell,overlay,events,storage,memory,buttons,find,fire,advance,finishStory,
    tick:(ms=300)=>{now+=ms;},writes:()=>writes,preferenceWrites:()=>preferenceWrites,deletions:()=>deletions};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('actual main story/state paths (DOM port, no browser)',()=>{
  it('boots to two entry actions, new B01 prologue, and the existing intro without an early save or command',()=>{
    expect(sourceFile.statements.at(-1)?.getText(sourceFile)).toBe('showStartScreen();');
    const h=harness('B01','playing',{freshStart:true});h.api.showStartScreen();
    expect(h.api.snapshot().screen).toBe('start');expect(h.shell.getAttribute('inert')).toBe('');
    expect(h.buttons().map(n=>n.textContent)).toEqual(['最初から始める','続きから始める']);expect(h.find('続きから始める').disabled).toBe(true);
    const start=h.find('最初から始める'),stale=start.onclick!;h.fire(start);h.fire(start,'Enter',true);expect(h.overlay.querySelector('.start-screen')).not.toBeNull();
    h.tick();h.fire(start,'Enter');expect(h.api.snapshot().screen).toBe('intro');
    expect(h.overlay.querySelector('.start-screen')).toBeNull();expect(h.overlay.querySelector('.prologue-screen')).not.toBeNull();
    const fresh=structuredClone(h.api.snapshot().state);expect(fresh).toMatchObject({battleId:'B01',round:1,phase:'playing',turn:'player',activeId:null,records:[],activation:{moved:false,acted:false}});
    expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);expect(h.preferenceWrites()).toBe(0);expect(h.memory.has(CAMPAIGN_KEY)).toBe(false);
    h.tick();stale({detail:1,preventDefault:()=>{},stopPropagation:()=>{}} as MouseEvent);expect(h.overlay.querySelector('.prologue-screen')).not.toBeNull();
    h.fire(h.find('第1戦の物語へ進む'));expect(h.overlay.querySelector('.prologue-screen')).toBeNull();expect(h.overlay.querySelector('.story-count')!.textContent).toMatch(/^1 /);
    h.fire(h.buttons().at(-1)!);expect(h.overlay.querySelector('.story-count')!.textContent).toMatch(/^1 /);
    h.fire(h.buttons().at(-1)!,'Enter',true);expect(h.overlay.querySelector('.story-count')!.textContent).toMatch(/^1 /);
    h.tick();stale({detail:1,preventDefault:()=>{},stopPropagation:()=>{}} as MouseEvent);expect(h.api.snapshot().state).toEqual(fresh);expect(h.writes()).toBe(0);
    h.finishStory();h.tick();h.fire(h.buttons()[0]);expect(h.api.snapshot().screen).toBe('battle');expect(h.overlay.children).toHaveLength(0);expect(h.writes()).toBe(1);
    h.api.restart();expect(h.api.snapshot().screen).toBe('battle');expect(h.overlay.children).toHaveLength(0);
  });
  it('continues a loaded later stage directly from title without a prologue, reset, save or command',()=>{
    const h=harness('B05'),saved=h.memory.get(CAMPAIGN_KEY),before=structuredClone(h.api.snapshot().state);
    h.api.showStartScreen();expect(h.overlay.querySelector('.start-note')!.textContent).toContain('B05');h.tick();h.fire(h.find('続きから始める'));
    expect(h.api.snapshot().state.battleId).toBe('B05');expect(h.overlay.querySelector('.prologue-screen')).toBeNull();
    expect(h.overlay.querySelector('.story-text')!.textContent).toBe(readAuthoredStory(introStoryHtml('B05'))[0].text);
    expect(h.api.snapshot().state).toEqual(before);expect(h.memory.get(CAMPAIGN_KEY)).toBe(saved);expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);
  });
  it('continues saved B01 directly regardless of an absent or retired read marker',()=>{
    for(const prologueSeen of [false,true]){
      const h=harness('B01','playing',{prologueSeen}),saved=h.memory.get(CAMPAIGN_KEY),before=structuredClone(h.api.snapshot().state);
      h.api.showStartScreen();h.tick();h.fire(h.find('続きから始める'));
      expect(h.overlay.querySelector('.prologue-screen')).toBeNull();expect(h.overlay.querySelector('.story-text')!.textContent).toBe(readAuthoredStory(introStoryHtml('B01'))[0].text);
      expect(h.api.snapshot().state).toEqual(before);expect(h.memory.get(CAMPAIGN_KEY)).toBe(saved);expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);expect(h.preferenceWrites()).toBe(0);
    }
  });
  it('new game opens confirmation first and cancel or Escape returns to the title without changing any saved progress',()=>{
    for(const cancelWith of ['button','Escape'] as const){
      const h=harness('B05'),saved=h.memory.get(CAMPAIGN_KEY);h.api.showStartScreen();const before=structuredClone(h.api.snapshot());h.tick();h.fire(h.find('最初から始める'));
      expect(h.overlay.rawHTML).toContain('最初から始めますか');expect(h.doc.activeElement).toBe(h.find('キャンセル'));
      expect(h.api.snapshot().state).toEqual(before.state);expect(h.api.snapshot().campaign).toEqual(before.campaign);expect(h.memory.get(CAMPAIGN_KEY)).toBe(saved);expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);
      const stale=h.find('最初から始める').onclick!;h.tick();h.fire(h.find('キャンセル'),cancelWith==='Escape'?'Escape':undefined);
      expect(h.overlay.querySelector('.start-screen')).not.toBeNull();expect(h.doc.activeElement).toBe(h.find('最初から始める'));expect(h.api.snapshot()).toEqual(before);
      stale({} as MouseEvent);expect(h.memory.get(CAMPAIGN_KEY)).toBe(saved);expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);
    }
  });
  it('confirmed new game resets only then, always shows the prologue despite old read/completion state, and saves only at battle start',()=>{
    const h=harness('B05','playing',{prologueSeen:true}),saved=h.memory.get(CAMPAIGN_KEY);h.api.showStartScreen();h.tick();h.fire(h.find('最初から始める'));
    expect(h.memory.get(CAMPAIGN_KEY)).toBe(saved);expect(h.deletions()).toBe(0);h.tick();const confirm=h.find('最初から始める'),stale=confirm.onclick!;h.fire(confirm);
    expect(h.deletions()).toBe(1);expect(h.events.filter(e=>e==='reset')).toHaveLength(1);expect(h.memory.has(CAMPAIGN_KEY)).toBe(false);expect(h.writes()).toBe(0);
    expect(h.api.snapshot().campaign.completed).toEqual([]);expect(h.api.snapshot().campaign.currentBattle).toBe('B01');expect(h.overlay.querySelector('.prologue-screen')).not.toBeNull();
    const fresh=structuredClone(h.api.snapshot().state);expect(fresh).toMatchObject({battleId:'B01',round:1,activeId:null,phase:'playing',activation:{moved:false,acted:false}});expect(fresh.units.filter((u:{team:string})=>u.team==='player').every((u:{hp:number;maxHp:number})=>u.hp===u.maxHp)).toBe(true);
    stale({} as MouseEvent);expect(h.deletions()).toBe(1);h.fire(h.find('序章をスキップ'));expect(h.api.snapshot().state).toEqual(fresh);expect(h.writes()).toBe(0);
    expect(h.memory.get(RETIRED_SEEN_KEY)).toBe('1');expect(h.preferenceWrites()).toBe(0);h.finishStory();h.tick();h.fire(h.find('B01 調査隊を指揮する'));
    expect(h.writes()).toBe(1);expect(readCampaign(h.storage).campaign).toMatchObject({currentBattle:'B01',completed:[]});
  });
  it('fresh new game also ignores a retired seen marker, never requiring a progress reset',()=>{
    const h=harness('B01','playing',{freshStart:true,prologueSeen:true});h.api.showStartScreen();h.tick();h.fire(h.find('最初から始める'));
    expect(h.overlay.querySelector('.prologue-screen')).not.toBeNull();expect(h.deletions()).toBe(0);expect(h.writes()).toBe(0);expect(h.memory.get(RETIRED_SEEN_KEY)).toBe('1');
  });
  it('shows the actual unreadable-save warning and preserves raw data when new-game confirmation is cancelled',()=>{
    const h=harness(),raw='{"version":999,"keep":"unchanged"}';h.memory.set(CAMPAIGN_KEY,raw);
    const loaded=readStartProgress(h.storage);h.context.startHasCheckpoint=loaded.hasCheckpoint;h.context.saveWritable=loaded.writable;h.context.startWarning=loaded.warning;
    h.context.saveStatus='A later unrelated status';h.api.showStartScreen();const before=structuredClone(h.api.snapshot());
    expect(h.overlay.querySelector('.start-warning')!.textContent).toBe(loaded.warning);expect(h.find('続きから始める').disabled).toBe(true);
    h.tick();h.fire(h.find('最初から始める'));expect(h.overlay.rawHTML).toContain('最初から始めますか');expect(h.memory.get(CAMPAIGN_KEY)).toBe(raw);expect(h.deletions()).toBe(0);
    h.tick();h.fire(h.find('キャンセル'));expect(h.overlay.querySelector('.start-warning')!.textContent).toBe(loaded.warning);expect(h.api.snapshot()).toEqual(before);
    expect(h.memory.get(CAMPAIGN_KEY)).toBe(raw);expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);
  });
  it('returns a reset failure to the title without replacing the loaded battle, campaign, or original save',()=>{
    const h=harness('B05'),saved=h.memory.get(CAMPAIGN_KEY),before=structuredClone(h.api.snapshot());h.storage.removeItem=()=>{throw new Error('denied');};
    h.api.showStartScreen();h.tick();h.fire(h.find('最初から始める'));h.tick();h.fire(h.find('最初から始める'));
    expect(h.overlay.querySelector('.start-screen')).not.toBeNull();expect(h.overlay.querySelector('.start-warning')!.textContent).toContain('リセットに失敗');
    expect(h.api.snapshot().state).toEqual(before.state);expect(h.api.snapshot().campaign).toEqual(before.campaign);expect(h.memory.get(CAMPAIGN_KEY)).toBe(saved);expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);
  });
  it('can explicitly start a new game when storage is unavailable without ever claiming to save progress',()=>{
    const h=harness('B01','playing',{freshStart:true});h.context.storage=null;h.context.saveWritable=false;h.context.startWarning='保存領域を利用できません。';
    h.api.showStartScreen();h.tick();h.fire(h.find('最初から始める'));h.tick();h.fire(h.find('最初から始める'));
    expect(h.overlay.querySelector('.prologue-screen')).not.toBeNull();h.fire(h.find('序章をスキップ'));h.finishStory();h.tick();h.fire(h.find('B01 調査隊を指揮する'));
    expect(h.api.snapshot().screen).toBe('battle');expect(h.api.snapshot().saveStatus).toContain('保存されません');expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);
  });
  it('replays opening context during battle then returns without changing state, campaign save, or an activation',()=>{
    const h=harness(),returned=vi.fn();h.context.screen='battle';h.context.selected='ally-garan';
    const before=structuredClone(h.api.snapshot()),saved=h.memory.get(CAMPAIGN_KEY);h.api.showOpeningContext(returned,true);
    expect(h.overlay.querySelector('.prologue-screen')).not.toBeNull();expect(h.api.snapshot().screen).toBe('battle');h.fire(h.find('閉じて元の画面へ戻る'));
    expect(returned).toHaveBeenCalledOnce();expect(h.api.snapshot()).toEqual(before);expect(h.memory.get(CAMPAIGN_KEY)).toBe(saved);
    expect(h.writes()).toBe(0);expect(h.deletions()).toBe(0);expect(h.preferenceWrites()).toBe(0);expect(h.api.snapshot().state.activeId).toBeNull();expect(h.shell.getAttribute('inert')).toBeNull();
  });
  it('intro → briefing → reread/back → start uses fresh authored pages without an early save or command',()=>{
    const h=harness(),before=structuredClone(h.api.snapshot());h.api.intro();
    expect(h.shell.getAttribute('inert')).toBe('');expect(h.api.snapshot().dialogOpen).toBe(true);
    h.advance();h.tick();h.fire(h.find('戻る'));expect(h.overlay.querySelector('.story-text')!.textContent).toContain('杭は流されていない');
    h.finishStory();expect(h.find('導入を読み返す')).toBeTruthy();expect(h.writes()).toBe(0);
    h.tick();h.fire(h.find('導入を読み返す'));expect(h.overlay.querySelector('.story-count')!.textContent).toMatch(/^1 /);
    h.finishStory();expect(h.api.snapshot().state).toEqual(before.state);
    const start=h.buttons().find(n=>n.textContent.includes('調査隊を指揮する'))!;
    // The newly opened field dialog does not accept the carried click/held key.
    h.fire(start);h.fire(start,'Enter',true);expect(h.writes()).toBe(0);
    h.tick();h.fire(start);expect(h.api.snapshot().screen).toBe('battle');expect(h.writes()).toBe(1);
    expect(h.shell.getAttribute('inert')).toBeNull();expect(h.api.snapshot().dialogOpen).toBe(false);
    expect(h.overlay.children).toHaveLength(0);
  });
  it('victory saves before story; last-block arrows do not expose results; rereads do not award/save twice',()=>{
    const h=harness('B01','won');h.api.finish();
    expect(h.events.indexOf('completeBattle')).toBeLessThan(h.events.indexOf('write'));
    expect(h.api.snapshot().campaign.completed).toEqual(['B01']);expect(h.writes()).toBe(1);
    h.finishStory();const before=structuredClone(h.api.snapshot());const resultButtons=h.buttons();
    h.tick();h.fire(h.find('物語を読み返す'));
    const count=h.overlay.querySelector('.story-count')!;
    for(let i=0;i<100;i++){const [,index,total]=/^(\d+) \/ (\d+)/.exec(count.textContent)!;if(index===total)break;h.advance();}
    h.tick();h.fire(h.find('戻る'),'ArrowRight');expect(h.overlay.querySelector('.story-shield')).not.toBeNull();
    h.finishStory();expect(h.writes()).toBe(1);expect(h.api.snapshot()).toEqual(before);
    // A primary callback from a removed result dialog is rejected by the real settlement.
    const stale=resultButtons[0].onclick!;stale({} as MouseEvent);expect(h.writes()).toBe(1);
    h.tick();h.fire(h.find('B02 旧セラ堤へ'));
    expect(h.api.snapshot().state.battleId).toBe('B02');expect(h.api.snapshot().screen).toBe('intro');
    expect(h.overlay.querySelector('.story-count')!.textContent).toMatch(/^1 /);
  });
  it('loss has neither victory-story nor next-stage/ending; retry starts a new battle without awarding evidence',()=>{
    const h=harness('B01','lost');h.api.finish();expect(h.overlay.querySelector('.story-shield')).toBeNull();
    expect(h.buttons().some(n=>n.textContent.includes('読み返す')||n.textContent.includes('B02'))).toBe(false);
    expect(h.writes()).toBe(0);h.tick();h.fire(h.find('同じ作戦に再挑戦'));
    expect(h.api.snapshot().state.phase).toBe('playing');expect(h.api.snapshot().campaign.completed).toEqual([]);
  });
  it('rejects an already queued next-stage click from a field dialog replaced by a story',()=>{
    const h=harness('B01','won');h.api.finish();h.finishStory();h.tick();
    const next=h.find('B02 旧セラ堤へ');h.fire(next);expect(h.writes()).toBe(2);
    h.advance();const text=h.overlay.querySelector('.story-text')!.textContent;
    // Dispatch through the removed veil's capture handlers, as a queued DOM event would.
    h.tick();h.fire(next);expect(h.writes()).toBe(2);
    expect(h.overlay.querySelector('.story-text')!.textContent).toBe(text);
  });
  it('B12 ending and reread use the saved evidence, without a second completion/write; reload starts at intro',()=>{
    const h=harness('B12','won');h.api.finish();h.finishStory();h.tick();h.fire(h.find('終幕を読む'));
    expect(h.overlay.querySelector('.story-count')!.textContent).toMatch(/^1 /);h.finishStory();
    h.tick();h.fire(h.find('終幕を読み返す'));h.finishStory();expect(h.writes()).toBe(1);
    expect(h.events.filter(x=>x==='completeBattle')).toHaveLength(1);
    const loaded=readCampaign(h.storage);expect(loaded.campaign?.completed).toContain('B12');
    const fresh=harness('B12');fresh.context.campaign=loaded.campaign;fresh.api.intro();
    expect(fresh.overlay.querySelector('.story-count')!.textContent).toMatch(/^1 /);
    expect(fresh.api.snapshot().state.phase).toBe('playing');expect(fresh.writes()).toBe(0);
  });
  it('preserves the previous checkpoint when victory storage fails; story reread never silently retries the write',()=>{
    const h=harness('B01','won'),saved=h.memory.get(CAMPAIGN_KEY);let attempts=0;
    h.storage.setItem=()=>{attempts++;throw new Error('quota');};h.api.finish();
    expect(attempts).toBe(1);expect(h.api.snapshot().saveStatus).toContain('保存に失敗');
    h.finishStory();h.tick();h.fire(h.find('物語を読み返す'));h.finishStory();
    expect(attempts).toBe(1);expect(h.memory.get(CAMPAIGN_KEY)).toBe(saved);
    expect(readCampaign(h.storage).campaign.completed).toEqual([]);
    expect(h.api.snapshot().campaign.completed).toEqual(['B01']);
  });
  it('wires each of the 12 authored intros to its own current briefing/config without changing battle or checkpoint',()=>{
    for(let n=1;n<=12;n++){
      const id=`B${String(n).padStart(2,'0')}` as BattleId,h=harness(id),before=structuredClone(h.api.snapshot());
      const checkpoint=h.memory.get(CAMPAIGN_KEY);h.api.intro();
      expect(h.overlay.querySelector('.story-text')!.textContent).toBe(readAuthoredStory(introStoryHtml(id))[0].text);
      h.finishStory();const config=getBattleConfig(id);
      expect(h.overlay.rawHTML).toContain(config.intro);
      expect(h.overlay.rawHTML).toContain(`第${config.roundLimit}ラウンド終了`);
      expect(h.api.snapshot().state).toEqual(before.state);expect(h.api.snapshot().campaign).toEqual(before.campaign);
      expect(h.memory.get(CAMPAIGN_KEY)).toBe(checkpoint);expect(h.writes()).toBe(0);
    }
  });
});
