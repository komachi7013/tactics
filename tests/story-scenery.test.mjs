import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { storyScenery } from '../src/view/storyScenery';

describe('authored scenario plates', () => {
 it('supplies all twelve chapter cards and both before/after scene routes with real JPEGs', () => {
  for (let chapter=1;chapter<=12;chapter++) {
   const id = `B${String(chapter).padStart(2,'0')}`;
   const intro = storyScenery(id,'intro'), result = storyScenery(id,'result');
   expect(intro.chapterTitle).toMatch(new RegExp(`^${chapter}章：`));
   expect(intro.background).toBe(result.background); expect(result.chapterTitle).toBeUndefined();
   const path = new URL(`../public${intro.background}`, import.meta.url);
   expect(existsSync(path)).toBe(true); expect([...readFileSync(path).subarray(0,3)]).toEqual([255,216,255]);
   expect(storyScenery(id,'field')).toBeUndefined();
  }
 });
 it('uses a dedicated epilogue, and every background has a prompt and provenance', () => {
  const ending = storyScenery('B12','ending');
  expect(ending.chapterTitle).toContain('終幕');
  expect(existsSync(new URL(`../public${ending.background}`,import.meta.url))).toBe(true);
  const provenance = JSON.parse(readFileSync(new URL('../public/assets/story/provenance.json',import.meta.url),'utf8'));
  expect(provenance.assets).toHaveLength(14);
  for (const asset of provenance.assets) { expect(asset.art_source).toBe('host_image'); expect(asset.prompt.length).toBeGreaterThan(100); }
 });
});
