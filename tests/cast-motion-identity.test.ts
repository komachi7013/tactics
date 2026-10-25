import {describe,it,expect} from 'vitest';
import {castIdentity,castPortraitPath} from '../src/view/castIdentity';
import {CAST_IDLE,castIdle} from '../src/view/castMotion';
describe('production identity and grounded idle contract',()=>{
 it('keeps representative separate from Toma, Dani full body and workers fixed markers',()=>{
 expect(castIdentity({id:'escort-delegation',weapon:'melee'})).toBe('delegation');expect(castIdentity({id:'escort-toma',weapon:'melee'})).toBe('toma');
 expect(castPortraitPath({id:'escort-delegation',weapon:'melee'})).not.toBe(castPortraitPath({id:'escort-toma',weapon:'melee'}));
 expect(castIdle({id:'ally-dani',weapon:'bow'},'N')?.key).toBe('motion-idle-dani-N');expect(castIdentity({id:'npc-worker-north',weapon:'melee'})).toBe('worker');
 });
 it('provides all48 grounded statics, distinct paths and valid anchors without walking fallback',()=>{const all=Object.values(CAST_IDLE).flatMap(v=>Object.values(v));expect(all).toHaveLength(48);expect(new Set(all.map(a=>a.path)).size).toBe(48);for(const a of all){expect(a.originY).toBeGreaterThan(0);expect(a.originY).toBeLessThanOrEqual(1);expect(a.visibleHeight).toBeGreaterThan(0);}});
});
