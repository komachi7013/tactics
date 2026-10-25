export type BattleId = 'B01' | 'B02' | 'B03' | 'B04' | 'B05' | 'B06' | 'B07' | 'B08' | 'B09' | 'B10' | 'B11' | 'B12';
export type Team = 'player' | 'enemy';
export type Facing = 'N' | 'E' | 'S' | 'W';
export interface Pos { x: number; y: number }
export interface Cell extends Pos { height: number; shallow: boolean; blocked: boolean; water?: boolean; bridge?: boolean }
export interface Unit {
  equipmentWeaponId?: string;
  id: string; name: string; role: string; team: Team; pos: Pos;
  hp: number; maxHp: number; atk: number; def: number; move: number;
  jobCommand?: 'survey' | 'protect' | 'plank' | 'readOrder'; readCharges?: number; plankCharges?: number; plankReady?: boolean; surveyCharges?: number; surveyBonus?: boolean; protection?: { sourceId: string };
  kind?: 'escort'; healCharges?: number; weapon: 'melee' | 'bow'; guardGoal?: Pos; shallowCost: number; facing: Facing; acted: boolean; guard: boolean;
}
export interface BattleState {
  battleId: BattleId; round: number; turn: Team; activeId: string | null; units: Unit[]; cells: Cell[];
  /** Absent only for explicit legacy/oracle factories; runtime passes campaign combat. */
  combatRandom?: CombatRandomState;
  lastAttack?: AttackResolution;
  equipmentChests?: {eventId:string;pos:Pos}[];
  pendingEquipment?: string[];
  readOrders?: string[];
  finalControl?: {heldRounds:number;commanderSubdued:boolean};
  repairs?: Record<string,{completed:boolean;pendingRound:number|null}>;
  sluices?: Record<string,{drained:boolean;pendingRound:number|null;pendingDrained?:boolean}>;
  capture?: {heldRounds: number}; escort?: {route: Pos[]; index: number; unitId?: string}; records: string[]; gate: { drained: boolean; pendingRound: number | null; pendingDrained?: boolean };
  activation: { moved: boolean; acted: boolean; moveOrigin: Pos | null; moveOriginFacing?: Facing; plankConsumed?: boolean };
  phase: 'playing' | 'won' | 'lost'; log: string[];
}
export type Command =
  | { type: 'endPlayerTurn' }
  | { type: 'start'; unitId: string }
  | { type: 'move'; to: Pos }
  | { type: 'undoMove' }
  | { type: 'attack'; targetId: string }
  | { type: 'heal'; targetId: string }
  | { type: 'survey'; targetId: string }
  | { type: 'protect'; targetId: string }
  | { type: 'plank'; targetId: string }
  | { type: 'readOrder'; targetId: string }
  | { type: 'loot'; eventId: string }
  | { type: 'collect'; recordId: string }
  | { type: 'gate'; gateId?: string }
  | { type: 'repair'; siteId: string }
  | { type: 'defend' }
  | { type: 'end'; facing: Facing };
export interface Result { state: BattleState; error?: string }
export interface Reachable extends Pos { cost: number; path: Pos[] }
export type AttackSector = 'front' | 'side' | 'rear';
export interface AttackResolution {
  sequence: number; actorId: string; targetId: string;
  hitChance: 90 | 95 | 100; hit: boolean;
  /** Actual HP lost, capped by HP before the attack. */
  damage: number;
  /** Damage before the HP cap, conditional on a hit. */
  damageOnHit: number; sector: AttackSector;
}
export interface AttackPreview { legal: boolean; damage: number; reason: string; rear: boolean; hitChance: 0 | 90 | 95 | 100; sector?: AttackSector }
export const RECORDS = [{ id: 'A', x: 2, y: 2 }, { id: 'B', x: 7, y: 5 }] as const;
export const GATE: Pos = { x: 2, y: 4 };
export const EXIT: Pos = { x: 9, y: 6 };
import type { CombatRandomState } from './combatRandom';

