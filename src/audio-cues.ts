import AUDIO_FILE_VERSIONS from './audio-versions.json';
import type { BattleId } from './domain/types';
/** v2 original orchestral cues. SoundFont itself is not distributed. */
export const MUSIC_IDS = ['bgm-title', 'bgm-prologue', 'bgm-briefing', 'bgm-b01', 'bgm-b02', 'bgm-b03', 'bgm-b04', 'bgm-b05', 'bgm-b06', 'bgm-b07', 'bgm-b08', 'bgm-b09', 'bgm-b10', 'bgm-b11', 'bgm-b12', 'bgm-ending'] as const;
export const SOUND_IDS = ['se-ui', 'se-cancel', 'se-invalid', 'se-sword', 'se-arrow', 'se-impact', 'se-miss', 'se-guard', 'se-skill', 'se-heal', 'se-chest', 'se-record', 'se-mechanism', 'se-exit', 'se-cart', 'se-turn', 'se-down', 'se-victory', 'se-defeat'] as const;
export type MusicId = typeof MUSIC_IDS[number];
export type SoundId = typeof SOUND_IDS[number];
export type AudioCueId = MusicId | SoundId;
export const AUDIO_CATALOG = Object.fromEntries([...MUSIC_IDS, ...SOUND_IDS].map(id => [id, `/audio/v2/${id}.wav${id.startsWith('bgm-') ? `?v=${AUDIO_FILE_VERSIONS[id as MusicId]}` : ''}`])) as Record<AudioCueId, string>;
export const battleMusic = (id: BattleId): MusicId => `bgm-${id.toLowerCase()}` as MusicId;
export interface SoundEvent { id: SoundId; delayMs: number }
