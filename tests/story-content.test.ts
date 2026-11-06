import { describe, expect, it } from 'vitest';
import { briefingRulesText } from '../src/view/briefingContent';
import { introStoryHtml, resultStoryHtml } from '../src/view/storyContent';
import { readAuthoredStory, storySpeakerFace } from '../src/view/storyScript';
import { StoryCursor } from '../src/view/storyPanel';
import { endingContent } from '../src/ending';
import { BATTLE_IDS } from '../src/progression';
import type { BattleId } from '../src/domain/types';

const plain = (html:string) => html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/\s+/g,'');
const pageText = (html:string) => readAuthoredStory(html).map(p=>p.sourceText).join('').replace(/\s+/g,'');
const canonicalOnly = (html:string) => html.replace(/<blockquote data-story-addition="[^"]+">[\s\S]*?<\/blockquote>/g,'');

describe('player-facing story and mission copy',()=>{
  for(const id of BATTLE_IDS){
    it(`${id}: explains the task and retains complete readable story blocks`,()=>{
      const guide = briefingRulesText(id,{roundLimit:19});
      expect(guide).toContain('第19ラウンド');
      expect(guide).not.toMatch(/未実装|抽象化|個別HP|登録床|非致死|発効|生存味方戦闘員/);
      for(const html of [introStoryHtml(id),resultStoryHtml(id,[]),resultStoryHtml(id,['K'])]){
        expect(html).not.toMatch(/未実装|抽象化|個別HP|試作シナリオ|政治票計算|B\d{2}で/);
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
  it('keeps the optional compensation record separate from the required archive documents',()=>{
    expect(briefingRulesText('B05',{roundLimit:10})).toContain('持ち帰らなくても先へ進めます');
    expect(resultStoryHtml('B05',['K'])).toContain('補償名簿Kも持ち帰ることができた');
    expect(resultStoryHtml('B05',[])).toContain('補償名簿Kは持ち帰れなかった');
  });
});
describe('explicit speaker attribution and non-lossy block handling',()=>{
  it('identifies Lise in the opening surveying quotations',()=>{
    for(const id of ['B01','B02'] as const)expect(readAuthoredStory(introStoryHtml(id))[0].speaker).toEqual({name:'リセ',unitId:'ally-lise'});
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
