import { afterEach, describe, expect, it, vi } from 'vitest';
import { attackPreview, createInitialState, getCell, getUnit, reduce } from '../src/domain/engine';
import type { BattleState, Command } from '../src/domain/types';
import { createAttackTargets, type AttackTargetsOptions } from '../src/view/attackTargets';

/** DOM identity/content port; responsive sizing is checked by the owning UI task. */
class ElementPort {
  children: ElementPort[] = [];
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  className = ''; textContent = ''; type = ''; title = ''; disabled = false;
  src = ''; alt = ''; draggable = true; hidden = false;
  onclick?: () => void; onerror?: () => void;
  classList = { add: (...names: string[]) => { this.className += ` ${names.join(' ')}`; } };
  constructor(readonly tagName: string) {}
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  append(...nodes: ElementPort[]) { this.children.push(...nodes); }
  all(): ElementPort[] { return [this, ...this.children.flatMap(child => child.all())]; }
  text(): string { return [this.textContent, ...this.children.map(child => child.text())].join(' '); }
}

afterEach(() => vi.unstubAllGlobals());
const apply = (state: BattleState, command: Command) => {
  const result = reduce(state, command);
  expect(result.error).toBeUndefined();
  return result.state;
};
function flat(actorId = 'ally-lise') {
  const state = createInitialState();
  state.cells.forEach(cell => { cell.height = 0; cell.blocked = false; cell.shallow = false; });
  return apply(state, { type: 'start', unitId: actorId });
}
function render(state: BattleState, options: Partial<AttackTargetsOptions> = {}) {
  vi.stubGlobal('document', { createElement: (tag: string) => new ElementPort(tag.toUpperCase()) });
  const onSelect = options.onSelect ?? vi.fn();
  const root = createAttackTargets(state, { ...options, onSelect }) as unknown as ElementPort;
  const select = (id = 'enemy-melee-01') => root.all().find(node => node.dataset.focusKey === `target:${id}`)!;
  return { root, select, onSelect };
}
function adjacent() {
  const state = flat();
  getUnit(state, 'ally-lise')!.pos = { x: 4, y: 5 };
  return state;
}

describe('read-only attack target face cards', () => {
  it('shows the canonical damage/hit forecast with a reusable face and stable focus key', () => {
    const state = adjacent(), enemy = getUnit(state, 'enemy-melee-01')!;
    const forecast = attackPreview(state, state.activeId!, enemy.id);
    const { root, select } = render(state), card = select();
    expect(root.dataset.attackTargets).toBe('');
    expect(root.attrs).toMatchObject({ role: 'group', 'aria-label': '攻撃対象' });
    expect(card.disabled).toBe(false);
    expect(card.attrs['aria-label']).toBe(`${enemy.name}、命中時 −${forecast.damage}、命中率 ${forecast.hitChance}%。攻撃予測を確認`);
    expect(card.attrs['aria-haspopup']).toBe('dialog');
    expect(card.text()).toContain(`命中時 −${forecast.damage}`);
    expect(card.text()).toContain(`命中率 ${forecast.hitChance}%`);
    expect(card.children[0].dataset.faceAsset).toBe('guard');
    expect(card.children[0].children[0].src).toBe('/assets/motion-v1/portraits/guard.png');
  });

  it('emits only the selected id and never dispatches, rolls or updates HP/state', () => {
    const state = adjacent(), before = structuredClone(state), onSelect = vi.fn();
    const { select } = render(state, { onSelect });
    select().onclick!();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('enemy-melee-01');
    expect(state).toEqual(before);
  });

  it('retains names and forecasts if the existing decorative portrait fallback hides a failed image', () => {
    const { select } = render(adjacent()), card = select();
    const image = card.children[0].children[0];
    image.onerror!();
    expect(image.hidden).toBe(true);
    expect(card.text()).toContain('警備兵');
    expect(card.text()).toContain('命中時 −');
  });

  it('keeps out-of-range faces visible with canonical disabled reasons, without disabling information viewing', () => {
    const state = flat(), onInspect = vi.fn(), before = structuredClone(state);
    const { root, select, onSelect } = render(state, { onInspect });
    const card = select();
    expect(card.disabled).toBe(true);
    expect(card.text()).toContain('隣接・高さ差1以内が必要です');
    expect(card.children[0].dataset.faceAsset).toBe('guard');
    card.onclick!(); expect(onSelect).not.toHaveBeenCalled();
    const inspect = root.all().find(node => node.dataset.focusKey === 'target-inspect:enemy-melee-01')!;
    expect(inspect.disabled).toBe(false);
    inspect.onclick!();
    expect(onInspect).toHaveBeenCalledExactlyOnceWith('enemy-melee-01');
    expect(state).toEqual(before);
  });

  it('uses line-of-sight as well as bow range, and updates after the current terrain changes', () => {
    const state = flat('ally-neia');
    getUnit(state, 'ally-neia')!.pos = { x: 1, y: 1 };
    getUnit(state, 'enemy-melee-01')!.pos = { x: 3, y: 1 };
    getCell(state, { x: 2, y: 1 })!.height = 2;
    const blocked = render(state).select();
    expect(blocked.disabled).toBe(true);
    expect(blocked.title).toBe('地形で射線が遮られています');
    getCell(state, { x: 2, y: 1 })!.height = 0;
    expect(render(state).select().disabled).toBe(false);
  });

  it('rebuilds forecast availability from the moved/undone state rather than a cached target list', () => {
    const state = flat();
    expect(render(state).select().disabled).toBe(true);
    const moved = apply(state, { type: 'move', to: { x: 4, y: 5 } });
    expect(render(moved).select().disabled).toBe(false);
    expect(render(apply(moved, { type: 'undoMove' })).select().disabled).toBe(true);
  });

  it('does not show defeated enemies or friendly units as attack candidates', () => {
    const state = adjacent(); getUnit(state, 'enemy-melee-01')!.hp = 0;
    const { root } = render(state);
    const keys = root.all().map(node => node.dataset.focusKey).filter(Boolean);
    expect(keys).not.toContain('target:enemy-melee-01');
    expect(keys.some(key => key.startsWith('target:ally-'))).toBe(false);
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(['spent', 'enemy-turn', 'finished', 'no-active'] as const)('does not enable a legal geometric preview when %s', condition => {
    const state = adjacent();
    if (condition === 'spent') state.activation.acted = true;
    if (condition === 'enemy-turn') state.turn = 'enemy';
    if (condition === 'finished') state.phase = 'won';
    if (condition === 'no-active') state.activeId = null;
    const { root, select, onSelect } = render(state);
    expect(select().disabled).toBe(true);
    expect(root.children[0].attrs.role).toBe('status');
    expect(root.children[0].textContent.length).toBeGreaterThan(0);
    select().onclick!(); expect(onSelect).not.toHaveBeenCalled();
  });

  it('honors transient UI gating for attack and optional inspection separately from domain legality', () => {
    const state = adjacent(), before = structuredClone(state), onInspect = vi.fn();
    const { root, select, onSelect } = render(state, { disabled: true, onInspect });
    expect(select().disabled).toBe(true);
    select().onclick!();
    const inspect = root.all().find(node => node.dataset.focusKey === 'target-inspect:enemy-melee-01')!;
    expect(inspect.disabled).toBe(true); inspect.onclick!();
    expect(onSelect).not.toHaveBeenCalled(); expect(onInspect).not.toHaveBeenCalled();
    expect(state).toEqual(before);
  });

  it('returns only a reason when no living enemies remain, with no fake target', () => {
    const state = adjacent(); state.units.filter(unit => unit.team === 'enemy').forEach(unit => { unit.hp = 0; });
    const { root } = render(state);
    expect(root.children).toHaveLength(1);
    expect(root.text()).toContain('攻撃できる生存敵がいません。');
    expect(root.all().some(node => node.tagName === 'BUTTON')).toBe(false);
  });

  it('returns the same forecasts after target cancellation without consuming guard or a domain action', () => {
    const state = adjacent(); getUnit(state, 'ally-lise')!.guard = true;
    const before = structuredClone(state), first = render(state).root.text();
    const second = render(state).root.text();
    expect(second).toBe(first); expect(state).toEqual(before);
  });
});
