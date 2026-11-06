import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/domain/engine';
import {getBattleConfig} from '../src/domain/battles';
import {registeredLandscape,registeredFloors} from '../src/view/registeredLandscape';
import type {BattleId} from '../src/domain/types';
const stages:BattleId[]=['B02','B03','B06','B09','B11'];
describe('wider authored routes',()=>{
 it.each(stages)('%s keeps all objectives, actors, new lanes and exits on connected floors',id=>{
  const s=createInitialState(id),config=getBattleConfig(id),start=s.units.find(u=>u.id==='ally-lise')!.pos;
  const floors=registeredFloors(registeredLandscape(id)!,s.cells),visited=new Set<string>(),queue=[start];
  while(queue.length){const p=queue.pop()!,key=p.x+','+p.y;if(visited.has(key))continue;visited.add(key);const from=s.cells.find(c=>c.x===p.x&&c.y===p.y)!;
   for(const c of floors)if(!c.blocked&&Math.abs(c.x-p.x)+Math.abs(c.y-p.y)===1&&Math.abs(c.height-from.height)<=1&&!visited.has(c.x+','+c.y))queue.push(c);
  }
  const goals=[...s.units.map(u=>u.pos),...config.records,...(config.gate?[config.gate]:[]),...(config.repairSites??[]).map(site=>site.pos),config.exit];
  for(const pos of goals)expect(visited.has(pos.x+','+pos.y),`${id} ${pos.x},${pos.y}`).toBe(true);
  for(const c of floors.filter(c=>!c.blocked))expect(visited.has(c.x+','+c.y),`${id} isolated floor ${c.x},${c.y}`).toBe(true);
 });
 it('offers at least three lanes across the old Sera bridge while retaining its start and destination',()=>{
  const s=createInitialState('B02');expect(s.cells.filter(c=>!c.blocked)).toHaveLength(92);
  for(let x=4;x<=22;x++)for(let y=0;y<=2;y++)expect(s.cells.find(c=>c.x===x&&c.y===y)?.blocked).toBe(false);
  expect(getBattleConfig('B02').records[0].name).toBe('観測地点');
 });
});
