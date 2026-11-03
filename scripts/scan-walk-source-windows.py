"""Look for complete native gait windows before paying to regenerate a take.

Predict fixed-head registration geometry from high-resolution keyed sources.
This does not certify anatomy or foot yaw; selected results still need review.
"""
import concurrent.futures
import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v2'
spec=importlib.util.spec_from_file_location('normscan',ROOT/'scripts/normalize-walk-root.py')
norm=importlib.util.module_from_spec(spec);spec.loader.exec_module(norm)


def scan(row):
    meta=row['metadata'];source=ROOT/meta['source'];master=np.asarray(Image.open(ROOT/meta['masterPath']).convert('RGBA'))
    body=norm.revise.measure_body(master[:,:,3],2);ref,ref_area=norm.head_feature(master,round(body.height*.28))
    keyed=source/'keyed-native24';clean=sorted((keyed/'frames-clean').glob('*.png'));raw=sorted((keyed/'frames-raw').glob('*.png'))
    decoded=[];heights=[];bounds=[]
    for c,r in zip(clean,raw):
        a=np.asarray(Image.open(c).convert('RGBA')).copy();rgb=np.asarray(Image.open(r).convert('RGB'),dtype=np.int16)
        a[norm.revise.ground_shadow_mask(rgb,a[:,:,3],body.ground,45)]=0
        decoded.append(a);heights.append(norm.revise.measure_body(a[:,:,3],2).height)
        ys,_=np.where(a[:,:,3]>128);bounds.append((ys.min(),ys.max()))
    results=[]
    for start in [6,7,8,25,26,27,45,46,47,63,64]:
        if start+19>=len(decoded):continue
        band=round(float(np.median(heights[start:start+19]))*.28)
        features=[norm.head_feature(a,band) for a in decoded[start:start+19]]
        scale=math.sqrt(ref_area/float(np.median([a for _,a in features])))
        tops=[];feet=[]
        for k,(pos,_) in enumerate(features):
            root_y=-body.height*.008*(1-math.cos(4*math.pi*k/19))/2
            y0,y1=bounds[start+k];delta=ref[1]+root_y-pos[1]*scale
            tops.append(280+(y0*scale+delta-body.ground)*180/body.height)
            feet.append(280+(y1*scale+delta-body.ground)*180/body.height)
        peak=max(feet);top=float(np.median(tops))
        results.append({'start':start,'end':start+19,'predictedMaxFoot':peak,'predictedMedianHeadTop':top,
                        'score':abs(peak-280)+abs(top-100),
                        'geometryCandidate':bool(abs(peak-280)<=1.5 and abs(top-100)<=1.5)})
    results.sort(key=lambda x:x['score'])
    return {'index':row['index'],'cast':row['cast'],'direction':row['direction'],'source':meta['source'],'windows':results}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--current',action='store_true');parser.add_argument('--indices');args=parser.parse_args()
    if args.current:
        current=json.loads((WORK/'review.json').read_text())['rows']
        before=[{'index':r['index'],'cast':r['cast'],'direction':r['direction'],'metadata':r['display']['metadata']} for r in current if r.get('metrics')]
    else:before=json.loads((WORK/'review-before.json').read_text())['rows']
    indices=list(map(int,args.indices.split(','))) if args.indices else [3,4,7,9,21,22,23,26,29,34,36,46]
    rows=[r for r in before if r['index'] in indices]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(scan,rows))
    (WORK/('current-source-window-scan.json' if args.current else 'source-window-scan.json')).write_text(json.dumps(results,indent=2)+'\n')
    for r in results:print(r['index'],r['cast'],r['direction'],r['windows'][0],flush=True)

if __name__=='__main__':main()
