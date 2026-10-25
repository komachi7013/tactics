import { describe, expect, it } from 'vitest';
import { createEquipment, equipItem } from '../src/equipment';
import { createJobs, setMainJob } from '../src/jobs';
import { BATTLE_IDS } from '../src/progression';
import { compareEquipmentDraft, createEquipmentDraft, resolveEquipmentDraft, type EquipmentDraftContext } from '../src/view/equipmentDraft';

function context(): EquipmentDraftContext {
  const jobs = createJobs(), completed = BATTLE_IDS.slice(0, 8);
  let equipment = createEquipment(); equipment.acquired = ['chest:B03','chest:B04','chest:B05','chest:B08'];
  equipment = equipItem(equipment, completed, jobs, 'ally-lise', 'head', 'clear:B01');
  equipment = equipItem(equipment, completed, jobs, 'ally-lise', 'body', 'clear:B02');
  equipment = equipItem(equipment, completed, jobs, 'ally-lise', 'legs', 'clear:B03');
  equipment = equipItem(equipment, completed, jobs, 'ally-garan', 'weapon', 'chest:B04');
  return { equipment, jobs, completed };
}
describe('equipment candidate comparison and commit boundary', () => {
  it('compares the adopted offensive weapon example without modifying ownership, live allocation or jobs', () => {
    const c = context(), before = JSON.stringify(c);
    const draft = createEquipmentDraft(c, 'B09', 'ally-lise', 'weapon', 'chest:B05');
    for (let i=0;i<3;i++) {
      const p = compareEquipmentDraft(c, draft);
      expect([p.before.maxHp,p.before.atk,p.before.def]).toEqual([25,9,1]);
      expect([p.after.maxHp,p.after.atk,p.after.def]).toEqual([25,10,0]);
      expect(p.delta).toEqual({hp:0,atk:1,def:-1});
      expect(p.equipment.loadouts['ally-lise'].weapon).toBe('chest:B05');
      expect(p.equipment.acquired).toEqual(c.equipment.acquired);
    }
    expect(JSON.stringify(c)).toBe(before);
    // Discarding the intent requires no undo and cannot alter a live object.
    expect(c.equipment.loadouts['ally-lise'].weapon).toBeNull();
  });
  it('resolves a fresh candidate into a separate validated allocation only at the commit boundary', () => {
    const c = context(), draft = createEquipmentDraft(c, 'B09', 'ally-lise', 'weapon', 'chest:B05');
    const next = resolveEquipmentDraft(c, draft);
    expect(next).not.toBe(c.equipment); expect(next.loadouts['ally-lise'].weapon).toBe('chest:B05');
    expect(c.equipment.loadouts['ally-lise'].weapon).toBeNull();
    expect(() => resolveEquipmentDraft({...c,equipment:next}, draft)).toThrow('選び直し');
  });
  it('reports the HP cap and negative defense when replacing a body slot', () => {
    const c = context(), p = compareEquipmentDraft(c, createEquipmentDraft(c,'B09','ally-lise','body','chest:B03'));
    expect(p.before.maxHp).toBe(25); expect(p.after.maxHp).toBe(25);
    expect(p.afterBonus.armorPositive.hp).toBe(5); expect(p.afterBonus.capLoss.hp).toBe(2);
    expect(p.delta).toEqual({hp:0,atk:0,def:-1});
  });
  it.each([
    ['head','chest:B05'], ['weapon','chest:B08'], ['weapon','chest:B04'], ['legs','chest:B11'],
  ] as const)('rejects wrong slot, job, other owner or unowned instance %s/%s', (slot, instance) => {
    const c = context(), before=JSON.stringify(c);
    expect(()=>createEquipmentDraft(c,'B09','ally-lise',slot,instance)).toThrow();
    expect(JSON.stringify(c)).toBe(before);
  });
  it('revalidates exact shared ownership at confirmation and never steals another person’s item', () => {
    const c = context(), draft=createEquipmentDraft(c,'B09','ally-lise','weapon','chest:B05');
    const external= equipItem(c.equipment,c.completed,c.jobs,'ally-garan','weapon','chest:B05','B09');
    const before=JSON.stringify(external);
    expect(()=>resolveEquipmentDraft({...c,equipment:external},draft)).toThrow('選び直し');
    expect(JSON.stringify(external)).toBe(before); expect(external.loadouts['ally-garan'].weapon).toBe('chest:B05');
  });
  it('invalidates a pending comparison when a job or completed history changes', () => {
    const c=context(),draft=createEquipmentDraft(c,'B09','ally-lise','weapon','chest:B05');
    const jobs=setMainJob(c.jobs,'ally-neia','surveyor','B09');
    expect(()=>resolveEquipmentDraft({...c,jobs},draft)).toThrow('選び直し');
    expect(()=>resolveEquipmentDraft({...c,completed:BATTLE_IDS.slice(0,9)},draft)).toThrow('選び直し');
  });
  it('keeps B06 absence locked even for a standard-equipment candidate', () => {
    const c=context();expect(()=>createEquipmentDraft(c,'B06','ally-neia','head',null)).toThrow('離脱');
  });
  it('permits a joined reserve’s comparison while preparing an earlier battle', () => {
    const c=context();const d=createEquipmentDraft(c,'B01','ally-dani','head','clear:B04');
    expect(resolveEquipmentDraft(c,d).loadouts['ally-dani'].head).toBe('clear:B04');
    expect(c.equipment.loadouts['ally-dani'].head).toBeNull();
  });
  it('compares returning a finite piece to standard without deleting the instance', () => {
    const c=context(), d=createEquipmentDraft(c,'B09','ally-lise','head',null),p=compareEquipmentDraft(c,d);
    expect(p.delta).toEqual({hp:-1,atk:0,def:0});
    expect(p.equipment.loadouts['ally-lise'].head).toBeNull();
    expect(c.equipment.loadouts['ally-lise'].head).toBe('clear:B01');
    expect(p.equipment.acquired).toEqual(c.equipment.acquired);
  });
});
