import type { BattleId } from '../domain/types';
import { getBattleConfig } from '../domain/battles';

export function storyScenery(id: BattleId, presentation: 'intro' | 'result' | 'ending' | 'field') {
  if (presentation === 'field') return undefined;
  if (presentation === 'ending') return { background: '/assets/story/epilogue.jpg', chapterTitle: '終幕：同じ杭に、別々の記録を' };
  const config = getBattleConfig(id);
  return {
    background: `/assets/story/${id.toLowerCase()}.jpg`,
    chapterTitle: presentation === 'intro' ? `${Number(id.slice(1))}章：${config.subtitle} 〜${config.title}〜` : undefined,
  };
}
