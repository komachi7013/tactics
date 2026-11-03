"""Conservative slip feasibility and alpha-ground audit; not foot-pose estimation."""
import json,math
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'artifacts/walk-from-standing-v1'
p=json.loads((WORK/'game-walk-application.json').read_text())
for record in p['records']:
 files=sorted((ROOT/record['candidate']).glob('frame_*.png')); xs=[];ys=[]
 for path in files:
  a=np.asarray(Image.open(path).convert('RGBA'))[:,:,3]; mask=a>128
  # Deliberately broad lower-body envelope. Enlarges the bound, never overclaims a track.
  top=np.where(mask)[0].min(); bottom=np.where(mask)[0].max()+1
  mask[:round(top+(bottom-top)*.70)]=False
  y,x=np.where(mask);xs.extend([int(x.min()),int(x.max())]);ys.extend([int(y.min()),int(y.max())])
 width=(max(xs)-min(xs))*90/179;height=(max(ys)-min(ys))*90/179
 # Half-cycle = 2 B01 tiles at (60,30) pixels/tile, scale=1.
 # A perfectly planted point must move 120px horizontally against root movement.
 record['lowerBodyEnvelopeGamePx']=[round(width,3),round(height,3)]
 record['groundTravelHalfCycleGamePx']=[120,60]
 record['minimumHorizontalSlipOverAssumedHalfCyclePx']=round(max(0,120-width),3)
 record['slipFeasibility']='cannot stay planted for a whole 400ms support phase at current translation speed' if width<120 else 'inconclusive'
report={'scope':'12 cast / 48 directions, B01 flat ground, unitScale=1','timing':{'frames':19,'cycleMs':800,'tileMs':200,'tilesPerCycle':4},'limitations':['Alpha ground range is silhouette extent, not anatomical support contact.','Slip bound assumes one support phase lasts 400ms; no left/right tracking or contact classification.','Terrain elevation, camera changes and actual support duration need gameplay visual checks.','No claim that all foot motion or identity issues are resolved.'],'records':p['records']}
(WORK/'game-contact-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
lines=['# ゲーム適用後の接地・足滑り確認','', '12キャラ・48方向を適用。19フレーム／800ms。固定した立ち絵原点を使用。','', '## 結果','', '- B01の移動設定は200ms/マス、4マス/周期。半周期に地面は横120px・縦60px進む。','- 全48方向の下半身の移動可能範囲より大きく、支持を半周期とした場合、接地中の足を地面に留められない。','- 上下差は画像の下端の測定であり、解剖学的な接地そのものを自動検出した値ではない。','- 画像に手を加えず、まず実装を反映した。滑り・足元の上下差は未解消。','', '|キャラ|方向|足元画像下端のずれ(px、基準倍率)|下半身の横範囲(px)|半周期支持を仮定した滑り下限(px)|','|---|---|---|---|---|']
for r in p['records']:
 a,b=r['groundOffsetGamePxRange'];lines.append(f"|{r['cast']}|{r['direction']}|{a:.1f}〜{b:.1f}|{r['lowerBodyEnvelopeGamePx'][0]:.1f}|{r['minimumHorizontalSlipOverAssumedHalfCyclePx']:.1f}|")
lines+=['','## 実ゲーム確認','', '- 隔離QAでB01を起動し、リセのN方向への複数マス移動と、移動完了後のコマンド選択への復帰を確認。通常セーブは変更していない。','- 全48方向はゲームと同じ画像・原点・倍率・distancePose関数を使う検証ページでも表示確認。通常戦闘全編で全12キャラを操作した検証ではない。','- ガードSは直近Seedance v4候補を反映。痙攣の解消・色味の一致は未承認。','', '## 修正案（未実施）','', '- 接地足の位置を追跡して、支持期の実際の歩幅から移動距離を決める。0.8秒の周期を守るならゲームの移動速度を下げる必要がある。','- 支持足を識別した後、固定原点の誤差と、脚自体の接地不良を分ける。全コマを下端へ固定する補正は足の持ち上げを消すため使わない。']
(WORK/'game-contact-audit.md').write_text('\n'.join(lines)+'\n')
print('Audited 48 directions; horizontal slip lower bounds:',min(r['minimumHorizontalSlipOverAssumedHalfCyclePx'] for r in p['records']),max(r['minimumHorizontalSlipOverAssumedHalfCyclePx'] for r in p['records']))
