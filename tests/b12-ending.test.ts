import {describe,it,expect} from 'vitest';
import {endingContent} from '../src/ending';
describe('B12 fixed epilogue and optional compensation record',()=>{
 it.each([{evidence:[]},{evidence:['B05:K']}])('keeps political procedure, safety and responsibility with evidence $evidence',({evidence})=>{
  const text=endingContent(evidence);
  for(const required of ['生きたまま','裁定所','首府警備隊','避難を確認した後','水は複数の施設から少しずつ','安全を確かめた後','正式な採決','計九票','計三票','必要な七票','期限付き','測量をやり直す','暫定的に議場への参加','上限を定めた','公開の場で審理','立会補助員','返済','土地をめぐる争い','赦してほしいとは、言わなかった'])expect(text).toContain(required);
  expect(text.match(/<li>/g)).toHaveLength(5);expect(text).not.toContain('B13');
 });
 it('changes only the optional compensation paragraph and never removes the rights or fixed ending',()=>{
  const withK=endingContent(['B05:K']),withoutK=endingContent([]);
  expect(withK).toContain('持ち帰った補償名簿K');expect(withoutK).toContain('補償名簿Kは持ち帰れなかった');
  const remove=(s:string)=>s.replace(/<p data-ending="compensation">.*?<\/p>/,'');
  expect(remove(withK)).toBe(remove(withoutK));
  for(const s of [withK,withoutK]){expect(s).toContain('補償');expect(s).toContain('権利');expect(s).toContain('責任が帳消しになるわけではなかった');}
 });
 it('leaves input evidence unchanged and treats unrelated evidence as no K',()=>{
  const evidence=Object.freeze(['B11:W1','B12:U','B12:V']);expect(endingContent(evidence)).toBe(endingContent([]));expect(evidence).toEqual(['B11:W1','B12:U','B12:V']);
 });
});
