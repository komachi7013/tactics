import { EQUIPMENT_EVENTS, EQUIPMENT_ITEMS, equipmentBonus, ownedEquipment, type EquipmentSlot, type EquipmentState } from '../equipment';
import { CHARACTER_IDS, type CharacterId } from '../progression';
import type { BattleId } from '../domain/types';
import type { JobsState } from '../jobs';

export const EQUIPMENT_SLOT_NAMES: Record<EquipmentSlot, string> = { weapon: '武器', head: '頭', body: '胴', legs: '脚' };
export function equipmentEffectText(bonus: { hp: number; atk: number; def: number }): string {
  const parts = ([['hp', 'HP'], ['atk', '攻撃'], ['def', '防御']] as const).filter(([key]) => bonus[key] !== 0).map(([key, name]) => `${name}${bonus[key] > 0 ? '+' : '−'}${Math.abs(bonus[key])}`);
  return parts.join('・') || '補正0';
}
export function equipmentDefinition(instance: string) {
  const event = EQUIPMENT_EVENTS.find(event => event.id === instance);
  return event && EQUIPMENT_ITEMS.find(item => item.id === event.itemId);
}
export function equipmentOwner(equipment: EquipmentState, instance: string): CharacterId | undefined {
  return CHARACTER_IDS.find(id => Object.values(equipment.loadouts[id]).includes(instance));
}
export function equipmentSlotOptions(equipment: EquipmentState, completed: readonly BattleId[], jobs: JobsState, character: CharacterId, slot: EquipmentSlot) {
  return ownedEquipment(completed, equipment.acquired).flatMap(event => {
    const item = equipmentDefinition(event.id);
    if (!item || item.slot !== slot) return [];
    const owner = equipmentOwner(equipment, event.id);
    const fits = !item.weapon || item.weapon === (jobs[character].main === 'scout' ? 'bow' : 'melee');
    return [{ event, item, owner, disabled: !fits || Boolean(owner && owner !== character), reason: !fits ? '主職不適合' : owner && owner !== character ? '他人物が装着中' : '' }];
  });
}
export function equipmentCollectionRows(completed: readonly BattleId[], equipment: EquipmentState, confirmed: readonly string[], pending: readonly string[] = []) {
  const owned = new Set(ownedEquipment(completed, equipment.acquired).map(event => event.id));
  return EQUIPMENT_EVENTS.map(event => ({
    event, item: equipmentDefinition(event.id)!,
    status: pending.includes(event.id) ? '仮回収・勝利で持帰り' : owned.has(event.id) ? confirmed.includes(event.id) ? '保存済み' : '勝利未保存' : event.source === 'clear' ? '未達成' : '未回収',
  }));
}
export function equipmentCapText(equipment: EquipmentState, character: CharacterId): string {
  const bonus = equipmentBonus(equipment.loadouts[character]);
  return `装備合計 ${equipmentEffectText(bonus)} ／ 防具の正補正上限 HP+3・攻撃+2・防御+2。上限超過で非適用: ${equipmentEffectText(bonus.capLoss)}（負補正と武器は別に加算）`;
}
