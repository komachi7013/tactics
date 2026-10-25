import {afterEach,describe,it,expect,vi} from 'vitest';
import {renderInspectionRoster} from '../src/view/inspectionRoster';
import {createInitialState} from '../src/domain/engine';
class Node {
 children:Node[]=[];dataset:Record<string,string>={};attrs:Record<string,string>={};className='';textContent='';disabled=false;src='';hidden=false;onclick?:()=>void;onerror?:()=>void;
 classList={add:(name:string)=>{this.className+=' '+name}};
 setAttribute(k:string,v:string){this.attrs[k]=v}append(...nodes:Node[]){this.children.push(...nodes)}replaceChildren(...nodes:Node[]){this.children=nodes}
}
afterEach(()=>vi.unstubAllGlobals());
describe('read-only inspection cards',()=>{
 it('shows every person including downed units, current job/HP/status and stable keyboard focus identity',()=>{
  vi.stubGlobal('document',{createElement:()=>new Node()});const host=new Node(),s=createInitialState('B03');s.units[0].hp=0;s.units[1].acted=true;
  const before=structuredClone(s),inspect=vi.fn();renderInspectionRoster(host as unknown as HTMLElement,s.units,s.units[0].id,false,inspect);
  expect(host.children).toHaveLength(s.units.length);
  for(const [i,card]of host.children.entries()){
   expect(card.attrs['aria-label']).toContain(`${s.units[i].name}、HP ${s.units[i].hp}/${s.units[i].maxHp}、${s.units[i].role}`);
   expect(card.dataset.focusKey).toBe('inspect-card:'+s.units[i].id);expect(card.attrs['aria-pressed']).toBe(String(i===0));
   card.onclick!();expect(inspect).toHaveBeenLastCalledWith(s.units[i].id);
  }
  expect(host.children[0].attrs['aria-label']).toContain('退避');expect(host.children[1].attrs['aria-label']).toContain('行動済み');
  expect(s).toEqual(before);
 });
 it('gates disabled interaction and retains textual identity if face loading fails',()=>{
  vi.stubGlobal('document',{createElement:()=>new Node()});const host=new Node(),inspect=vi.fn();renderInspectionRoster(host as unknown as HTMLElement,createInitialState().units,null,true,inspect);
  host.children[0].onclick!();expect(inspect).not.toHaveBeenCalled();const face=host.children[0].children[0].children[0];face.onerror!();expect(face.hidden).toBe(true);expect(host.children[0].attrs['aria-label']).toContain('リセ');expect(host.children[0].children[1].children[0].textContent).toBe('リセ');
 });
 it('labels the subdued commander as preserved without relabeling ally or ordinary enemy withdrawal or mutating state',()=>{
  vi.stubGlobal('document',{createElement:()=>new Node()});const host=new Node(),s=createInitialState('B12');
  for(const id of ['enemy-vesk','enemy-melee-01','ally-neia'])s.units.find(u=>u.id===id)!.hp=0;
  const before=structuredClone(s);renderInspectionRoster(host as unknown as HTMLElement,s.units,null,false,()=>{});
  for(const id of ['enemy-vesk','enemy-melee-01','ally-neia']){
   const card=host.children.find(c=>c.dataset.focusKey==='inspect-card:'+id)!;
   const expected=id==='enemy-vesk'?'制圧済み・保全対象':'退避';
   expect(card.attrs['aria-label']).toContain(expected);expect(card.children[1].children[2].textContent).toContain(expected);
  }
  expect(s).toEqual(before);
 });

});
