import './attackTargets.css';
import { attackPreview, getUnit } from '../domain/engine';
import type { BattleState } from '../domain/types';
import { attackAvailability } from './attackAvailability';
import { createInspectionFace } from './inspectionRoster';

export interface AttackTargetsOptions {
  /** Opens the owner's existing confirmation popup; does not commit an attack. */
  onSelect: (targetId: string) => void;
  /** Transient view gate, for example animation or another open popup. */
  disabled?: boolean;
  /** Optional read-only inspection, independent of attack range/legality. */
  onInspect?: (targetId: string) => void;
}

/**
 * Render from the current derived command state, not a cached range list.
 * Selection only emits an id: the owner must revalidate its current snapshot
 * when confirming. No domain command, random roll or HP update happens here.
 */
export function createAttackTargets(state: BattleState, options: AttackTargetsOptions): HTMLElement {
  const root = document.createElement('section');
  root.className = 'attack-targets';
  root.dataset.attackTargets = '';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '攻撃対象');
  const availability = attackAvailability(state);
  const actor = state.activeId ? getUnit(state, state.activeId) : undefined;
  const legalTargets = new Map(availability.targets.map(target => [target.targetId, target.preview]));
  const enemies = state.units.filter(unit => unit.team === 'enemy' && unit.hp > 0);

  if (!availability.enabled) {
    const reason = document.createElement('p');
    reason.className = 'attack-targets-reason';
    reason.setAttribute('role', 'status');
    reason.textContent = availability.reason;
    root.append(reason);
  }
  if (!enemies.length) return root;

  const list = document.createElement('div');
  list.className = 'attack-target-list';
  for (const enemy of enemies) {
    const available = legalTargets.get(enemy.id);
    const preview = available ?? (actor ? attackPreview(state, actor.id, enemy.id) : undefined);
    // A legal geometric preview cannot override action/phase restrictions.
    const reason = available ? '' : preview && !preview.legal ? preview.reason : availability.reason;
    const card = document.createElement('div');
    card.className = 'attack-target-card';
    card.dataset.targetId = enemy.id;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'attack-target-button';
    button.dataset.focusKey = `target:${enemy.id}`;
    button.disabled = !!options.disabled || !available;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', available
      ? `${enemy.name}、命中時 −${available.damage}、命中率 ${available.hitChance}%。攻撃予測を確認`
      : `${enemy.name}、攻撃不可。${reason}`);
    if (reason) button.title = reason;

    const text = document.createElement('span');
    text.className = 'attack-target-text';
    const name = document.createElement('strong');
    name.className = 'attack-target-name';
    name.textContent = enemy.name;
    text.append(name);
    if (available) {
      const damage = document.createElement('span');
      damage.className = 'attack-target-damage';
      damage.textContent = `命中時 −${available.damage}`;
      const chance = document.createElement('span');
      chance.className = 'attack-target-chance';
      chance.textContent = `命中率 ${available.hitChance}%`;
      text.append(damage, chance);
    } else {
      const blocked = document.createElement('span');
      blocked.className = 'attack-target-unavailable';
      blocked.textContent = reason;
      text.append(blocked);
    }
    button.append(createInspectionFace(enemy), text);
    button.onclick = () => { if (!button.disabled) options.onSelect(enemy.id); };
    card.append(button);

    if (options.onInspect) {
      const inspect = document.createElement('button');
      inspect.type = 'button';
      inspect.className = 'attack-target-inspect';
      inspect.textContent = '詳細';
      inspect.dataset.focusKey = `target-inspect:${enemy.id}`;
      inspect.disabled = !!options.disabled;
      inspect.setAttribute('aria-label', `${enemy.name}の詳細を見る`);
      inspect.onclick = () => { if (!inspect.disabled) options.onInspect?.(enemy.id); };
      card.append(inspect);
    }
    list.append(card);
  }
  root.append(list);
  return root;
}
