import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, getUnit, reduce } from '../src/domain/engine';
import { applyCharacterRole } from '../src/jobs';
import { createSkillTargets, skillTargetRows, unitSkill, skillUses } from '../src/view/skillTargets';

class NodePort {
  children: NodePort[] = []; dataset: Record<string,string> = {}; attrs: Record<string,string> = {};
  className = ''; disabled = false; textContent = ''; title = ''; onclick?: () => void;
  classList = { add: (...names: string[]) => { this.className += ' ' + names.join(' '); } };
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  append(...nodes: NodePort[]) { this.children.push(...nodes); }
}
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const state = createInitialState(); state.units = state.units.map(applyCharacterRole);
  getUnit(state,'ally-lise')!.pos = {x:1,y:5}; getUnit(state,'ally-garan')!.pos = {x:1,y:6};
  return reduce(state, {type:'start',unitId:'ally-lise'}).state;
}
describe('portrait based skill selection', () => {
  it('shows valid targets and reasons for unavailable targets without committing the skill', () => {
    const state = setup(), before = structuredClone(state), actor = getUnit(state,'ally-lise')!;
    const rows = skillTargetRows(state, actor, 'survey');
    expect(rows.map(r=>r.unit.team)).not.toContain('enemy');
    expect(rows.find(r=>r.unit.id===actor.id)?.legal).toBe(false);
    expect(rows.find(r=>r.unit.id==='ally-garan')).toMatchObject({legal:true,detail:'次の通常攻撃＋2'});
    expect(state).toEqual(before);
    vi.stubGlobal('document',{createElement:()=>new NodePort()}); const select = vi.fn();
    const root = createSkillTargets(state,actor,'survey',false,select) as unknown as NodePort;
    expect(root.attrs['aria-label']).toBe('測線の対象');
    expect(root.children[0].textContent).toContain('残り2回');
    const cards = root.children[1].children;
    expect(cards[0].children[0].disabled).toBe(true);
    cards[0].children[0].onclick!(); expect(select).not.toHaveBeenCalled();
    const garan = cards.find(c=>c.children[0].dataset.focusKey==='skill:survey:ally-garan')!.children[0];
    expect(garan.children[0].dataset.faceAsset).toBe('garan');
    garan.onclick!(); expect(select).toHaveBeenCalledWith('ally-garan'); expect(state).toEqual(before);
  });
  it('cannot offer a legal heal after the action is spent, even with a valid geometric target', () => {
    const state=setup(), actor=getUnit(state,'ally-lise')!; actor.healCharges=2;
    getUnit(state,'ally-garan')!.hp-=6;
    expect(skillTargetRows(state,actor,'heal').find(r=>r.unit.id==='ally-garan')?.legal).toBe(true);
    state.activation.acted=true;
    expect(skillTargetRows(state,actor,'heal').every(r=>!r.legal)).toBe(true);
  });
  it('offers only enemies for read order and exposes exhausted charges', () => {
    const state=setup(), actor=getUnit(state,'ally-lise')!; actor.jobCommand='readOrder';actor.readCharges=0;
    expect(unitSkill(actor)).toBe('readOrder'); expect(skillUses(actor,'readOrder')).toContain('残り0回');
    const rows=skillTargetRows(state,actor,'readOrder');
    expect(rows.every(r=>r.unit.team==='enemy'&&!r.legal)).toBe(true);
  });
  it('Neia has an automatic shallow capability instead of an active skill', () => {
    const state=setup(), neia=getUnit(state,'ally-neia')!;
    expect(unitSkill(neia)).toBeUndefined(); expect(neia.shallowCost).toBe(1);
  });
});
