"""Build a review-only cast preview from the user-selected Garan baseline."""
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v1'
spec=importlib.util.spec_from_file_location('check',ROOT/'scripts/check-garan-body-proportions.py')
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)


def main():
    baseline=json.loads((WORK/'baseline.json').read_text())
    refs=[check.measure(ROOT/v['directory']) for v in baseline['directions'].values()]
    foot_limits=[min(r['lowestFootMedianPx'] for r in refs)-2,max(r['lowestFootMedianPx'] for r in refs)+2]
    jobs=json.loads((WORK/'retakes.json').read_text())['jobs'];rows=[]
    visual_path=WORK/'visual-reviews.json'
    visual=json.loads(visual_path.read_text()) if visual_path.exists() else {}
    for j in jobs:
        path=WORK/'normalized'/j['cast']/j['direction']
        if not (path/'normalization.json').exists():
            rows.append({'index':j['index'],'cast':j['cast'],'direction':j['direction'],'status':'awaiting-source','reasons':['未生成・処理待ち']});continue
        m=json.loads((path/'normalization.json').read_text())
        if m.get('job_id')!=j.get('job_id'):
            rows.append({'index':j['index'],'cast':j['cast'],'direction':j['direction'],'status':'awaiting-retake','reasons':['再生成の処理待ち']});continue
        x=check.measure(path);reasons=[]
        qa_path=ROOT/j['directory']/'source-qa.json'
        qa=json.loads(qa_path.read_text()) if qa_path.exists() else {}
        if qa.get('clipped') or not qa.get('frames'):reasons.append('原動画の見切れ・未検証')
        if x['frames']!=19 or x['cycleMs']!=800:reasons.append('19フレーム・800ms未達')
        ids=m['sourceIndices']
        if len(ids)!=19 or ids!=list(range(ids[0],ids[0]+19)):reasons.append('原動画のコマ順・枚数が不正')
        if x['edgePixels']:reasons.append('出力の見切れ')
        # Raster coordinates are measured to a tenth of a display pixel;
        # avoid failing a boundary for subpixel arithmetic noise.
        if not round(foot_limits[0],1)<=round(x['lowestFootMedianPx'],1)<=round(foot_limits[1],1):reasons.append('全身の高さが基準範囲外')
        if abs(x['headTopMedianPx']-100)>2:reasons.append('頭頂の位置が基準範囲外')
        if m['headAreaVariationCv']>.03:reasons.append('頭部形状の変動')
        row={'index':j['index'],'cast':j['cast'],'direction':j['direction'],
             'status':'needs-correction' if reasons else 'needs-visual-review','reasons':reasons,
             'directory':'/'+str(path.relative_to(ROOT)),'metadata':m,'metrics':x,
             'sha256':hashlib.sha256((path/'walk.png').read_bytes()).hexdigest(),
             'sourceQaFrames':qa.get('frames'),'visualReview':'pending'}
        seen=visual.get(str(j['index']),{})
        if seen.get('job_id')==j['job_id'] and seen.get('sheetSha256')==row['sha256']:
            row['visualReview']='all-selected-native-frames-inspected'
            row['visualNotes']='19コマ目視確認済み'
            if not reasons:row['status']='reviewed'
        rows.append(row)
    for d,v in baseline['directions'].items():
        path=ROOT/v['directory'];assert hashlib.sha256((path/'walk.png').read_bytes()).hexdigest()==v['sheetSha256'],'selected Garan baseline changed'
        rows.append({'index':4+'NESW'.index(d),'cast':'garan','direction':d,'status':'user-selected-baseline','reasons':[],
                     'directory':'/'+v['directory'],'metadata':json.loads((path/'normalization.json').read_text()),'sha256':v['sheetSha256']})
    rows.sort(key=lambda r:r['index'])
    review={'frames':19,'cycleMs':800,'footMedianLimitsDisplayPx':foot_limits,
            'scope':'image geometry checks; anatomical gait requires full-frame visual review; no game publication',
            'rows':rows}
    (WORK/'review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
    contact_dir=WORK/'contact';contact_dir.mkdir(exist_ok=True)
    for cast in dict.fromkeys(r['cast'] for r in rows):
        sheet=Image.new('RGB',(19*96,4*132),'#20343a');draw=ImageDraw.Draw(sheet)
        for k,d in enumerate('NESW'):
            row=next((r for r in rows if r['cast']==cast and r['direction']==d),None)
            if not row or not row.get('metadata'):continue
            p=ROOT/row['directory'].lstrip('/');m=row['metadata'];cell=m.get('cell',256);scale=180/m['bodyReferenceHeight']
            for i in range(m['frames']):
                frame=Image.open(p/f'frame_{i:03d}.png').convert('RGBA')
                canvas=Image.new('RGBA',(256,300),'#d5d6c8');im=frame.resize((round(cell*scale),round(cell*scale)),Image.Resampling.LANCZOS)
                canvas.alpha_composite(im,(round(128-cell*.5*scale),round(280-m['masterGround']*scale)))
                x=i*96;y=k*132;sheet.paste(canvas.resize((96,112)).convert('RGB'),(x,y+20));
                draw.text((x+3,y+3),f'{d} {i}',fill='white')
        sheet.save(contact_dir/f'{cast}-all-frames.jpg',quality=95)
    summary={s:sum(r['status']==s for r in rows) for s in sorted(set(r['status'] for r in rows))}
    print(json.dumps(summary))
    for r in rows:
        if r['reasons']:print(r['index'],r['cast'],r['direction'],','.join(r['reasons']))


if __name__=='__main__':main()
