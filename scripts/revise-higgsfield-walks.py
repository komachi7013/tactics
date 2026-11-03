"""V3: fixed video transform, raw-colour shadow removal, hip registration,
and consecutive source frames. Never warp four guessed gait phases.
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/walk-higgsfield-v3"
sys.path.insert(0,str(ROOT/".codex/skills/video2dsprite/scripts"))
from finish_frames import measure_body
from register_clip import hip_x
from forge_core import label_components

REPORTED={0:'step',3:'step',4:'incomplete gait',5:'shadow',6:'step',7:'step',9:'step',10:'step',20:'position',22:'step',26:'step',27:'step',31:'position',32:'position',36:'shadow',38:'step',42:'step',43:'step',44:'step',47:'step'}
# Reviewed source windows: short foot-spread periods can be one step, while
# long recurrence periods can include two full cycles or the initial idle hold.
PERIOD_OVERRIDES={3:26,8:18,13:24,20:18,27:28}


def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,indent=2)+'\n')


def ground_shadow_mask(rgb,alpha,ground,chroma_delta=8):
    h,w=alpha.shape
    lower=np.arange(h)[:,None] >= (20+2.5*(ground-55))*h/768
    hue=(rgb[:,:,2]>rgb[:,:,0]*.55)
    strong=(rgb[:,:,0]>rgb[:,:,1]+chroma_delta)&(rgb[:,:,2]>rgb[:,:,1]+chroma_delta)&hue
    shadow=lower&strong
    if chroma_delta>8:
        # Generated magenta floor rules can turn grey after despill. Detect
        # their very wide, thin rows, then remove weak magenta only on those
        # rows. A weak hue test over whole trouser legs destroys grey cloth.
        wide=((alpha>32).sum(axis=1)>w*.45)&lower[:,0]
        expanded=np.convolve(wide.astype(int),np.ones(7,dtype=int),mode='same')>0
        weak=(rgb[:,:,0]>rgb[:,:,1]+8)&(rgb[:,:,2]>rgb[:,:,1]+8)&hue
        shadow|=expanded[:,None]&weak
    return shadow


def canonical_frames(entry):
    job=ROOT/entry['directory']; dest=OUT/entry['cast']/entry['direction'];dest.mkdir(parents=True,exist_ok=True)
    master=Image.open(job/'master.png').convert('RGBA');ma=np.asarray(master)
    body=measure_body(ma[:,:,3],2);target_x=hip_x(ma[:,:,3]>128,body.ground,body.height)+32
    target_y=body.ground+32
    keyed=job/entry.get('keyedDirectory','keyed-v2')
    cleaned=sorted((keyed/'frames-clean').glob('*.png'))
    raw=sorted((keyed/'frames-raw').glob('*.png'))
    assert len(cleaned)==len(raw)
    frames=[];shadow_count=0
    for clean,source in zip(cleaned,raw):
        rgba=Image.open(clean).convert('RGBA');rgb=np.asarray(Image.open(source).convert('RGB'),dtype=np.int16)
        a=np.asarray(rgba).copy();h,w=a.shape[:2]
        # Use the original video RGB, before despill turns dark magenta shadows
        # into grey/green foreground. Restrict this to the lower leg/floor band.
        chroma_delta=entry.get('shadowChromaDelta',8)
        shadow=ground_shadow_mask(rgb,a[:,:,3],body.ground,chroma_delta)
        shadow_count+=int(((a[:,:,3]>0)&shadow).sum());a[shadow]=0
        rgba=Image.fromarray(a)
        sx,sy=w/768*2.5,h/768*2.5
        fixed=rgba.transform((320,320),Image.Transform.AFFINE,(sx,0,w/768*64-32*sx,0,sy,h/768*20-32*sy),Image.Resampling.BICUBIC)
        a=np.asarray(fixed).copy();labels,n=label_components(a[:,:,3]>64);areas=np.bincount(labels.ravel(),minlength=n+1)
        if n:
            largest=1+int(areas[1:].argmax());small=np.flatnonzero((areas<max(12,areas[largest]*.006))&(np.arange(len(areas))!=largest));small=small[small!=0]
            keep=(labels!=0)&~np.isin(labels,small)
            fringe=np.asarray(Image.fromarray(keep.astype('uint8')*255).filter(ImageFilter.MaxFilter(5)))>0;a[~fringe]=0
        observed=measure_body(a[:,:,3],2);hx=hip_x(a[:,:,3]>128,observed.ground,body.height)
        dx=round(target_x-hx);dy=round(target_y-observed.ground)
        grounded=Image.new('RGBA',(320,320));grounded.alpha_composite(Image.fromarray(a),(dx,dy))
        frames.append(grounded.resize((256,256),Image.Resampling.LANCZOS))
    anchor=[128,round(target_y*.8)]
    master_height=body.height*.8
    return dest,frames,anchor,master_height,shadow_count


def choose_window(frames,length):
    a=np.stack([np.asarray(im.resize((64,64)),dtype=np.float32)/255 for im in frames]);a[:,:,:,:3]*=a[:,:,:,3:4]
    choices=[]
    for start in range(2,len(frames)-length-1):
        end=start+length
        closure=float(np.abs(a[start]-a[end]).mean())
        velocity=float(np.abs((a[start+1]-a[start])-(a[end]-a[end-1])).mean())
        seam=float(np.abs(a[start]-a[end-1]).mean())
        choices.append((closure+.4*velocity+.1*seam,start,end))
    if not choices:raise ValueError('not enough video for the candidate cycle')
    score,start,end=min(choices)
    return start,end,score


def leg_period(frames,anchor,height):
    a=np.stack([np.asarray(f.resize((64,64)),dtype=np.float32)/255 for f in frames]);a[:,:,:,:3]*=a[:,:,:,3:4]
    y0=max(0,round((anchor[1]-height*.30)/4));y1=min(64,round(anchor[1]/4)+2)
    legs=a[:,y0:y1,8:56]
    values=[float(np.median(np.abs(legs[:-lag]-legs[lag:]).mean(axis=(1,2,3)))) for lag in range(10,41)]
    smooth=np.convolve(np.pad(values,(1,1),mode='edge'),[.25,.5,.25],mode='valid')
    minima=[i for i in range(1,len(smooth)-1) if smooth[i]<smooth[i-1] and smooth[i]<=smooth[i+1]]
    if not minima:return None,values
    best=min(smooth[i] for i in minima)
    eligible=[i for i in minima if smooth[i]<=best*1.2]
    return min(eligible)+10,values


def render(entry,dest,frames,anchor,height,length,label,shadow_count,window=None):
    start,end,score=window if window is not None else choose_window(frames,length)
    selected=frames[start:end]
    height=float(np.median([measure_body(np.asarray(im)[:,:,3],2).height for im in selected]))
    # One static centre correction to the authored master; no contact-frame x
    # recentering and no per-frame size normalization.
    count=len(selected);sheet=Image.new('RGBA',(1024,math.ceil(count/4)*256))
    for i,im in enumerate(selected):sheet.alpha_composite(im,(i%4*256,i//4*256))
    path=dest/f'{label}.png';sheet.save(path,optimize=True)
    previews=[]
    for im in selected:
        bg=Image.new('RGBA',(256,256),(220,220,210,255));scale=180/height
        im=im.resize((round(256*scale),round(256*scale)),Image.Resampling.LANCZOS)
        bg.alpha_composite(im,(round(128-anchor[0]*scale),round(240-anchor[1]*scale)));previews.append(bg.convert('RGB'))
    cycle_ms=entry.get('targetCycleMs',720)
    previews[0].save(dest/f'{label}.gif',save_all=True,append_images=previews[1:],duration=round(cycle_ms/count),loop=0)
    contact=Image.new('RGB',(1024,280),(32,40,45));draw=ImageDraw.Draw(contact)
    draw.text((4,4),f"{entry['cast']} {entry['direction']} {label} | consecutive {start}:{end} ({count} source frames)",fill='white')
    for i in range(16):
        im=selected[min(count-1,math.floor(i*count/16))];bg=Image.new('RGBA',(256,256),(220,220,210,255) if i<8 else (32,40,45,255));scale=180/height
        bg.alpha_composite(im.resize((round(256*scale),round(256*scale)),Image.Resampling.LANCZOS),(round(128-anchor[0]*scale),round(240-anchor[1]*scale)))
        contact.paste(bg.convert('RGB').resize((128,128)),(i%8*128,i//8*128+24))
    contact.save(dest/f'{label}-contact.jpg')
    return {'label':label,'directory':str(dest.relative_to(ROOT)),'sourceIndices':list(range(start,end)),
            'score':score,'shadowPixelsRemoved':shadow_count,'frames':count,'cell':256,'originX':anchor[0]/256,
            'originY':anchor[1]/256,'visibleHeight':height,'cycleMs':cycle_ms,'tilesPerCycle':entry.get('targetTilesPerCycle',4),'status':'candidate-needs-review'}


def job(entry):
    dest,frames,anchor,height,shadow=canonical_frames(entry)
    old=read(ROOT/entry['directory']/'ready.json');loop=read(ROOT/entry['directory']/'loop-v2/loop-report.json')
    period=loop.get('period',{}).get('T_frames')
    # The old phase estimator sometimes selected two repeats. Preserve two
    # explicit alternatives for inspection instead of pretending to know leg ID.
    detected,profile=leg_period(frames,anchor,height)
    length=round(period) if period else detected or old['sourceIndices'][-1]-old['sourceIndices'][0]+1
    length=PERIOD_OVERRIDES.get(entry['index'],max(12,min(40,length)))
    candidates=[render(entry,dest,frames,anchor,height,length,'cycle',shadow)]
    if 2*length<len(frames)-4:candidates.append(render(entry,dest,frames,anchor,height,2*length,'double',shadow))
    if length>26:candidates.append(render(entry,dest,frames,anchor,height,round(length/2),'half',shadow))
    write(dest/'candidates.json',{'index':entry['index'],'cast':entry['cast'],'direction':entry['direction'],
        'reported':REPORTED.get(entry['index']),'job_id':entry['job_id'],'legPeriod':detected,'lagProfile':profile,'candidates':candidates})
    return {'index':entry['index'],'candidateFrames':[c['frames'] for c in candidates]}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--indices',default='');args=parser.parse_args()
    plan=read(ROOT/'artifacts/walk-higgsfield-v2/plan.json');OUT.mkdir(exist_ok=True)
    write(OUT/'source-plan.json',plan)
    ids=[int(i) for i in args.indices.split(',')] if args.indices else list(range(48))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(job,[plan['jobs'][i] for i in ids]):print(json.dumps(result),flush=True)


if __name__=='__main__':main()
