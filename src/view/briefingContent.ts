import { battleObjectiveCopy } from './battleObjectiveCopy';
import type { BattleId } from '../domain/types';
export interface BriefingContext {
  finalGuide: string; repairGuide: string; portGuide: string; delegationGuide: string;
  sluiceGuide: string; chainGuide: string; archiveExitLabel: string;
}
/** The short objective and the optional instructions use the same authored copy. */
export function briefingRulesText(battleId: BattleId, config: { gate?: unknown; roundLimit: number }, _context?: BriefingContext): string {
  const copy = battleObjectiveCopy(battleId);
  return [...copy.steps, ...copy.legend, `第${config.roundLimit}ラウンドが終わるまでに目標を達成しましょう。`].join('\n');
}
