/** Original v1 cues; served WAVs contain no bundled instrument SoundFont. */
export const MUSIC_IDS = ['bgm-briefing', 'bgm-tactics', 'bgm-ending'] as const;
export const SOUND_IDS = ['se-ui', 'se-move', 'se-impact', 'se-heal', 'se-record', 'se-mechanism', 'se-victory', 'se-defeat'] as const;
export type MusicId = typeof MUSIC_IDS[number];
export type SoundId = typeof SOUND_IDS[number];
export type AudioCueId = MusicId | SoundId;
export const AUDIO_CATALOG = Object.fromEntries([...MUSIC_IDS, ...SOUND_IDS].map(id => [id, `/audio/v1/${id}.wav`])) as Record<AudioCueId, string>;
