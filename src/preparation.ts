import './view/preparationGuide.css';
import { createInspectionFace } from './view/inspectionRoster';
import type { BattleId } from './domain/types';
import { CHARACTER_IDS, availableCharacters, defaultParty, commonLevel, type CharacterId, type Growth } from './progression';
import { INITIAL_JOBS, type JobsState } from './jobs';
import { validateParty, createPreparedUnit } from './party';
import { createEquipment, ownedEquipment, joinedEquipmentCharacters, reconcileEquipmentRoles, type EquipmentState, type EquipmentSlot } from './equipment';
import { EQUIPMENT_SLOT_NAMES, equipmentCapText, equipmentDefinition, equipmentEffectText, equipmentSlotOptions } from './view/equipmentView';
import { compareEquipmentDraft, createEquipmentDraft, resolveEquipmentDraft, type EquipmentDraft } from './view/equipmentDraft';

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  'ally-lise': 'リセ・アーヴェン', 'ally-garan': 'ガラン', 'ally-neia': 'ネイア',
  'ally-sena': 'セナ', 'ally-iva': 'イヴァ', 'ally-dani': 'ダニ',
};
export interface PreparationData { growth: Growth; jobs: JobsState; parties: Partial<Record<BattleId, CharacterId[]>>; completed: BattleId[]; equipment?: EquipmentState; confirmedEquipmentEvents?: readonly string[] }
/** Preparation is available between battles; it never mutates a running battle. */
export function mountPreparation(host: HTMLElement, battleId: BattleId, data: PreparationData,
  update: (next: PreparationData) => string | null | { notice: string; data: PreparationData }): void {
  let current = { ...data, equipment: reconcileEquipmentRoles(data.equipment ?? createEquipment()) };
  let pendingEquipment: EquipmentDraft | null = null;
  let returnFocus: string | null = null;
  let draft = [...(data.parties[battleId] ?? defaultParty(battleId))];
  let notice = data.equipment && JSON.stringify(data.equipment.loadouts) !== JSON.stringify(current.equipment.loadouts) ? '各人物に合わない武器を共有保管へ戻しました。取得済みの装備は失われません。' : '';
  let selectedCharacter: CharacterId | null = null;
  host.classList.add('preparation-guide');
  let activatingButton: HTMLButtonElement | null = null;
  const available = availableCharacters(battleId);
  function perform(change: () => PreparationData, equipmentConfirmation = false) {
    if (pendingEquipment && !equipmentConfirmation) { notice = '先に装備の比較を確定するか、やめるを選んでください。'; draw(); return; }
    try {
      const next = change(); const error = update(next);
      if (error && typeof error === 'object') { current = { ...error.data, equipment: error.data.equipment ?? createEquipment() }; notice = error.notice; }
      else { current = { ...next, equipment: next.equipment ?? createEquipment() }; notice = error ?? '準備を更新しました。'; }
      pendingEquipment = null;
    } catch (error) { notice = error instanceof Error ? error.message : 'この準備は選択できません。'; }
    draw();
  }
  function action(label: string, run: () => void, disabled = false, focusKey?: string) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = disabled;
    b.onclick = () => {
      const previous = activatingButton;
      activatingButton = b;
      try { run(); } finally { activatingButton = previous; }
    };
    if (focusKey) b.dataset.preparationFocus = focusKey;
    return b;
  }
  function cancelEquipment() {
    if (!pendingEquipment) return;
    returnFocus = `equipment:${pendingEquipment.character}:${pendingEquipment.slot}`;
    pendingEquipment = null; notice = '装備の比較を取り消しました。装備・在庫・保存は変更していません。'; draw();
  }
  function stageEquipment(id: CharacterId, slot: EquipmentSlot, instanceId: string | null) {
    if (pendingEquipment && (pendingEquipment.character !== id || pendingEquipment.slot !== slot)) {
      notice = '先に現在の装備比較を確定するか、やめるを選んでください。'; draw(); return;
    }
    try {
      pendingEquipment = current.equipment.loadouts[id][slot] === instanceId ? null : createEquipmentDraft(current, battleId, id, slot, instanceId);
      notice = pendingEquipment ? '候補を仮比較しています。装備を確定するまで装備・在庫・保存は変わりません。' : '現在の装備です。変更はありません。';
    } catch (error) { notice = error instanceof Error ? error.message : 'この装備は選べません。'; }
    returnFocus = `equipment:${id}:${slot}`; draw();
    if (pendingEquipment) host.querySelector<HTMLElement>('.equipment-comparison')?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
  }
  function text(tag: string, value: string) { const node = document.createElement(tag); node.textContent = value; return node; }
  function draw() {
    // AX/pointer activation need not focus the button first. Preserve the
    // control that actually requested this synchronous redraw in either case.
    const active = activatingButton ?? (document.activeElement instanceof HTMLElement && host.contains(document.activeElement) ? document.activeElement : null);
    const focusKey = returnFocus ?? active?.dataset.preparationFocus;
    returnFocus = null;
    const owner = active?.closest<HTMLElement>('.training-person')?.dataset.character;
    const savedParty = current.parties[battleId] ?? defaultParty(battleId);
    const partyDirty = draft.length !== savedParty.length || draft.some(id => !savedParty.includes(id));
    const joined = joinedEquipmentCharacters(current.completed);
    host.replaceChildren();
    const timing = text('p', '次の出撃の準備です。変更は出撃時に反映され、今の戦闘のHP・技回数は変わりません。');
    timing.className = 'preparation-timing'; host.append(timing);
    const archived = CHARACTER_IDS.some(id => current.jobs[id].main !== INITIAL_JOBS[id] || current.jobs[id].learned.length > 0 || current.jobs[id].support !== null) || Object.values(current.growth.tutoring).some(points => points > 0);
    if (archived) { const note = text('p', '以前の職業・訓練設定は履歴として保持し、能力には反映しません。'); note.className = 'preparation-legacy-note'; host.append(note); }
    const partyPanel = document.createElement('section'); partyPanel.className = 'preparation-party'; partyPanel.dataset.preparationParty = '';
    const party = document.createElement('fieldset');
    party.append(text('legend', `出撃メンバー 選択中 ${draft.length}/${Math.min(4, available.length)}人（リセ必須）${partyDirty ? '・未保存' : ''}`));
    const help = text('p', '左上のチェックで出撃メンバーを選び、保存すると編成に反映します。顔・名前を押すと装備を確認できます。');
    help.className = 'preparation-party-help'; party.append(help);
    const chooser = document.createElement('div'); chooser.className = 'preparation-characters';
    chooser.setAttribute('role', 'group'); chooser.setAttribute('aria-label', '出撃メンバーの選択と仲間の装備確認');
    for (const id of CHARACTER_IDS) {
      const selectable = available.includes(id) || joined.includes(id);
      const unavailable = id === 'ally-neia' && battleId === 'B06' ? '離脱中' : joined.includes(id) ? 'この戦闘は出撃不可' : '未加入';
      const selected = draft.includes(id);
      const changed = selected !== savedParty.includes(id);
      const member = !available.includes(id) ? unavailable : id === 'ally-lise' ? '必須・選択済み' : selected ? '選択済み' : '未選択';
      const memberStatus = member + (changed ? '・未保存' : '');
      const card = document.createElement('div'); card.className = 'preparation-character-card';
      card.dataset.partySelected = String(selected); card.dataset.partyDirty = String(changed);
      const toggle = document.createElement('label'); toggle.className = 'preparation-member-toggle';
      const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.preparationFocus = `party:${id}`;
      input.checked = selected; input.disabled = id === 'ally-lise' || !available.includes(id);
      input.setAttribute('aria-label', `${CHARACTER_NAMES[id]}を出撃メンバーに選ぶ`);
      input.setAttribute('aria-describedby', `preparation-member-status-${id}`);
      input.onchange = () => {
        returnFocus = `party:${id}`;
        // Keep the same draft boundary even if a stale/disabled control is
        // invoked programmatically while an equipment comparison is open.
        if (pendingEquipment || id === 'ally-lise' || !available.includes(id)) { draw(); return; }
        draft = input.checked ? [...new Set([...draft, id])] : draft.filter(x => x !== id);
        draw();
      };
      toggle.append(input, text('span', '出撃'));
      const pick = action('', () => { selectedCharacter = id; draw(); }, !selectable, `select-person:${id}`);
      pick.className = 'preparation-person-choice';
      pick.setAttribute('aria-pressed', String(selectedCharacter === id));
      pick.setAttribute('aria-label', `${CHARACTER_NAMES[id]}の装備を見る（${memberStatus}）`);
      const memberText = text('small', memberStatus); memberText.setAttribute('id', `preparation-member-status-${id}`);
      pick.append(createInspectionFace({ id, weapon: INITIAL_JOBS[id] === 'scout' ? 'bow' : 'melee' }), text('span', CHARACTER_NAMES[id]), memberText);
      // A checkbox is never nested in the equipment-view button. Both have
      // their own focus/activation target within the same face card.
      card.append(toggle, pick); chooser.append(card);
    }
    party.append(chooser);
    const partyActions = document.createElement('div'); partyActions.className = 'preparation-party-actions';
    partyActions.append(action('この編成を保存する', () => perform(() => {
      if (!validateParty(battleId, draft)) throw Error('リセを含め、出撃可能な仲間から指定人数を選んでください。');
      return { ...current, parties: { ...current.parties, [battleId]: [...draft] } };
    }), !validateParty(battleId, draft), 'save-party'));
    partyActions.append(action('編成の選択を戻す', () => { draft = [...(current.parties[battleId] ?? defaultParty(battleId))]; draw(); }, !partyDirty, 'cancel-party'));
    party.append(partyActions);
    if (!validateParty(battleId, draft)) party.append(text('p', `リセを含めて${Math.min(4, available.length)}人を選ぶと保存できます。`));
    partyPanel.append(party); host.append(partyPanel);
    const status = text('p', notice); status.className = 'preparation-save-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); host.append(status);
    if (!selectedCharacter) { const prompt = text('p', '仲間を選ぶと、武器・装具と次の出撃時の能力を確認できます。'); prompt.className = 'preparation-prompt'; host.append(prompt); }
    for (const id of CHARACTER_IDS.filter(id => id === selectedCharacter && (available.includes(id) || joined.includes(id)))) {
      const details = document.createElement('details'); details.className = 'training-person';
      details.dataset.character = id; details.open = true;
      const nextUnit = createPreparedUnit(id, current.jobs, commonLevel(current.completed), current.equipment);
      details.append(text('summary', `${CHARACTER_NAMES[id]} ／ ${available.includes(id) ? `保存済み編成：${savedParty.includes(id) ? '出撃予定' : '控え'}` : 'この戦闘は出撃不可'} ／ ${nextUnit.role}`));
      details.querySelector('summary')!.dataset.preparationFocus = `person:${id}`;
      const gear = document.createElement('fieldset'); gear.style.minWidth = '0'; gear.style.width = '100%'; gear.style.gridColumn = '1 / -1'; gear.className = 'preparation-equipment'; gear.append(text('legend', '武器・装具'));
      const owned = ownedEquipment(current.completed, current.equipment.acquired);
      const used = new Set(Object.values(current.equipment.loadouts).flatMap(loadout => Object.values(loadout).filter((item): item is string => item !== null)));
      gear.append(text('p', `共有保管 ${owned.filter(event => !used.has(event.id)).length}個。候補を選ぶと能力差を確認できます。確定前は装備・在庫を変更しません。`));
      for (const slot of ['weapon', 'head', 'body', 'legs'] as EquipmentSlot[]) {
        const label = document.createElement('label'); label.style.display = 'block'; label.style.minWidth = '0'; label.style.width = '100%'; label.append(document.createTextNode(EQUIPMENT_SLOT_NAMES[slot] + ' '));
        const select = document.createElement('select'); select.dataset.preparationFocus = `equipment:${id}:${slot}`; select.style.maxWidth = '100%'; select.style.width = '100%'; select.style.minWidth = '0';
        const standard = document.createElement('option'); standard.value = ''; standard.textContent = slot === 'weapon' ? `標準${INITIAL_JOBS[id] === 'scout' ? '弩' : '近接具'}（補正0・常備）` : `標準${EQUIPMENT_SLOT_NAMES[slot]}装（補正0・常備）`; select.append(standard);
        for (const choice of equipmentSlotOptions(current.equipment, current.completed, current.jobs, id, slot)) {
          const option = document.createElement('option'); option.value = choice.event.id; option.disabled = choice.disabled;
          option.textContent = `${choice.item.name} / ${equipmentEffectText(choice.item.bonus)} / ${choice.owner ? CHARACTER_NAMES[choice.owner] + '装着中' : '共有保管'}${choice.reason ? '・' + choice.reason : ''}`;
          select.append(option);
        }
        const comparing = pendingEquipment?.character === id && pendingEquipment.slot === slot;
        select.value = comparing ? pendingEquipment!.instanceId ?? '' : current.equipment.loadouts[id][slot] ?? '';
        select.disabled = id === 'ally-neia' && battleId === 'B06';
        select.style.minHeight = '44px';
        select.setAttribute('aria-label', `${CHARACTER_NAMES[id]}の${EQUIPMENT_SLOT_NAMES[slot]}候補（選択後に比較・確定）`);
        select.onchange = () => stageEquipment(id, slot, select.value || null);
        label.append(select); gear.append(label);
      }
      if (pendingEquipment?.character === id) {
        const candidate = pendingEquipment;
        const comparison = document.createElement('fieldset'); comparison.className = 'equipment-comparison';
        comparison.setAttribute('aria-label', `${CHARACTER_NAMES[id]}の装備比較`); comparison.setAttribute('aria-live', 'polite');
        comparison.append(text('legend', `${EQUIPMENT_SLOT_NAMES[candidate.slot]}候補の比較（未確定）`));
        try {
          const preview = compareEquipmentDraft(current, candidate);
          const oldId = current.equipment.loadouts[id][candidate.slot];
          comparison.append(text('p', `現在：${oldId ? equipmentDefinition(oldId)!.name : '標準品'} → 候補：${candidate.instanceId ? equipmentDefinition(candidate.instanceId)!.name : '標準品'}`));
          const signed = (n: number) => n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0';
          comparison.append(text('p', `次出撃の全快HP ${preview.before.maxHp} → ${preview.after.maxHp}（${signed(preview.delta.hp)}）／ 攻撃 ${preview.before.atk} → ${preview.after.atk}（${signed(preview.delta.atk)}）／ 防御 ${preview.before.def} → ${preview.after.def}（${signed(preview.delta.def)}）`));
          comparison.append(text('p', `現在：${equipmentCapText(current.equipment, id)}`));
          comparison.append(text('p', `候補：${equipmentCapText(preview.equipment, id)}`));
          comparison.append(text('p', '共有保管と装着者は確定前の状態です。今戦闘のHP・技回数は変更しません。'));
          comparison.append(action('装備を確定', () => {
            returnFocus = `equipment:${id}:${candidate.slot}`;
            perform(() => ({ ...current, equipment: resolveEquipmentDraft(current, candidate) }), true);
          }, false, `equipment-confirm:${id}`));
        } catch (error) { comparison.append(text('p', error instanceof Error ? error.message : '候補を選び直してください。')); }
        comparison.append(action('やめる', cancelEquipment, false, `equipment-cancel:${id}`));
        for (const control of comparison.querySelectorAll<HTMLButtonElement>('button')) control.style.minHeight = '44px';
        gear.append(comparison); details.open = true;
      }
      gear.append(text('p', equipmentCapText(current.equipment, id)));
      gear.append(text('p', `次出撃の全快HP ${nextUnit.maxHp} / 攻撃 ${nextUnit.atk} / 防御 ${nextUnit.def}。今戦闘のHP・技回数は変更しません。`));
      details.append(gear); host.append(details);
    }
    // One unresolved equipment confirmation owns mutation controls.
    // Read-only details remain available.
    if (pendingEquipment) for (const control of host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')) {
      const key = control.dataset.preparationFocus;
      const allowed = key === `equipment:${pendingEquipment.character}:${pendingEquipment.slot}` || key === `equipment-confirm:${pendingEquipment.character}` || key === `equipment-cancel:${pendingEquipment.character}`;
      if (!allowed) control.disabled = true;
    }
    if (focusKey) {
      const previous = host.querySelector<HTMLElement>(`[data-preparation-focus="${CSS.escape(focusKey)}"]`);
      const usable = previous && !previous.matches(':disabled') ? previous : null;
      const fallback = owner ? host.querySelector<HTMLElement>(`[data-preparation-focus="${CSS.escape(`person:${owner}`)}"]`) : null;
      (usable ?? fallback)?.focus({ preventScroll: true });
    }
  }
  host.onkeydown = event => {
    if (event.key === 'Escape' && pendingEquipment) {
      event.preventDefault(); event.stopPropagation(); cancelEquipment(); return;
    }
  };
  draw();
}
