import type { BattleId } from './domain/types';

export const CHARACTER_IDS = Object.freeze(['ally-lise', 'ally-garan', 'ally-neia', 'ally-sena', 'ally-iva', 'ally-dani'] as const);
export type CharacterId = typeof CHARACTER_IDS[number];
export const BATTLE_IDS: readonly BattleId[] = Object.freeze(['B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12']);
export interface Growth {
  version: 2;
  deployments: Partial<Record<BattleId, CharacterId[]>>;
  compensated: BattleId[];
  tutoring: Record<CharacterId, number>;
}
const own = (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
function denseList(v: unknown): v is unknown[] {
  return Array.isArray(v) && Object.keys(v).length === v.length && Array.from({length:v.length}, (_,i) => own(v,i)).every(Boolean);
}
function prefix(v: unknown): v is BattleId[] {
  return denseList(v) && v.length <= BATTLE_IDS.length && v.every((id,i) => id === BATTLE_IDS[i]);
}
function requireBattle(id: BattleId): number {
  const i = BATTLE_IDS.indexOf(id); if (i < 0) throw new Error('不明な戦闘です。'); return i;
}
export function availableCharacters(battleId: BattleId): CharacterId[] {
  const i = requireBattle(battleId);
  return CHARACTER_IDS.filter(id => !(id === 'ally-neia' && battleId === 'B06') && !(id === 'ally-sena' && i < 2)
    && !(id === 'ally-iva' && i < 3) && !(id === 'ally-dani' && i < 4));
}
export function defaultParty(battleId: BattleId): CharacterId[] {
  requireBattle(battleId);
  if (battleId === 'B06') return ['ally-lise','ally-garan','ally-sena','ally-iva'];
  const party: CharacterId[] = ['ally-lise','ally-garan','ally-neia'];
  if (['B03','B07','B09'].includes(battleId)) party.push('ally-sena');
  else if (!['B01','B02'].includes(battleId)) party.push('ally-iva');
  return party;
}
export function validParty(battleId: BattleId, party: unknown): party is CharacterId[] {
  const available = availableCharacters(battleId);
  return denseList(party) && party.length === Math.min(4,available.length) && party.includes('ally-lise') && new Set(party).size === party.length
    && party.every(id => available.includes(id as CharacterId));
}
export function createGrowth(): Growth {
  return {version:2, deployments:{}, compensated:[], tutoring:Object.fromEntries(CHARACTER_IDS.map(id => [id,0])) as Record<CharacterId,number>};
}
export function commonLevel(completed: readonly BattleId[]): number {
  if (!prefix(completed)) throw new Error('クリア履歴は先頭から連続している必要があります。');
  return 1 + Math.floor(completed.length / 3);
}
export function validGrowth(value: unknown, completed: readonly BattleId[]): value is Growth {
  if (!prefix(completed) || !record(value) || Object.keys(value).sort().join(',') !== 'compensated,deployments,tutoring,version' || value.version !== 2
    || !record(value.deployments) || !record(value.tutoring) || !denseList(value.compensated)) return false;
  if (Object.keys(value.deployments).length !== completed.length || !completed.every(id => own(value.deployments as object,id) && validParty(id,(value.deployments as Record<string,unknown>)[id]))) return false;
  if (value.compensated.length > 1 || (value.compensated.length === 1 && (value.compensated[0] !== 'B06' || !completed.includes('B06')))) return false;
  // A tutoring action fills the entire deficit. Its persisted cumulative amount
  // must equal a deficit attainable at an eligible past checkpoint (or zero).
  const possibleTutoring = (character: CharacterId): number[] => [0,...completed.map((_,i) => {
    const count = i + 1;
    if (!availableCharacters(BATTLE_IDS[Math.min(count,11)]).includes(character)) return 0;
    const earned = completed.slice(0,count).filter(id => (value.deployments as Record<string,CharacterId[]>)[id].includes(character)).length * 2
      + (character === 'ally-neia' && count >= 6 ? 2 : 0);
    return Math.max(0, Math.floor(count / 3) * 6 - earned);
  })];
  return Object.keys(value.tutoring).length === CHARACTER_IDS.length && CHARACTER_IDS.every(id => own(value.tutoring as object,id)
    && Number.isSafeInteger((value.tutoring as Record<string,unknown>)[id]) && possibleTutoring(id).includes(Number((value.tutoring as Record<string,unknown>)[id])));
}
function completedOf(growth: Growth): BattleId[] {
  const completed = BATTLE_IDS.filter(id => own(growth.deployments,id));
  if (!validGrowth(growth,completed)) throw new Error('育成履歴が不正です。');
  return completed;
}
export function awardFirstClear(growth: Growth, battleId: BattleId, party: readonly CharacterId[]): Growth {
  const completed = completedOf(growth); requireBattle(battleId);
  if (!validParty(battleId,party)) throw new Error('出撃編成が不正です。');
  const existing = growth.deployments[battleId];
  if (existing) {
    if (existing.length !== party.length || existing.some(id => !party.includes(id))) throw new Error('初回出撃履歴は変更できません。');
    return structuredClone(growth);
  }
  if (BATTLE_IDS[completed.length] !== battleId) throw new Error('初回クリアは順番に記録してください。');
  const next = structuredClone(growth); next.deployments[battleId] = [...party]; return next;
}
export function returnFromAbsence(growth: Growth, enteringBattle: BattleId): Growth {
  const completed = completedOf(growth), index = requireBattle(enteringBattle);
  const next = structuredClone(growth);
  if (index >= 6 && index <= completed.length && completed.includes('B06') && !next.compensated.includes('B06')) next.compensated.push('B06');
  return next;
}
export function trainingPoints(growth: Growth, character: CharacterId): number {
  completedOf(growth);
  if (!CHARACTER_IDS.includes(character)) throw new Error('不明な人物です。');
  return Object.values(growth.deployments).filter(party => party.includes(character)).length * 2
    + (character === 'ally-neia' && growth.compensated.includes('B06') ? 2 : 0) + growth.tutoring[character];
}
// Optional catch-up only. Each completed chapter raises the gross-earned ceiling by 6.
// Resting characters receive nothing until this explicit action is requested.
export function tutor(growth: Growth, character: CharacterId, completed: readonly BattleId[]): Growth {
  if (!validGrowth(growth,completed)) throw new Error('育成とクリア履歴が一致しません。');
  const frontier = BATTLE_IDS[Math.min(completed.length,11)];
  if (!availableCharacters(frontier).includes(character)) throw new Error('未加入または強制離脱中の人物は補習できません。');
  // Settle mandatory return compensation first so its pending state cannot be
  // used to claim catch-up for the same missing reward twice.
  const next = returnFromAbsence(growth,frontier);
  next.tutoring[character] += Math.max(0, Math.floor(completed.length / 3) * 6 - trainingPoints(next,character));
  return next;
}
export function migrateLegacyGrowth(completed: readonly BattleId[]): Growth {
  if (!prefix(completed)) throw new Error('旧クリア履歴が不正です。');
  let growth = createGrowth();
  for (const id of completed) growth = awardFirstClear(growth,id,defaultParty(id));
  return returnFromAbsence(growth,BATTLE_IDS[Math.min(completed.length,11)]);
}
