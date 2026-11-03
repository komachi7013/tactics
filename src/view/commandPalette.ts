import './commandPalette.css';
import type { Unit } from '../domain/types';
import { createInspectionFace } from './inspectionRoster';

/** UI wording only. Actor ownership and command dispatch stay in the main controller. */
function commandModeLabel(mode: string, busy: boolean): string {
  if (busy) return '演出中';
  const labels: Record<string, string> = {
    inspect: 'コマンド選択中',
    skills: '固有技を選択中',
    move: '移動先を選択中',
    attack: '攻撃対象を選択中',
    heal: '手当する対象を選択中',
    survey: '測量する対象を選択中',
    protect: '守る対象を選択中',
    plank: '板道を渡す対象を選択中',
    readOrder: '読令の対象を選択中',
    facing: '向きを選択中',
  };
  if (mode === 'gate' || mode.startsWith('gate:')) return '水門・信号の操作を確認中';
  if (mode.startsWith('repair:')) return '復旧する設備を確認中';
  if (mode.startsWith('loot:')) return '装備の回収を確認中';
  return labels[mode] ?? 'コマンド選択中';
}

const rendered = new WeakMap<HTMLElement, { key: string; root: HTMLElement }>();

/**
 * Render the command owner, independently of the person currently inspected.
 * This function has no selection, activation, storage or dispatch side effects.
 */
export function renderCommandPaletteIdentity(host: HTMLElement, actor: Unit | undefined, mode: string, busy: boolean): void {
  host.hidden = false;
  const label = actor ? commandModeLabel(mode, busy) : busy ? '演出中' : '操作する味方を選択';
  const key = JSON.stringify([actor?.id, actor?.name, actor?.weapon, actor?.team, label]);
  const previous = rendered.get(host);
  if (previous?.key === key && host.firstElementChild === previous.root) return;

  host.classList.add('palette-identity');
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'true');
  if (actor) { host.dataset.actorId = actor.id; host.dataset.team = actor.team; }
  else { delete host.dataset.actorId; delete host.dataset.team; }

  const identity = document.createElement('div'); identity.className = 'palette-identity-content';
  if (actor) identity.append(createInspectionFace(actor));
  const copy = document.createElement('div'); copy.className = 'palette-identity-copy';
  const caption = document.createElement('span'); caption.className = 'palette-identity-caption'; caption.textContent = actor ? '操作中の人物' : busy ? '進行状況' : '人物を選択';
  const status = document.createElement('p'); status.className = 'palette-identity-status';
  if (actor) {
    const name = document.createElement('strong'); name.className = 'palette-actor-name'; name.textContent = actor.name;
    const state = document.createElement('span'); state.className = 'palette-actor-mode'; state.textContent = `：${label}`;
    status.append(name, state);
  } else status.textContent = label;
  copy.append(caption, status); identity.append(copy); host.replaceChildren(identity);
  rendered.set(host, { key, root: identity });
}
