"""Measure registered, rendered foot placements; require manual leg identity QA.

Connected components locate visible boot centres, not anatomical ankle joints.
The extrema aid comparison of apparent stride. They cannot prove alternation.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.codex/skills/video2dsprite/scripts'))
from forge_core import label_components


def foot_pair(frame,ground,height):
    a=np.asarray(frame);opaque=a[:,:,3]>128;ys,xs=np.where(opaque)
    bottom_y=float(np.percentile(ys,99.9))
    # Detection ROI follows the visible soles. Registration itself must never
    # follow the soles: that was the root-bounce bug fixed by head registration.
    for fraction in [.16,.14,.12,.10]:
        mask=opaque&(np.arange(a.shape[0])[:,None]>=bottom_y-height*fraction)
        labels,n=label_components(mask);parts=[]
        for k in range(1,n+1):
            y,x=np.where(labels==k)
            if len(x)<max(12,height*height*.0003) or y.max()<bottom_y-height*.22:continue
            lower=y>=y.min()+(y.max()-y.min())*.50
            parts.append({'x':float(x[lower].mean()),'y':float(y[lower].mean()),'area':len(x),'bottom':int(y.max())})
        parts.sort(key=lambda p:(p['bottom'],p['area']),reverse=True)
        if len(parts)>=2 and min(p['area'] for p in parts[:2])/max(p['area'] for p in parts[:2])>=.18:return parts[:2]
    return None


def measure(directory,direction):
    meta=json.loads((directory/'normalization.json').read_text());count=meta['frames'];h=meta['bodyReferenceHeight'];scale=90/h
    frames=[Image.open(directory/f'frame_{i:03d}.png').convert('RGBA') for i in range(count)]
    sign={'N':(1,-1),'E':(1,1),'S':(-1,1),'W':(-1,-1)}[direction]
    axis=np.array([sign[0]*2,sign[1]],dtype=float);axis/=np.linalg.norm(axis)
    pairs=[foot_pair(f,meta['masterGround'],h) for f in frames]
    sep=lambda i:abs(np.dot(np.array([pairs[i][0]['x']-pairs[i][1]['x'],pairs[i][0]['y']-pairs[i][1]['y']]),axis)) if pairs[i] else -1
    first=[i for i in range(count) if min(i,count-i)<=count*.24 and pairs[i]]
    second=[i for i in range(count) if count*.26<=i<=count*.74 and pairs[i]]
    digest=hashlib.sha256((directory/'walk.png').read_bytes()).hexdigest()
    if not first or not second:return {'status':'manual-foot-points-required','sheet_sha256':digest,'visiblePairFrames':sum(p is not None for p in pairs)},frames,meta
    p0=max(first,key=lambda i:sep(i)-.02*min(i,count-i));p1=max(second,key=lambda i:sep(i)-.02*abs(i-count/2))
    pair0=sorted(pairs[p0],key=lambda p:np.dot([p['x'],p['y']],axis))
    pair1=sorted(pairs[p1],key=lambda p:np.dot([p['x'],p['y']],axis))
    travel_a=float(np.dot([pair0[1]['x']-pair1[0]['x'],pair0[1]['y']-pair1[0]['y']],axis))*scale
    travel_b=float(np.dot([pair1[1]['x']-pair0[0]['x'],pair1[1]['y']-pair0[0]['y']],axis))*scale
    mean=(travel_a+travel_b)/2
    return {'status':'measured-visible-centres-manual-identity-required','sheet_sha256':digest,
            'firstExtremumFrame':p0,'secondExtremumFrame':p1,'firstFootCentres':pair0,'secondFootCentres':pair1,
            'firstLeadingFootTravelPx':travel_a,'secondLeadingFootTravelPx':travel_b,
            'meanContactCentreTravelPx':mean,'apparentStrideAsymmetry':abs(travel_a-travel_b)/max(mean,1e-8),
            'visiblePairFrames':sum(p is not None for p in pairs),'frames':count,
            'anatomicalFootIdentity':'not-inferred','headYDriftDisplayPx':meta['finalHeadYDriftDisplayPx'],
            'headAreaVariationCv':meta['headAreaVariationCv'],'edgePixels':meta['edgePixels']},frames,meta


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,default=ROOT/'artifacts/walk-standard-v1/cast');args=parser.parse_args()
    work=args.work.resolve();out=work/'footprint-review';out.mkdir(exist_ok=True)
    pilot=ROOT/'artifacts/walk-standard-v1/root-normalization/pilot-garan-E'
    baseline,_,_=measure(pilot,'E');target=baseline.get('meanContactCentreTravelPx');rows=[];sheets={}
    entries=[]
    for f in sorted((work/'normalized').glob('*/*/normalization.json')):
        meta=json.loads(f.read_text());entries.append((meta['cast'],meta['direction'],f.parent))
    entries.append(('garan','E',pilot))
    for cast,direction,path in entries:
        r,frames,meta=measure(path,direction);r.update(cast=cast,direction=direction,directory=str(path.relative_to(ROOT)))
        if target and r.get('meanContactCentreTravelPx'):
            r['relativeStrideError']=r['meanContactCentreTravelPx']/target-1
            r['geometryWithin10Percent']=abs(r['relativeStrideError'])<=.10
        rows.append(r);(path/'footprint-measurement.json').write_text(json.dumps(r,indent=2)+'\n')
        # Every native frame, with an enlarged foot crop; no sampled thumbnail
        # can silently skip an irregular extra step.
        contact=Image.new('RGB',(len(frames)*128,152),'#20343a');draw=ImageDraw.Draw(contact)
        for i,f in enumerate(frames):
            crop=f.crop((48,round(meta['masterGround']-meta['bodyReferenceHeight']*.35),208,256))
            tile=Image.new('RGBA',crop.size,'#d5d6c8');tile.alpha_composite(crop)
            tile.thumbnail((124,120));x=i*128;contact.paste(tile.convert('RGB'),(x+2,26));draw.text((x+4,4),str(i),fill='white')
        contact.save(out/f'{cast}-{direction}-all-feet.jpg',quality=94)
        # Full-body extrema with centre markers support manual correction.
        pose=Image.new('RGB',(512,280),'#20343a');draw=ImageDraw.Draw(pose)
        for col,key,pointskey in [(0,'firstExtremumFrame','firstFootCentres'),(1,'secondExtremumFrame','secondFootCentres')]:
            idx=r.get(key,0);bg=Image.new('RGBA',(256,256),'#d5d6c8');bg.alpha_composite(frames[idx]);d=ImageDraw.Draw(bg)
            for point in r.get(pointskey,[]):
                x,y=point['x'],point['y'];d.ellipse((x-3,y-3,x+3,y+3),fill='red')
            pose.paste(bg.convert('RGB'),(col*256,24));draw.text((col*256+4,4),f'{cast} {direction} / frame {idx}',fill='white')
        pose.save(out/f'{cast}-{direction}-placements.jpg',quality=94)
        sheets.setdefault(cast,[]).append((direction,pose))
    for cast,parts in sheets.items():
        sheet=Image.new('RGB',(1024,560),'#20343a')
        for d,im in parts:
            i='NESW'.index(d);sheet.paste(im,(i%2*512,i//2*280))
        sheet.save(out/f'{cast}-placements.jpg',quality=94)
    report={'status':'not-accepted-pending-manual-leg-and-equipment-review','targetContactCentreTravelPx':target,
            'metric':'apparent boot-centre movement between opposing stride extrema, at 90px body reference; includes boot shape and occlusion',
            'anatomicalIdentity':'never inferred from component order','rows':rows}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'directionsMeasured':len(rows),'baselineContactCentreTravelPx':target,
                     'outside10Percent':[(r['cast'],r['direction'],round(r['relativeStrideError'],2)) for r in rows if r.get('geometryWithin10Percent') is False],
                     'missingFootPoints':[(r['cast'],r['direction']) for r in rows if not r.get('meanContactCentreTravelPx')]}))


if __name__=='__main__':main()
