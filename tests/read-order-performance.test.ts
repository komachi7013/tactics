import {it,expect} from 'vitest';
import {createPartyBattle} from '../src/party';
import {createJobs} from '../src/jobs';
import {BATTLE_IDS,defaultParty} from '../src/progression';
import {createEnemyDecisionSnapshotReader} from '../src/domain/ai';
import {reduce,getUnit} from '../src/domain/engine';
it('measures current-board decisions on twelve maps and caches repeated panel/hover reads without domain mutation',()=>{
 const rows=[];
 for(const id of BATTLE_IDS){
 const s=createPartyBattle(id,defaultParty(id),createJobs());s.readOrders=s.units.filter(u=>u.team==='enemy').slice(0,2).map(u=>u.id);
 // Early-map marks are synthetic performance prerequisites, not claimed legal casts.
 const before=structuredClone(s);let count=0;const read=createEnemyDecisionSnapshotReader(()=>count++);
 const times=[];let reference;
 for(let i=0;i<3;i++)read(structuredClone(s));
 for(let i=0;i<20;i++){const copy=structuredClone(s),start=performance.now(),snap=read(copy);times.push(performance.now()-start);if(i===0)reference=snap;else expect(snap).toEqual(reference);}
 const snapshot=read(s),countBefore=count,start=performance.now();for(let i=0;i<1000;i++)expect(read(s)).toBe(snapshot);const cached1000Ms=performance.now()-start;
 expect(count).toBe(countBefore);expect(s).toEqual(before);
 // A legal committed immutable transition invalidates the reference cache.
 const actor=s.units.find(u=>u.team==='player'&&u.kind!=='escort')!,next=reduce(s,{type:'start',unitId:actor.id});expect(next.error).toBeUndefined();read(next.state);expect(count).toBe(countBefore+1);
 times.sort((a,b)=>a-b);rows.push({battle:id,marks:s.readOrders.length,samples:20,p50Ms:times[10],p95Ms:times[19],cached1000Ms,computeCount:count});
 expect(times[19]).toBeLessThan(1000);expect(getUnit(s,actor.id)!.guard).toBe(before.units.find(u=>u.id===actor.id)!.guard);
 }
 console.log('READ_ORDER_SNAPSHOT_MEASUREMENTS '+JSON.stringify({scope:'pure decisions; not UI/FPS/native latency',warmups:3,rows}));
},30000);
