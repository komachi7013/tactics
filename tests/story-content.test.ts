import { describe, expect, it } from 'vitest';
import original from './fixtures/story-original.json';
import briefingOriginal from './fixtures/briefing-original.json';
import { briefingRulesText } from '../src/view/briefingContent';
import { introStoryHtml, resultStoryHtml } from '../src/view/storyContent';
import { readAuthoredStory, storySpeakerFace } from '../src/view/storyScript';
import { StoryCursor } from '../src/view/storyPanel';
import { endingContent } from '../src/ending';
import { BATTLE_IDS } from '../src/progression';
import type { BattleId } from '../src/domain/types';

// Independent plain text comparison: formatting wrappers may move, authored text may not.
const plain = (html:string) => html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/\s+/g,'');
const pageText = (html:string) => readAuthoredStory(html).map(p=>p.sourceText).join('').replace(/\s+/g,'');
const canonicalOnly = (html:string) => html.replace(/<blockquote data-story-addition="[^"]+">[\s\S]*?<\/blockquote>/g,'');
type StoryVariant='intro'|'result'|'resultWithK';
type CopyEdit=readonly [before:string,after:string];
// The archived fixture stays unchanged. Only these explicitly approved operation
// supplements may differ; dialogue, events, optional K and all other HTML remain exact.
const operationCopyEdits:Partial<Record<BattleId,Partial<Record<'intro'|'result',readonly CopyEdit[]>>>>={
  B04:{result:[['職固有技は今後拡充します。','']]},
  B05:{intro:[['新職技は今後拡充します。','']],result:[['新職技は今後拡充します。','']]},
  B06:{intro:[['新職技は今後拡充します。','']],result:[['編成・訓練は戦闘前に変更できます。','出撃メンバーと装備は戦闘前に変更できます。']]},
  B07:{result:[['編成・訓練は戦闘前に変更できます。','出撃メンバーと装備は戦闘前に変更できます。']]},
  B08:{
    intro:[['編成・訓練は戦闘前の「部隊の準備」から変更できます。','出撃メンバーと装備は戦闘前の「出撃準備」で変更できます。']],
    result:[['編成・訓練は戦闘前の「部隊の準備」から変更できます。','出撃メンバーと装備は戦闘前の「出撃準備」で変更できます。']],
  },
  B09:{result:[['職固有技の拡充・','']]},
  B10:{result:[['編成・訓練は戦闘前に変更できます。','出撃メンバーと装備は戦闘前に変更できます。']]},
  B11:{intro:[['弁復旧は個人の新職技ではありません。','弁の復旧には救出した保守員が協力します。']],result:[['職固有技の拡充・','']]},
  B12:{result:[['育成・職業・編成は段階実装中です。職固有技の拡充・','']]},
};
function approvedStoryCopy(id:BattleId,variant:StoryVariant):string {
  let html=original[id][variant];
  for(const [before,after] of operationCopyEdits[id]?.[variant==='intro'?'intro':'result']??[]){
    expect(html.split(before),`${id}/${variant}: approved old copy must occur exactly once`).toHaveLength(2);
    html=html.replace(before,after);
  }
  return html;
}
describe('complete operation instructions retain original conditions',()=>{
  for(const id of BATTLE_IDS)for(const gate of [false,true]){
    it(`${id}: original full briefing, gate=${gate}`,()=>{
      const originalCopy=briefingOriginal.cases[id][gate ? 'withGate':'withoutGate'];
      let expected=gate&&['B01','B02','B03'].includes(id)
        ? originalCopy.replace('水門は任意。次ラウンドから','水門を操作すると、次ラウンドから') : originalCopy;
      if (id === 'B01' && gate) expected = expected.replace('次ラウンドから', '操作直後から');
      if (id === 'B03' && !gate) expected = expected.replace('荷車は味方戦闘員の隣接と次セルの空きを確認し、次R開始に1セルずつ進みます。敵が隣接すると停止。施療士として出撃したセナの手当は+6・2回、荷車も対象。', '荷車の上下左右に生存味方戦闘員を隣接させ、「荷車を押す」で1行動を使い経路上を1マス進めます。荷車全体で1ラウンド1回まで。斜めは不可。敵が荷車に隣接している、次の進行先が埋まっている、通行不能の場合は押せません。ラウンド経過では自動移動しません。セナの手当は+6・2回で、荷車にも使えます。');
      expect(briefingRulesText(id,{gate:gate ? {} : undefined,roundLimit:7},briefingOriginal.context)).toBe(expected);
    });
  }
  it('keeps the supplied convoy deadline and expanded exit coordinates verbatim',()=>{
    expect(briefingRulesText('B03',{roundLimit:19},briefingOriginal.context)).toContain('第19R終了');
    expect(briefingRulesText('B05',{roundLimit:10},{...briefingOriginal.context,archiveExitLabel:'(0,13)'})).toContain('西退去口(0,13)');
  });
});
describe('verbatim scenario migration for every battle',()=>{
  for(const id of BATTLE_IDS){
    it(`${id}: retains original HTML except approved operation copy, including both optional K outcomes`,()=>{
      expect(canonicalOnly(introStoryHtml(id))).toBe(approvedStoryCopy(id,'intro'));
      expect(canonicalOnly(resultStoryHtml(id,[]))).toBe(approvedStoryCopy(id,'result'));
      expect(canonicalOnly(resultStoryHtml(id,['K']))).toBe(approvedStoryCopy(id,'resultWithK'));
      const quotations=(html:string)=>html.match(/<blockquote>[\s\S]*?<\/blockquote>/g)??[];
      expect(quotations(introStoryHtml(id))).toEqual(quotations(original[id].intro));
      expect(quotations(resultStoryHtml(id,[]))).toEqual(quotations(original[id].result));
      expect(quotations(resultStoryHtml(id,['K']))).toEqual(quotations(original[id].resultWithK));
    });
    it(`${id}: every original dialogue/narrative character remains in authored order`,()=>{
      for(const html of [introStoryHtml(id),resultStoryHtml(id,[]),resultStoryHtml(id,['K'])]){
        expect(pageText(html)).toBe(plain(html));
        for(const page of readAuthoredStory(html)){
          expect(page.text.length).toBeGreaterThan(0);
          if(page.speaker){expect(page.speaker.name+page.text).toBe(page.sourceText);expect(page.text.startsWith('「')).toBe(true);}
        }
      }
    });
    it(`${id}: complete/re-read/back have no duplicate final transition`,()=>{
      const pages=readAuthoredStory(introStoryHtml(id));const cursor=new StoryCursor(pages.length);let t=0;
      expect(cursor.input('next',t,true)).toBe('ignored');
      for(let i=0;i<pages.length-1;i++){expect(cursor.input('next',t+=300)).toBe('page');expect(cursor.index).toBe(i+1);}
      expect(cursor.input('next',t+=300)).toBe('complete');expect(cursor.input('next',t+=300)).toBe('ignored');
      expect(new StoryCursor(pages.length).index).toBe(0);
    });
  }
});
describe('explicit speaker attribution and non-lossy block handling',()=>{
  it('keeps B01/B02 unsigned quotations as narration',()=>{
    for(const id of ['B01','B02'] as const)expect(readAuthoredStory(introStoryHtml(id))[0].speaker).toBeUndefined();
  });
  it('resolves all named original dialogue independently of deployment and job',()=>{
    const names=new Set<string>();
    for(const id of BATTLE_IDS)for(const page of readAuthoredStory(introStoryHtml(id)+resultStoryHtml(id,[]))){
      if(!page.speaker)continue;names.add(page.speaker.name);expect(page.speaker.unitId).toBeTruthy();expect(storySpeakerFace(page.speaker.unitId!)).toBeDefined();
    }
    expect([...names].sort()).toEqual(['イヴァ','ガラン','セナ','ダニ','トマ','ネイア','リセ']);
    expect(storySpeakerFace('ally-dani')?.id).toBe('ally-dani');expect(storySpeakerFace('escort-toma')?.id).toBe('escort-toma');
  });
  it('preserves unnamed, unknown, and incomplete dialogue without inventing faces',()=>{
    const pages=readAuthoredStory('<blockquote>「匿名。」</blockquote><blockquote>未知の人「本文。」</blockquote><blockquote>リセ「閉じていない</blockquote>');
    expect(pages[0].speaker).toBeUndefined();expect(pages[1].speaker).toEqual({name:'未知の人',unitId:undefined});expect(pages[2].speaker).toBeUndefined();expect(pages[2].text).toBe('リセ「閉じていない');
    expect(storySpeakerFace('constructor')).toBeUndefined();
  });
  it('uses blocks rather than punctuation; retains breaks/entities/unknown wrapper text safely',()=>{
    const pages=readAuthoredStory('<p>第一文。第二文。<br>改行&amp;保持。</p><aside>未知の説明&lt;文字&gt;</aside>');
    expect(pages.map(p=>p.text)).toEqual(['第一文。第二文。\n改行&保持。','未知の説明<文字>']);
  });
  it('retains every ending heading, article, optional compensation paragraph and named final speech',()=>{
    for(const evidence of [[],['B05:K']]){const html=endingContent(evidence);expect(pageText(html)).toBe(plain(html));const pages=readAuthoredStory(canonicalOnly(html));expect(pages.filter(p=>p.speaker).map(p=>p.speaker?.name)).toEqual(['ネイア']);expect(pages.some(p=>p.text.includes('恒久的な議席変更'))).toBe(true);}
  });
});
