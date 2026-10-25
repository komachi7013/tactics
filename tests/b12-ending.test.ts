import {describe,it,expect} from 'vitest';
import {endingContent} from '../src/ending';
describe('B12 fixed epilogue and optional compensation record',()=>{
 it.each([{evidence:[]},{evidence:['B05:K']}])('keeps political procedure, safety and responsibility with evidence $evidence',({evidence})=>{
  const text=endingContent(evidence);
  for(const required of ['生存したまま保全','裁定所','首府警備隊','避難確認','分散放流','安全確保の後','正式採決','計9票','計3票','過半数7票','期限付き','共同再測量','暫定参加','上限付き','公開審理','資格停止中の立会補助員','返済','土地争い','赦しの約束は求めない'])expect(text).toContain(required);
  expect(text.match(/<li>/g)).toHaveLength(5);expect(text).not.toContain('B13');
 });
 it('changes only the optional compensation paragraph and never removes the rights or fixed ending',()=>{
  const withK=endingContent(['B05:K']),withoutK=endingContent([]);
  expect(withK).toContain('搬出した補償名簿K');expect(withoutK).toContain('補償名簿Kは搬出できなかった');
  const remove=(s:string)=>s.replace(/<p data-ending="compensation">.*?<\/p>/,'');
  expect(remove(withK)).toBe(remove(withoutK));
  for(const s of [withK,withoutK]){expect(s).toContain('補償');expect(s).toContain('権利');expect(s).toContain('責任は帳消しにならない');}
 });
 it('leaves input evidence unchanged and treats unrelated evidence as no K',()=>{
  const evidence=Object.freeze(['B11:W1','B12:U','B12:V']);expect(endingContent(evidence)).toBe(endingContent([]));expect(evidence).toEqual(['B11:W1','B12:U','B12:V']);
 });
});
