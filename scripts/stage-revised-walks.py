"""Stage V3 review assets; --publish explicitly adopts the reviewed candidates."""
import argparse
import hashlib
import json
import math
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-higgsfield-v3'
sys.path.insert(0,str(ROOT/'.codex/skills/video2dsprite/scripts'))
from finish_frames import measure_body
from register_clip import hip_x


def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,indent=2)+'\n')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--publish',action='store_true');args=parser.parse_args()
    source=read(WORK/'source-plan.json');jobs=[];checks=[];manifest={}
    for original in source['jobs']:
        dest=WORK/original['cast']/original['direction'];d=read(dest/'candidates.json');candidate=d['candidates'][0]
        indices=candidate['sourceIndices'];assert indices==list(range(indices[0],indices[-1]+1))
        assert len(indices)==candidate['frames'] and len(indices)>=12
        sheet=Image.open(dest/(candidate['label']+'.png')).convert('RGBA');count=candidate['frames']
        assert sheet.size==(1024,math.ceil(count/4)*256)
        frames=[sheet.crop((i%4*256,i//4*256,i%4*256+256,i//4*256+256)) for i in range(count)]
        hips=[]
        for im in frames:
            a=np.asarray(im);b=measure_body(a[:,:,3],2);hips.append(hip_x(a[:,:,3]>128,b.ground,candidate['visibleHeight']))
        target=float(np.median(hips));sheet=Image.new('RGBA',sheet.size)
        for i,(im,x) in enumerate(zip(frames,hips)):
            fixed=Image.new('RGBA',(256,256));fixed.alpha_composite(im,(round(target-x),0))
            sheet.alpha_composite(fixed,(i%4*256,i//4*256))
        buffer=io.BytesIO();sheet.save(buffer,format='PNG',optimize=True);png=buffer.getvalue();(dest/'walk.png').write_bytes(png)
        reduced=[];edge=0
        for i in range(count):
            a=np.asarray(sheet.crop((i%4*256,i//4*256,i%4*256+256,i//4*256+256)))
            edge+=int((a[0,:,3]>4).sum()+(a[-1,:,3]>4).sum()+(a[:,0,3]>4).sum()+(a[:,-1,3]>4).sum())
            f=np.asarray(Image.fromarray(a).resize((64,64)),dtype=np.float32)/255;f[:,:,:3]*=f[:,:,3:4];reduced.append(f)
        assert edge==0,(original['index'],'clipped',edge)
        a=np.stack(reduced);step=np.abs(np.diff(a,axis=0)).mean(axis=(1,2,3))
        seam=float(np.abs(a[-1]-a[0]).mean())/max(1e-6,float(np.percentile(step,95)))
        assert seam<1.6,(original['index'],'seam',seam)
        asset={k:candidate[k] for k in ['frames','cell','originX','originY','visibleHeight','cycleMs','tilesPerCycle']}
        asset.update(key=f"motion-v3-walk-{original['cast']}-{original['direction']}",path=f"/assets/motion-v3/{original['cast']}/walk-{original['direction']}.png")
        ready={'index':original['index'],'cast':original['cast'],'direction':original['direction'],'job_id':original['job_id'],
               'art_source':original['art_source'],'asset':asset,'sourceIndices':indices,
               'sheet_sha256':hashlib.sha256(png).hexdigest(),'sourceDirectory':original['directory'],
               'sourceFps':16,'extractionStartSeconds':0.5,
               'sourceIndexBasis':'0-based keyed sequence extracted from the video at a uniform 16 fps, starting at 0.5 seconds',
               'processing':'fixed construction transform; original-RGB ground shadow mask; hip lock before and after common downscale; contiguous extracted-frame cycle',
               'review':'contact-sheet-inspected-gait-unverified' if args.publish else 'needs-visual-review',
               'userReported':d.get('reported'),'seamOverAdjacentP95':seam,'shadowPixelsRemoved':candidate['shadowPixelsRemoved']}
        write(dest/'ready.json',ready)
        job={**original,'sourceDirectory':original['directory'],'directory':str(dest.relative_to(ROOT))};jobs.append(job)
        checks.append({'index':original['index'],'cast':original['cast'],'direction':original['direction'],
                       'reported':d.get('reported'),'frames':count,'consecutiveSourceFrames':True,'sourceFrameDuplicates':0,
                       'sourceFrameDrops':0,'seamOverAdjacentP95':round(seam,3),'edgePixels':edge})
        if args.publish:
            production=ROOT/('public'+asset['path']);production.parent.mkdir(parents=True,exist_ok=True)
            production.write_bytes(png);write(production.with_suffix('.json'),ready)
            manifest.setdefault(original['cast'],{})[original['direction']]=asset
    write(WORK/'plan.json',{'version':3,'jobs':jobs})
    write(WORK/'audit.json',{'version':3,'reportedDirections':sum(c['reported'] is not None for c in checks),
          'frameOrderPolicy':'Consecutive original frames only; no phase warping, no duplicated or skipped source indices',
          'cycleMs':720,'visualStatus':'contact-review-required' if args.publish else 'pending','checks':checks})
    template=WORK/'preview-template.html'
    html=(template if template.exists() else ROOT/'artifacts/walk-higgsfield-v2/preview.html').read_text().replace('walk-higgsfield-v2/','walk-higgsfield-v3/')
    html=html.replace('再検証中（歩行不具合の報告あり）','V3：歩行不全の報告あり・接地を再検証中')
    html=html.replace('<main>', '<p><a href="../walk-gait-audit/index.html">足元の拡大・歩行監査結果（全48方向）</a></p><main>')
    (WORK/'preview.html').write_text(html)
    if args.publish:write(ROOT/'src/view/walk-v2.json',manifest)
    print(json.dumps({'directions':len(jobs),'reported':sum(c['reported'] is not None for c in checks),
                      'status':'published' if args.publish else 'staged','maxSeam':max(c['seamOverAdjacentP95'] for c in checks)}))


if __name__=='__main__':main()
