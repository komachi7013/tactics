"""Full-cast comparison of production-rendered geometry and timing.

Silhouette measurements are diagnostic proxies, not anatomical stride or pose
estimates. No direction passes the common-motion gate without tracked joints.
"""
import csv
import hashlib
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/walk-standard-v1/audit';OUT.mkdir(parents=True,exist_ok=True)


def measure_frames(frames,visible_height):
    scale=90/visible_height;heights=[];head_width=[];upper=[];foot_spread=[]
    for frame in frames:
        a=np.asarray(frame)[:,:,3].astype(float)/255;ys,xs=np.where(a>.5)
        top,bottom=int(ys.min()),int(ys.max());height=bottom-top+1;heights.append(height*scale)
        head=(a>.5)&(np.arange(a.shape[0])[:,None]<top+height*.28)
        hy,hx=np.where(head);head_width.append((np.percentile(hx,95)-np.percentile(hx,5))*scale)
        body=(a>.5)&(np.arange(a.shape[0])[:,None]<top+height*.60)
        by,bx=np.where(body);upper.append([bx.mean()*scale,by.mean()*scale])
        foot=(a>.5)&(np.arange(a.shape[0])[:,None]>=bottom-height*.22)
        fy,fx=np.where(foot);foot_spread.append((np.percentile(fx,95)-np.percentile(fx,5))*scale)
    upper=np.array(upper)
    span=lambda a:round(float(np.percentile(a,95)-np.percentile(a,5)),3)
    return {'bodyHeightMedianPx':round(float(np.median(heights)),3),
            'bodyHeightP05Px':round(float(np.percentile(heights,5)),3),
            'bodyHeightP95Px':round(float(np.percentile(heights,95)),3),
            'bodyHeightDriftPx':span(heights),'headBandWidthDriftPx':span(head_width),
            'upperSilhouetteHorizontalDriftPx':span(upper[:,0]),
            'upperSilhouetteVerticalDriftPx':span(upper[:,1]),
            'bootSilhouetteWidthMedianPx':round(float(np.median(foot_spread)),3),
            'bootSilhouetteWidthDriftPx':span(foot_spread)}


def main():
    manifest=json.loads((ROOT/'src/view/walk-v2.json').read_text())
    standard=json.loads((ROOT/'artifacts/walk-standard-v1/standard.json').read_text());rows=[]
    for cast,directions in manifest.items():
        for direction,a in directions.items():
            path=ROOT/('public'+a['path']);sheet=Image.open(path).convert('RGBA');cols=sheet.width//a['cell'];cell=a['cell']
            frames=[sheet.crop((i%cols*cell,i//cols*cell,(i%cols+1)*cell,(i//cols+1)*cell)) for i in range(a['frames'])]
            metadata=json.loads(path.with_suffix('.json').read_text())
            row={'cast':cast,'direction':direction,'sheet_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                 'cycleMs':a['cycleMs'],'tilesPerCycle':a['tilesPerCycle'],
                 'contactAnnotationPresent':'gaitContacts' in metadata,
                 'cycleMatchesStandard':a['cycleMs']==standard['cycleMs'],
                 'travelMatchesStandard':a['tilesPerCycle']==standard['tilesPerCycle'],
                 **measure_frames(frames,a['visibleHeight']),
                 'anatomicalStrideStatus':'unmeasured','armSwingStatus':'unmeasured',
                 'uniformityStatus':'not-accepted'}
            rows.append(row)
    report={'status':'not-accepted','directions':len(rows),'standard':standard,
            'limits':'Head/torso/boot silhouette proxies include costume and occlusion. They cannot establish anatomical stride, arm swing or left/right foot identity. Contact annotations alone do not certify cross-character uniformity.',
            'rows':rows}
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    with (OUT/'metrics.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    columns=[('cast','キャラ'),('direction','向き'),('bodyHeightMedianPx','身長中央値 px'),
             ('bodyHeightDriftPx','身長変動 px'),('headBandWidthDriftPx','頭部幅変動 px'),
             ('upperSilhouetteHorizontalDriftPx','上体横揺れ px'),('upperSilhouetteVerticalDriftPx','上体縦揺れ px'),
             ('bootSilhouetteWidthMedianPx','足元の見かけの幅 px'),('bootSilhouetteWidthDriftPx','同・変動 px'),
             ('cycleMs','周期 ms'),('tilesPerCycle','移動マス/周期')]
    page='''<!doctype html><html lang="ja"><meta charset="utf-8"><title>全48方向・統一監査</title>
<style>body{font:14px system-ui;background:#18282c;color:#eee;padding:20px}a{color:#ffe0a0}table{border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{padding:8px;border:1px solid #667e7b;text-align:right}th{position:sticky;top:0;background:#263e40}tr.garan{background:#573d33}</style>
<h1>全48方向：共通歩行基準との比較（全方向・未合格）</h1>
<p>予定基準：身長90px相当・左右2歩/800ms・1マス/周期。歩幅・腕振りの関節計測は未完了です。</p>
<p>下表は画面上の輪郭の測定です。衣装・武器・隠れを含むため、足元の幅を「歩幅」、輪郭の揺れを「勢い」の合格判定に流用しません。</p>
<p><a href="report.json">検証JSON</a> / <a href="metrics.csv">全48方向CSV</a> / <a href="../../walk-higgsfield-v4/preview.html">現行V4</a></p><table><thead><tr>'''
    page+=''.join('<th>'+label+'</th>' for _,label in columns)+'</tr></thead><tbody>'
    for r in rows:
        page+=f'<tr class="{r["cast"]}">'+''.join('<td>'+html.escape(str(r[key]))+'</td>' for key,_ in columns)+'</tr>'
    page+='</tbody></table></html>';(OUT/'index.html').write_text(page)
    print(json.dumps({'directions':len(rows),'accepted':0,'timingMismatch':sum(not r['cycleMatchesStandard'] for r in rows),
        'travelMismatch':sum(not r['travelMatchesStandard'] for r in rows),
        'maxBodyHeightDriftPx':max(r['bodyHeightDriftPx'] for r in rows)}))


if __name__=='__main__':main()
