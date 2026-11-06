import { describe, expect, it } from 'vitest';
import { BATTLE_IDS } from '../src/progression';
import { introStoryHtml, resultStoryHtml } from '../src/view/storyContent';
import { readAuthoredStory, storySpeakerFace } from '../src/view/storyScript';
import { BATTLE_DIALOGUE, ENDING_DIALOGUE } from '../src/view/storyExpansion';
import { PROLOGUE_PARAGRAPHS } from '../src/view/prologue';
import { endingContent } from '../src/ending';

const additions = (html: string) => html.match(/<blockquote data-story-addition="[^"]+">[\s\S]*?<\/blockquote>/g) ?? [];
const addedText = (html: string) => additions(html).map(block => readAuthoredStory(block)[0].sourceText).join('\n');
const withoutCompensation = (html: string) => html.replace(/<p data-ending="compensation">[\s\S]*?<\/p>/, '');

describe('authored dialogue expansion and reveal order', () => {
  it('adds 176 speeches across the prologue, twelve intro/results and ending', () => {
    let battleSpeeches = 0;
    for (const id of BATTLE_IDS) {
      const intro = additions(introStoryHtml(id)), result = additions(resultStoryHtml(id, []));
      expect(intro, `${id} intro`).toHaveLength(8);
      expect(result, `${id} result`).toHaveLength(5);
      battleSpeeches += intro.length + result.length;
    }
    const opening = PROLOGUE_PARAGRAPHS.filter(paragraph => /^(リセ|ガラン|ネイア)「/.test(paragraph));
    expect(opening).toHaveLength(6);
    expect(additions(endingContent([]))).toHaveLength(14);
    expect(battleSpeeches + opening.length + ENDING_DIALOGUE.length).toBe(176);
  });

  it('renders additions as explicit authored speeches with existing person identities', () => {
    for (const id of BATTLE_IDS) for (const phase of ['intro', 'result'] as const) {
      const html = phase === 'intro' ? introStoryHtml(id) : resultStoryHtml(id, []);
      const pages = additions(html).flatMap(readAuthoredStory);
      expect(pages.map(page => page.sourceText)).toEqual(BATTLE_DIALOGUE[id][phase].map(line => `${line.speaker}「${line.text}」`));
      for (const page of pages) {
        expect(page.speaker?.unitId).toBeTruthy();
        expect(storySpeakerFace(page.speaker!.unitId!)).toBeDefined();
      }
    }
  });

  it('does not reveal Lise’s omitted measurement/signature ownership before B05 result', () => {
    const early = ['B01', 'B02', 'B03', 'B04'] as const;
    const text = early.flatMap(id => [...BATTLE_DIALOGUE[id].intro, ...BATTLE_DIALOGUE[id].result])
      .concat([...BATTLE_DIALOGUE.B05.intro]).map(line => line.text).join('\n');
    expect(text).not.toMatch(/私の署名|私の印|測っていない|実測を省|再認証した|資格停止/);
    expect(PROLOGUE_PARAGRAPHS.join('')).not.toMatch(/薄明放流|再認証|ヴェスク|資格停止/);
    expect(addedText(resultStoryHtml('B05', []))).toContain('測っていない場所に、確かめた印を置いた');
  });

  it('keeps early speakers within established meetings and B06 Neia absent', () => {
    for (const id of ['B01', 'B02'] as const) {
      const speakers = [...BATTLE_DIALOGUE[id].intro, ...BATTLE_DIALOGUE[id].result].map(line => line.speaker);
      expect(speakers.every(speaker => ['リセ', 'ガラン', 'ネイア'].includes(speaker))).toBe(true);
    }
    expect(BATTLE_DIALOGUE.B04.intro.some(line => line.speaker === 'ダニ')).toBe(false);
    expect(BATTLE_DIALOGUE.B04.result.some(line => line.speaker === 'ダニ')).toBe(true);
    expect([...BATTLE_DIALOGUE.B06.intro, ...BATTLE_DIALOGUE.B06.result].some(line => line.speaker === 'ネイア')).toBe(false);
    expect(addedText(introStoryHtml('B06'))).toContain('ネイアが戻るのを待ってはいられません');
  });

  it('places B05’s final exchange before departure, never inventing a post-departure Neia reply', () => {
    const html = resultStoryHtml('B05', []), departure = html.indexOf('<p>ネイアは調査隊を離れた。');
    expect(departure).toBeGreaterThan(0);
    const lastAddition = html.lastIndexOf('data-story-addition="B05:result"');
    expect(lastAddition).toBeLessThan(departure);
    expect(html.slice(departure)).not.toMatch(/<blockquote[^>]*>ネイア「/);
  });

  it('keeps the closing preparation/next-stage instructions after the added conversation', () => {
    for (const id of BATTLE_IDS) {
      const intro = introStoryHtml(id), preparation = intro.search(/<p>(?:出撃は|リセ・ガラン)/);
      if (preparation >= 0) expect(intro.lastIndexOf(`data-story-addition="${id}:intro"`)).toBeLessThan(preparation);
      const result = resultStoryHtml(id, []), instructions = result.search(/<p>(?:<strong>)?(?:次は|第[234]章|「終幕を読む」)/);
      if (instructions >= 0) expect(result.lastIndexOf(`data-story-addition="${id}:result"`)).toBeLessThan(instructions);
    }
  });

  it('does not turn B07’s rescue cooperation into forgiveness or absolution', () => {
    const intro = addedText(introStoryHtml('B07')), result = addedText(resultStoryHtml('B07', []));
    expect(intro).toContain('岸へ送る道をつくる');
    expect(intro).toContain('赦したことにはしないで');
    expect(intro).toContain('今日は住民を助けるために');
    expect(result).toContain('救えなかった人が戻るわけではない');
  });

  it('keeps the B01/A-B and B02 observation records distinct from the B03 resident-list context', () => {
    expect(addedText(introStoryHtml('B01'))).toContain('今この場で確保するのは、水位の記録二件');
    expect(addedText(introStoryHtml('B02'))).toContain('高台で記録を取ったら、東岸へ');
    expect(addedText(introStoryHtml('B03'))).toContain('写しも負傷者も、ここから運び出しましょう');
    for (const id of ['B01', 'B02'] as const) expect(addedText(introStoryHtml(id))).not.toMatch(/記録[ＡAＢBＯO].{0,8}(住民名簿|名簿写し)/);
  });

  it('maintains four, six and nine prospective votes, with formal voting only after safety', () => {
    expect(addedText(resultStoryHtml('B09', []))).toContain('支持は四票相当');
    expect(addedText(introStoryHtml('B10'))).toContain('支持はまだ四票相当');
    expect(addedText(resultStoryHtml('B10', []))).toContain('六票相当');
    expect(introStoryHtml('B11')).toContain('六票');
    expect(addedText(resultStoryHtml('B11', []))).toContain('支持見込みは九票相当');
    expect(addedText(resultStoryHtml('B11', []))).toContain('正式採決はまだ');
    expect(addedText(resultStoryHtml('B12', []))).toContain('安全を確保した後、正式採決と審理へ');
    expect(addedText(endingContent([]))).toContain('賛成九票、反対三票');
    expect(endingContent([])).toContain('成立に必要な七票');
  });

  it('keeps seizure, operation staff and Lise/Toma responsibility separate from rescue', () => {
    expect(addedText(resultStoryHtml('B09', []))).toContain('身柄を押さえるのは首府警備隊の役目');
    expect(addedText(introStoryHtml('B12'))).toContain('生きたまま制圧し');
    expect(addedText(introStoryHtml('B11'))).toContain('水門を動かす仕事は止められない');
    const ending = addedText(endingContent([]));
    expect(ending).toContain('資格停止のままですが、立会補助員');
    expect(ending).toContain('指示を出した人の名の後ろに、私の筆を隠さない');
    expect(endingContent([]).match(/<li>/g)).toHaveLength(5);
  });

  it('changes no expanded dialogue or fixed ending between K outcomes and never removes compensation rights', () => {
    const records = Object.freeze(['K']), withKResult = resultStoryHtml('B05', records), withoutKResult = resultStoryHtml('B05', []);
    expect(addedText(withKResult)).toBe(addedText(withoutKResult));
    for (const html of [withKResult, withoutKResult]) expect(addedText(html)).toContain('受けた被害も補償を求める権利も変わらない');
    const withK = endingContent(['B05:K']), withoutK = endingContent([]);
    expect(withoutCompensation(withK)).toBe(withoutCompensation(withoutK));
    expect(addedText(withK)).toBe(addedText(withoutK));
    expect(addedText(withK)).toContain('資料がある人だけの補償にしない');
    expect(records).toEqual(['K']);
  });

  it('places new ending conversations in safety, vote, responsibility and measurement order', () => {
    const html = endingContent([]);
    expect(html.indexOf('data-story-addition="ending:safety"')).toBeLessThan(html.indexOf('<h3>十二票の議場</h3>'));
    expect(html.indexOf('data-story-addition="ending:vote"')).toBeLessThan(html.indexOf('<h3>流域再建協定</h3>'));
    expect(html.indexOf('data-story-addition="ending:responsibility"')).toBeLessThan(html.indexOf('data-ending="compensation"'));
    expect(html.indexOf('data-story-addition="ending:measurement"')).toBeLessThan(html.indexOf('<blockquote>ネイア「舟は出す。'));
    expect(additions(html).flatMap(readAuthoredStory).map(page => page.sourceText)).toEqual(ENDING_DIALOGUE.map(line => `${line.speaker}「${line.text}」`));
  });
});
