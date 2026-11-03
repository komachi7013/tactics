import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import source from '../src/main.ts?raw';
import { createInitialState, getCell, getUnit, reachable, attackPreview, reduce } from '../src/domain/engine';
import { getBattleConfig } from '../src/domain/battles';
import { createPartyBattle } from '../src/party';
import { defaultParty } from '../src/progression';
import { selectionCommandState, reduceSelectionCommand } from '../src/view/selectionCommands';
import { mapObjectCellStatus } from '../src/view/mapObjectInspection';
import type { BattleState, Command, Pos } from '../src/domain/types';

// Exercise the real main selection handlers; rendering and confirmation are ports.
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const handlers = ['inspectUnit', 'selectCell'].map(name => {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  return node.getText(ast);
}).join('\n');
const js = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(initial = createInitialState(), initialMode = 'move') {
  return new Function('ports', `
    const { getCell,getUnit,reachable,attackPreview,getBattleConfig,selectionCommandState,reduceSelectionCommand,mapObjectCellStatus } = ports;
    const registeredLandscape=()=>undefined;
    let state=ports.initial, selected='ally-lise', commandOwner='ally-lise', mode=ports.initialMode,
      cursor={...getUnit(state,'ally-lise').pos}, inspectionTeam='player', message='', enabled=true;
    let confirmations=[]; const render=()=>{}, interactive=()=>enabled, say=text=>{message=text;};
    function confirmCommand(title,body,command){confirmations.push(command);}
    function dispatch(command){if(!enabled)return;const result=reduceSelectionCommand(state,commandOwner??selected,command);if(result.error){message=result.error;return;}state=result.state;mode='inspect';}
    ${js}
    return {click:selectCell, command:dispatch, inspect:inspectUnit,
      setMode:value=>{mode=value;}, lock:value=>{enabled=!value;},
      snapshot:()=>({state,selected,commandOwner,mode,message,confirmations})};
  `)({ initial, initialMode, getCell, getUnit, reachable, attackPreview, getBattleConfig, selectionCommandState, reduceSelectionCommand, mapObjectCellStatus }) as {
    click(pos: Pos): void; command(command: Command): void; inspect(id: string): void;
    setMode(mode: string): void; lock(value: boolean): void;
    snapshot(): { state: BattleState; selected: string; commandOwner: string; mode: string; message: string; confirmations: Command[] };
  };
}
const commit = (state: BattleState, command: Command) => { const result = reduce(state, command); expect(result.error).toBeUndefined(); return result.state; };

describe('direct movement and stable command ownership', () => {
  it('commits a legal destination immediately without a move confirmation', () => {
    const h = harness(); h.click({ x: 1, y: 5 }); const s = h.snapshot();
    expect(getUnit(s.state, 'ally-lise')!.pos).toEqual({ x: 1, y: 5 });
    expect(s.state.activeId).toBe('ally-lise'); expect(s.state.activation.moved).toBe(true);
    expect(s.confirmations).toEqual([]);
  });
  it.each(['move', 'attack'])('keeps actor and %s mode when another person is inspected', mode => {
    const h = harness(createInitialState(), mode), before = structuredClone(h.snapshot().state);
    h.click(getUnit(before, 'ally-garan')!.pos);
    expect(h.snapshot()).toMatchObject({ commandOwner: 'ally-lise', selected: 'ally-garan', mode });
    expect(h.snapshot().state).toEqual(before);
  });
  it('does not commit an invalid destination or accept repeated input during animation', () => {
    const h = harness(), before = structuredClone(h.snapshot().state);
    h.click({ x: 9, y: 0 }); expect(h.snapshot().state).toEqual(before); expect(h.snapshot().mode).toBe('move');
    h.lock(true); h.click({ x: 1, y: 5 }); h.click(getUnit(before, 'ally-garan')!.pos);
    expect(h.snapshot().state).toEqual(before); expect(h.snapshot().selected).toBe('ally-lise');
  });
  it('allows repeated move/cancel without duplicating movement or a plank effect', () => {
    const state = createInitialState(); getUnit(state, 'ally-lise')!.plankReady = true;
    const h = harness(state);
    for (let n = 0; n < 3; n++) {
      h.setMode('move'); h.click({ x: 1, y: 5 }); h.command({ type: 'undoMove' });
      const s = h.snapshot().state;
      expect(getUnit(s, 'ally-lise')!.pos).toEqual({ x: 0, y: 5 });
      expect(getUnit(s, 'ally-lise')!.plankReady).toBe(true);
      expect(s.activation).toMatchObject({ moved: false, acted: false, moveOrigin: null });
    }
  });
  it('keeps attack confirmation noncommittal, so cancellation can still undo the move', () => {
    const state = createInitialState(); state.units.find(u => u.team === 'enemy')!.pos = { x: 2, y: 5 };
    const h = harness(state); h.click({ x: 1, y: 5 }); const moved = structuredClone(h.snapshot().state);
    h.setMode('attack'); h.click({ x: 2, y: 5 });
    expect(h.snapshot().confirmations).toEqual([{ type: 'attack', targetId: 'enemy-melee-01' }]);
    expect(h.snapshot().state).toEqual(moved); h.command({ type: 'undoMove' });
    expect(getUnit(h.snapshot().state, 'ally-lise')!.pos).toEqual({ x: 0, y: 5 });
  });
  it.each(['collect', 'loot', 'attack', 'end'] as const)('rejects undo after committed %s without refunding its effect', kind => {
    let s = kind === 'loot' ? createPartyBattle('B01', defaultParty('B01')) : createInitialState();
    const actor = getUnit(s, 'ally-lise')!;
    actor.pos = kind === 'collect' ? { x: 1, y: 3 } : kind === 'loot' ? { x: 5, y: 6 } : { x: 0, y: 5 };
    if (kind === 'attack') s.units.find(u => u.team === 'enemy')!.pos = { x: 2, y: 5 };
    s = commit(s, { type: 'start', unitId: actor.id });
    s = commit(s, { type: 'move', to: kind === 'collect' ? { x: 2, y: 3 } : kind === 'loot' ? { x: 6, y: 6 } : { x: 1, y: 5 } });
    const command: Command = kind === 'collect' ? { type: 'collect', recordId: 'A' } : kind === 'loot' ? { type: 'loot', eventId: 'chest:B01' } : kind === 'attack' ? { type: 'attack', targetId: 'enemy-melee-01' } : { type: 'end', facing: 'E' };
    s = commit(s, command); const before = structuredClone(s), refused = reduce(s, { type: 'undoMove' });
    expect(refused.error).toBeTruthy(); expect(refused.state).toEqual(before);
  });
});
