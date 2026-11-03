import type { BattleState, Command } from './domain/types';
import type { SoundEvent } from './audio-cues';
import { committedAttackResolution } from './view/presentation';

/** Committed state only: no idle stepping, speculative hits, or repeated outcomes. */
export function soundsForTransition(before: BattleState, after: BattleState, command?: Command): SoundEvent[] {
  const event = (id: SoundEvent['id'], delayMs = 0): SoundEvent => ({ id, delayMs });
  if (before === after || before.phase !== 'playing') return [];
  if (after.phase === 'won' || after.phase === 'lost') return []; // result owns its one-shot cadence
  const result = committedAttackResolution(before, after, command?.type === 'attack' ? before.activeId ?? undefined : undefined, command?.type === 'attack' ? command.targetId : undefined);
  if (result) {
    const actor = before.units.find(u => u.id === result.actorId);
    const target = after.units.find(u => u.id === result.targetId);
    const bow = actor?.weapon === 'bow';
    const events = [event(bow ? 'se-arrow' : 'se-sword'), event(!result.hit ? 'se-miss' : target?.guard ? 'se-guard' : 'se-impact', bow ? 180 : 110)];
    // Nonlethal Vesk subdual also uses the restrained incapacity cue; no death implication.
    if (result.hit && target?.hp === 0) events.push(event('se-down', 340));
    return events;
  }
  if (command?.type === 'attack' && (before.combatRandom || after.combatRandom)) return [];
  if (!before.combatRandom && !after.combatRandom && after.units.some(u => u.hp < (before.units.find(old => old.id === u.id)?.hp ?? u.hp))) return [event('se-impact')];
  if (after.units.some(u => u.hp > (before.units.find(old => old.id === u.id)?.hp ?? u.hp))) return [event('se-heal')];
  if ((after.pendingEquipment ?? []).some(id => !before.pendingEquipment?.includes(id))) return [event('se-chest')];
  if (after.records.some(id => !before.records.includes(id))) return [event('se-record')];
  if (command && ['survey','protect','plank','readOrder'].includes(command.type)) return [event('se-skill')];
  if (command?.type === 'defend') return [event('se-guard')];
  if (command?.type === 'undoMove') return [event('se-cancel')];
  const mechanism = before.gate.drained !== after.gate.drained
    || Object.keys(after.sluices ?? {}).some(id => before.sluices?.[id]?.drained !== after.sluices?.[id]?.drained)
    || Object.keys(after.repairs ?? {}).some(id => before.repairs?.[id]?.completed !== after.repairs?.[id]?.completed);
  const cartBefore = before.units.find(u => u.id === 'escort-cart');
  const cartAfter = after.units.find(u => u.id === 'escort-cart');
  const cart = cartBefore && cartAfter && cartAfter.hp > 0 && (cartBefore.pos.x !== cartAfter.pos.x || cartBefore.pos.y !== cartAfter.pos.y);
  // Gate reservations acknowledge once; actual mechanical motion sounds only on application.
  if (command?.type === 'gate' || command?.type === 'repair') return [event('se-ui')];
  const events: SoundEvent[] = [];
  if (mechanism) events.push(event('se-mechanism'));
  if (cart) events.push(event('se-cart', mechanism ? 180 : 0));
  if (!events.length && (before.turn !== after.turn || before.round !== after.round)) events.push(event('se-turn'));
  if (!events.length && command?.type === 'start') events.push(event('se-ui'));
  return events; // ordinary movement and static/blocked/idle animation stay silent
}

export function resultSounds(battleId: BattleState['battleId'], won: boolean): SoundEvent[] {
  if (!won) return [{ id: 'se-defeat', delayMs: 0 }];
  return ['B01','B02','B03','B05','B06','B07','B09','B11'].includes(battleId)
    ? [{ id: 'se-exit', delayMs: 0 }, { id: 'se-victory', delayMs: 700 }]
    : [{ id: 'se-victory', delayMs: 0 }];
}
