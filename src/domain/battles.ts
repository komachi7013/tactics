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
import type { BattleId, Pos } from './types';
export interface BattleConfig {
 id: BattleId; title: string; subtitle: string; width: number; height: number; roundLimit: number;
 records: {id: string; x: number; y: number; name: string; optional?: boolean}[]; exit: Pos; gate: Pos | null;
 objective?: 'escort' | 'capture' | 'evacuate' | 'sluice' | 'repair' | 'finale'; controlPoints?:{id:string;name:string;pos:Pos}[]; commanderId?:string; repairSites?: {id:string;name:string;pos:Pos;workerRecordId:string}[]; sluiceGates?: {id:string;name:string;panel:Pos;region:Pos[]}[]; gateEffect?: 'chain'; escortRequiresOpenGate?: boolean; captureRequiresOpenGate?: boolean; chapter?: number; reversibleGate?: boolean; capturePoint?: Pos; requiredHoldRounds?: number; gateRegion: Pos[]; intro: string; result: string; defeatMessage: string;
}
const configs: Record<BattleId, BattleConfig> = {
 B01: {id:'B01',title:'トルネ渡し場',subtitle:'消された水位',width:10,height:8,roundLimit:8,
 records:[{id:'A',x:2,y:2,name:'水位記録A'},{id:'B',x:7,y:5,name:'水位記録B'}],exit:{x:9,y:6},gate:{x:2,y:4},
 gateRegion:Array.from({length:8},(_,i)=>({x:3+i%2,y:2+Math.floor(i/2)})),
 intro:'水位記録A・Bを採取し、リセを東の脱出地点へ。',result:'水位記録を確保して脱出。',defeatMessage:'第8ラウンド終了。記録の接収に間に合わなかった。'},
 B02: {id:'B02',title:'旧セラ堤',subtitle:'橋の閉鎖まで',...b02.map,roundLimit:18,
 records:[{id:'O',...b02.points.observation,name:'旧堤の観測点'}],exit:b02.points.exit,gate:null,gateRegion:[],
 intro:'旧堤の観測点Oを確保し、リセを東端へ。第18ラウンド終了に橋が閉鎖される。',
 result:'地形のずれを記録して旧堤を突破。次はB03 ラウム救護倉へ。',defeatMessage:'第18ラウンド終了。橋が閉鎖され、突破できなかった。'},
 B03: {id:'B03',title:'ラウム救護倉',subtitle:'名簿を守る者',...b03.map,roundLimit:12,objective:'escort',
 records:[{id:'M',...b03.points.observation,name:'負傷者名簿の写し'}],exit:b03.points.exit,gate:null,gateRegion:[],
 intro:'名簿Mを確保し、負傷者の荷車を街路の搬出口へ護送。隣接して敵を退け、次の進行先を空ける。',
 result:'負傷者と名簿を搬出。名簿接収を拒んだ調査隊は公的補給を失い、セナが正式に同行する。第1章完了。次はB04 乾いた支渠へ。',
 defeatMessage:'第12ラウンド終了。救護倉が封鎖され、搬出に間に合わなかった。'},
 B04: {id:'B04',title:'乾いた支渠',subtitle:'署名のある罪',chapter:2,width:b04.dimensions.width,height:b04.dimensions.height,roundLimit:10,objective:'capture',
 records:[],exit:b04.points.exit,gate:b04.points.gate,reversibleGate:true,capturePoint:b04.points.capture,requiredHoldRounds:2,
 gateRegion:b04.gateRegion,
 intro:'水路へ再入水し、制圧点Cを連続2ラウンド保持する。予約中・敵隣接中は保持できない。',
 result:'取水拠点を確保し、支渠へ水が戻る。下流を守る妨害が別の集落を干上がらせていた。イヴァが正式加入し、ダニが記録を携えて合流。次はB05 イェルン文書蔵へ。',
 defeatMessage:'第10ラウンド終了。制圧を完了できず、拠点を明け渡した。'},
 B05: {id:'B05',title:'イェルン文書蔵',subtitle:'署名のある罪',chapter:2,width:b05.dimensions.width,height:b05.dimensions.height,roundLimit:10,
 records:[{id:'D',...b05.points.D,name:'放流指令'},{id:'T',...b05.points.T,name:'放流時刻表'},{id:'S',...b05.points.S,name:'リセの再認証署名'},{id:'K',...b05.points.K,name:'補償名簿',optional:true}],exit:b05.points.exit,gate:null,gateRegion:[],
 intro:'必須文書D・T・Sを採取し、リセを西の退去口へ。任意の補償名簿Kは帰還前に確保する。',
 result:'放流指令・時刻表・再認証署名を搬出。放流の必要性と、警告・実測を省いた責任は別だ。文書だけで決着はつかない。ネイアは離脱する。次はB06 ケスト運河鎖門へ。',
 defeatMessage:'第10ラウンド終了。文書蔵が封鎖され、搬出に間に合わなかった。'},
 B06: {id:'B06',title:'ケスト運河鎖門',subtitle:'証言を運ぶ航路',chapter:2,width:b06.dimensions.width,height:b06.dimensions.height,roundLimit:18,objective:'escort',gateEffect:'chain',escortRequiresOpenGate:true,
 records:[],exit:b06.points.exit,gate:b06.points.gate,gateRegion:[],
 intro:'鎖門を開通し、書記トマを東の船着場へ護送する。開門は次ラウンド開始、隣接護衛で1セル進行。水位と橋は変わらない。',
 result:'書記トマと書記保全記録Wを確保。トマは証言と自身の加担への審理を引き受ける。商盟は航路維持と返済を条件に融資・補給へ協力する。第2章完了。次は第3章 B07 ヴァセル段丘村へ。',
 defeatMessage:'第18ラウンド終了。運河が封鎖され、トマを搬出できなかった。'},
 B07: {id:'B07',title:'ヴァセル段丘村',subtitle:'公開された署名',chapter:3,width:b07.dimensions.width,height:b07.dimensions.height,roundLimit:10,objective:'evacuate',
 records:[{id:'V1',...b07.points.V1,name:'北段の住民'},{id:'V2',...b07.points.V2,name:'南道の住民'}],exit:b07.points.exit,gate:null,gateRegion:[],
 intro:'住民集合点V1・V2に隣接する敵を退け、味方を隣接させて避難案内。案内係が場外の退避路へ送り、集合点は通行可能になる。両地点の案内を終え、リセを東の出口へ。中央封鎖兵と下流妨害兵はともに調査隊と敵対する。',
 result:'北段と南道の住民を退避路へ案内し、リセも村を脱出。公表した署名の責任は消えない。ネイアは赦しではなく住民を守るため復帰した。次はB08 ベルカ補助堰へ。',
 defeatMessage:'第10ラウンド終了。退避路が封鎖され、避難案内を完了できなかった。'},
 B08: {id:'B08',title:'ベルカ補助堰',subtitle:'保守と隠蔽',chapter:3,width:b08.dimensions.width,height:b08.dimensions.height,roundLimit:12,objective:'sluice',
 records:[{id:'P',...b08.points.record,name:'補助堰の保守記録'}],exit:b08.points.exit,gate:null,gateRegion:[],capturePoint:b08.points.capture,requiredHoldRounds:2,
 sluiceGates:b08.sluiceGates,
 intro:'北水路N・南水路Sを排水し、保守記録Pを確保。両水路に予約のない状態で操作所Cを連続2ラウンド保持する。切替は各水路ごとに次ラウンド開始に発効する。',
 result:'保守記録Pと操作所保全記録Cを確保。現在の水位痕と記録の照合は貯水池の危険を裏づける。設備保守の必要性と命令改竄の責任は別だ。リセの責任も消えない。次はB09 水段回廊へ。第3章は未完了。',
 defeatMessage:'第12ラウンド終了。操作所を確保できず、補助堰から撤退した。'},
 B09: {id:'B09',title:'水段回廊',subtitle:'公開の場への道',chapter:3,width:b09.dimensions.width,height:b09.dimensions.height,roundLimit:22,objective:'escort',
 records:[],exit:b09.points.exit,gate:null,gateRegion:[],
 intro:'保守記録と署名を携え、ラウム・ベルカ・トルネ代表と書記トマら証人の一行を裁定所へ。護送隊HPは一行の安全を表し、個人の死亡値ではない。隣接護衛と次セルの確保で各次ラウンドに1セル前進する。救助してもリセの責任は消えない。',
 result:'代表・証人一行が到着し、三都市招集連署Jと裁定所受理記録Hを得た。ラウム2・ベルカ1・トルネ1の計4票相当が支持し、三都市連署で臨時招集、全12票を持つ都市へ告知する。可決には7票が必要で、恒久議席変更・新政府・リセの免責は未成立。裁定所はヴェスクへの出頭・記録保全と妨害時の身柄保全を命じ、B12後に首府警備隊が執行する。リセの私刑にはしない。第3章完了。次は第4章 B10 首府外港へ。',
 defeatMessage:'第22ラウンド終了。回廊が封鎖され、代表・証人一行を退出させられなかった。'},
 B10: {id:'B10',title:'首府外港',subtitle:'入港の条件',chapter:4,width:b10.dimensions.width,height:b10.dimensions.height,roundLimit:12,objective:'capture',gateEffect:'chain',captureRequiresOpenGate:true,
 records:[],exit:b10.points.exit,gate:b10.points.gate,gateRegion:[],capturePoint:b10.points.capture,requiredHoldRounds:2,
 intro:'首府の住民と港の働き手に救援を届ける。外港鎖門の信号盤を操作し、次ラウンド開始の開通後、検問Cを連続2ラウンド保持する。船団は場外で待機し、水位・地形は変わらない。トマと代表は裁定所の保護下にいる。',
 result:'検問制圧・入港確認記録Cを得た。港の働き手と協力して場外の救援船団が入港し、首府住民へ補給を届ける。商盟は航路維持と将来返済を条件に融資・補給へ協力する。商盟の融資判断とは別に、ケスト都市代表2票が支持し計6票相当となる。全12票の過半数7票には未達で、正式採決・恒久議席変更・新政府・リセの免責は未成立。次はB11 中枢水門・下層保守路へ。第4章は未完了。',
 defeatMessage:'第12ラウンド終了。検問を保持できず、救援船団の入港を確保できなかった。'},
 B11: {id:'B11',title:'中枢水門・下層保守路',subtitle:'技師の手を借りて',chapter:4,width:b11.dimensions.width,height:b11.dimensions.height,roundLimit:12,objective:'repair',
 records:b11.records,exit:b11.points.exit,gate:null,gateRegion:[],
 repairSites:b11.repairSites,
 intro:'水務院の北保守員W1・南保守員W2を救出し、場外の安全な保守作業場所へ案内する。対応する北補助弁A・南補助弁Bへ復旧指示を出し、次ラウンド開始の完了後にリセを西退去口へ戻す。保守員の協力が不可欠だ。トマと代表は裁定所保護下にいる。',
 result:'保守員救出W1・W2と補助弁復旧A・Bを記録した。水務院の技師と保守員の協力で分散放流の準備が整う。設備保守の必要性と違法命令・リセの署名の責任は別だ。救援と安全確保の見通しを受け、オルセ代表3票が協力方針を示し計9票相当の支持見込みとなる。上流2票とイェルン1票の反対は残る。最終正式採決はB12の安全確保後で、恒久議席変更・新政府・免責・拘束執行・放流完了は未成立。次はB12 中枢水門・上層操作台。第4章は未完了。',
 defeatMessage:'第12ラウンド終了。保守員救出・補助弁復旧と退去を完了できず、保守路から撤退した。'},
 B12: {id:'B12',title:'中枢水門・上層操作台',subtitle:'誰の堤か',chapter:4,width:b12.dimensions.width,height:b12.dimensions.height,roundLimit:8,objective:'finale',
 records:[],exit:b12.points.exit,gate:null,gateRegion:[],requiredHoldRounds:2,commanderId:'enemy-vesk',
 controlPoints:b12.controlPoints,
 intro:'保守員と技師による補助弁復旧を受け、集中放流の強行を止める。生存する別々の味方で北分散操作台A・南分散操作台Bを同時に連続2ラウンド保持し、ヴェスクを非致死制圧する。第8ラウンド終了までに両条件を満たす。HP0のヴェスクは逃亡・死亡でなく保全対象。技師と保守員は場外運用、トマと代表は裁定所保護下。放流完了・正式採決・拘束執行は安全確保後。',
 result:'分散操作台保全記録U・指揮官身柄保全記録Vを確保。ヴェスクは生存状態で保全され、裁定所命令に基づく首府警備隊の拘束執行へ。保守員と技師が避難を確認して分散放流を同期し、安全確保後の正式採決と公開審理へ進む。戦闘でリセが免責されたわけではない。第4章の戦闘を完了。終幕で協定と残された課題を読む。',
 defeatMessage:'第8ラウンド終了。両操作台の連続保持とヴェスクの非致死制圧を完了できず、作戦失敗。'}
};
export const getBattleConfig = (id: BattleId): BattleConfig => structuredClone(configs[id]);

/** Optional evidence never blocks victory; legacy records remain mandatory. */
export const requiredRecords = (id: BattleId) => getBattleConfig(id).records.filter(r=>!r.optional);
