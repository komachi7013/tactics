import { afterEach, describe, expect, it, vi } from 'vitest';
import { B01_INTRO, B01_GUIDE, StoryCursor, mountStoryPanel, type StoryPage } from '../src/view/storyPanel';
import { createInitialState } from '../src/domain/engine';

// DOM port tests exercise lifecycle/input wiring, not browser layout or screenshots.
class ElementPort {
  children: ElementPort[] = []; parent: ElementPort | null = null;
  attrs: Record<string,string> = {}; dataset: Record<string,string> = {};
  className=''; id=''; src=''; textContent=''; hidden=false; disabled=false; tabIndex=-1; scrollTop=0;
  onclick: ((e: MouseEvent) => void) | null = null; onerror: (() => void) | null = null;
  listeners = new Map<string, (event: KeyboardEvent) => void>();
  classList={add:(s:string)=>{this.className+=' '+s;}};
  constructor(readonly ownerDocument: DocumentPort, readonly tagName='DIV') {}
  get isConnected():boolean { return this===this.ownerDocument.host || !!this.parent?.isConnected; }
  append(...nodes:ElementPort[]) { for(const n of nodes){n.parent=this;this.children.push(n);} }
  replaceChildren(...nodes:ElementPort[]) { this.children.forEach(n=>n.parent=null);this.children=[];this.append(...nodes); }
  setAttribute(k:string,v:string){this.attrs[k]=v;}
  addEventListener(k:string,f:(event:KeyboardEvent)=>void){this.listeners.set(k,f);}
  removeEventListener(k:string){this.listeners.delete(k);}
  focus(){this.ownerDocument.active=this;}
  all():ElementPort[]{return [this,...this.children.flatMap(n=>n.all())];}
}
class DocumentPort {
  host=new ElementPort(this); active:ElementPort|null=null;
  get activeElement(){return this.active;}
  createElement(tag:string){return new ElementPort(this,tag.toUpperCase());}
  getSelection():Selection|null{return null;}
}
let now=1000;
function setup(pages:readonly StoryPage[]=B01_INTRO){
  now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
  const doc=new DocumentPort();vi.stubGlobal('document',doc);
  const units=createInitialState().units,before=structuredClone(units),complete=vi.fn();
  const dispose=mountStoryPanel(doc.host as unknown as HTMLElement,{title:'B01',pages,completeLabel:'作戦説明へ',findSpeaker:id=>units.find(u=>u.id===id),complete});
  const all=()=>doc.host.all(),text=()=>all().find(n=>n.className==='story-text')!;
  const buttons=()=>all().filter(n=>n.tagName==='BUTTON');
  const click=(n:ElementPort,detail=1)=>n.onclick?.({detail,stopPropagation:vi.fn()} as unknown as MouseEvent);
  const key=(key:string,target=buttons()[1],repeat=false)=>{const e={key,target,repeat,ctrlKey:false,metaKey:false,altKey:false,preventDefault:vi.fn(),stopPropagation:vi.fn()};doc.host.children[0].listeners.get('keydown')?.(e as unknown as KeyboardEvent);return e;};
  return{doc,all,text,buttons,click,key,complete,dispose,units,before};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('authored B01 story',()=>{
  it('retains complete original blocks and does not invent an unnamed speaker',()=>{
    expect(B01_INTRO.map(p=>p.text)).toEqual(['「杭は流されていない。\n……地図のほうが、書き換えられている。」','測量官リセは、警備隊が接収する前に水位痕と住民名簿を確保しようと決めた。渡し守ネイアが水路を指し、ガランは退路に立つ。']);
    expect(B01_INTRO.every(p=>!p.speaker)).toBe(true);
    expect(B01_GUIDE).toBe('記録は上下左右の隣接から1行動で取得。リセが倒れると敗北。水門は任意。次ラウンドから対象水路の移動費2→1（浅瀬適性のある人物は1のまま）。');
  });
  it('ignores rapid/repeated inputs and settles once, including after back/replay',()=>{
    const c=new StoryCursor(2);expect(c.input('next',0)).toBe('page');expect(c.input('next',100)).toBe('ignored');
    expect(c.input('next',300,true)).toBe('ignored');expect(c.input('back',300)).toBe('page');expect(c.index).toBe(0);
    c.input('next',600);expect(c.input('next',900)).toBe('complete');expect(c.input('next',1200)).toBe('ignored');
  });
  it('fresh mount starts at first block (re-read and reload do not consume a turn)',()=>{
    const a=new StoryCursor(2);a.input('next',0);expect(new StoryCursor(2).index).toBe(0);
  });
});
describe('story input and lifecycle',()=>{
  it('requires the labelled final action; text taps do not silently start combat',()=>{
    const s=setup();s.click(s.text());expect(s.text().textContent).toBe(B01_INTRO[1].text);
    now+=300;s.click(s.text());expect(s.complete).not.toHaveBeenCalled();s.click(s.buttons()[1]);expect(s.complete).toHaveBeenCalledOnce();
    now+=300;s.click(s.buttons()[1]);expect(s.complete).toHaveBeenCalledOnce();expect(s.units).toEqual(s.before);
  });
  it('blocks a double click and held Enter from skipping blocks',()=>{
    const s=setup();s.click(s.buttons()[1]);now+=300;s.click(s.buttons()[1],2);s.key('Enter',s.buttons()[1],true);
    expect(s.complete).not.toHaveBeenCalled();s.key('Enter');expect(s.complete).toHaveBeenCalledOnce();
  });
  it('Escape goes back without dismissing; Tab remains for the existing modal trap',()=>{
    const s=setup();s.key('ArrowRight');now+=300;const e=s.key('Escape');expect(e.preventDefault).toHaveBeenCalled();
    expect(s.text().textContent).toBe(B01_INTRO[0].text);expect(s.complete).not.toHaveBeenCalled();expect(s.key('Tab').preventDefault).not.toHaveBeenCalled();
  });
  it('right arrow advances even when back has focus, without treating arrow as a back-button click',()=>{
    const s=setup();s.key('ArrowRight');now+=300;s.key('ArrowLeft');now+=300;s.key('ArrowRight',s.buttons()[0]);
    expect(s.text().textContent).toBe(B01_INTRO[1].text);expect(s.complete).not.toHaveBeenCalled();
  });
  it('does not finish the last block with arrows or an Enter outside the explicit final button',()=>{
    const s=setup();s.click(s.buttons()[1]);now+=300;
    s.key('ArrowRight',s.buttons()[0]);s.key('ArrowRight',s.buttons()[1]);
    s.key('Enter',s.doc.host.children[0]);s.key(' ',s.text());
    expect(s.complete).not.toHaveBeenCalled();
    s.key('Enter',s.buttons()[1]);expect(s.complete).toHaveBeenCalledOnce();
  });
  it('returns focus to next when reaching the first block disables the focused back button',()=>{
    const s=setup();s.click(s.buttons()[1]);now+=300;s.buttons()[0].focus();s.click(s.buttons()[0]);
    expect(s.buttons()[0].disabled).toBe(true);expect(s.doc.active).toBe(s.buttons()[1]);
  });
  it('does not dispatch queued callbacks after disposal or replacement',()=>{
    const s=setup([{text:'one'}]);const queued=s.buttons()[1].onclick!;s.dispose();queued({detail:1,stopPropagation:vi.fn()} as unknown as MouseEvent);expect(s.complete).not.toHaveBeenCalled();
    const t=setup([{text:'one'}]);const old=t.buttons()[1].onclick!;t.doc.host.replaceChildren();old({detail:1,stopPropagation:vi.fn()} as unknown as MouseEvent);expect(t.complete).not.toHaveBeenCalled();
  });
  it('shows no invented portrait for narrator or missing assets/characters',()=>{
    const s=setup([{text:'Narration'},{text:'unknown',speaker:{name:'語り手',unitId:'not-a-unit'}}]);
    expect(s.all().find(n=>n.className==='story-portrait')!.hidden).toBe(true);
    s.click(s.buttons()[1]);expect(s.all().find(n=>n.className==='story-speaker')!.textContent).toBe('語り手');expect(s.all().find(n=>n.className==='story-portrait')!.hidden).toBe(true);
  });
  it('uses the shared Neia-standard face widget for explicitly authored speakers',()=>{
    const s=setup([{text:'長い本文。'.repeat(300),speaker:{name:'ネイア',unitId:'ally-neia'}}]);
    const face=s.all().find(n=>n.className.split(' ').includes('inspection-face'))!;expect(face.dataset.faceAsset).toBe('neia');expect(face.children[0].src).toBe('/assets/motion-v1/portraits/neia.png');
    expect(s.text().textContent.length).toBeGreaterThan(1000);expect(s.all().find(n=>n.className==='story-speaker')!.textContent).toBe('ネイア');
    face.children[0].onerror!();expect(face.children[0].hidden).toBe(true);expect(s.all().find(n=>n.className==='story-speaker')!.textContent).toBe('ネイア');
  });
  it('preserves a selected long paragraph and resets its scroll only on an actual page change',()=>{
    const s=setup([{text:'長い本文。'.repeat(300)},{text:'次の本文'}]);
    s.doc.getSelection=()=>({toString:()=> '選択中'} as unknown as ReturnType<Document['getSelection']>);
    s.text().scrollTop=500;s.click(s.text());expect(s.text().textContent.length).toBeGreaterThan(1000);
    expect(s.text().scrollTop).toBe(500);
    s.click(s.buttons()[1]);expect(s.text().textContent).toBe('次の本文');expect(s.text().scrollTop).toBe(0);
  });
});
