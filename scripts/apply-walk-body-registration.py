"""Apply the user-authorized fixed body map to isolated correction drafts.

Always rebuild from a job-bound backup; protect every head pixel byte for byte.
This does not certify anatomy or change any game asset.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from walk_body_registration import body_factor, register_body

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v2'
spec=importlib.util.spec_from_file_location('geometry',ROOT/'scripts/check-garan-body-proportions.py')
geometry=importlib.util.module_from_spec(spec);spec.loader.exec_module(geometry)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--indices',required=True)
    parser.add_argument('--protected-head-y',type=float,default=165);args=parser.parse_args()
    wanted={int(i) for i in args.indices.split(',')}
    jobs=json.loads((WORK/'retakes.json').read_text())['jobs']
    for j in jobs:
        if j['index'] not in wanted:continue
        out=WORK/'normalized'/j['cast']/j['direction']
        meta=json.loads((out/'normalization.json').read_text())
        assert meta['job_id']==j['job_id'] and meta['frames']==19 and meta['cycleMs']==800
        backup=WORK/'body-registration-before'/j['cast']/j['direction']/j['job_id']
        if not (backup/'normalization.json').exists():
            backup.mkdir(parents=True,exist_ok=True)
            for name in ['normalization.json','walk.png']+[f'frame_{i:03d}.png' for i in range(19)]:
                shutil.copyfile(out/name,backup/name)
        base=json.loads((backup/'normalization.json').read_text())
        assert base['job_id']==j['job_id'] and not base.get('bodyRegistration')
        base.setdefault('cell',Image.open(backup/'frame_000.png').width)
        before=geometry.measure(backup)
        head_translation=100-before['headTopMedianPx'] if abs(100-before['headTopMedianPx'])>1.5 else 0
        # One shared display translation aligns an off-centre clip. The head
        # texture remains unchanged; this is never a per-frame root adjustment.
        base['masterGround']-=head_translation/(180/base['bodyReferenceHeight'])
        factor=body_factor(before['lowestFootRangePx'][1]+head_translation,pivot_y=args.protected_head_y)
        scale=180/base['bodyReferenceHeight'];world_y=280+(np.arange(base['cell'])-base['masterGround'])*scale
        protected=world_y<=args.protected_head_y;frames=[];head_hashes=[]
        for i in range(19):
            original=np.asarray(Image.open(backup/f'frame_{i:03d}.png').convert('RGBA'))
            corrected=register_body(original,factor,base['masterGround'],base['bodyReferenceHeight'],pivot_y=args.protected_head_y)
            assert np.array_equal(original[protected],corrected[protected]),'protected head changed'
            head_hashes.append(hashlib.sha256(original[protected].tobytes()).hexdigest())
            frame=Image.fromarray(corrected);frame.save(out/f'frame_{i:03d}.png');frames.append(frame)
        sheet=Image.new('RGBA',(base['cell']*4,base['cell']*math.ceil(19/4)))
        contact=Image.new('RGB',(19*128,160),'#d5d6c8');draw=ImageDraw.Draw(contact)
        edge=0
        for i,f in enumerate(frames):
            sheet.alpha_composite(f,(i%4*base['cell'],i//4*base['cell']))
            tile=f.resize((128,128),Image.Resampling.LANCZOS);contact.paste(tile,(i*128,24),tile);draw.text((i*128+3,3),str(i),fill='black')
            a=np.asarray(f)[:,:,3];edge+=sum(int((e>4).sum()) for e in [a[0],a[-1],a[:,0],a[:,-1]])
        assert edge==0,'body registration clips canvas'
        sheet.save(out/'walk.png');contact.save(out/'contact.jpg',quality=94)
        m={**base,'edgePixels':edge,'bodyRegistration':{'version':1,'authorized':True,'bodyFactor':factor,'protectedHeadWorldY':args.protected_head_y,
            'blendHeight':12,'targetSoleY':280,'headPixelsUnchanged':True,'headSha256PerFrame':head_hashes,'sharedDisplayTranslationPx':head_translation,
            'backup':str(backup.relative_to(ROOT)),'sameMapForEveryFrame':True,'beforeMetrics':before}}
        (out/'normalization.json').write_text(json.dumps(m,indent=2)+'\n')
        after=geometry.measure(out)
        (out/'body-registration.json').write_text(json.dumps({**m['bodyRegistration'],'afterMetrics':after},indent=2)+'\n')
        print(json.dumps({'index':j['index'],'bodyFactor':factor,'headUnchanged':True,'beforeSole':before['lowestFootRangePx'][1],'afterSole':after['lowestFootRangePx'][1]}),flush=True)


if __name__=='__main__':main()
