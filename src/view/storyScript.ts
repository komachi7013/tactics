import type { Unit } from '../domain/types';
import type { StoryPage } from './storyPanel';

export type SpeakerFace = Pick<Unit, 'id' | 'weapon'>;
const speakers: Record<string, SpeakerFace> = {
  'リセ': { id: 'ally-lise', weapon: 'melee' }, 'ガラン': { id: 'ally-garan', weapon: 'melee' },
  'ネイア': { id: 'ally-neia', weapon: 'bow' }, 'セナ': { id: 'ally-sena', weapon: 'melee' },
  'イヴァ': { id: 'ally-iva', weapon: 'melee' }, 'ダニ': { id: 'ally-dani', weapon: 'bow' },
  'トマ': { id: 'escort-toma', weapon: 'melee' },
};
/** Story portraits do not depend on deployment, HP, current job or inspection target. */
export function storySpeakerFace(id: string): SpeakerFace | undefined {
  return Object.values(speakers).find(person => person.id === id);
}
function decodeText(value: string): string {
  const named: Record<string,string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, key: string) => {
    if (key[0] !== '#') return named[key.toLowerCase()] ?? original;
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : parseInt(key.slice(1),10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : original;
  });
}

/** Only explicit authored HTML block boundaries; no sentence/role guessing or HTML rendering. */
export function readAuthoredStory(html: string): StoryPage[] {
  const pages: StoryPage[] = [];
  let block = '', text = '';
  const flush = () => {
    const sourceText = decodeText(text).trim();
    if (sourceText) {
      // A speaker is written before a complete Japanese quote in a blockquote.
      const quote = block === 'blockquote' ? /^([^「\n]+)(「[\s\S]*」)$/.exec(sourceText) : null;
      if (quote) {
        const name = quote[1];
        pages.push({ text: quote[2], speaker: { name, unitId: Object.prototype.hasOwnProperty.call(speakers,name) ? speakers[name].id : undefined }, sourceText });
      } else pages.push({ text: sourceText, sourceText });
    }
    text = ''; block = '';
  };
  for (const token of html.split(/(<[^>]*>)/g)) {
    if (!token.startsWith('<')) { text += token; continue; }
    const tag = /^<\s*(\/?)\s*([a-z\d]+)/i.exec(token);
    if (!tag) continue;
    const name = tag[2].toLowerCase(), closing = Boolean(tag[1]);
    if (name === 'br' && !closing) { text += '\n'; continue; }
    if (['p', 'blockquote', 'h1', 'h2', 'h3', 'li'].includes(name)) {
      if (closing) flush();
      else { flush(); block = name; }
    }
    // Inline emphasis and wrappers affect presentation only. Unknown text is retained.
  }
  flush();
  return pages;
}
