import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountStartScreen, readStartProgress } from '../src/view/startScreen';
import { CAMPAIGN_KEY, createCampaign, completeBattle, selectBattle } from '../src/campaign';
import { createInitialState } from '../src/domain/engine';
import { createQaStorage, qaStorageKey } from '../src/qa/storage';

class NodePort {
  children:NodePort[]=[];parent:NodePort|null=null;attrs:Record<string,string>={};
  className='';id='';textContent='';hidden=false;disabled=false;
  onclick:((e:MouseEvent)=>void)|null=null;onerror:(()=>void)|null=null;
  listeners=new Map<string,(e:KeyboardEvent)=>void>();
  classList={add:(s:string)=>{this.className+=' '+s;}};
  constructor(readonly ownerDocument:DocumentPort){}
  get isConnected():boolean{return this===this.ownerDocument.host||!!this.parent?.isConnected;}
  append(...nodes:NodePort[]){for(const n of nodes){n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes:NodePort[]){this.children.forEach(n=>n.parent=null);this.children=[];this.append(...nodes);}
  setAttribute(k:string,v:string){this.attrs[k]=v;}
  addEventListener(k:string,f:(e:KeyboardEvent)=>void){this.listeners.set(k,f);}
  removeEventListener(k:string){this.listeners.delete(k);}
  focus(){this.ownerDocument.active=this;}
  all():NodePort[]{return[this,...this.children.flatMap(n=>n.all())];}
}
class DocumentPort {
  host=new NodePort(this);active:NodePort|null=null;
  createElement(){return new NodePort(this);}
}
afterEach(()=>vi.restoreAllMocks());
describe('read-only startup progress',()=>{
  function read(raw:string|null){
    const getItem=vi.fn(()=>raw),setItem=vi.fn(),removeItem=vi.fn();
    const loaded=readStartProgress({getItem,setItem,removeItem});
    expect(getItem).toHaveBeenCalledExactlyOnceWith(CAMPAIGN_KEY);expect(setItem).not.toHaveBeenCalled();expect(removeItem).not.toHaveBeenCalled();
    return loaded;
  }
  it('distinguishes empty from an existing valid first-stage checkpoint without writing either',()=>{
    expect(read(null)).toMatchObject({hasCheckpoint:false,writable:true});
    expect(read(JSON.stringify(createCampaign()))).toMatchObject({hasCheckpoint:true,writable:true,campaign:{currentBattle:'B01'}});
  });
  it('retains a real completed-stage checkpoint and legacy compatibility',()=>{
    const win=createInitialState();win.phase='won';win.records=['A','B'];
    const campaign=selectBattle(completeBattle(createCampaign(),win),'B02');
    const loaded=read(JSON.stringify(campaign));expect(loaded.hasCheckpoint).toBe(true);expect(loaded.campaign).toEqual(campaign);
    expect(read(JSON.stringify({version:1,unlocked:['B01'],completed:[],currentBattle:'B01',evidence:[]}))).toMatchObject({hasCheckpoint:true,writable:true,campaign:{version:4}});
  });
  it('protects malformed/unknown saves and storage failures without a misleading continue action',()=>{
    for(const raw of ['{broken','{"version":99,"keep":"original"}'])expect(read(raw)).toMatchObject({hasCheckpoint:false,writable:false});
    const setItem=vi.fn(),removeItem=vi.fn();
    expect(readStartProgress({getItem:()=>{throw new Error('denied');},setItem,removeItem})).toMatchObject({hasCheckpoint:false,writable:false});
    expect(setItem).not.toHaveBeenCalled();expect(removeItem).not.toHaveBeenCalled();
  });
  it('reads only the chosen DEV namespace, including an empty namespace beside an existing normal save',()=>{
    const data=new Map([[CAMPAIGN_KEY,JSON.stringify(createCampaign())]]),reads:string[]=[];
    const raw={getItem:(key:string)=>{reads.push(key);return data.get(key)??null;},setItem:vi.fn(),removeItem:vi.fn()};
    expect(readStartProgress(createQaStorage(raw,'title-qa-isolated')).hasCheckpoint).toBe(false);
    expect(reads).toEqual([qaStorageKey('title-qa-isolated')]);expect(data.size).toBe(1);
    expect(raw.setItem).not.toHaveBeenCalled();expect(raw.removeItem).not.toHaveBeenCalled();
  });
});
describe('title lifecycle DOM port (not layout/browser QA)',()=>{
  function setup(hasCheckpoint=false,initialFocus?:'new'|'continue'){
    let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const doc=new DocumentPort(),onNewGame=vi.fn(),onContinue=vi.fn();
    const dispose=mountStartScreen(doc.host as unknown as HTMLElement,{hasCheckpoint,battleLabel:'B05 イェルン文書蔵',warning:'元の保存を保持します。',qaNotice:'隔離QA: title-test',onNewGame,onContinue,initialFocus});
    const all=doc.host.all(),root=all.find(n=>n.className==='start-screen')!,newGame=all.find(n=>n.className.split(' ').includes('start-new-game'))!,continueGame=all.find(n=>n.className.split(' ').includes('start-continue'))!;
    const click=(target:NodePort,detail=1)=>target.onclick?.({detail,preventDefault:vi.fn(),stopPropagation:vi.fn()} as unknown as MouseEvent);
    const key=(key:string,repeat=false,target=doc.active!)=>root.listeners.get('keydown')?.({key,repeat,target,ctrlKey:false,metaKey:false,altKey:false,preventDefault:vi.fn(),stopPropagation:vi.fn()} as unknown as KeyboardEvent);
    return{doc,all,root,newGame,continueGame,onNewGame,onContinue,dispose,click,key,tick:()=>{now+=300;}};
  }
  it('has exactly two clear entry actions and retains the authored title, progress, warning and QA note',()=>{
    const s=setup(true);expect(s.doc.active).toBe(s.continueGame);expect(s.newGame.textContent).toBe('最初から始める');expect(s.continueGame.textContent).toBe('続きから始める');
    expect(s.all.filter(n=>n.onclick)).toHaveLength(2);expect(s.all.some(n=>n.textContent==='プロローグを読む')).toBe(false);
    expect(s.root.attrs).toMatchObject({role:'dialog','aria-modal':'true','aria-labelledby':'start-title'});
    expect(s.all.find(n=>n.id==='start-title')!.textContent).toBe('澪を継ぐ者');expect(s.all.find(n=>n.className==='start-subtitle')!.textContent).toBe('流域盟約戦記');
    expect(s.all.find(n=>n.className==='start-note')!.textContent).toContain('B05');expect(s.all.find(n=>n.className==='start-note')!.textContent).toContain('戦闘途中');
    expect(s.all.find(n=>n.className==='start-warning')!.textContent).toContain('保持');expect(s.all.find(n=>n.className==='start-qa')!.hidden).toBe(false);s.dispose();
  });
  it('shares immediate/double/held/off-button guards and permits only one new or continue callback',()=>{
    for(const kind of ['new','continue'] as const){
      const s=setup(true),target=kind==='new'?s.newGame:s.continueGame,callback=kind==='new'?s.onNewGame:s.onContinue,other=kind==='new'?s.onContinue:s.onNewGame,stale=target.onclick!;
      s.click(target);s.key('Enter',true,target);expect(callback).not.toHaveBeenCalled();s.tick();
      s.click(target,2);s.key('Enter',true,target);s.key('Enter',false,s.root);s.key('ArrowRight');expect(callback).not.toHaveBeenCalled();
      s.key(' ',false,target);s.click(s.newGame);s.click(s.continueGame);s.key('Enter',false,target);
      expect(callback).toHaveBeenCalledOnce();expect(other).not.toHaveBeenCalled();expect(s.newGame.disabled).toBe(true);expect(s.continueGame.disabled).toBe(true);
      s.dispose();stale({detail:1,preventDefault:()=>{},stopPropagation:()=>{}} as MouseEvent);expect(callback).toHaveBeenCalledOnce();
    }
  });
  it('disables continue without a checkpoint, explains why, and rejects programmatic clicks or Enter on it',()=>{
    const s=setup(false);expect(s.doc.active).toBe(s.newGame);expect(s.continueGame.disabled).toBe(true);
    const note=s.all.find(n=>n.className==='start-note')!;expect(note.textContent).toContain('続きの保存データがない');expect(s.continueGame.attrs['aria-describedby']).toBe(note.id);
    s.tick();s.click(s.continueGame);s.key('Enter',false,s.continueGame);expect(s.onContinue).not.toHaveBeenCalled();expect(s.onNewGame).not.toHaveBeenCalled();
    s.click(s.newGame);expect(s.onNewGame).toHaveBeenCalledOnce();s.dispose();
  });
  it('does not depend on artwork loading and ignores a stale artwork error after replacement',()=>{
    const s=setup(),image=s.all.find(n=>n.onerror)!;const stale=image.onerror!;
    stale();expect(image.hidden).toBe(true);expect(s.all.find(n=>n.className==='start-image-note')!.hidden).toBe(false);
    s.tick();s.click(s.newGame);expect(s.onNewGame).toHaveBeenCalledOnce();s.dispose();
    s.doc.host.replaceChildren();expect(()=>stale()).not.toThrow();expect(image.onerror).toBeNull();
    const t=setup(true);t.doc.host.replaceChildren();t.tick();t.click(t.continueGame);expect(t.onContinue).not.toHaveBeenCalled();t.dispose();
  });
  it('keeps Tab browser-owned and lets a confirmation cancel restore focus to the new-game entry',()=>{
    const s=setup(true,'new');expect(s.doc.active).toBe(s.newGame);
    const preventDefault=vi.fn();s.root.listeners.get('keydown')?.({key:'Tab',target:s.newGame,preventDefault,ctrlKey:false,metaKey:false,altKey:false} as unknown as KeyboardEvent);
    expect(preventDefault).not.toHaveBeenCalled();s.dispose();
    const restored=setup(true,'new');expect(restored.doc.active).toBe(restored.newGame);expect(restored.onNewGame).not.toHaveBeenCalled();restored.dispose();
    const fallback=setup(false,'continue');expect(fallback.doc.active).toBe(fallback.newGame);fallback.dispose();
  });
  it('does not let queued callbacks activate after replacement or switch paths after either action started',()=>{
    const replaced=setup(true),queued=replaced.newGame.onclick!;replaced.tick();replaced.doc.host.replaceChildren();queued({detail:1,preventDefault:()=>{},stopPropagation:()=>{}} as MouseEvent);
    expect(replaced.onNewGame).not.toHaveBeenCalled();expect(replaced.onContinue).not.toHaveBeenCalled();replaced.dispose();
    const started=setup(true);started.tick();started.click(started.continueGame);started.click(started.newGame);expect(started.onContinue).toHaveBeenCalledOnce();expect(started.onNewGame).not.toHaveBeenCalled();started.dispose();
  });
});
