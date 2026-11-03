import { describe, expect, it } from 'vitest';
import { BATTLE_DIALOGUES, BattleDialogueJournal } from '../src/view/battleDialogues';
import { createInitialState, getUnit, reduce } from '../src/domain/engine';
import type { BattleState } from '../src/domain/types';

function transition(row: typeof BATTLE_DIALOGUES[number]): [BattleState,BattleState] {
  const before = createInitialState(row.battleId), after = structuredClone(before);
  switch (row.trigger) {
    case 'first-record': after.records = ['A']; break;
    case 'both-records': before.records = ['A']; after.records = ['A','B']; break;
    case 'observation': after.records = ['O']; break;
    case 'gate-open': after.gate.drained = true; break;
    case 'water-return': after.gate.drained = false; break;
    case 'manifest': after.records = ['M']; break;
    case 'signature': after.records = ['S']; break;
    case 'compensation': after.records = ['K']; break;
    case 'maintenance': after.records = ['P']; break;
    case 'first-rescue': after.records = ['V2']; break;
    case 'first-worker': after.records = ['W2']; break;
    case 'first-repair': after.repairs!.B.completed = true; break;
    case 'subdued': after.finalControl!.commanderSubdued = true; break;
    case 'sluices-ready': after.sluices!.N.drained = true; after.sluices!.S.drained = true; break;
    case 'hold-started': if (after.finalControl) after.finalControl.heldRounds = 1; else after.capture!.heldRounds = 1; break;
    case 'cart-push': case 'escort-first': after.escort!.index = 1; break;
    case 'escort-half': before.escort!.index = 1; after.escort!.index = Math.max(2,Math.ceil((after.escort!.route.length - 1) / 2)); break;
  }
  return [before,after];
}

describe('authored in-battle events, independent of rules and persistent storage', () => {
  it('covers all twelve battles with stable unique event ids', () => {
    expect(new Set(BATTLE_DIALOGUES.map(row => row.battleId)).size).toBe(12);
    expect(new Set(BATTLE_DIALOGUES.map(row => row.battleId + ':' + row.key)).size).toBe(BATTLE_DIALOGUES.length);
  });
  for (const row of BATTLE_DIALOGUES) {
    it(`${row.battleId}/${row.key}: objective fact fires once, only after commit, with immutable history`, () => {
      const [before,after] = transition(row), original = structuredClone([before,after]), journal = new BattleDialogueJournal(row.battleId);
      journal.observe(before,before); journal.observe(before,structuredClone(before)); expect(journal.drain()).toEqual([]);
      journal.observe(before,after); expect(journal.history).toEqual([]); // pending is not presented during animation
      const entries = journal.drain(); expect(entries.some(e => e.id === `${row.battleId}:${row.key}`)).toBe(true);
      journal.observe(before,after); expect(journal.drain()).toEqual([]);
      expect([before,after]).toEqual(original);
      const history = structuredClone([...journal.history]); history[0].title = 'changed externally';
      expect(journal.history[0].title).not.toBe('changed externally');
      journal.reset(row.battleId); journal.observe(before,after); expect(journal.drain().length).toBeGreaterThan(0);
    });
  }
  it('ignores uncommitted/failed operations, undo movement and terminal/wrong-stage transitions', () => {
    let before = createInitialState('B01'); const journal = new BattleDialogueJournal('B01');
    before = reduce(before,{type:'start',unitId:'ally-lise'}).state;
    const invalid = reduce(before,{type:'collect',recordId:'A'}); expect(invalid.error).toBeTruthy(); journal.observe(before,invalid.state);
    let after = reduce(before,{type:'move',to:{x:1,y:5}}).state; journal.observe(before,after);
    journal.observe(after,reduce(after,{type:'undoMove'}).state); expect(journal.drain()).toEqual([]);
    after = structuredClone(before); after.records = ['A','B']; after.phase = 'won'; journal.observe(before,after); expect(journal.drain()).toEqual([]);
    journal.observe(before,createInitialState('B02')); expect(journal.drain()).toEqual([]);
  });
  it('observes a real legal collect result, never a preview/click, and does not consume actions itself', () => {
    let before = createInitialState('B01'); getUnit(before,'ally-lise')!.pos={x:2,y:3}; before=reduce(before,{type:'start',unitId:'ally-lise'}).state;
    const result=reduce(before,{type:'collect',recordId:'A'}); expect(result.error).toBeUndefined();
    const committed=structuredClone(result.state), journal=new BattleDialogueJournal('B01');journal.observe(before,result.state);
    expect(journal.drain().map(row=>row.id)).toEqual(['B01:first-record']);expect(result.state).toEqual(committed);
  });
  it('does not claim a two-waterway completion while a reservation is still pending', () => {
    const b=createInitialState('B08'),a=structuredClone(b),j=new BattleDialogueJournal('B08');
    a.sluices!.N.drained=true;a.sluices!.S.drained=true;a.sluices!.S.pendingRound=2;j.observe(b,a);expect(j.drain()).toEqual([]);
  });
  it('K text requires actual K acquisition; signature ownership and Neia departure remain in post-battle story', () => {
    const b=createInitialState('B05'),a=structuredClone(b),j=new BattleDialogueJournal('B05');a.records=['D','T'];j.observe(b,a);expect(j.drain()).toEqual([]);
    a.records.push('S');j.observe(b,a);const text=j.drain().flatMap(e=>e.pages).map(p=>p.text).join('');
    expect(text).not.toMatch(/私の署名|署名した|離脱|赦した/);expect(j.history.some(row=>row.id.endsWith('compensation'))).toBe(false);
    const k=structuredClone(a);k.records.push('K');j.observe(a,k);expect(j.drain().some(e=>e.id==='B05:compensation')).toBe(true);
  });
  it('omits absent or retreated supporting speakers rather than inventing their presence', () => {
    const row=BATTLE_DIALOGUES.find(row=>row.battleId==='B03'&&row.key==='first-push')!,[b,a]=transition(row);a.units=a.units.filter(u=>u.id!=='ally-sena');
    const j=new BattleDialogueJournal('B03');j.observe(b,a);expect(j.drain()[0].pages.map(p=>p.speaker?.name)).toEqual(['リセ']);
  });
  it('leaves seen history intact on replay or pending cancellation, but resets it for an explicit retry', () => {
    const [b,a]=transition(BATTLE_DIALOGUES[0]),j=new BattleDialogueJournal('B01');j.observe(b,a);j.drain();const h=j.history;
    j.discardPending();expect(j.history).toEqual(h);j.observe(b,a);expect(j.drain()).toEqual([]);j.reset('B01');expect(j.history).toEqual([]);
  });
});
