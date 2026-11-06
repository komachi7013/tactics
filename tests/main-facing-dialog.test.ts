import { unitSkill, SKILL_EFFECTS, skillUses } from '../src/view/skillTargets';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import source from '../src/main.ts?raw';
import { createInitialState, getUnit } from '../src/domain/engine';
import { reduceSelectionCommand, selectionCommandState } from '../src/view/selectionCommands';
import { castIdle } from '../src/view/castMotion';
import type { Command, Facing } from '../src/domain/types';

const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const handlers = ['inspectUnit', 'facingDialog'].map(name =>
  ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!.getText(ast),
).join('\n');
const js = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function setup() {
  const controls: any[] = [];
  let confirm = () => {};
  const ctx = {
    state: createInitialState(), selected: 'ally-lise', commandOwner: 'ally-lise', mode: 'move',
    inspectionTeam: 'player', cursor: { x: 0, y: 5 }, message: '',
    castIdle,unitSkill,SKILL_EFFECTS,skillUses,getUnit, selectionCommandState, render: vi.fn(), say: vi.fn(), mapObjectCellStatus: () => undefined,
    modal: (_title: string, _body: string, _yes: string, action: () => void) => { confirm = action; },
    document: {
      getElementById: () => ({ before: vi.fn(), append: (control: any) => controls.push(control), querySelectorAll: () => controls }),
      createElement: () => ({ setAttribute: vi.fn() }),
    },
    button: (_label: string, action: () => void) => {const children:any[]=[];return {action,children,append:(node:any)=>children.push(node),querySelector:()=>children.find(n=>n.className==='facing-label'),dataset:{},setAttribute:vi.fn(),classList:{toggle:vi.fn()}};},
    dispatch: vi.fn((command: Command) => {
      const result = reduceSelectionCommand(ctx.state, ctx.commandOwner ?? ctx.selected, command);
      expect(result.error).toBeUndefined(); ctx.state = result.state;
    }),
  };
  const handlers = new Function('ctx', `with(ctx){${js};return {inspect:inspectUnit,open:facingDialog};}`)(ctx);
  return { ctx, controls, ...handlers, confirm: () => confirm(), choose: (facing: string) => controls.find(c => c.dataset.facing === facing).action() };
}

describe('actual main facing confirmation', () => {
  it.each(['ally-garan', 'enemy-melee-01'])('ends the command owner while inspecting %s before activation starts', inspected => {
    const h = setup(), before = structuredClone(h.ctx.state);
    h.inspect(inspected);
    expect(h.ctx.selected).toBe(inspected);
    expect(h.ctx.commandOwner).toBe('ally-lise');
    h.open(); h.choose('W');
    for(const control of h.controls){
      expect(control.children.find((node:any)=>node.className==='facing-pose').src).toBe(castIdle(getUnit(before,'ally-lise')!,control.dataset.facing as Facing)!.path);
    }
    expect(h.ctx.state).toEqual(before);
    h.confirm();
    expect(h.ctx.say).not.toHaveBeenCalled();
    expect(h.ctx.dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'end', facing: 'W' });
    expect(getUnit(h.ctx.state, 'ally-lise')).toMatchObject({ acted: true, facing: 'W' });
    expect(getUnit(h.ctx.state, inspected)).toEqual(getUnit(before, inspected));
    expect(h.ctx.state.activeId).toBeNull();
  });

  it.each(['state', 'owner'])('rejects confirmation after the %s changes', changed => {
    const h = setup(); h.open();
    if (changed === 'state') h.ctx.state = structuredClone(h.ctx.state);
    else h.ctx.commandOwner = 'ally-garan';
    const before = structuredClone(h.ctx.state);
    h.confirm();
    expect(h.ctx.dispatch).not.toHaveBeenCalled();
    expect(h.ctx.say).toHaveBeenCalledWith('状況が変わりました。もう一度選んでください。');
    expect(h.ctx.state).toEqual(before);
  });
});
