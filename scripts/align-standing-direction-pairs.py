"""Align reviewed standing landmarks using user-selected per-character references.

Manual landmarks are estimates. This transforms image pixels, independently of
guide rendering; reference images remain unchanged. It never generates media.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/standing-cast-review-v1'
OUT=ROOT/'artifacts/standing-cast-repairs-local-v1'


def warp(image, source, target):
    rgba=np.asarray(image).astype(np.float32)/255
    alpha=rgba[...,3:4]
    premult=np.concatenate((rgba[...,:3]*alpha,alpha),axis=2)
    sy=np.interp(np.arange(image.height),target,source)
    lo=np.floor(sy).astype(int).clip(0,image.height-1)
    hi=(lo+1).clip(0,image.height-1)
    t=(sy-lo)[:,None,None]
    result=premult[lo]*(1-t)+premult[hi]*t
    a=result[...,3:4]
    rgb=np.divide(result[...,:3],a,out=np.zeros_like(result[...,:3]),where=a>1e-6)
    return Image.fromarray(np.round(np.clip(np.concatenate((rgb,a),axis=2),0,1)*255).astype('uint8'))


def main():
    plan=json.loads((WORK/'pair-alignment-plan.json').read_text())
    manifest=json.loads((WORK/'manifest.json').read_text())
    active=json.loads((WORK/'repairs-active.json').read_text())
    guides=json.loads((WORK/'landmark-overrides.json').read_text())
    decisions=json.loads((WORK/'reference-decisions.json').read_text())
    for cast,spec in plan.items():
        snapshots={}
        for d in ['N','E','W','S']:
            folder=OUT/cast/d;folder.mkdir(parents=True,exist_ok=True)
            snapshot=folder/'before-five-point-alignment.png'
            if not snapshot.exists():
                r=next(r for r in manifest['rows'] if r['cast']==cast and r['direction']==d)
                path=active.get(cast+'/'+d,{}).get('image',r['original'].lstrip('/'))
                snapshot.write_bytes((ROOT/path).read_bytes())
            snapshots[d]=Image.open(snapshot).convert('RGBA')
        for pair,reference in spec['references'].items():
            other=next(d for d in pair if d!=reference)
            source=[0,*spec['landmarks'][other],300]
            target=[0,*spec['landmarks'][reference],300]
            assert all(b>a for a,b in zip(source,source[1:]))
            assert all(b>a for a,b in zip(target,target[1:]))
            changed=source!=target
            image=warp(snapshots[other],source,target) if changed else snapshots[other].copy()
            path=OUT/cast/other/'five-point-aligned.png';image.save(path)
            coordinates=dict(zip(['head','jaw','waist','knee','ground'],target[1:-1]))
            record=dict(active.get(cast+'/'+other,{}))
            record.update({'cast':cast,'direction':other,'image':str(path.relative_to(ROOT)),
                'jaw':coordinates['jaw'],'landmarks':coordinates,
                'label':reference+'基準・5点位置補正' if changed else '5点位置確認・変更なし',
                'referenceDirection':reference,
                'geometryRemap':{'source':source,'target':target},
                'geometryRemapChanged':changed,
                'status':'manual landmark alignment candidate; visual approval pending',
                'landmarkMethod':'manual visual estimate; knees partly hidden, +/-3px',
                'bodyPixelsUnchangedBelow':None,'originalFeetPixelsUnchanged':False,
                'eastUpperBodyPixelsUnchanged':False,
                'higgsfieldAdditionalCredits':0,
                'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
            active[cast+'/'+other]=record
            (OUT/cast/other/'five-point-alignment.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
            for d in pair:
                guides[cast+'/'+d]={'jaw':coordinates['jaw'],'landmarks':coordinates,
                    'method':'manual visual estimates; geometry aligned to selected reference',
                    'pairReference':reference}
            decisions[cast+'/'+pair]=reference
            print(f'{cast}: {other} -> {reference}; image pixels remapped, reference unchanged')
    for name,data in [('repairs-active.json',active),('landmark-overrides.json',guides),('reference-decisions.json',decisions)]:
        (WORK/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':main()
