import type { BattleId } from '../domain/types';
import { equipItem, equipmentBonus, type EquipmentState, type EquipmentSlot } from '../equipment';
import type { JobsState } from '../jobs';
import { createPreparedUnit } from '../party';
import { commonLevel, type CharacterId } from '../progression';

export interface EquipmentDraftContext {
  equipment: EquipmentState;
  jobs: JobsState;
  completed: readonly BattleId[];
}
/** An intent plus a baseline, never a live loadout or a saved allocation. */
export interface EquipmentDraft {
  character: CharacterId;
  slot: EquipmentSlot;
  instanceId: string | null;
  battleId: BattleId;
  baseline: string;
}
const baseline = (context: EquipmentDraftContext) => JSON.stringify([context.equipment, context.jobs, context.completed]);
export function createEquipmentDraft(context: EquipmentDraftContext, battleId: BattleId, character: CharacterId,
  slot: EquipmentSlot, instanceId: string | null): EquipmentDraft {
  // Validate with the same ownership, slot, job and absence rules as confirmation.
  equipItem(context.equipment, context.completed, context.jobs, character, slot, instanceId, battleId);
  return { character, slot, instanceId, battleId, baseline: baseline(context) };
}
/** Revalidate against the current preparation at confirmation, never reuse a stale allocation. */
export function resolveEquipmentDraft(context: EquipmentDraftContext, draft: EquipmentDraft): EquipmentState {
  if (baseline(context) !== draft.baseline) throw Error('比較中に準備内容が変わりました。候補を選び直してください。');
  return equipItem(context.equipment, context.completed, context.jobs, draft.character, draft.slot, draft.instanceId, draft.battleId);
}
export function compareEquipmentDraft(context: EquipmentDraftContext, draft: EquipmentDraft) {
  const equipment = resolveEquipmentDraft(context, draft), level = commonLevel(context.completed);
  const before = createPreparedUnit(draft.character, context.jobs, level, context.equipment);
  const after = createPreparedUnit(draft.character, context.jobs, level, equipment);
  return {
    equipment, before, after,
    delta: { hp: after.maxHp - before.maxHp, atk: after.atk - before.atk, def: after.def - before.def },
    beforeBonus: equipmentBonus(context.equipment.loadouts[draft.character]),
    afterBonus: equipmentBonus(equipment.loadouts[draft.character]),
  };
}
