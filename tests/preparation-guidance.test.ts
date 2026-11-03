import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPreparation, type PreparationData } from '../src/preparation';
import { createEquipment } from '../src/equipment';
import { createJobs } from '../src/jobs';
import { BATTLE_IDS, createGrowth, defaultParty, migrateLegacyGrowth } from '../src/progression';
import type { BattleId } from '../src/domain/types';

// Minimal DOM port: exercises real preparation event handlers/state boundaries.
// It deliberately does not claim layout, portrait loading, or browser QA.
class NodePort {
  parent: NodePort | null = null; children: NodePort[] = [];
  attrs: Record<string, string> = {}; dataset: Record<string, string> = {}; style: Record<string, string> = {};
  className = ''; disabled = false; checked = false; selected = false; hidden = false; open = false;
  value = ''; type = ''; src = ''; alt = ''; draggable = false;
  private ownText = '';
  onclick: (() => void) | null = null; onchange: (() => void) | null = null;
  onkeydown: ((event: KeyboardEvent) => void) | null = null; onerror: (() => void) | null = null;
  classList = { add: (...names: string[]) => { this.className = [...new Set([...this.className.split(' '), ...names])].filter(Boolean).join(' '); } };
  constructor(readonly tagName: string, readonly ownerDocument: DocumentPort) {}
  set textContent(value: string) { this.ownText = value; this.children = []; }
  get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...nodes: NodePort[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes: NodePort[]) { for (const old of this.children) old.parent = null; this.children = []; this.ownText = ''; this.append(...nodes); }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  focus() { this.ownerDocument.activeElement = this; }
  all(): NodePort[] { return [this, ...this.children.flatMap(child => child.all())]; }
  contains(node: NodePort) { return this.all().includes(node); }
  matches(selector: string): boolean {
    if (selector === ':disabled') return this.disabled;
    const data = /^\[data-([a-z-]+)(?:="(.*)")?\]$/.exec(selector);
    if (data) { const key = data[1].replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()); return data[2] === undefined ? key in this.dataset : this.dataset[key] === data[2]; }
    if (selector.startsWith('.')) { const [name] = selector.slice(1).split('['); return this.className.split(' ').includes(name) && (!selector.endsWith('[open]') || this.open); }
    return this.tagName === selector.toLowerCase();
  }
  closest(selector: string): NodePort | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  querySelectorAll(selector: string): NodePort[] { return this.children.flatMap(child => child.all()).filter(node => selector.split(',').some(part => node.matches(part.trim()))); }
  querySelector(selector: string): NodePort | null { return this.querySelectorAll(selector)[0] ?? null; }
}
class DocumentPort {
  host = new NodePort('div', this); activeElement: NodePort | null = null;
  createElement(tag: string) { return new NodePort(tag, this); }
  createTextNode(text: string) { const node = new NodePort('#text', this); node.textContent = text; return node; }
}
afterEach(() => { vi.unstubAllGlobals(); });
function setup(battleId: BattleId = 'B09', completed = BATTLE_IDS.slice(0, 8), mutate?: (data: PreparationData) => void) {
  const document = new DocumentPort();
  vi.stubGlobal('document', document); vi.stubGlobal('HTMLElement', NodePort); vi.stubGlobal('CSS', { escape: (value: string) => value });
  const data: PreparationData = { growth: completed.length ? migrateLegacyGrowth(completed) : createGrowth(), jobs: createJobs(), parties: {}, completed: [...completed], equipment: createEquipment() };
  data.equipment!.acquired = ['chest:B04', 'chest:B05', 'chest:B08']; mutate?.(data);
  const original = structuredClone(data); let saved = structuredClone(data);
  const update = vi.fn((next: PreparationData) => { saved = structuredClone(next); return { notice: '準備を保存しました。次の出撃に反映します。', data: saved }; });
  mountPreparation(document.host as unknown as HTMLElement, battleId, data, update);
  const find = (key: string) => document.host.querySelector(`[data-preparation-focus="${key}"]`)!;
  const click = (key: string) => { const node = find(key); expect(node, key).toBeTruthy(); expect(node.disabled, key).toBe(false); node.onclick!(); };
  const change = (key: string, value: string) => { const node = find(key); expect(node.disabled, key).toBe(false); node.value = value; node.onchange!(); };
  const escape = () => { const preventDefault = vi.fn(), stopPropagation = vi.fn(); document.host.onkeydown!({ key: 'Escape', preventDefault, stopPropagation } as unknown as KeyboardEvent); return { preventDefault, stopPropagation }; };
  return { document, data, original, update, find, click, change, escape, saved: () => saved };
}

describe('character-first preparation guidance (DOM port)', () => {
  it('starts at portraits, with no all-character equipment/training panels or acquisition catalogue', () => {
    const s = setup();
    expect(s.document.host.querySelectorAll('.preparation-person-choice')).toHaveLength(6);
    expect(s.document.host.querySelectorAll('.preparation-character-card')).toHaveLength(6);
    expect(s.document.host.querySelectorAll('input')).toHaveLength(6);
    expect(s.document.host.querySelector('[data-preparation-party]')!.tagName).toBe('section');
    for (const card of s.document.host.querySelectorAll('.preparation-character-card')) {
      expect(card.children.map(node => node.tagName)).toEqual(['label', 'button']);
      expect(card.querySelector('button')!.querySelector('input')).toBeNull();
      expect(card.querySelector('label')!.className).toBe('preparation-member-toggle');
    }
    expect(s.document.host.querySelectorAll('.training-person')).toHaveLength(0);
    expect(s.document.host.querySelectorAll('select')).toHaveLength(0);
    expect(s.document.host.textContent).toContain('仲間を選ぶと');
    expect(s.document.host.textContent).not.toContain('装備の取得一覧');
    expect(s.update).not.toHaveBeenCalled(); expect(s.data).toEqual(s.original);
  });

  it('uses card checks for an unsaved draft, without opening equipment or changing saved membership', () => {
    const s = setup('B05', BATTLE_IDS.slice(0, 4));
    const saved = structuredClone(s.saved());
    expect(s.find('select-person:ally-garan').textContent).toContain('選択済み');
    expect(s.find('select-person:ally-sena').textContent).toContain('未選択');
    expect(s.find('select-person:ally-lise').textContent).toContain('必須');
    const garan = s.find('party:ally-garan');
    expect(garan.attrs['aria-label']).toBe('ガランを出撃メンバーに選ぶ');
    expect(garan.attrs['aria-describedby']).toBe('preparation-member-status-ally-garan');
    garan.checked = false; garan.onchange!();
    expect(s.find('select-person:ally-garan').textContent).toContain('未選択・未保存');
    expect(s.find('party:ally-garan').closest('.preparation-character-card')!.dataset.partyDirty).toBe('true');
    expect(s.document.activeElement).toBe(s.find('party:ally-garan'));
    expect(s.document.host.querySelector('.training-person')).toBeNull();
    expect(s.saved()).toEqual(saved); expect(s.update).not.toHaveBeenCalled();
    s.click('select-person:ally-garan');
    expect(s.find('party:ally-garan').checked).toBe(false);
    expect(s.find('select-person:ally-garan').attrs['aria-pressed']).toBe('true');
    expect(s.document.host.querySelector('.training-person')!.textContent).toContain('出撃予定');
    expect(s.saved()).toEqual(saved); expect(s.update).not.toHaveBeenCalled();
  });

  it('selects exactly one character and keeps selection separate from deployment membership and persistence', () => {
    const s = setup(); s.click('select-person:ally-lise');
    expect(s.document.host.querySelectorAll('.training-person')).toHaveLength(1);
    expect(s.document.host.querySelector('.training-person')!.dataset.character).toBe('ally-lise');
    expect(s.document.host.querySelectorAll('.preparation-equipment')).toHaveLength(1);
    expect(s.document.host.querySelector('[data-preparation-training]')).toBeNull();
    expect(s.find('select-person:ally-lise').attrs['aria-pressed']).toBe('true');
    s.click('select-person:ally-dani');
    expect(s.document.host.querySelector('.training-person')!.dataset.character).toBe('ally-dani');
    expect(s.document.host.querySelector('.training-person')!.textContent).toContain('控え');
    expect(s.update).not.toHaveBeenCalled(); expect(s.data).toEqual(s.original);
  });

  it('retains draft/cancel/save boundaries for party selection and requires a valid party', () => {
    const s = setup('B05', BATTLE_IDS.slice(0, 4));
    expect(s.find('party:ally-lise').disabled).toBe(true);
    s.find('party:ally-garan').checked = false; s.find('party:ally-garan').onchange!();
    expect(s.find('save-party').disabled).toBe(true);
    expect(s.document.host.querySelector('[data-preparation-party]')!.textContent).toContain('未保存');
    expect(s.update).not.toHaveBeenCalled();
    s.click('cancel-party'); expect(s.find('party:ally-garan').checked).toBe(true); expect(s.update).not.toHaveBeenCalled();
    expect(s.document.host.querySelector('[data-preparation-party]')!.textContent).not.toContain('未保存');
    s.find('party:ally-garan').checked = false; s.find('party:ally-garan').onchange!();
    s.find('party:ally-sena').checked = true; s.find('party:ally-sena').onchange!();
    s.click('save-party');
    expect(s.update).toHaveBeenCalledOnce();
    expect(s.saved().parties.B05).toEqual(defaultParty('B05').filter(id => id !== 'ally-garan').concat('ally-sena'));
    expect(s.find('select-person:ally-sena').textContent).toContain('選択済み');
    expect(s.find('select-person:ally-garan').textContent).toContain('未選択');
    expect(s.document.host.querySelector('[data-preparation-party]')!.textContent).not.toContain('未保存');
    expect(s.data).toEqual(s.original);
  });

  it('keeps required, unjoined and battle-ineligible members disabled on the cards', () => {
    const early = setup('B01', []);
    expect(early.find('party:ally-lise').checked).toBe(true);
    expect(early.find('party:ally-lise').disabled).toBe(true);
    expect(early.find('party:ally-sena').disabled).toBe(true);
    expect(early.find('select-person:ally-sena').disabled).toBe(true);
    expect(early.find('select-person:ally-sena').textContent).toContain('未加入');
    // Disabled/stale controls cannot bypass eligibility or remove required Lise.
    early.find('party:ally-lise').checked = false; early.find('party:ally-lise').onchange!();
    early.find('party:ally-sena').checked = true; early.find('party:ally-sena').onchange!();
    expect(early.find('party:ally-lise').checked).toBe(true);
    expect(early.find('party:ally-sena').checked).toBe(false);
    expect(early.update).not.toHaveBeenCalled();
    const absent = setup('B06', BATTLE_IDS.slice(0, 5));
    expect(absent.find('party:ally-neia').disabled).toBe(true);
    expect(absent.find('party:ally-neia').checked).toBe(false);
    expect(absent.find('select-person:ally-neia').textContent).toContain('離脱中');
    absent.find('party:ally-neia').checked = true; absent.find('party:ally-neia').onchange!();
    expect(absent.find('party:ally-neia').checked).toBe(false);
    const reserve = setup('B01', BATTLE_IDS.slice(0, 8));
    expect(reserve.find('party:ally-dani').disabled).toBe(true);
    expect(reserve.find('select-person:ally-dani').disabled).toBe(false);
    expect(reserve.find('select-person:ally-dani').textContent).toContain('この戦闘は出撃不可');
  });

  it('compares equipment before saving, locks other mutations, cancels without changing resources and then commits once', () => {
    const s = setup();
    const oldPartyCheck = s.find('party:ally-garan');
    s.click('select-person:ally-lise'); s.change('equipment:ally-lise:weapon', 'chest:B05');
    expect(s.document.host.querySelector('.equipment-comparison')!.textContent).toContain('未確定');
    expect(s.document.host.querySelector('.equipment-comparison')!.textContent).toContain('→');
    expect(s.find('select-person:ally-garan').disabled).toBe(true);
    expect(s.find('party:ally-garan').disabled).toBe(true);
    expect(s.find('save-party').disabled).toBe(true);
    expect(s.find('cancel-party').disabled).toBe(true);
    oldPartyCheck.checked = false; oldPartyCheck.onchange!();
    expect(s.find('party:ally-garan').checked).toBe(true);
    expect(s.update).not.toHaveBeenCalled(); expect(s.data).toEqual(s.original);
    expect(s.escape().preventDefault).toHaveBeenCalledOnce();
    expect(s.document.host.querySelector('.equipment-comparison')).toBeNull();
    expect(s.update).not.toHaveBeenCalled(); expect(s.document.activeElement).toBe(s.find('equipment:ally-lise:weapon'));
    s.change('equipment:ally-lise:weapon', 'chest:B05'); s.click('equipment-confirm:ally-lise');
    expect(s.update).toHaveBeenCalledOnce(); expect(s.saved().equipment!.loadouts['ally-lise'].weapon).toBe('chest:B05');
    expect(s.saved().equipment!.acquired).toEqual(s.original.equipment!.acquired);
    expect(s.document.host.textContent).toContain('次の出撃に反映'); expect(s.data).toEqual(s.original);
  });

  it('removes all job/support/training/tutoring controls and keeps archived choices ineffective', () => {
    const s = setup('B04', BATTLE_IDS.slice(0, 3), data => {
      data.jobs['ally-lise'] = { main: 'warden', learned: ['surveyor-foundation'], support: 'surveyor-foundation' };
    });
    s.click('select-person:ally-lise');
    expect(s.document.host.querySelector('[data-preparation-training]')).toBeNull();
    const controls = s.document.host.querySelectorAll('button, select');
    expect(controls.some(node => /^(main|support|tutor|learn|respec):/.test(node.dataset.preparationFocus ?? ''))).toBe(false);
    expect(s.document.host.querySelector('.training-person')!.textContent).toContain('測量官');
    expect(s.document.host.querySelector('.preparation-equipment')!.textContent).toContain('全快HP 20');
    expect(s.document.host.textContent).toContain('履歴として保持');
    expect(s.update).not.toHaveBeenCalled(); expect(s.data).toEqual(s.original);
  });

  it('returns an old transferred-role weapon to shared storage in memory without deleting the item or history', () => {
    const s = setup('B09', BATTLE_IDS.slice(0, 8), data => {
      data.jobs['ally-neia'].main = 'warden';
      data.equipment!.loadouts['ally-neia'].weapon = 'chest:B04';
    });
    s.click('select-person:ally-neia');
    expect(s.find('equipment:ally-neia:weapon').value).toBe('');
    expect(s.find('equipment:ally-neia:weapon').textContent).toContain('標準弩');
    expect(s.document.host.textContent).toContain('共有保管へ戻しました');
    expect(s.find('equipment:ally-neia:weapon').children.find(option => option.value === 'chest:B04')!.disabled).toBe(true);
    expect(s.update).not.toHaveBeenCalled(); expect(s.data).toEqual(s.original);
    s.change('equipment:ally-neia:weapon', 'chest:B08'); s.click('equipment-confirm:ally-neia');
    expect(s.update).toHaveBeenCalledOnce(); expect(s.saved().equipment!.loadouts['ally-neia'].weapon).toBe('chest:B08');
    expect(s.saved().equipment!.acquired).toEqual(s.original.equipment!.acquired);
    expect(s.saved().jobs).toEqual(s.original.jobs); expect(s.data).toEqual(s.original);
  });

  it('keeps the B06 forced absence read-only and earlier-battle reserve equipment editable', () => {
    const absent = setup('B06', BATTLE_IDS.slice(0, 5)); absent.click('select-person:ally-neia');
    expect(absent.find('equipment:ally-neia:weapon').disabled).toBe(true);
    expect(absent.find('main:ally-neia')).toBeNull();
    expect(absent.document.host.textContent).toContain('離脱中'); expect(absent.update).not.toHaveBeenCalled();
    const reserve = setup('B01', BATTLE_IDS.slice(0, 8)); reserve.click('select-person:ally-dani');
    expect(reserve.find('main:ally-dani')).toBeNull();
    expect(reserve.find('equipment:ally-dani:head').disabled).toBe(false);
    expect(reserve.document.host.textContent).toContain('出撃不可'); expect(reserve.update).not.toHaveBeenCalled();
  });
});
