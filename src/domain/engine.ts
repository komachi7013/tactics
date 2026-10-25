import b02 from '../landscapes/b02.json';
import b03 from '../landscapes/b03.json';
import b04 from '../landscapes/b04.json';
import b05 from '../landscapes/b05.json';
import b06 from '../landscapes/b06.json';
import b07 from '../landscapes/b07.json';
import b08 from '../landscapes/b08.json';
import b09 from '../landscapes/b09.json';
import b10 from '../landscapes/b10.json';
import b11 from '../landscapes/b11.json';
import b12 from '../landscapes/b12.json';
import {EQUIPMENT_EVENTS} from '../equipment';
import { getBattleConfig, requiredRecords } from './battles';
import { getAttackDirection } from './combatDirection';
import { faceNearestOpponents } from './initialFacing';
import { nextCombatRoll } from './combatRandom';
import { GATE, type BattleId, type BattleState, type Cell, type Command, type Unit, type Pos, type Reachable, type AttackPreview, type Result, type Facing } from './types';
const equal = (a: Pos,b: Pos) => a.x===b.x&&a.y===b.y;
const dist = (a:Pos,b:Pos) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const validPos=(p:Pos)=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y);
export const getCell=(s:BattleState,p:Pos):Cell|undefined=>validPos(p)?s.cells.find(c=>equal(c,p)):undefined;
export const getUnit=(s:BattleState,id:string):Unit|undefined=>s.units.find(u=>u.id===id);
export const escortUnit=(s:BattleState):Unit|undefined=>getUnit(s,s.escort?.unitId??'escort-cart');
export function createInitialState(id:BattleId='B01'):BattleState {
 const config=getBattleConfig(id);
 const registered=id==='B02'?b02:id==='B03'?b03:id==='B04'?b04:id==='B05'?b05:id==='B06'?b06:id==='B07'?b07:id==='B08'?b08:id==='B09'?b09:id==='B10'?b10:id==='B11'?b11:id==='B12'?b12:undefined;
 const cells:Cell[]=registered?structuredClone(registered.cells):[];
 if(!registered)for(let y=0;y<config.height;y++)for(let x=0;x<config.width;x++) cells.push({x,y,height:x>=6&&x<=8&&y>=1&&y<=3?2:(x===5&&y>=1&&y<=3)||(x>=6&&x<=8&&y===4)||(x===9&&y>=1&&y<=3)?1:0,shallow:x>=3&&x<=4&&y>=2&&y<=5,blocked:x===GATE.x&&y===GATE.y});
 if(id==='B06'&&!registered)for(const c of cells){
 c.shallow=false;c.blocked=c.x>=4&&c.x<=5&&c.y!==4;c.water=c.x>=4&&c.x<=5;c.bridge=!!c.water&&c.y===4;
 c.height=(c.x>=2&&c.x<=3&&c.y>=1&&c.y<=2)?2:((c.x>=2&&c.x<=3&&(c.y===0||c.y===3))||(c.x===1&&c.y>=1&&c.y<=2)||((c.x>=3&&c.x<=6)&&c.y===4))?1:0;
 }

 const unit=(id:string,name:string,role:string,team:'player'|'enemy',x:number,y:number,hp:number,atk:number,def:number,weapon:'melee'|'bow'='melee'):Unit=>({id,name,role,team,pos:{x,y},hp,maxHp:hp,atk,def,move:4,weapon,shallowCost:id==='ally-neia'?1:2,facing:team==='player'?'E':'W',acted:false,guard:false});
 const state:BattleState={battleId:id,round:1,turn:'player',activeId:null,cells,units:[unit('ally-lise','リセ','測量官','player',0,5,18,7,1),unit('ally-garan','ガラン','堤防衛士','player',1,6,24,7,3),unit('ally-neia','ネイア','水路斥候','player',0,6,16,6,1,'bow'),unit('enemy-melee-01','警備兵一','警備兵','enemy',5,5,14,6,1),unit('enemy-melee-02','警備兵二','警備兵','enemy',7,4,14,6,1),unit('enemy-bow-01','高台弩兵','弩兵','enemy',7,2,12,6,1,'bow')],records:[],gate:{drained:false,pendingRound:null},activation:{moved:false,acted:false,moveOrigin:null},phase:'playing',log:[config.intro]};
 if(id==='B08'){
 const gates=config.sluiceGates!;state.sluices=Object.fromEntries(gates.map(g=>[g.id,{drained:false,pendingRound:null}]));state.capture={heldRounds:0};
 if(!registered)for(const c of cells){c.shallow=gates.some(g=>g.region.some(p=>equal(p,c)));c.blocked=gates.some(g=>equal(g.panel,c));}
 state.units.push(unit('ally-iva','イヴァ','水路保守係','player',1,4,20,6,2));
 state.units.filter(u=>u.team==='enemy').forEach(u=>{u.guardGoal={...u.pos};u.name=u.weapon==='bow'?'補助堰弩兵':'補助堰警備兵';u.role='補助堰警備隊';});
 }
 if(id==='B12'){
 if(!registered)for(const c of cells){c.shallow=false;c.blocked=false;}
 state.finalControl={heldRounds:0,commanderSubdued:false};
 state.units.push(unit('ally-iva','イヴァ','水路保守係','player',1,4,20,6,2));
 state.units=state.units.map(u=>u.id==='enemy-melee-02'?unit('enemy-vesk','オルダ・ヴェスク','中央水務卿・指揮官','enemy',6,4,18,6,2):u);
 state.units.filter(u=>u.team==='enemy').forEach(u=>{u.guardGoal={...u.pos};if(u.id!=='enemy-vesk'){u.name=u.weapon==='bow'?'上層操作台弩兵':'上層操作台警備兵';u.role='中央操作台警備隊';}});
 }
 if(id==='B11'){
 if(!registered)for(const c of cells){c.shallow=false;c.blocked=(c.x===4&&[1,2,5].includes(c.y))||config.records.some(r=>equal(r,c))||config.repairSites!.some(r=>equal(r.pos,c));}
 state.repairs=Object.fromEntries(config.repairSites!.map(r=>[r.id,{completed:false,pendingRound:null}]));
 state.units.push(unit('ally-iva','イヴァ','水路保守係','player',1,4,20,6,2));
 const positions:Pos[]=[{x:3,y:2},{x:7,y:4},{x:7,y:2}];state.units.filter(u=>u.team==='enemy').forEach((u,i)=>{u.pos={...positions[i]};u.guardGoal={...u.pos};u.name=u.weapon==='bow'?'保守路弩兵':'保守路警備兵';u.role='下層保守路警備隊';});
 }
 if(id==='B10'){
 state.capture={heldRounds:0};for(const c of cells)c.shallow=false;
 state.units.push(unit('ally-iva','イヴァ','水路保守係','player',1,4,20,6,2));
 state.units.filter(u=>u.team==='enemy').forEach(u=>{u.guardGoal={...u.pos};u.name=u.weapon==='bow'?'港検問弩兵':'港検問警備兵';u.role='中央港検問隊';});
 }
 if(id==='B09'){
 if(!registered)for(const c of cells){c.shallow=false;c.blocked=false;}
 const positions:Pos[]=[{x:6,y:4},{x:7,y:6},{x:7,y:2}];
 state.units.filter(u=>u.team==='enemy').forEach((u,i)=>{u.pos={...positions[i]};u.guardGoal={...positions[i]};u.name=u.weapon==='bow'?'中央回廊弩兵':'中央回廊封鎖兵';u.role='中央回廊封鎖隊';});
 const sena=unit('ally-sena','セナ','救護師','player',1,4,16,4,1);sena.healCharges=2;
 const delegation=unit('escort-delegation','代表・証人一行','三都市代表・書記トマら証人','player',2,5,24,0,2);delegation.move=0;delegation.kind='escort';state.units.push(sena,delegation);
 state.escort={route:structuredClone(b09.escortRoute),index:0,unitId:'escort-delegation'};
 }
 if(id==='B05'&&!registered)for(const c of cells){c.shallow=false;c.blocked=c.x===4&&[1,2,4,5].includes(c.y);}
 if(id==='B07'){
 if(!registered)for(const c of cells){c.shallow=false;c.blocked=(c.x===4&&[1,2,5].includes(c.y))||config.records.some(r=>equal(c,r));}
 const sena=unit('ally-sena','セナ','救護師','player',1,4,16,4,1);sena.healCharges=2;state.units.push(sena);
 const positions:Pos[]=[{x:3,y:2},{x:7,y:4},{x:7,y:2}];
 state.units.filter(u=>u.team==='enemy').forEach((u,i)=>{u.pos={...positions[i]};u.guardGoal={...positions[i]};u.name=i===1?'下流の妨害兵':i===2?'中央の弩兵':'中央の封鎖兵';u.role=i===1?'下流妨害隊':'中央封鎖隊';});
 }
 if(id==='B04'||id==='B05'){
 if(id==='B04'){state.gate.drained=true;state.capture={heldRounds:0};state.cells.forEach(c=>c.shallow=false);}
 state.units.push(unit('ally-iva','イヴァ','水路保守係','player',1,4,20,6,2));
 state.units.filter(u=>u.team==='enemy').forEach(u=>{if(id==='B04'){u.name=u.weapon==='bow'?'下流の弩兵':'下流の戦士';u.role='下流急進派';}else{u.name=u.weapon==='bow'?'文書蔵の弩兵':'文書接収兵';u.role='中央警備隊';u.guardGoal=u.id==='enemy-melee-01'?{x:2,y:3}:{...u.pos};}});
 }
 if(id==='B02'||id==='B04'||id==='B05'||id==='B07'||id==='B08'||id==='B09'||id==='B10'||id==='B11'||id==='B12')for(const u of state.units){const p=(id==='B02'?b02:id==='B04'?b04:id==='B05'?b05:id==='B07'?b07:id==='B08'?b08:id==='B09'?b09:id==='B10'?b10:id==='B11'?b11:b12).placements.find(p=>p.id===u.id)!;u.pos={x:p.x,y:p.y};if(u.team==='enemy'){const goal=id==='B05'?b05.placements.find(p=>p.id===u.id)?.guardGoal:undefined;u.guardGoal={...(goal??u.pos)};}}
 if(id==='B03'){

 const sena=unit('ally-sena','セナ','救護師','player',1,4,16,4,1);sena.healCharges=2;
 const cart=unit('escort-cart','負傷者の荷車','護送対象','player',2,5,24,0,2);cart.move=0;cart.kind='escort';state.units.push(sena,cart);
 state.escort={route:structuredClone(b03.escortRoute),index:0};
 for(const u of state.units){const p=b03.placements.find(p=>p.id===u.id)!;u.pos={x:p.x,y:p.y};if(u.team==='enemy')u.guardGoal={...u.pos};}
 }
 if(id==='B06'){
 getCell(state,config.gate!)!.blocked=true;
 state.units=state.units.filter(u=>u.id!=='ally-neia');
 const positions:Pos[]=[{x:6,y:4},{x:7,y:5},{x:7,y:2}];
 state.units.filter(u=>u.team==='enemy').forEach((u,i)=>{u.pos={...positions[i]};u.guardGoal={...positions[i]};u.name=u.weapon==='bow'?'鎖門の弩兵':'鎖門の警備兵';});
 const sena=unit('ally-sena','セナ','救護師','player',1,4,16,4,1);sena.healCharges=2;
 const iva=unit('ally-iva','イヴァ','水路保守係','player',1,5,20,6,2);
 const toma=unit('escort-toma','トマ','保護された書記','player',2,4,20,0,2);toma.move=0;toma.kind='escort';state.units.push(sena,iva,toma);
 state.escort={route:structuredClone(b06.escortRoute),index:0,unitId:'escort-toma'};
 for(const u of state.units){const p=b06.placements.find(p=>p.id===u.id)!;u.pos={x:p.x,y:p.y};if(u.team==='enemy')u.guardGoal={...u.pos};}
 }
 state.units=faceNearestOpponents(state.units);
 return state;
}
export function effectiveShallowCost(unit:Unit):number {return unit.plankReady?1:unit.shallowCost;}
export function reachable(s:BattleState,id:string):Reachable[] {
 const u=getUnit(s,id); if(!u||u.hp<=0||u.kind==='escort')return [];
 const shallowCost=effectiveShallowCost(u);
 const result:Reachable[]=[{...u.pos,cost:0,path:[]}], queue:Reachable[]=[result[0]];
 while(queue.length){queue.sort((a,b)=>a.cost-b.cost||a.y-b.y||a.x-b.x);const p=queue.shift()!;if(result.find(c=>equal(c,p))?.cost!==p.cost)continue;
 for(const d of [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]){const to={x:p.x+d.x,y:p.y+d.y},cell=getCell(s,to),from=getCell(s,p)!;
 if(!cell||cell.blocked||Math.abs(cell.height-from.height)>1||s.units.some(v=>v.hp>0&&v.id!==id&&equal(v.pos,to)))continue;
 const cost=p.cost+(cell.shallow?shallowCost:1);if(cost>u.move)continue;
 const prev=result.find(v=>equal(v,to));if(prev&&prev.cost<=cost)continue;
 const next={...to,cost,path:[...p.path,to]};if(prev)result.splice(result.indexOf(prev),1);result.push(next);queue.push(next);
 }} return result.sort((a,b)=>a.cost-b.cost||a.y-b.y||a.x-b.x);
}
// Closed cell boxes implement supercover, including edge/corner contact.
export function lineOfSight(s:BattleState,a:Pos,b:Pos):boolean {
 const ac=getCell(s,a),bc=getCell(s,b);if(!ac||!bc)return false;
 for(const c of s.cells){if(equal(c,a)||equal(c,b))continue;let enter=0,leave=1;
 for(const axis of ['x','y'] as const){const d=b[axis]-a[axis],lo=c[axis]-.5,hi=c[axis]+.5;if(d===0){if(a[axis]<lo||a[axis]>hi){enter=2;break;}}else{const t1=(lo-a[axis])/d,t2=(hi-a[axis])/d;enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));}}
 if(enter>leave||enter>1||leave<0)continue;
 const z0=ac.height+1,zDiff=bc.height-ac.height;
 if(Math.min(z0+zDiff*enter,z0+zDiff*leave)<=c.height+1e-9)return false;
 }return true;
}
function hasProtection(s:BattleState,u:Unit):boolean {
 const source=u.protection&&getUnit(s,u.protection.sourceId);
 return !!source&&source.hp>0&&source.team===u.team&&source.kind!=='escort';
}
export function attackPreview(s:BattleState,attackerId:string,targetId:string):AttackPreview {
 const a=getUnit(s,attackerId),b=getUnit(s,targetId);const no=(reason:string):AttackPreview=>({legal:false,damage:0,rear:false,hitChance:0,reason});
 if(b&&b.hp<=0&&s.battleId==='B12'&&b.id===getBattleConfig(s.battleId).commanderId)return no('ヴェスクは制圧済みの保全対象です');if(!a||!b||a.hp<=0||b.hp<=0)return no('対象が退避しています');if(a.kind==='escort')return no(s.battleId==='B06'||s.battleId==='B09'?'護送対象は攻撃できません':'荷車は攻撃できません');if(a.team===b.team)return no('味方は攻撃できません');
 const ac=getCell(s,a.pos),bc=getCell(s,b.pos);if(!ac||!bc)return no('盤面外です');const distance=dist(a.pos,b.pos);
 if(a.weapon==='melee'&&(distance!==1||Math.abs(ac.height-bc.height)>1))return no('隣接・高さ差1以内が必要です');
 if(a.weapon==='bow'&&(distance<2||distance>(ac.height>bc.height?5:4)))return no('弩の射程外です');
 if(a.weapon==='bow'&&!lineOfSight(s,a.pos,b.pos))return no('地形で射線が遮られています');
 const direction=getAttackDirection(a.pos,b.pos,b.facing),rear=a.weapon==='melee'&&direction.sector==='rear';
 const hitChance=s.combatRandom?direction.hitChance:100;
 const reason=s.combatRandom?`${{front:'正面',side:'側面',rear:'背後'}[direction.sector]} ${hitChance}%${rear?'・背面 +2':''}`:rear?'背面 +2':'必中';
 return {legal:true,damage:Math.max(1,a.atk-b.def+(rear?2:0)+(a.surveyBonus?2:0)-((b.guard||hasProtection(s,b))?2:0)),rear,hitChance,sector:direction.sector,reason};
}
export function jobCommandPreview(s:BattleState,actorId:string,targetId:string,kind:'survey'|'protect'|'plank'|'readOrder'):{legal:boolean;reason:string} {
 const a=getUnit(s,actorId),b=getUnit(s,targetId),no=(reason:string)=>({legal:false,reason});
 if(s.phase!=='playing'||s.turn!=='player'||s.activeId!==actorId||!a||a.team!=='player'||a.hp<=0||a.acted||a.kind==='escort'||s.activation.acted)return no('未行動の味方戦闘員の行動を開始してください');
 if((kind!=='survey'&&kind!=='protect'&&kind!=='plank'&&kind!=='readOrder')||a.jobCommand!==kind)return no('現在の主職では使えません');
 if(kind==='readOrder'){
 if(!Number.isInteger(a.readCharges)||(a.readCharges??0)<=0)return no('読令は戦闘2回までです');
 if(!b||b.hp<=0||b.team!=='enemy')return no('生存敵を選んでください');
 if(!getCell(s,a.pos)||!getCell(s,b.pos))return no('盤面外です');
 if(s.readOrders?.includes(b.id))return no('読令の効果は重複できません');
 return {legal:true,reason:'1行動・残り回数1消費。現在盤面の候補を対象の次の行動終了まで表示'};
 }
 if(!b||b.hp<=0||a.id===b.id||b.team!==a.team)return no('他の生存味方を選んでください');
 const ac=getCell(s,a.pos),bc=getCell(s,b.pos);if(!ac||!bc)return no('盤面外です');
 if(kind==='plank'){
 if(!Number.isInteger(a.plankCharges)||(a.plankCharges??0)<=0)return no('渡り板は戦闘2回までです');
 if(b.kind==='escort')return no('味方戦闘員を選んでください');
 if(b.shallowCost<=1)return no('既に浅瀬の移動費が1です');
 if(b.plankReady)return no('渡り板の効果は重複できません');
 if(dist(a.pos,b.pos)!==1||Math.abs(ac.height-bc.height)>1)return no('隣接・高さ差1以内が必要です');
 return {legal:true,reason:'1行動・残り回数1消費。次の移動だけ浅瀬の移動費1（乾地のみでも消費）'};
 }
 if(kind==='survey'){
 if(!Number.isInteger(a.surveyCharges)||(a.surveyCharges??0)<=0)return no('測線は戦闘2回までです');
 if(b.kind==='escort')return no('味方戦闘員を選んでください');
 if(b.surveyBonus)return no('測線の効果は重複できません');
 if(dist(a.pos,b.pos)<1||dist(a.pos,b.pos)>3)return no('測線の射程は1〜3です');
 if(!lineOfSight(s,a.pos,b.pos))return no('地形で射線が遮られています');
 return {legal:true,reason:'1行動・残り回数1消費。次の通常攻撃ダメージ+2'};
 }
 if(hasProtection(s,b))return no('護衛の効果は重複できません');
 if(dist(a.pos,b.pos)!==1||Math.abs(ac.height-bc.height)>1)return no('隣接・高さ差1以内が必要です');
 return {legal:true,reason:'1行動。次の被ダメージ−2（本人の次の行動開始まで、防御と重複しない）'};
}
function actionUnit(s:BattleState):Unit|undefined {const u=s.activeId?getUnit(s,s.activeId):undefined;return s.phase==='playing'&&u&&u.hp>0&&u.team===s.turn&&!s.activation.acted?u:undefined;}
export function evacuationPreview(s:BattleState,id:string):{eligible:boolean;reason:string}{
 const config=getBattleConfig(s.battleId),r=config.records.find(r=>r.id===id),no=(reason:string)=>({eligible:false,reason});
 const worker=config.objective==='repair';
 if(!['evacuate','repair'].includes(config.objective??'')||!r)return no(worker?'救出対象なし':'避難対象なし');
 if(s.records.includes(id))return no(worker?'救出済みです':'避難案内済みです');
 const u=actionUnit(s);
 if(!u||u.team!=='player'||u.kind==='escort')return no('未行動の味方戦闘員の行動を開始してください');
 if(dist(u.pos,r)!==1||Math.abs(getCell(s,u.pos)!.height-getCell(s,r)!.height)>1)return no(worker?'保守員への隣接・高さ差1以内が必要です':'集合点への隣接・高さ差1以内が必要です');
 if(s.units.some(e=>e.team==='enemy'&&e.hp>0&&dist(e.pos,r)===1))return no(worker?'保守員に隣接する敵が救出を妨害しています':'集合点に隣接する敵が避難を妨害しています');
 return {eligible:true,reason:worker?'1行動で救出。場外の安全な保守作業場所へ案内します':'1行動で避難案内。場外の案内係が退避路へ送ります'};
}
export function equipmentPickupPreview(s:BattleState,eventId:string):{eligible:boolean;legal:boolean;reason:string} {
 const no=(reason:string)=>({eligible:false,legal:false,reason});
 const u=s.activeId?getUnit(s,s.activeId):undefined,chest=s.equipmentChests?.find(c=>c.eventId===eventId);
 if(s.phase!=='playing'||s.turn!=='player'||!u||u.team!=='player'||u.kind==='escort'||u.hp<=0||u.acted||s.activation.acted)return no('未行動の味方戦闘員の行動を開始してください');
 if(!chest||!EQUIPMENT_EVENTS.some(e=>e.id===eventId&&e.source==='chest'&&e.battleId===s.battleId))return no('未回収の装備箱を選んでください');
 if(s.pendingEquipment?.includes(eventId))return no('仮回収済みです');
 const a=getCell(s,u.pos),b=getCell(s,chest.pos);if(!a||!b||b.blocked)return no('箱の位置が不正です');
 if(dist(u.pos,chest.pos)>1||Math.abs(a.height-b.height)>1)return no('同セルまたは直交隣接・高さ差1以内が必要です');
 if(s.units.some(e=>e.team==='enemy'&&e.hp>0&&equal(e.pos,chest.pos)))return no('箱の上に敵がいます');
 return {eligible:true,legal:true,reason:'1行動で仮回収。勝利で所有確定、保存成功で永続化し次の出撃から使用'};
}
export function canCollect(s:BattleState,id:string):boolean {if(['evacuate','repair'].includes(getBattleConfig(s.battleId).objective??''))return evacuationPreview(s,id).eligible;const u=actionUnit(s),r=getBattleConfig(s.battleId).records.find(r=>r.id===id);return !!u&&u.team==='player'&&!!r&&!s.records.includes(id)&&dist(u.pos,r)===1&&Math.abs(getCell(s,u.pos)!.height-getCell(s,r)!.height)<=1;}
export function repairPreview(s:BattleState,siteId:string):{eligible:boolean;reason:string;round:number;siteId?:string;name?:string;workerRecordId?:string}{
 const config=getBattleConfig(s.battleId),site=config.repairSites?.find(r=>r.id===siteId),status=site&&s.repairs?.[site.id];
 const base={round:status?.pendingRound??s.round+1,siteId:site?.id,name:site?.name,workerRecordId:site?.workerRecordId},no=(reason:string)=>({...base,eligible:false,reason});
 if(config.objective!=='repair'||!site||!status)return no('復旧対象IDを選択してください');
 if(status.completed)return no('補助弁は復旧済みです');
 if(status.pendingRound!==null)return no('復旧予約済み（上書き不可）');
 if(!s.records.includes(site.workerRecordId))return no(`保守員${site.workerRecordId}の救出が必要です`);
 const u=actionUnit(s);if(!u||u.team!=='player'||u.kind==='escort')return no('未行動の味方戦闘員の行動を開始してください');
 if(dist(u.pos,site.pos)!==1||Math.abs(getCell(s,u.pos)!.height-getCell(s,site.pos)!.height)>1)return no('補助弁への隣接・高さ差1以内が必要です');
 return {...base,eligible:true,reason:'1行動で復旧指示。次ラウンド開始に完了（水位・地形は変わらない）'};
}
export function canRepair(s:BattleState,siteId:string):boolean{return repairPreview(s,siteId).eligible;}
export function canGate(s:BattleState,gateId?:string):boolean {const u=actionUnit(s),config=getBattleConfig(s.battleId);
 if(config.objective==='sluice'){const gate=config.sluiceGates?.find(g=>g.id===gateId),water=gate&&s.sluices?.[gate.id];return !!gate&&!!water&&!!u&&u.team==='player'&&u.kind!=='escort'&&water.pendingRound===null&&dist(u.pos,gate.panel)===1&&Math.abs(getCell(s,u.pos)!.height-getCell(s,gate.panel)!.height)<=1;}
 const gate=config.gate;return !!gate&&!!u&&u.team==='player'&&(!!config.reversibleGate||!s.gate.drained)&&s.gate.pendingRound===null&&dist(u.pos,gate)===1&&Math.abs(getCell(s,u.pos)!.height-getCell(s,gate)!.height)<=1;}
export function gatePreview(s:BattleState,gateId?:string):{nextDrained:boolean;round:number;region:Pos[];reason:string;gateId?:string;name?:string}{
 const config=getBattleConfig(s.battleId);
 if(config.objective==='sluice'){const gate=config.sluiceGates?.find(g=>g.id===gateId),water=gate&&s.sluices?.[gate.id];return {gateId:gate?.id,name:gate?.name,nextDrained:water?.pendingRound!=null?(water.pendingDrained??!water.drained):!water?.drained,round:water?.pendingRound??s.round+1,region:gate?.region??[],reason:!gate||!water?'操作盤IDを選択してください':water.pendingRound!==null?'切替予約済み（上書き不可）':canGate(s,gateId)?'操作可能':'未行動の味方を操作盤に隣接させてください'};}
 const nextDrained=s.gate.pendingRound!==null?(s.gate.pendingDrained??true):config.reversibleGate?!s.gate.drained:true;
 return {nextDrained,round:s.gate.pendingRound??s.round+1,region:config.gateRegion,reason:config.gateEffect==='chain'&&s.gate.drained?(s.battleId==='B10'?'外港鎖門は開通済み':'鎖門は開通済み'):!config.gate?'操作盤なし':s.gate.pendingRound!==null?'切替予約済み（上書き不可）':canGate(s)?'操作可能':'未行動の味方を操作盤に隣接させてください'};
}
export function capturePreview(s:BattleState):{heldRounds:number;requiredRounds:number;eligible:boolean;reason:string}{
 const config=getBattleConfig(s.battleId),base={heldRounds:s.capture?.heldRounds??0,requiredRounds:config.requiredHoldRounds??0};
 const no=(reason:string)=>({...base,eligible:false,reason});
 if(!['capture','sluice'].includes(config.objective??'')||!config.capturePoint)return no('制圧対象なし');
 if(config.objective==='sluice'){
 if(!s.records.includes('P'))return no('保守記録Pの確保が必要');
 if(config.sluiceGates?.some(g=>!s.sluices?.[g.id]?.drained))return no('北・南の両水路を排水してください');
 if(config.sluiceGates?.some(g=>s.sluices?.[g.id]?.pendingRound!==null))return no('切替予約中は保持できません');
 }else{
 if(config.captureRequiresOpenGate&&!s.gate.drained)return no('外港鎖門の開通が必要（次ラウンド開始に発効）');
 if(!config.captureRequiresOpenGate&&s.gate.drained)return no('水路へ再入水が必要');
 if(s.gate.pendingRound!==null)return no('切替予約中は保持できません');
 }
 if(!s.units.some(u=>u.team==='player'&&u.kind!=='escort'&&u.hp>0&&equal(u.pos,config.capturePoint!)))return no('制圧点Cに味方が必要');
 if(s.units.some(u=>u.team==='enemy'&&u.hp>0&&dist(u.pos,config.capturePoint!)===1))return no('制圧点Cに隣接する敵を排除してください');
 return {...base,eligible:true,reason:'ラウンド終了時に保持数+1'};
}
export function healPreview(s:BattleState,actorId:string,targetId:string):{legal:boolean;amount:number;reason:string} {
 const a=getUnit(s,actorId),b=getUnit(s,targetId),no=(reason:string)=>({legal:false,amount:0,reason});
 if(!a||a.hp<=0||(a.healCharges??0)<=0)return no('手当を使えません（戦闘2回）');
 if(!b||b.hp<=0)return no('退避した味方には手当できません');
 if(a.id===b.id||a.team!==b.team)return no('隣接する味方を選んでください');
 if(b.hp>=b.maxHp)return no('HPは全快です');
 if(dist(a.pos,b.pos)!==1||Math.abs(getCell(s,a.pos)!.height-getCell(s,b.pos)!.height)>1)return no('隣接・高さ差1以内が必要です');
 return {legal:true,amount:Math.min(6,b.maxHp-b.hp),reason:'手当 HP+6（上限まで）'};
}
export function finalControlPreview(s:BattleState):{points:{id:string;name:string;pos:Pos;occupantId:string|null}[];bothOccupied:boolean;heldRounds:number;requiredRounds:number;commanderSubdued:boolean;eligible:boolean;reason:string}{
 const c=getBattleConfig(s.battleId),points=(c.controlPoints??[]).map(p=>({...p,occupantId:s.units.find(u=>u.team==='player'&&u.kind!=='escort'&&u.hp>0&&equal(u.pos,p.pos))?.id??null}));
 const bothOccupied=points.length===2&&points.every(p=>p.occupantId!==null)&&new Set(points.map(p=>p.occupantId)).size===2;
 const commander=c.commanderId?getUnit(s,c.commanderId):undefined,commanderSubdued=!!s.finalControl?.commanderSubdued&&commander?.hp===0;
 const eligible=c.objective==='finale'&&bothOccupied;
 return {points,bothOccupied,heldRounds:s.finalControl?.heldRounds??0,requiredRounds:c.requiredHoldRounds??0,commanderSubdued,eligible,reason:c.objective!=='finale'?'操作台保持対象なし':!bothOccupied?'別々の生存味方戦闘員でA・Bを同時占有してください':commanderSubdued?'両操作台を占有。ラウンド終了に保持判定':'両操作台を占有。保持は可能、勝利にはヴェスクの非致死制圧も必要'};
}
export function escortAdvancePreview(s:BattleState):{canAdvance:boolean;next:Pos|null;reason:string} {
 const e=s.escort,cart=escortUnit(s),person=s.battleId==='B06',delegation=s.battleId==='B09';
 const no=(reason:string,next:Pos|null=null)=>({canAdvance:false,next,reason});
 if(!e||!cart)return no('護送対象なし');if(cart.hp<=0)return no(delegation?'代表・証人一行の安全を維持できません':person?'トマが退避しました':'荷車が破損しました');
 const next=e.route[e.index+1]??null;if(!next)return no(delegation?'代表・証人一行は退出口に到着':person?'トマは船着場に到着':'荷車は搬出口に到着',null);
 if(getBattleConfig(s.battleId).escortRequiresOpenGate&&!s.gate.drained)return no('鎖門の開通が必要（次ラウンド開始に発効）',next);
 if(!s.units.some(u=>u.team==='player'&&u.kind!=='escort'&&u.hp>0&&dist(u.pos,cart.pos)===1))return no('味方戦闘員の隣接が必要',next);
 if(s.units.some(u=>u.team==='enemy'&&u.hp>0&&dist(u.pos,cart.pos)===1))return no(delegation?'代表・証人一行に隣接する敵を排除してください':person?'トマに隣接する敵を排除してください':'荷車に隣接する敵を排除してください',next);
 const from=getCell(s,cart.pos),to=getCell(s,next);
 if(!from||!to||to.blocked||Math.abs(from.height-to.height)>1)return no('次の進行先は通行不能です',next);
 if(s.units.some(u=>u.hp>0&&equal(u.pos,next)))return no('次の進行先が占有されています',next);
 return {canAdvance:true,next:{...next},reason:'次ラウンド開始に1セル前進'};
}
function evaluate(s:BattleState):void {
 const lise=getUnit(s,'ally-lise'),config=getBattleConfig(s.battleId),cart=escortUnit(s);
 if(!lise||lise.hp<=0){s.phase='lost';s.log.push('リセが退避。作戦失敗。');}
 else if(config.objective==='escort'&&(!cart||cart.hp<=0)){s.phase='lost';s.log.push(s.battleId==='B09'?'代表・証人一行の安全を維持できず、護送失敗。':s.battleId==='B06'?'トマが退避。護送失敗。':'負傷者の荷車が破損。搬出失敗。');}
 else if(config.objective==='finale'){/* B12 compound victory is evaluated only at round end. */}
 else if(config.objective==='repair'){if(requiredRecords(s.battleId).every(r=>s.records.includes(r.id))&&config.repairSites?.every(r=>s.repairs?.[r.id]?.completed&&s.repairs[r.id].pendingRound===null)&&equal(lise.pos,config.exit)){s.records=[...config.records.map(r=>r.id),...config.repairSites.map(r=>r.id)];s.phase='won';s.log.push(config.result);}}
 else if(config.objective==='capture'||config.objective==='sluice'){if((s.capture?.heldRounds??0)>=(config.requiredHoldRounds??2)){s.records=config.objective==='sluice'?['P','C']:['C'];s.phase='won';s.log.push(config.result);}}
 else if(requiredRecords(s.battleId).every(r=>s.records.includes(r.id))&&(config.objective==='escort'?!!cart&&equal(cart.pos,config.exit)&&(!config.escortRequiresOpenGate||s.gate.drained):equal(lise.pos,config.exit))){if(s.battleId==='B06')s.records=['W'];if(s.battleId==='B09')s.records=['J','H'];s.phase='won';s.log.push(config.result);}
}
function battleResult(state:BattleState):Result {
 if(state.readOrders){state.readOrders=state.readOrders.filter(id=>{const u=getUnit(state,id);return u?.team==='enemy'&&u.hp>0;});if(!state.readOrders.length)delete state.readOrders;}
 if(state.phase==='lost')delete state.pendingEquipment;
 if(state.phase!=='playing'){delete state.readOrders;for(const unit of state.units)delete unit.plankReady;delete state.activation.plankConsumed;}
 return {state};
}
export function reduce(s:BattleState,cmd:Command):Result {
 const fail=(error:string):Result=>({state:s,error});if(s.phase!=='playing')return fail('戦闘は終了しています');
 const u=s.activeId?getUnit(s,s.activeId):undefined;
 if(cmd.type==='start'){const t=getUnit(s,cmd.unitId);if(s.activeId||!t||t.hp<=0||t.kind==='escort'||t.acted||t.team!==s.turn)return fail('このユニットは行動を開始できません');const n=structuredClone(s);n.activeId=t.id;n.activation={moved:false,acted:false,moveOrigin:null};expireAtActivationStart(n,getUnit(n,t.id)!);return battleResult(n);}
 if(cmd.type==='endPlayerTurn'){
 if(s.turn!=='player'||s.activeId)return fail('行動中の人物を先に終了してください');
 const n=structuredClone(s),waiting=n.units.filter(v=>v.team==='player'&&v.hp>0&&v.kind!=='escort'&&!v.acted);
 for(const unit of waiting){expireAtActivationStart(n,unit);unit.acted=true;}
 n.log.push('味方ターン終了: '+waiting.length+'人が現在位置・向きで待機（防御の追加なし）');
 return advanceTurn(n);
 }
 if(!u||u.hp<=0||u.team!==s.turn||u.acted)return fail('先に未行動ユニットを選んでください');
 switch(cmd.type){
 case 'move':if(s.activation.moved||!validPos(cmd.to)||equal(u.pos,cmd.to)||!reachable(s,u.id).some(p=>equal(p,cmd.to)))return fail('移動できないセルです');break;
 case 'undoMove':if(!s.activation.moved||s.activation.acted||!s.activation.moveOrigin)return fail('移動を取り消せません');break;
 case 'attack':{if(s.activation.acted)return fail('行動済みです');const p=attackPreview(s,u.id,cmd.targetId);if(!p.legal)return fail(p.reason);break;}
 case 'survey':case 'protect':case 'plank':case 'readOrder':{const p=jobCommandPreview(s,u.id,cmd.targetId,cmd.type);if(!p.legal)return fail(p.reason);break;}
 case 'heal':{if(s.activation.acted)return fail('行動済みです');const p=healPreview(s,u.id,cmd.targetId);if(!p.legal)return fail(p.reason);break;}
 case 'loot':{const p=equipmentPickupPreview(s,cmd.eventId);if(!p.eligible)return fail(p.reason);break;}
 case 'collect':if(!canCollect(s,cmd.recordId))return fail(['evacuate','repair'].includes(getBattleConfig(s.battleId).objective??'')?evacuationPreview(s,cmd.recordId).reason:'記録を採取できません');break;
 case 'repair':{const p=repairPreview(s,cmd.siteId);if(!p.eligible)return fail(p.reason);break;}
 case 'gate':if(!canGate(s,cmd.gateId))return fail(getBattleConfig(s.battleId).gateEffect==='chain'?'鎖門を操作できません':'水門を操作できません');break;
 case 'defend':if(s.activation.acted)return fail('行動済みです');break;
 case 'end':if(!(['N','E','S','W'] as Facing[]).includes(cmd.facing))return fail('向きが不正です');break;
 default:return fail('不正なコマンドです');
 }
 const n=structuredClone(s),v=getUnit(n,u.id)!;
 switch(cmd.type){
 case 'move':n.activation.moveOrigin={...v.pos};v.pos={...cmd.to};n.activation.moved=true;if(v.plankReady){delete v.plankReady;n.activation.plankConsumed=true;}break;
 case 'undoMove':v.pos={...n.activation.moveOrigin!};n.activation.moved=false;n.activation.moveOrigin=null;if(n.activation.plankConsumed)v.plankReady=true;delete n.activation.plankConsumed;break;
 case 'attack':{
 const target=getUnit(n,cmd.targetId)!,p=attackPreview(n,v.id,target.id),hpBefore=target.hp;
 let hit=true;
 if(n.combatRandom){
 const draw=nextCombatRoll(n.combatRandom);n.combatRandom=draw.random;hit=draw.roll<p.hitChance/100;
 n.lastAttack={sequence:draw.random.draws,actorId:v.id,targetId:target.id,hitChance:p.hitChance as 90|95|100,hit,damage:hit?Math.min(hpBefore,p.damage):0,damageOnHit:p.damage,sector:p.sector!};
 }
 if(hit)target.hp=Math.max(0,target.hp-p.damage);
 // A missed normal attack spends the action and survey; protection is spent
 // only by a hit. Legacy factories still take their unchanged guaranteed hit.
 delete v.surveyBonus;if(hit)delete target.protection;
 if(target.hp===0){delete target.plankReady;delete target.surveyBonus;for(const ally of n.units)if(ally.protection?.sourceId===target.id)delete ally.protection;}
 n.activation.acted=true;
 if(!hit)n.log.push(`${v.name} → ${target.name} 外れ（命中率${p.hitChance}%）`);
 else if(n.battleId==='B12'&&target.id===getBattleConfig(n.battleId).commanderId&&target.hp===0){n.finalControl!.commanderSubdued=true;n.log.push(`${v.name} → ${target.name} ${p.damage}ダメージ・非致死制圧。制圧済み・保全対象（逃亡・死亡ではない）。占有解除、戦後に裁定所命令で首府警備隊が拘束する。`);}
 else n.log.push(`${v.name} → ${target.name} ${p.damage}ダメージ${target.hp===0?'・退避':''}`);
 break;}
 case 'readOrder':{const target=getUnit(n,cmd.targetId)!;n.readOrders=[...(n.readOrders??[]),target.id];v.readCharges!--;n.activation.acted=true;n.log.push(`${v.name}が${target.name}へ読令（現在盤面の候補・対象の次の行動終了まで・残り${v.readCharges}回）`);break;}
 case 'survey':{const target=getUnit(n,cmd.targetId)!;target.surveyBonus=true;v.surveyCharges!--;n.activation.acted=true;n.log.push(`${v.name}が${target.name}へ測線（次の通常攻撃+2・残り${v.surveyCharges}回）`);break;}
 case 'plank':{const target=getUnit(n,cmd.targetId)!;target.plankReady=true;v.plankCharges!--;n.activation.acted=true;n.log.push(`${v.name}が${target.name}へ渡り板（次の移動だけ浅瀬費用1・残り${v.plankCharges}回）`);break;}
 case 'protect':{const target=getUnit(n,cmd.targetId)!;target.protection={sourceId:v.id};n.activation.acted=true;n.log.push(`${v.name}が${target.name}を護衛（次の被ダメージ−2・本人の次の行動開始まで）`);break;}
 case 'heal':{const target=getUnit(n,cmd.targetId)!,p=healPreview(n,v.id,target.id);target.hp+=p.amount;v.healCharges!--;n.activation.acted=true;n.log.push(`${v.name}が${target.name}を手当 HP+${p.amount}（残り${v.healCharges}回）`);break;}
 case 'loot':n.pendingEquipment=[...(n.pendingEquipment??[]),cmd.eventId];n.activation.acted=true;n.log.push(`${v.name}が装備箱を仮回収（勝利と保存で確定・次出撃から使用）`);break;
 case 'collect':{n.records.push(cmd.recordId);n.activation.acted=true;const config=getBattleConfig(n.battleId),r=config.records.find(r=>r.id===cmd.recordId)!;if(['evacuate','repair'].includes(config.objective??'')){getCell(n,r)!.blocked=false;n.log.push(config.objective==='repair'?`${v.name}が${r.name}を救出し、場外の安全な保守作業場所へ案内した（${cmd.recordId}）`:`${v.name}が${r.name}を避難案内。場外の案内係が退避路へ送った（${cmd.recordId}）`);}else n.log.push(`${v.name}が記録${cmd.recordId}を確保（部隊共有）`);break;}
 case 'repair':{const p=repairPreview(n,cmd.siteId);n.repairs![cmd.siteId].pendingRound=p.round;n.activation.acted=true;n.log.push(`補助弁${p.siteId}（${p.name}）復旧予約: 第${p.round}ラウンド開始に完了（水位・地形は変わらない）`);break;}
 case 'gate':{const p=gatePreview(n,cmd.gateId);if(getBattleConfig(n.battleId).objective==='sluice'){const water=n.sluices![cmd.gateId!];water.pendingRound=p.round;water.pendingDrained=p.nextDrained;n.activation.acted=true;n.log.push(`水路${p.gateId}（${p.name}）予約: 第${p.round}ラウンド開始に${p.nextDrained?'排水':'再入水'}`);break;}n.gate.pendingRound=p.round;if(getBattleConfig(n.battleId).reversibleGate)n.gate.pendingDrained=p.nextDrained;n.activation.acted=true;n.log.push(getBattleConfig(n.battleId).gateEffect==='chain'?(n.battleId==='B10'?`外港鎖門の開通信号予約: 第${p.round}ラウンド開始に開通（水位・地形は変わらない）`:`鎖門予約: 第${p.round}ラウンド開始に開通（水位は変わらない）`):`水門予約: 第${p.round}ラウンド開始に${p.nextDrained?'排水':'再入水'}`);break;}
 case 'defend':v.guard=true;n.activation.acted=true;n.log.push(`${v.name}が防御`);break;
 case 'end':if(n.readOrders&&v.team==='enemy')n.readOrders=n.readOrders.filter(id=>id!==v.id);v.facing=cmd.facing;v.acted=true;n.activeId=null;n.activation={moved:false,acted:false,moveOrigin:null};break;
 }
 evaluate(n);if(n.phase!=='playing')return battleResult(n);
 if(cmd.type==='end')return advanceTurn(n);
 n.log=n.log.slice(-40);return battleResult(n);
}
/** Same activation-start expiration for explicitly started and phase-skipped waits. */
function expireAtActivationStart(state:BattleState,unit:Unit):void {
 unit.guard=false;for(const target of state.units)if(target.protection?.sourceId===unit.id)delete target.protection;
}
/** Called only after a completed activation or explicit player-phase wait. */
function advanceTurn(n:BattleState):Result {
 evaluate(n);if(n.phase!=='playing')return battleResult(n);
 const alive=n.units.filter(v=>v.hp>0&&v.kind!=='escort');
 if(alive.some(v=>v.team===n.turn&&!v.acted))return battleResult(n);
 if(n.turn==='player'&&alive.some(v=>v.team==='enemy'&&!v.acted)){
 n.turn='enemy';n.log.push('敵ターン開始');return battleResult(n);
 }

 if(n.finalControl){const p=finalControlPreview(n);n.finalControl.heldRounds=p.eligible?n.finalControl.heldRounds+1:0;n.log.push(`操作台A・B 連続保持 ${n.finalControl.heldRounds}/${p.requiredRounds}: ${p.reason}`);evaluate(n);if(n.phase!=='playing')return battleResult(n);if(p.commanderSubdued&&n.finalControl.heldRounds>=p.requiredRounds){n.records=['U','V'];n.phase='won';n.log.push(getBattleConfig(n.battleId).result);return battleResult(n);}}
 if(n.capture){const p=capturePreview(n);n.capture.heldRounds=p.eligible?n.capture.heldRounds+1:0;n.log.push(`制圧点C 保持 ${n.capture.heldRounds}/${p.requiredRounds}: ${p.reason}`);evaluate(n);if(n.phase!=='playing')return battleResult(n);}
 if(n.round>=getBattleConfig(n.battleId).roundLimit){n.phase='lost';n.log.push(getBattleConfig(n.battleId).defeatMessage);return battleResult(n);}
 n.round++;n.units.forEach(v=>v.acted=false);n.turn='player';
 if(n.gate.pendingRound===n.round){const config=getBattleConfig(n.battleId);n.gate.drained=n.gate.pendingDrained??true;n.gate.pendingRound=null;delete n.gate.pendingDrained;n.cells.forEach(c=>{if(config.gateRegion.some(p=>equal(p,c)))c.shallow=!n.gate.drained;});n.log.push(config.gateEffect==='chain'?(n.battleId==='B10'?'外港鎖門が開通。水位・地形は変わらない。':'鎖門が開通。水位・橋・地形は変わらない。'):n.gate.drained?'排水完了。浅瀬の移動費が1になった。':'再入水完了。水路8セルは浅瀬になった。');}
 if(n.sluices)for(const g of getBattleConfig(n.battleId).sluiceGates??[]){const water=n.sluices[g.id];if(water.pendingRound!==n.round)continue;water.drained=water.pendingDrained??!water.drained;water.pendingRound=null;delete water.pendingDrained;for(const c of n.cells)if(g.region.some(p=>equal(p,c)))c.shallow=!water.drained;n.log.push(`水路${g.id}（${g.name}）${water.drained?'排水':'再入水'}完了。対象4セルの移動費を切替。`);}
 if(n.repairs){for(const site of getBattleConfig(n.battleId).repairSites??[]){const status=n.repairs[site.id];if(status.pendingRound===n.round){status.completed=true;status.pendingRound=null;n.log.push(`補助弁${site.id}（${site.name}）復旧完了。地形・水位は変わらない。`);}}evaluate(n);if(n.phase!=='playing')return battleResult(n);}
 if(n.escort){const preview=escortAdvancePreview(n);if(preview.canAdvance){escortUnit(n)!.pos={...preview.next!};n.escort.index++;n.log.push(n.battleId==='B09'?'代表・証人一行が1セル前進。':n.battleId==='B06'?'トマが1セル前進。':'荷車が1セル前進。');}else n.log.push((n.battleId==='B09'?'代表・証人一行停止: ':n.battleId==='B06'?'トマ停止: ':'荷車停止: ')+preview.reason);evaluate(n);if(n.phase!=='playing')return battleResult(n);}
 n.log.push('味方ターン開始');
 n.log=n.log.slice(-40);return battleResult(n);
}
