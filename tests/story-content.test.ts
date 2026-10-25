import { describe, expect, it } from 'vitest';
import original from './fixtures/story-original.json';
import briefingOriginal from './fixtures/briefing-original.json';
import { briefingRulesText } from '../src/view/briefingContent';
import { introStoryHtml, resultStoryHtml } from '../src/view/storyContent';
import { readAuthoredStory, storySpeakerFace } from '../src/view/storyScript';
import { StoryCursor } from '../src/view/storyPanel';
import { endingContent } from '../src/ending';
import { BATTLE_IDS } from '../src/progression';

// Independent plain text comparison: formatting wrappers may move, authored text may not.
const plain = (html:string) => html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/\s+/g,'');
const pageText = (html:string) => readAuthoredStory(html).map(p=>p.sourceText).join('').replace(/\s+/g,'');
describe('complete operation instructions retain original conditions',()=>{
  for(const id of BATTLE_IDS)for(const gate of [false,true]){
    it(`${id}: original full briefing, gate=${gate}`,()=>{
      expect(briefingRulesText(id,{gate:gate ? {} : undefined,roundLimit:7},briefingOriginal.context))
        .toBe(briefingOriginal.cases[id][gate ? 'withGate':'withoutGate']);
    });
  }
  it('keeps the supplied convoy deadline and expanded exit coordinates verbatim',()=>{
    expect(briefingRulesText('B03',{roundLimit:19},briefingOriginal.context)).toContain('第19R終了');
    expect(briefingRulesText('B05',{roundLimit:10},{...briefingOriginal.context,archiveExitLabel:'(0,13)'})).toContain('西退去口(0,13)');
  });
});
describe('verbatim scenario migration for every battle',()=>{
  for(const id of BATTLE_IDS){
    it(`${id}: retains exact authored HTML including both optional K outcomes`,()=>{
      expect(introStoryHtml(id)).toBe(original[id].intro);
      expect(resultStoryHtml(id,[])).toBe(original[id].result);
      expect(resultStoryHtml(id,['K'])).toBe(original[id].resultWithK);
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
    expect([...names].sort()).toEqual(['イヴァ','セナ','ダニ','トマ','ネイア','リセ']);
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
    for(const evidence of [[],['B05:K']]){const html=endingContent(evidence);expect(pageText(html)).toBe(plain(html));const pages=readAuthoredStory(html);expect(pages.filter(p=>p.speaker).map(p=>p.speaker?.name)).toEqual(['ネイア']);expect(pages.some(p=>p.text.includes('恒久的な議席変更'))).toBe(true);}
  });
});
