import type { BattleId } from './domain/types';
import { CHARACTER_IDS, availableCharacters, defaultParty, commonLevel, tutor, trainingPoints, type CharacterId, type Growth } from './progression';
import { JOB_NAMES, SKILLS, INITIAL_JOBS, availableTraining, learnSkill, setMainJob, equipSupport, respec, type JobsState, type JobId, type SkillId } from './jobs';
import { validateParty, createPreparedUnit } from './party';
import { createEquipment, ownedEquipment, joinedEquipmentCharacters, reconcileEquipmentJobs, type EquipmentState, type EquipmentSlot } from './equipment';
import { EQUIPMENT_SLOT_NAMES, equipmentCapText, equipmentCollectionRows, equipmentDefinition, equipmentEffectText, equipmentSlotOptions } from './view/equipmentView';
import { compareEquipmentDraft, createEquipmentDraft, resolveEquipmentDraft, type EquipmentDraft } from './view/equipmentDraft';

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  'ally-lise': 'リセ・アーヴェン', 'ally-garan': 'ガラン', 'ally-neia': 'ネイア',
  'ally-sena': 'セナ', 'ally-iva': 'イヴァ', 'ally-dani': 'ダニ',
};
export interface PreparationData { growth: Growth; jobs: JobsState; parties: Partial<Record<BattleId, CharacterId[]>>; completed: BattleId[]; equipment?: EquipmentState; confirmedEquipmentEvents?: readonly string[] }
/** Preparation is available between battles; it never mutates a running battle. */
export function mountPreparation(host: HTMLElement, battleId: BattleId, data: PreparationData,
  update: (next: PreparationData) => string | null | { notice: string; data: PreparationData }): void {
  let current = { ...data, equipment: data.equipment ?? createEquipment() };
  let pendingJobChange: { id: CharacterId; jobs: JobsState; equipment: EquipmentState } | null = null;
  let pendingEquipment: EquipmentDraft | null = null;
  let returnFocus: string | null = null;
  let draft = [...(data.parties[battleId] ?? defaultParty(battleId))];
  let notice = '';
  let activatingButton: HTMLButtonElement | null = null;
  const available = availableCharacters(battleId);
  function perform(change: () => PreparationData, equipmentConfirmation = false) {
    if (pendingEquipment && !equipmentConfirmation) { notice = '先に装備の比較を確定するか、やめるを選んでください。'; draw(); return; }
    try {
      const next = change(); const error = update(next);
      if (error && typeof error === 'object') { current = { ...error.data, equipment: error.data.equipment ?? createEquipment() }; notice = error.notice; }
      else { current = { ...next, equipment: next.equipment ?? createEquipment() }; notice = error ?? '準備を更新しました。'; }
      pendingJobChange = null;
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
  function changeJobs(id: CharacterId, change: () => JobsState) {
    if (pendingEquipment) { notice = '先に装備の比較を確定するか、やめるを選んでください。'; draw(); return; }
    try {
      const jobs = change(), equipment = reconcileEquipmentJobs(current.equipment, jobs);
      if (current.equipment.loadouts[id].weapon !== equipment.loadouts[id].weapon) {
        pendingJobChange = { id, jobs, equipment }; draw();
        host.querySelector<HTMLButtonElement>(`[data-preparation-focus="job-confirm:${id}"]`)?.focus();
      } else perform(() => ({ ...current, jobs, equipment }));
    } catch (error) { notice = error instanceof Error ? error.message : 'この職業変更はできません。'; draw(); }
  }
  function cancelEquipment() {
    if (!pendingEquipment) return;
    returnFocus = `equipment:${pendingEquipment.character}:${pendingEquipment.slot}`;
    pendingEquipment = null; notice = '装備の比較を取り消しました。装備・在庫・保存は変更していません。'; draw();
  }
  function stageEquipment(id: CharacterId, slot: EquipmentSlot, instanceId: string | null) {
    if (pendingJobChange) { notice = '先に職変更を確定するか、取り消してください。'; draw(); return; }
    if (pendingEquipment && (pendingEquipment.character !== id || pendingEquipment.slot !== slot)) {
      notice = '先に現在の装備比較を確定するか、やめるを選んでください。'; draw(); return;
    }
    try {
      pendingEquipment = current.equipment.loadouts[id][slot] === instanceId ? null : createEquipmentDraft(current, battleId, id, slot, instanceId);
      notice = pendingEquipment ? '候補を仮比較しています。装備を確定するまで装備・在庫・保存は変わりません。' : '現在の装備です。変更はありません。';
    } catch (error) { notice = error instanceof Error ? error.message : 'この装備は選べません。'; }
    returnFocus = `equipment:${id}:${slot}`; draw();
  }
  function text(tag: string, value: string) { const node = document.createElement(tag); node.textContent = value; return node; }
  function draw() {
    // AX/pointer activation need not focus the button first. Preserve the
    // control that actually requested this synchronous redraw in either case.
    const active = activatingButton ?? (document.activeElement instanceof HTMLElement && host.contains(document.activeElement) ? document.activeElement : null);
    const focusKey = returnFocus ?? active?.dataset.preparationFocus;
    returnFocus = null;
    const owner = active?.closest<HTMLElement>('.training-person')?.dataset.character;
    const opened = new Set([...host.querySelectorAll<HTMLDetailsElement>('.training-person[open]')].map(e => e.dataset.character));
    const collectionOpen = host.querySelector<HTMLDetailsElement>('[data-equipment-collection]')?.open ?? false;
    host.replaceChildren();
    host.append(text('p', `章共通レベル ${commonLevel(current.completed)} ／ 初回出撃報酬は各2点。任意控えは0点、ネイアのB06強制離脱は復帰時に補填します。`));
    host.append(text('p', '補習は完了章数×6点までの不足分を手動で補います。周回不要。同じ上限では重ね取りできません。職変更・無料振り直し・補助の反映は次の出撃からです。'));
    const status = text('p', notice); status.setAttribute('role', 'status'); host.append(status);
    const party = document.createElement('fieldset'); party.append(text('legend', `出撃予定 ${draft.length}/${Math.min(4, available.length)}人（リセ必須）`));
    for (const id of CHARACTER_IDS) {
      const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox';
      input.dataset.preparationFocus = `party:${id}`;
      input.checked = draft.includes(id); input.disabled = id === 'ally-lise' || !available.includes(id);
      input.onchange = () => { draft = input.checked ? [...draft, id] : draft.filter(x => x !== id); draw(); };
      label.append(input, document.createTextNode(CHARACTER_NAMES[id] + (!available.includes(id) ? id === 'ally-neia' && battleId === 'B06' ? '（物語上の離脱）' : '（この戦闘では未加入）' : ''))); party.append(label);
    }
    party.append(action('この編成を保存する', () => perform(() => {
      if (!validateParty(battleId, draft)) throw Error('リセを含め、出撃可能な仲間から指定人数を選んでください。');
      return { ...current, parties: { ...current.parties, [battleId]: [...draft] } };
    }), false, 'save-party'));
    host.append(party);
    const owned = ownedEquipment(current.completed, current.equipment.acquired);
    const used = new Set(Object.values(current.equipment.loadouts).flatMap(loadout => Object.values(loadout).filter((id): id is string => id !== null)));
    host.append(text('p', `共有保管 ${owned.filter(event => !used.has(event.id)).length}/${owned.length}個（全6人の装着分を含む有限在庫）。武器1・頭1・胴1・脚1。標準品は補正0・在庫数に含めません。変更は次の出撃からです。`));
    const collection = document.createElement('details'); collection.dataset.equipmentCollection = ''; collection.open = collectionOpen;
    const collectionSummary = text('summary', '装備の取得一覧 / 未回収は元の戦闘を再挑戦'); collectionSummary.dataset.preparationFocus = 'equipment-collection'; collectionSummary.style.color = '#193539'; collection.append(collectionSummary);
    for (const row of equipmentCollectionRows(current.completed, current.equipment, current.confirmedEquipmentEvents ?? [])) {
      collection.append(text('p', `${row.event.battleId} ${row.event.source === 'clear' ? '初回クリア基本' : '任意宝箱'} / ${EQUIPMENT_SLOT_NAMES[row.item.slot]}・${row.item.name} / ${equipmentEffectText(row.item.bonus)} / ${row.status}`));
    }
    collection.append(text('p', 'B12は最終戦から終幕へ進み、装備報酬・宝箱はありません。宝箱は攻略・証拠・終幕の必須条件ではありません。'));
    host.append(collection);
    const joined = joinedEquipmentCharacters(current.completed);
    for (const id of CHARACTER_IDS.filter(id => available.includes(id) || joined.includes(id))) {
      const details = document.createElement('details'); details.className = 'training-person';
      details.dataset.character = id; details.open = opened.has(id);
      const loadout = current.jobs[id];
      details.append(text('summary', `${CHARACTER_NAMES[id]} ／ ${JOB_NAMES[loadout.main]} ／ 訓練点 ${availableTraining(current.jobs, current.growth, id)}残・累計${trainingPoints(current.growth, id)}`));
      details.querySelector('summary')!.dataset.preparationFocus = `person:${id}`;
      const fields = document.createElement('div'); fields.className = 'training-fields';
      if (!available.includes(id)) fields.append(text('p', id === 'ally-neia' && battleId === 'B06' ? '物語上の離脱中。職・装備を保持し、変更/貸出はできません。' : 'この戦闘には出撃できません。加入済みの装備割当は保持し、次の出撃への装備準備はできます。'));
      fields.append(action('章上限まで補習する', () => perform(() => ({ ...current, growth: tutor(current.growth, id, current.completed) })), false, `tutor:${id}`));
      const jobLabel = document.createElement('label'); jobLabel.append(document.createTextNode('主職 '));
      const jobs = document.createElement('select');
      jobs.dataset.preparationFocus = `main:${id}`;
      for (const job of [...new Set<JobId>(['surveyor', 'warden', INITIAL_JOBS[id]])]) {
        const option = document.createElement('option'); option.value = job; option.textContent = JOB_NAMES[job]; option.selected = job === loadout.main; jobs.append(option);
      }
      jobs.onchange = () => changeJobs(id, () => setMainJob(current.jobs, id, jobs.value as JobId, battleId));
      jobLabel.append(jobs); fields.append(jobLabel);
      const supportLabel = document.createElement('label'); supportLabel.append(document.createTextNode('他職の補助 '));
      const support = document.createElement('select'); const none = document.createElement('option'); none.value = ''; none.textContent = '装備しない'; support.append(none);
      support.dataset.preparationFocus = `support:${id}`;
      for (const skill of SKILLS.filter(s => loadout.learned.includes(s.id) && s.job !== loadout.main)) {
        const option = document.createElement('option'); option.value = skill.id; option.textContent = skill.name; support.append(option);
      }
      support.value = loadout.support ?? ''; support.onchange = () => perform(() => ({ ...current, jobs: equipSupport(current.jobs, id, support.value ? support.value as SkillId : null) }));
      supportLabel.append(support); fields.append(supportLabel);
      for (const skill of SKILLS.filter(s => s.job === loadout.main)) {
        fields.append(action(`${JOB_NAMES[skill.job]}・${skill.name}（${({ hp: 'HP', atk: '攻撃', def: '防御', move: '移動', shallow: '浅瀬移動費' })[skill.effect]}${skill.effect === 'shallow' ? '1' : '+' + skill.amount}／${skill.cost}点）${loadout.learned.includes(skill.id) ? ' 習得済み' : ''}`,
          () => perform(() => ({ ...current, jobs: learnSkill(current.jobs, current.growth, id, skill.id, battleId) })), loadout.learned.includes(skill.id), `learn:${id}:${skill.id}`));
      }
      fields.append(action('無料で振り直す（習得・補助を解除）', () => changeJobs(id, () => respec(current.jobs, id)), false, `respec:${id}`));
      if (!available.includes(id)) for (const control of fields.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select')) control.disabled = true;
      if (pendingJobChange?.id === id) {
        const pending = pendingJobChange;
        const confirmation = document.createElement('fieldset'); confirmation.append(text('legend', '職変更と武器返却の確認'));
        confirmation.append(text('p', '新しい主職では現在の武器を使えません。武器を共有保管へ返し、標準武器に戻して職を変更します。取消なら職・装備・在庫は変わりません。'));
        confirmation.append(action('武器を返して職変更を確定', () => perform(() => ({ ...current, jobs: pending.jobs, equipment: pending.equipment })), false, `job-confirm:${id}`));
        confirmation.append(action('職変更を取り消す', () => { pendingJobChange = null; draw(); }, false, `job-cancel:${id}`));
        details.open = true; fields.append(confirmation);
      }
      const gear = document.createElement('fieldset'); gear.style.minWidth = '0'; gear.style.width = '100%'; gear.style.gridColumn = '1 / -1'; gear.append(text('legend', '次の出撃の装備（4部位）'));
      for (const slot of ['weapon', 'head', 'body', 'legs'] as EquipmentSlot[]) {
        const label = document.createElement('label'); label.style.display = 'block'; label.style.minWidth = '0'; label.style.width = '100%'; label.append(document.createTextNode(EQUIPMENT_SLOT_NAMES[slot] + ' '));
        const select = document.createElement('select'); select.dataset.preparationFocus = `equipment:${id}:${slot}`; select.style.maxWidth = '100%'; select.style.width = '100%'; select.style.minWidth = '0';
        const standard = document.createElement('option'); standard.value = ''; standard.textContent = slot === 'weapon' ? `標準${current.jobs[id].main === 'scout' ? '弩' : '近接具'}（補正0・常備）` : `標準${EQUIPMENT_SLOT_NAMES[slot]}装（補正0・常備）`; select.append(standard);
        for (const choice of equipmentSlotOptions(current.equipment, current.completed, current.jobs, id, slot)) {
          const option = document.createElement('option'); option.value = choice.event.id; option.disabled = choice.disabled;
          option.textContent = `${choice.item.name} / ${equipmentEffectText(choice.item.bonus)} / ${choice.event.battleId}${choice.event.source === 'clear' ? '支給' : '箱'} / ${choice.owner ? CHARACTER_NAMES[choice.owner] + '装着中' : '共有保管'}${choice.reason ? '・' + choice.reason : ''}`;
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
      const nextUnit = createPreparedUnit(id, current.jobs, commonLevel(current.completed), current.equipment);
      gear.append(text('p', equipmentCapText(current.equipment, id)));
      gear.append(text('p', `次出撃の全快HP ${nextUnit.maxHp} / 攻撃 ${nextUnit.atk} / 防御 ${nextUnit.def}。今戦闘のHP・技回数は変更しません。`));
      fields.append(gear); details.append(fields); host.append(details);
    }
    host.append(text('p', '主職を測量官にすると基本HP18・攻撃7・防御1、堤防衛士はHP24・攻撃7・防御3。ともに近接・移動4・浅瀬2です。章レベルと補助を加算します。施療士から転職すると手当を使えません。'));
    host.append(text('p', '職業変更は測量官・堤防衛士と本人の初期職への復帰を先行実装しています。測量官は測線（戦闘2回・射程3・射線必要）、堤防衛士は護衛（隣接・次の被ダメージ−2）を主職技として使えます。水工師は渡り板（戦闘2回・隣接味方の次の移動だけ浅瀬費用1）を使えます。記録官は読令（戦闘2回・盤面全体の敵1人）で、現在盤面の移動先・攻撃対象・命中率・命中時ダメージを対象の次の行動終了まで読みます。候補は盤面変化で無料更新し、次の敵の確約ではありません。継承支援に固有コマンドは含まれません。難易度調整は今後の工程です。ダニは盤面に全身のキャラクター素材、人物一覧と詳細に対応する顔素材を表示します。'));
    // A single unresolved equipment/job confirmation owns mutation controls.
    // Read-only details and collection summaries remain available.
    if (pendingEquipment || pendingJobChange) for (const control of host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')) {
      const key = control.dataset.preparationFocus;
      const allowed = pendingEquipment
        ? key === `equipment:${pendingEquipment.character}:${pendingEquipment.slot}` || key === `equipment-confirm:${pendingEquipment.character}` || key === `equipment-cancel:${pendingEquipment.character}`
        : key === `job-confirm:${pendingJobChange!.id}` || key === `job-cancel:${pendingJobChange!.id}`;
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
    if (event.key === 'Escape' && pendingJobChange) {
      const id = pendingJobChange.id; event.preventDefault(); event.stopPropagation(); pendingJobChange = null; draw();
      host.querySelector<HTMLElement>(`[data-preparation-focus="main:${id}"]`)?.focus();
    }
  };
  draw();
}
