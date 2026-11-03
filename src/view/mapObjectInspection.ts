import { getBattleConfig } from '../domain/battles';
import type { BattleState, Pos } from '../domain/types';
import { mapObjectPlacements } from './mapObjectAssets';

/** Inspection only: selecting a site never collects, reserves or spends an action. */
export function mapObjectCellStatus(state: BattleState, pos: Pos): string | null {
  const names = mapObjectPlacements(state)
    .filter(row => row.pos.x === pos.x && row.pos.y === pos.y)
    .map(row => row.label.replace(/\n/g, ' ／ '));
  const config = getBattleConfig(state.battleId);
  if (config.objective === 'repair' || config.objective === 'evacuate') {
    for (const record of config.records.filter(row => row.x === pos.x && row.y === pos.y)) {
      names.push(`${record.name} ${record.id}${state.records.includes(record.id) ? config.objective === 'repair' ? '・救出済み' : '・案内済み' : ''}`);
    }
  }
  return names.length ? [...new Set(names)].join(' ／ ') : null;
}
