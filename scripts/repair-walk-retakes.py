"""Process replacement Higgsfield clips into full-source review assets.
No publication or inferred anatomical contact acceptance occurs here.
"""
import argparse
import concurrent.futures
import importlib.util
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-higgsfield-v4'
spec=importlib.util.spec_from_file_location('revise',ROOT/'scripts/revise-higgsfield-walks.py')
revise=importlib.util.module_from_spec(spec);spec.loader.exec_module(revise);revise.OUT=WORK
TOOLS=ROOT/'.codex/skills/video2dsprite/scripts'


def check_source(j):
    job=ROOT/j['directory'];out=job/'source-qa.json'
    keyed=job/j.get('keyedDirectory','keyed-v2')
    master=np.asarray(Image.open(job/'master.png').convert('RGBA'))
    body=revise.measure_body(master[:,:,3],2)
    raw=sorted((keyed/'frames-raw').glob('*.png'))
    counts=[]
    for f,r in zip(sorted((keyed/'frames-clean').glob('*.png')),raw):
        a=np.asarray(Image.open(f).convert('RGBA'))
        rgb=np.asarray(Image.open(r).convert('RGB'),dtype=np.int16)
        delta=j.get('shadowChromaDelta',45)
        shadow=revise.ground_shadow_mask(rgb,a[:,:,3],body.ground,delta)
        labels,n=revise.label_components((a[:,:,3]>128)&~shadow)
        areas=np.bincount(labels.ravel(),minlength=n+1)
        main=labels==(1+int(areas[1:].argmax()))
        counts.append(sum(int(e.sum()) for e in [main[0],main[-1],main[:,0],main[:,-1]]))
    report={'frames':len(counts),'mainBodyBorderPixels':counts,'clipped':any(counts),
            'mask':'same original-RGB lower-ground magenta shadow mask used for canonical export'}
    out.write_text(json.dumps(report,indent=2)+'\n')
    if any(counts): raise ValueError(f"{j['index']}: generated source clips the character; reject this take")
    return report


def process(j,refresh=False):
    j={**j,'shadowChromaDelta':45}
    job=ROOT/j['directory'];dest=WORK/j['cast']/j['direction'];dest.mkdir(parents=True,exist_ok=True)
    if not (job/'clip.mp4').exists(): return {'index':j['index'],'status':'awaiting-download'}
    existing=dest/'candidates.json'
    processing_version=4 if j.get('targetFrames') else 3
    if not refresh and existing.exists():
        prior=json.loads(existing.read_text())
        if prior.get('job_id')==j['job_id'] and prior.get('processingVersion')==processing_version:
            return {'index':j['index'],'status':'already-processed'}
    fps=j.get('sourceFps',16);expected_count=round(3.5*fps)
    keyed=job/j.get('keyedDirectory','keyed-v2')
    if not keyed.exists():
        with (job/'processing.log').open('w') as log:
            subprocess.run([sys.executable,str(TOOLS/'video2dsprite.py'),'process','--video',str(job/'clip.mp4'),
                '--output-dir',str(keyed),'--fps',str(fps),'--start','0.5','--duration','3.5','--key','magenta',
                '--matte','soft','--reference',str(job/'master.png'),'--frame-counts','16','--workers','2'],
                stdout=log,stderr=subprocess.STDOUT,check=True)
    check_source(j)
    full=dest/'full';full.mkdir(exist_ok=True)
    if refresh or len(list(full.glob('*.png')))!=expected_count:
        dest,frames,anchor,height,shadow=revise.canonical_frames(j)
        for i,im in enumerate(frames):im.save(full/f'{i:03d}.png')
        (dest/'geometry.json').write_text(json.dumps({'anchor':anchor,'height':height,'shadowPixelsRemoved':shadow}))
    else:
        frames=[Image.open(p).convert('RGBA') for p in sorted(full.glob('*.png'))]
        g=json.loads((dest/'geometry.json').read_text());anchor=g['anchor'];height=g['height'];shadow=g['shadowPixelsRemoved']
    period,profile=revise.leg_period(frames,anchor,height)
    length=period or {'N':17,'E':17,'S':22,'W':21}[j['direction']]
    if j.get('commonDrivingCycles'):
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=r_frame_rate,duration','-of','json',str(job/'clip.mp4')]))['streams'][0]
        assert probe['r_frame_rate']=='24/1','native24 processing requires a 24fps generation'
        expected_period=j['targetCycleMs']/1000*fps
        # The provider can append frames or retime the guide. Use observed
        # recurrence only within a tight neighbourhood of the known full gait.
        length=j.get('targetFrames') or (period if period and abs(period-expected_period)<=expected_period*.12 else round(expected_period))
        # Numerically score only windows beginning at the known driving L-heel
        # phase; a lower whole-image recurrence may be two cycles or a half step.
        starts=[round(k*expected_period-.5*fps)+offset for k in range(1,j['commonDrivingCycles']) for offset in [-1,0,1]]
        valid=[s for s in starts if 0<=s and s+length<len(frames)]
        fa=np.stack([np.asarray(f.resize((64,64)),dtype=np.float32)/255 for f in frames]);fa[:,:,:,:3]*=fa[:,:,:,3:4]
        start=min(valid,key=lambda s:float(np.abs(fa[s]-fa[s+length]).mean()))
        fixed_window=(start,start+length,float(np.abs(fa[start]-fa[start+length]).mean()))
    length=max(12,min(36,length))
    candidate=revise.render(j,dest,frames,anchor,height,length,'cycle',shadow,
                            window=fixed_window if j.get('commonDrivingCycles') else None)
    if j.get('commonDrivingCycles'):
        candidate.update(sourceFps=fps,drivingPeriodFrames=expected_period,phaseReference='predicted driving L contact; output still needs visual confirmation')
    (dest/'candidates.json').write_text(json.dumps({'index':j['index'],'cast':j['cast'],'direction':j['direction'],
        'reported':'replacement-required','job_id':j['job_id'],'sourceFps':fps,'sourceFrameCount':expected_count,
        'processingVersion':processing_version,'legPeriod':period,'lagProfile':profile,'candidates':[candidate]},indent=2)+'\n')
    # All 56 frames with exact source index, retaining aspect ratio.
    contact=Image.new('RGB',(1280,math.ceil(len(frames)/8)*104),'#25343a');draw=ImageDraw.Draw(contact)
    for i,f in enumerate(frames):
        crop=f.crop((64,max(0,round(anchor[1]-height*.4)),192,min(256,anchor[1]+5)))
        crop=ImageOps.contain(crop,(156,80),Image.Resampling.LANCZOS)
        tile=Image.new('RGBA',(160,80),'#d5d6c8');tile.alpha_composite(crop,((160-crop.width)//2,80-crop.height))
        x=i%8*160;y=i//8*104;contact.paste(tile.convert('RGB'),(x,y+22));draw.text((x+4,y+3),f'{i} / {i/fps+.5:.3f}s',fill='white')
    contact.save(dest/'full-feet.jpg',quality=94)
    return {'index':j['index'],'status':'needs-contact-review','period':period,'window':[candidate['sourceIndices'][0],candidate['sourceIndices'][-1]+1]}


def main():
    global WORK
    parser=argparse.ArgumentParser();parser.add_argument('--indices',default='');parser.add_argument('--refresh',action='store_true');parser.add_argument('--work',type=Path,default=WORK);args=parser.parse_args()
    WORK=args.work.resolve();revise.OUT=WORK
    plan=json.loads((WORK/'retakes.json').read_text());ids=set(map(int,args.indices.split(','))) if args.indices else None
    jobs=[j for j in plan['jobs'] if j.get('job_id') and (ids is None or j['index'] in ids)]
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        pending={pool.submit(process,j,args.refresh):j for j in jobs}
        for future in concurrent.futures.as_completed(pending):
            j=pending[future]
            try:r=future.result()
            except Exception as error:
                r={'index':j['index'],'status':'rejected-processing','reason':str(error)}
                (ROOT/j['directory']/'rejection.json').write_text(json.dumps(r,indent=2)+'\n')
            results.append(r);print(json.dumps(r),flush=True)
    (WORK/'processing-results.json').write_text(json.dumps(results,indent=2)+'\n')


if __name__=='__main__':main()
