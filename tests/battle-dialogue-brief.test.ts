import { describe,expect,it } from 'vitest';
import { mountBattleDialogueBrief } from '../src/view/battleDialogueBrief';
import type { BattleDialogue } from '../src/view/battleDialogues';
class NodePort {
  children:NodePort[]=[];hidden=false;className='';type='';textContent='';onclick:(()=>void)|null=null;attrs:Record<string,string>={};
  constructor(readonly ownerDocument:{createElement:(tag:string)=>NodePort}){}
  replaceChildren(...n:NodePort[]){this.children=n;}setAttribute(k:string,v:string){this.attrs[k]=v;}
}
it('brief expiry never advances game, clears newer text, or leaks after a scene change',()=>{
  const doc={createElement:(_tag:string):NodePort=>new NodePort(doc)},host=new NodePort(doc);let id=0;
  const queued=new Map<number,{fn:()=>void;ms:number}>(),clock={setTimeout:(fn:()=>void,ms:number)=>{queued.set(++id,{fn,ms});return id;},clearTimeout:(h:unknown)=>{queued.delete(h as number);}};
  const view=mountBattleDialogueBrief(host as unknown as HTMLElement,clock);
  const row=(text:string):BattleDialogue=>({id:text,battleId:'B01',kind:'brief',title:'short',pages:[{text,speaker:{name:'リセ'}}]});
  view.show(row('one'));const stale=queued.get(1)!;expect(stale.ms).toBeGreaterThanOrEqual(6500);expect(host.hidden).toBe(false);
  view.show(row('two'));stale.fn();expect(host.children[0].textContent).toContain('two');
  view.clear();expect(host.hidden).toBe(true);expect(queued.size).toBe(0);
  view.show(row('three'));const late=[...queued.values()][0].fn;view.dispose();late();expect(host.children).toEqual([]);expect(host.hidden).toBe(true);
  view.show(row('after-dispose'));expect(host.children).toEqual([]);
});
