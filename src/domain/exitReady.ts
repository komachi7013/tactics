import { getBattleConfig, requiredRecords } from './battles';
import type { BattleState } from './types';

/** Conditions other than arrival at the exit itself. */
export function exitReady(state: BattleState): boolean {
 const config = getBattleConfig(state.battleId);
 if (['capture', 'sluice', 'finale'].includes(config.objective ?? '')) return false;
 const lise = state.units.find(unit => unit.id === 'ally-lise');
 if (!lise || lise.hp <= 0 || state.phase === 'lost') return false;
 if (!requiredRecords(state.battleId).every(record => state.records.includes(record.id))) return false;
 if (config.objective === 'repair' && !config.repairSites?.every(site => state.repairs?.[site.id]?.completed && state.repairs[site.id].pendingRound === null)) return false;
 if (config.objective === 'escort') {
  const escort = state.units.find(unit => unit.id === (state.escort?.unitId ?? 'escort-cart'));
  if (!escort || escort.hp <= 0 || config.escortRequiresOpenGate && !state.gate.drained) return false;
 }
 return true;
}
