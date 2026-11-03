import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/domain/engine';
import { renderCommandPaletteIdentity } from '../src/view/commandPalette';

class NodePort {
  children: NodePort[] = [];
  dataset: Record<string, string> = {}; attrs: Record<string, string> = {};
  className = ''; hidden = false; src = ''; alt = ''; draggable = false;
  onerror: (() => void) | null = null;
  private ownText = '';
  classList = { add: (...names: string[]) => { this.className = [...new Set([...this.className.split(' '), ...names])].filter(Boolean).join(' '); } };
  set textContent(value: string) { this.ownText = value; this.children = []; }
  get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(''); }
  get firstElementChild() { return this.children[0] ?? null; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  append(...nodes: NodePort[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodePort[]) { this.ownText = ''; this.children = nodes; }
}

afterEach(() => vi.unstubAllGlobals());
function setup() {
  vi.stubGlobal('document', { createElement: () => new NodePort() });
  const host = new NodePort(); const state = createInitialState();
  return { host, state, render: (mode: string, busy = false, actor = state.units[0]) => renderCommandPaletteIdentity(host as unknown as HTMLElement, actor, mode, busy) };
}

describe('command palette identity (DOM port)', () => {
  it('shows the explicitly supplied actor, face and mode without changing game state', () => {
    const s = setup(), before = structuredClone(s.state), actor = s.state.units[1];
    s.render('move', false, actor);
    expect(s.host.dataset.actorId).toBe(actor.id);
    expect(s.host.dataset.team).toBe(actor.team);
    expect(s.host.textContent).toBe(`操作中の人物${actor.name}：移動先を選択中`);
    expect(s.host.attrs).toEqual({ role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    expect(s.host.children[0].children[0].dataset.faceAsset).toBe('garan');
    expect(s.state).toEqual(before);
  });

  it.each([
    ['inspect', 'コマンド選択中'], ['attack', '攻撃対象を選択中'],
    ['heal', '手当する対象を選択中'], ['survey', '測量する対象を選択中'],
    ['protect', '守る対象を選択中'], ['plank', '板道を渡す対象を選択中'],
    ['readOrder', '読令の対象を選択中'], ['facing', '向きを選択中'],
    ['gate:G1', '水門・信号の操作を確認中'], ['repair:V1', '復旧する設備を確認中'],
    ['loot:chest:B01', '装備の回収を確認中'], ['unknown', 'コマンド選択中'],
  ])('labels mode %s without leaking an internal mode name', (mode, expected) => {
    const s = setup(); s.render(mode);
    expect(s.host.textContent).toContain(`：${expected}`);
  });

  it('prioritizes presentation busy state and keeps empty actor state visible without stale identity', () => {
    const s = setup(); s.render('attack', true);
    expect(s.host.textContent).toContain('：演出中');
    renderCommandPaletteIdentity(s.host as unknown as HTMLElement, undefined, 'attack', false);
    expect(s.host.hidden).toBe(false); expect(s.host.dataset.actorId).toBeUndefined();
    expect(s.host.dataset.team).toBeUndefined();
    expect(s.host.textContent).toBe('人物を選択操作する味方を選択');
    expect(s.host.children[0].children).toHaveLength(1);
    renderCommandPaletteIdentity(s.host as unknown as HTMLElement, undefined, 'attack', true);
    expect(s.host.textContent).toBe('進行状況演出中');
  });

  it('retains a readable actor if decorative portrait loading fails', () => {
    const s = setup(); s.render('attack');
    const image = s.host.children[0].children[0].children[0]; image.onerror!();
    expect(image.hidden).toBe(true);
    expect(s.host.textContent).toContain(s.state.units[0].name);
    expect(s.host.textContent).toContain('攻撃対象を選択中');
  });

  it('avoids repeatedly rebuilding the live status but recovers if its host was cleared', () => {
    const s = setup(); s.render('move'); const first = s.host.firstElementChild;
    s.host.hidden = true;
    s.render('move'); expect(s.host.firstElementChild).toBe(first); expect(s.host.hidden).toBe(false);
    s.host.replaceChildren(); s.render('move'); expect(s.host.firstElementChild).not.toBe(first);
    s.render('attack'); expect(s.host.textContent).toContain('攻撃対象を選択中');
  });
});
