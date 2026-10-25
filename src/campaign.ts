import type { BattleId, BattleState } from './domain/types';
import { awardFirstClear, createGrowth, migrateLegacyGrowth, returnFromAbsence, validGrowth, validParty, type CharacterId, type Growth } from './progression';
import { createJobs, validJobs, type JobsState } from './jobs';
import { createEquipment, validEquipment, ownedEquipment, EQUIPMENT_EVENTS, type EquipmentState } from './equipment';
import { createCombatRandomConfig, validCombatRandomConfig, type CombatRandomConfig } from './domain/combatRandom';

export const CAMPAIGN_KEY = 'mio-tactics.progress.v1';
export interface Campaign {
  version: 1 | 2 | 3 | 4;
  combat?: CombatRandomConfig;
  equipment?: EquipmentState;
  growth?: Growth;
  jobs?: JobsState;
  parties?: Partial<Record<BattleId, CharacterId[]>>;
  unlocked: BattleId[];
  completed: BattleId[];
  currentBattle: BattleId;
  evidence: string[];
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const ids: BattleId[] = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12'];
const knownEvidence = ['B01:A', 'B01:B', 'B02:O', 'B03:M', 'B04:C', 'B05:D', 'B05:T', 'B05:S', 'B05:K', 'B06:W', 'B07:V1', 'B07:V2', 'B08:P', 'B08:C', 'B09:J', 'B09:H', 'B10:C', 'B11:W1', 'B11:W2', 'B11:A', 'B11:B', 'B12:U', 'B12:V'];
interface Snapshot { growth: Growth; jobs: JobsState; parties: Partial<Record<BattleId,CharacterId[]>>; equipment:EquipmentState; completed:BattleId[]; combat:CombatRandomConfig }
const baselines = new WeakMap<Campaign, { local: Snapshot; stored: Snapshot }>();
const snapshot = (c: Campaign): Snapshot => ({ growth: structuredClone(c.growth!), jobs: structuredClone(c.jobs!), parties: structuredClone(c.parties!), equipment: structuredClone(c.equipment!), completed:[...c.completed], combat:structuredClone(c.combat!) });
function same(a: unknown,b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function sameParty(a: readonly CharacterId[], b: readonly CharacterId[]): boolean { return a.length === b.length && a.every(id => b.includes(id)); }
function track(c: Campaign): Campaign { const value = snapshot(c); baselines.set(c,{local:value,stored:structuredClone(value)}); return c; }
function inherit(source: Campaign,next: Campaign): Campaign {
  const baseline = baselines.get(source);
  if (baseline) baselines.set(next,structuredClone(baseline));
  return next;
}
function validParties(value: unknown): value is Partial<Record<BattleId,CharacterId[]>> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([id,party]) => ids.includes(id as BattleId) && validParty(id as BattleId,party));
}
export function editPreparation(c: Campaign, changes: { growth?: Growth; jobs?: JobsState; parties?: Partial<Record<BattleId,CharacterId[]>>; equipment?:EquipmentState }): Campaign {
  const next = { ...normalize(c), ...structuredClone(changes) };
  if (!isCampaign(next)) throw new Error('準備内容と進行履歴が一致しません。');
  return inherit(c,next);
}
export function createCampaign(): Campaign {
  return track({ version: 4, combat:createCombatRandomConfig(), equipment:createEquipment(), unlocked: ['B01'], completed: [], currentBattle: 'B01', evidence: [], growth: createGrowth(), jobs: createJobs(), parties: {} });
}
function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') return false;
  const c = value as Campaign;
  const list = (v: unknown, allowed: readonly string[]): v is string[] => Array.isArray(v) && v.every(i => typeof i === 'string' && allowed.includes(i)) && new Set(v).size === v.length;
  const legacyKeys=['version','unlocked','completed','currentBattle','evidence'];
  const currentKeys=[...legacyKeys,'growth','jobs','parties'];
  const versionValid = c.version===1 ? Object.keys(c).every(key=>legacyKeys.includes(key)) :
    (c.version===2||c.version===3||c.version===4) && Object.keys(c).every(key=>(c.version===4?[...currentKeys,'equipment','combat']:c.version===3?[...currentKeys,'equipment']:currentKeys).includes(key)) &&
    list(c.completed,ids) && validGrowth(c.growth,c.completed) && validJobs(c.jobs,c.growth!) && validParties(c.parties) &&
    ((c.version!==3&&c.version!==4)||validEquipment(c.equipment,c.completed,c.jobs!)) &&
    (c.version!==4||validCombatRandomConfig(c.combat));
  return versionValid && list(c.unlocked, ids) && list(c.completed, ids) && list(c.evidence, knownEvidence)
    && c.unlocked.includes('B01') && ids.includes(c.currentBattle) && c.unlocked.includes(c.currentBattle)
    && c.completed.every(id => c.unlocked.includes(id))
    && (!c.unlocked.includes('B02') || c.completed.includes('B01'))
    && (!c.unlocked.includes('B03') || c.completed.includes('B02'))
    && (!c.unlocked.includes('B04') || c.completed.includes('B03'))
    && (!c.unlocked.includes('B05') || c.completed.includes('B04'))
    && (!c.unlocked.includes('B06') || c.completed.includes('B05'))
    && (!c.unlocked.includes('B07') || c.completed.includes('B06'))
    && (!c.unlocked.includes('B08') || c.completed.includes('B07'))
    && (!c.unlocked.includes('B09') || c.completed.includes('B08'))
    && (!c.unlocked.includes('B10') || c.completed.includes('B09'))
    && (!c.unlocked.includes('B11') || c.completed.includes('B10'))
    && (!c.unlocked.includes('B12') || c.completed.includes('B11'))
    && (!c.completed.includes('B01') || (c.evidence.includes('B01:A') && c.evidence.includes('B01:B')))
    && (!c.completed.includes('B02') || c.evidence.includes('B02:O'))
    && (!c.completed.includes('B03') || c.evidence.includes('B03:M'))
    && (!c.completed.includes('B04') || c.evidence.includes('B04:C'))
    && (!c.completed.includes('B05') || ['B05:D', 'B05:T', 'B05:S'].every(e => c.evidence.includes(e)))
    && (!c.completed.includes('B06') || c.evidence.includes('B06:W'))
    && (!c.completed.includes('B07') || ['B07:V1', 'B07:V2'].every(e => c.evidence.includes(e)))
    && (!c.completed.includes('B08') || ['B08:P', 'B08:C'].every(e => c.evidence.includes(e)))
    && (!c.completed.includes('B09') || ['B09:J', 'B09:H'].every(e => c.evidence.includes(e)))
    && (!c.completed.includes('B10') || c.evidence.includes('B10:C'))
    && (!c.completed.includes('B11') || ['B11:W1','B11:W2','B11:A','B11:B'].every(e => c.evidence.includes(e)))
    && (!c.completed.includes('B12') || ['B12:U','B12:V'].every(e => c.evidence.includes(e)));
}
// Extend a valid v1 checkpoint in memory. Reading never rewrites the saved value.
function normalize(c: Campaign): Campaign {
  const completed = ids.filter(id => c.completed.includes(id));
  const growth = c.version === 1 ? migrateLegacyGrowth(completed) : structuredClone(c.growth!);
  const jobs = c.version === 1 ? createJobs() : structuredClone(c.jobs!);
  const parties = c.version === 1 ? {} : structuredClone(c.parties!);
  const equipment=(c.version===3||c.version===4)?structuredClone(c.equipment!):createEquipment();
  const combat=c.version===4?structuredClone(c.combat!):createCombatRandomConfig();
  // Canonical event order is stable; only explicit victory events enter acquired.
  equipment.acquired=EQUIPMENT_EVENTS.filter(e=>e.source==='chest'&&equipment.acquired.includes(e.id)).map(e=>e.id);
  return { ...c, completed, version: 4, combat, growth, jobs, parties, equipment, unlocked: ids.filter(id => c.unlocked.includes(id) || id === 'B01'
    || (id === 'B02' && c.completed.includes('B01')) || (id === 'B03' && c.completed.includes('B02'))
    || (id === 'B04' && c.completed.includes('B03')) || (id === 'B05' && c.completed.includes('B04'))
    || (id === 'B06' && c.completed.includes('B05')) || (id === 'B07' && c.completed.includes('B06'))
    || (id === 'B08' && c.completed.includes('B07')) || (id === 'B09' && c.completed.includes('B08')) || (id === 'B10' && c.completed.includes('B09')) || (id === 'B11' && c.completed.includes('B10')) || (id === 'B12' && c.completed.includes('B11'))) };
}
export function completeBattle(c: Campaign, battle: BattleState): Campaign {
  if (battle.phase !== 'won' || !c.unlocked.includes(battle.battleId)) return c;
  const completed = ids.filter(id => c.completed.includes(id) || id === battle.battleId);
  const unlocked = ids.filter(id => id === 'B01' || (id === 'B02' && completed.includes('B01')) || (id === 'B03' && completed.includes('B02')) || (id === 'B04' && completed.includes('B03')) || (id === 'B05' && completed.includes('B04')) || (id === 'B06' && completed.includes('B05')) || (id === 'B07' && completed.includes('B06')) || (id === 'B08' && completed.includes('B07')) || (id === 'B09' && completed.includes('B08')) || (id === 'B10' && completed.includes('B09')) || (id === 'B11' && completed.includes('B10')) || (id === 'B12' && completed.includes('B11')));
  const evidence = [...new Set([...c.evidence, ...battle.records.map(id => `${battle.battleId}:${id}`)])].filter(v => knownEvidence.includes(v));
  const normalized = normalize(c);
  const party = battle.units.filter(unit => unit.team === 'player' && unit.kind !== 'escort').map(unit => unit.id as CharacterId);
  const growth = c.completed.includes(battle.battleId) ? normalized.growth! : awardFirstClear(normalized.growth!, battle.battleId, party);
  const acquired=EQUIPMENT_EVENTS.filter(e=>e.source==='chest' && (normalized.equipment!.acquired.includes(e.id) || (e.battleId===battle.battleId && battle.pendingEquipment?.includes(e.id)))).map(e=>e.id);
  const next={version:4 as const,combat:normalized.combat!,unlocked,completed,currentBattle:battle.battleId,evidence,growth,jobs:normalized.jobs!,parties:normalized.parties!,equipment:{...normalized.equipment!,acquired}};
  return inherit(c,next);
}
export function selectBattle(c: Campaign, id: BattleId): Campaign {
  if (!c.unlocked.includes(id)) return c;
  const next = normalize(c);
  return inherit(c, { ...next, currentBattle: id, growth: returnFromAbsence(next.growth!, id) });
}
export function readCampaign(storage: StorageLike): { campaign: Campaign; warning: string | null; writable: boolean } {
  try {
    const raw = storage.getItem(CAMPAIGN_KEY);
    if (raw === null) return { campaign: createCampaign(), warning: null, writable: true };
    const value: unknown = JSON.parse(raw);
    if (!isCampaign(value)) return { campaign: createCampaign(), warning: '保存データの版または内容を読めません。元のデータは保持しています。保存せずに遊ぶか、明示的に進行をリセットできます。', writable: false };
    return { campaign: track(normalize(structuredClone(value))), warning: null, writable: true };
  } catch {
    return { campaign: createCampaign(), warning: '進行の保存データを読めません。元のデータは変更していません。保存せずに遊べます。', writable: false };
  }
}
export function writeCampaign(storage: StorageLike, campaign: Campaign): { ok: boolean; error?: string; campaign?: Campaign } {
  if (!isCampaign(campaign)) return { ok: false, error: '進行の形式が不正なため保存していません。' };
  const before = readCampaign(storage);
  if (!before.writable) return { ok: false, error: before.warning ?? '元の保存データを保護するため書き込んでいません。' };
  const local = normalize(campaign), saved = before.campaign;
  const baseline = baselines.get(campaign) ?? { local: snapshot(createCampaign()), stored: snapshot(createCampaign()) };
  // This root identifies the replay series. Never merge or replace it as a
  // side effect of progress, preparation, quota recovery, or a stale tab write.
  const sameCombat = (a: CombatRandomConfig, b: CombatRandomConfig) => a.version === b.version && a.rootSeed === b.rootSeed;
  if ((baselines.has(campaign) && !sameCombat(local.combat!,baseline.local.combat)) || !sameCombat(local.combat!,saved.combat!)) {
    return { ok: false, error: '戦闘乱数の系列が変更または別の画面と競合しています。元の保存を変更せず、最新の進行を確認してください。' };
  }
  const conflict = () => ({ ok: false, error: '別の画面で育成・編成履歴が更新されています。保存せず再読込して最新の進行を確認してください。' });
  const growth = structuredClone(saved.growth!);
  for (const id of ids) {
    const incoming = local.growth!.deployments[id], existing = growth.deployments[id];
    if (incoming && existing && !sameParty(incoming,existing)) return conflict();
    if (incoming && !existing) growth.deployments[id] = [...incoming];
  }
  growth.compensated = ids.filter(id => saved.growth!.compensated.includes(id) || local.growth!.compensated.includes(id));
  for (const character of Object.keys(growth.tutoring) as CharacterId[]) {
    const incoming = local.growth!.tutoring[character], existing = saved.growth!.tutoring[character];
    const changed = incoming !== baseline.local.growth.tutoring[character];
    const external = existing !== baseline.stored.growth.tutoring[character];
    if (changed && external && incoming !== existing) return conflict();
    if (changed && incoming < existing) return conflict();
    growth.tutoring[character] = changed ? incoming : existing;
  }
  const editedJobs = !same(local.jobs,baseline.local.jobs);
  if (editedJobs && !same(saved.jobs,baseline.stored.jobs) && !same(local.jobs,saved.jobs)) return conflict();
  const jobs = editedJobs ? local.jobs! : saved.jobs!;
  const parties = structuredClone(saved.parties!);
  for (const id of ids) {
    const incoming = local.parties![id], existing = saved.parties![id];
    const changed = !same(incoming,baseline.local.parties[id]);
    const external = !same(existing,baseline.stored.parties[id]);
    if (changed && external && !same(incoming,existing)) return conflict();
    if (changed) { if (incoming) parties[id] = [...incoming]; else delete parties[id]; }
  }
  const editedLoadouts=!same(local.equipment!.loadouts,baseline.local.equipment.loadouts);
  if(editedLoadouts&&!same(saved.equipment!.loadouts,baseline.stored.equipment.loadouts)&&!same(local.equipment!.loadouts,saved.equipment!.loadouts))return conflict();
  const equipment:EquipmentState={acquired:EQUIPMENT_EVENTS.filter(e=>e.source==='chest'&&(saved.equipment!.acquired.includes(e.id)||local.equipment!.acquired.includes(e.id))).map(e=>e.id),loadouts:structuredClone(editedLoadouts?local.equipment!.loadouts:saved.equipment!.loadouts)};
  const merged: Campaign = normalize({
    ...local, growth, jobs, parties, equipment,
    unlocked: ids.filter(id => local.unlocked.includes(id) || saved.unlocked.includes(id)),
    completed: ids.filter(id => local.completed.includes(id) || saved.completed.includes(id)),
    evidence: [...new Set([...saved.evidence, ...local.evidence])],
  });
  if (!isCampaign(merged)) return { ok: false, error: '統合した進行の整合性を確認できないため保存していません。再読込してください。' };
  try {
    storage.setItem(CAMPAIGN_KEY, JSON.stringify(merged));
    baselines.set(campaign,{ local:snapshot(local), stored:snapshot(merged) });
    return { ok: true, campaign: track(merged) };
  } catch {
    return { ok: false, error: '進行を保存できませんでした。この画面では続けられますが、再読込で失われる可能性があります。' };
  }
}

/** Saved acquisition history only: unsaved victory items never hide replay chests. */
export function getConfirmedEquipmentEvents(c:Campaign):string[]{
 const stored=baselines.get(c)?.stored;return stored?ownedEquipment(stored.completed,stored.equipment.acquired).map(e=>e.id):[];
}
export function getUnconfirmedEquipmentEvents(c:Campaign):string[]{
 const confirmed=new Set(getConfirmedEquipmentEvents(c));const n=normalize(c);return ownedEquipment(n.completed,n.equipment!.acquired).map(e=>e.id).filter(id=>!confirmed.has(id));
}

export function resetCampaign(storage: StorageLike): { ok: boolean; error?: string } {
  try { storage.removeItem(CAMPAIGN_KEY); return { ok: true }; }
  catch { return { ok: false, error: '保存のリセットに失敗しました。元のデータは削除できていません。' }; }
}
