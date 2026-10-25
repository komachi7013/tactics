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
  function setup(hasCheckpoint=false){
    let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const doc=new DocumentPort(),start=vi.fn();
    const dispose=mountStartScreen(doc.host as unknown as HTMLElement,{hasCheckpoint,battleLabel:'B05 イェルン文書蔵',warning:'元の保存を保持します。',qaNotice:'隔離QA: title-test',start});
    const all=doc.host.all(),root=all.find(n=>n.className==='start-screen')!,action=all.find(n=>n.className==='start-action')!;
    const click=(detail=1)=>action.onclick?.({detail,preventDefault:vi.fn(),stopPropagation:vi.fn()} as unknown as MouseEvent);
    const key=(key:string,repeat=false,target=action)=>root.listeners.get('keydown')?.({key,repeat,target,ctrlKey:false,metaKey:false,altKey:false,preventDefault:vi.fn(),stopPropagation:vi.fn()} as unknown as KeyboardEvent);
    return{doc,all,root,action,start,dispose,click,key,tick:()=>{now+=300;}};
  }
  it('uses DOM title/accessible focus, one primary action, and an optional progress/warning/QA note',()=>{
    const s=setup(true);expect(s.doc.active).toBe(s.action);expect(s.action.textContent).toBe('続きから');
    expect(s.root.attrs).toMatchObject({role:'dialog','aria-modal':'true','aria-labelledby':'start-title'});
    expect(s.all.find(n=>n.id==='start-title')!.textContent).toBe('澪を継ぐ者');
    expect(s.all.find(n=>n.className==='start-note')!.textContent).toContain('戦闘途中');
    expect(s.all.find(n=>n.className==='start-qa')!.hidden).toBe(false);
  });
  it('rejects immediate/double/held and off-button input, completes once, and rejects queued callbacks after disposal',()=>{
    const s=setup(),stale=s.action.onclick!;s.click();expect(s.start).not.toHaveBeenCalled();
    s.tick();s.click(2);s.key('Enter',true);s.key('Enter',false,s.root);s.key('ArrowRight');expect(s.start).not.toHaveBeenCalled();
    s.key(' ');s.click();s.key('Enter');expect(s.start).toHaveBeenCalledOnce();expect(s.action.disabled).toBe(true);
    s.dispose();stale({detail:1,preventDefault:()=>{},stopPropagation:()=>{}} as MouseEvent);expect(s.start).toHaveBeenCalledOnce();
  });
  it('does not depend on artwork loading and ignores a stale artwork error after replacement',()=>{
    const s=setup(),image=s.all.find(n=>n.onerror)!;const stale=image.onerror!;
    stale();expect(image.hidden).toBe(true);expect(s.all.find(n=>n.className==='start-image-note')!.hidden).toBe(false);
    s.tick();s.click();expect(s.start).toHaveBeenCalledOnce();s.dispose();
    s.doc.host.replaceChildren();expect(()=>stale()).not.toThrow();expect(image.onerror).toBeNull();
    const t=setup();t.doc.host.replaceChildren();t.tick();t.click();expect(t.start).not.toHaveBeenCalled();
  });
});
