import {it,expect} from 'vitest';
import {createPartyBattle} from '../src/party';
import {createJobs} from '../src/jobs';
import {defaultParty,BATTLE_IDS} from '../src/progression';
import {reachable,getUnit} from '../src/domain/engine';

it('measures reachable with and without a battle-local plank on all twelve unchanged maps',()=>{
 const measurements=[];
 for(const id of BATTLE_IDS){
  const bare=createPartyBattle(id,defaultParty(id),createJobs()),aided=structuredClone(bare);
  // Synthetic effect for a pure performance fixture; not a claimed legal cast
  // or browser completion in the early chapters where engineer is unavailable.
  getUnit(aided,'ally-lise')!.plankReady=true;
  for(const [mode,state] of [['bare',bare],['plank',aided]] as const){
   const before=JSON.stringify(state),reference=reachable(state,'ally-lise');
   for(let i=0;i<20;i++)reachable(state,'ally-lise');
   const times=[];
   for(let i=0;i<100;i++){const t=performance.now();const actual=reachable(state,'ally-lise');times.push(performance.now()-t);if(i%25===0)expect(actual).toEqual(reference);}
   times.sort((a,b)=>a-b);
   const row={battle:id,mode,cells:reference.length,medianMs:times[50],p95Ms:times[95],maxMs:times[99]};measurements.push(row);
   // This is a bound on the pure route calculation, not the full UI latency
   // or FPS budget. Numbers are emitted so machine/load are visible.
   expect(row.p95Ms).toBeLessThan(100);expect(JSON.stringify(state)).toBe(before);
  }
 }
 console.log('PLANK_REACHABLE_MEASUREMENTS '+JSON.stringify({samplesPerCase:100,warmupsPerCase:20,cases:measurements}));
});
