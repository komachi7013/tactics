import { getBattleConfig } from '../domain/battles';
import { getUnit, reduce, gatePreview } from '../domain/engine';
import type { BattleState, Command, Pos } from '../domain/types';

export interface ArrivalInteraction { title: string; body: string; command: Command }
/** Pure preview. Visiting or cancelling never collects or changes an object. */
export function arrivalInteraction(state: BattleState): ArrivalInteraction | null {
 const actor = state.activeId ? getUnit(state,state.activeId) : undefined;
 if (!actor || state.turn !== 'player' || state.phase !== 'playing') return null;
 const config=getBattleConfig(state.battleId), same=(pos:Pos)=>actor.pos.x===pos.x&&actor.pos.y===pos.y;
 const choice=(title:string,body:string,command:Command):ArrivalInteraction|null => reduce(state,command).error ? null : {title,body,command};
 const record=config.records.find(row=>same(row)&&!state.records.includes(row.id));
 if(record) return choice(config.objective==='repair' ? `${record.name}を救出` : config.objective==='evacuate' ? `${record.name}を避難先へ案内` : state.battleId==='B02' ? '観測地点を調べる' : `${record.name}を採取`,
  `<p>${config.objective==='repair' ? '保守員を安全な場所へ案内しますか？' : config.objective==='evacuate' ? '住民を避難先へ案内しますか？' : state.battleId==='B02' ? '観測地点の記録を取りますか？' : `${record.name}を持ち帰りますか？`}</p>`,{type:'collect',recordId:record.id});
 const chest=state.equipmentChests?.find(row=>same(row.pos)&&!state.pendingEquipment?.includes(row.eventId));
 if(chest) return choice('宝箱を開ける','<p>宝箱の装備を取り出しますか？勝利すると持ち帰れます。</p>',{type:'loot',eventId:chest.eventId});
 const repair=config.repairSites?.find(row=>same(row.pos));
 if(repair) return choice(`${repair.name}を直す`,'<p>保守員と協力して補助弁を直しますか？復旧するのは次のラウンドです。</p>',{type:'repair',siteId:repair.id});
 const sluice=config.sluiceGates?.find(row=>same(row.panel));
 if(sluice || config.gate&&same(config.gate)) {
  const water=gatePreview(state,sluice?.id), chain=config.gateEffect==='chain';
  const action=chain ? water.nextDrained?'開く':'閉じる' : water.nextDrained?'水を抜く':'水を戻す';
  return choice(chain ? `門を${action}` : `水門弁を操作して${action}`,
   `<p>${chain ? `門を${action==='開く'?'開き':'閉じ'}ますか？` : water.nextDrained?'水路の水を抜きますか？水が引くと歩きやすくなります。':'水路に水を戻しますか？渡るのに時間がかかるようになります。'}</p>${state.battleId==='B01'?'':'<p>切り替わるのは次のラウンドです。</p>'}`,{type:'gate',gateId:sluice?.id});
 }
 return null;
}
