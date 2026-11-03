"""Register decoded source to the approved still's head, never a moving boot.

One source-to-master scale per clip; common small root motion; no per-frame
bounding-box resize. This does not repair or certify anatomical leg motion.
"""
import argparse
import concurrent.futures
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw,ImageFilter

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('revise',ROOT/'scripts/revise-higgsfield-walks.py')
revise=importlib.util.module_from_spec(spec);spec.loader.exec_module(revise)


def head_feature(a,band):
    mask=a[:,:,3]>128;ys,xs=np.where(mask)
    # Thin bow/staff tips and isolated hair wisps are not a head-size anchor.
    dense=np.flatnonzero(mask.sum(axis=1)>max(3,band*.20))
    top=int(dense[0] if len(dense) else ys.min())
    rows=np.arange(a.shape[0])[:,None];head=mask&(rows>=top)&(rows<top+band)
    yy,xx=np.where(head)
    return np.array([xx.mean(),yy.mean()]),len(xx)


def normalize(source,indices,master_path,out,phase_offset=0,keyed_directory='keyed-v2',padding=0):
    out.mkdir(parents=True,exist_ok=True)
    master=Image.open(master_path).convert('RGBA');ma=np.asarray(master)
    body=revise.measure_body(ma[:,:,3],2);ref,ref_area=head_feature(ma,round(body.height*.28))
    clean=sorted((source/keyed_directory/'frames-clean').glob('*.png'));raw=sorted((source/keyed_directory/'frames-raw').glob('*.png'))
    decoded=[];features=[];areas=[]
    for i in indices:
        a=np.asarray(Image.open(clean[i]).convert('RGBA')).copy()
        rgb=np.asarray(Image.open(raw[i]).convert('RGB'),dtype=np.int16)
        shadow=revise.ground_shadow_mask(rgb,a[:,:,3],body.ground,45);a[shadow]=0
        labels,n=revise.label_components(a[:,:,3]>64);sizes=np.bincount(labels.ravel(),minlength=n+1)
        keep=(labels>0)&(sizes[labels]>max(12,float(sizes[1:].max())*.005))
        fringe=np.asarray(Image.fromarray(keep.astype('uint8')*255).filter(ImageFilter.MaxFilter(5)))>0;a[~fringe]=0
        decoded.append(a)
    median_h=float(np.median([revise.measure_body(a[:,:,3],2).height for a in decoded]))
    for a in decoded:
        pos,area=head_feature(a,round(median_h*.28));features.append(pos);areas.append(area)
    scale=math.sqrt(ref_area/float(np.median(areas)))
    assert scale<1,'must rebuild from high-resolution decoded video, never upscale finished frames'
    frames=[];head_positions=[];edge=0
    for i,(a,pos) in enumerate(zip(decoded,features)):
        phase=(i/len(indices)-phase_offset)%1
        root=np.array([body.height*.004*math.sin(2*math.pi*phase),
                       -body.height*.008*(1-math.cos(4*math.pi*phase))/2])
        im=Image.fromarray(a).resize((round(a.shape[1]*scale),round(a.shape[0]*scale)),Image.Resampling.LANCZOS)
        cell=256+2*padding
        result=Image.new('RGBA',(cell,cell));delta=ref+root-pos*scale+padding
        result.alpha_composite(im,(round(delta[0]),round(delta[1])))
        arr=np.asarray(result);edge+=sum(int((e>4).sum()) for e in [arr[0,:,3],arr[-1,:,3],arr[:,0,3],arr[:,-1,3]])
        hp,_=head_feature(arr,round(body.height*.28));head_positions.append(hp.tolist());frames.append(result)
        result.save(out/f'frame_{i:03d}.png')
    sheet=Image.new('RGBA',(cell*4,math.ceil(len(frames)/4)*cell))
    for i,f in enumerate(frames):sheet.alpha_composite(f,(i%4*cell,i//4*cell))
    sheet.save(out/'walk.png')
    contact=Image.new('RGB',(len(frames)*128,160),'#20343a');draw=ImageDraw.Draw(contact)
    for i,f in enumerate(frames):
        bg=Image.new('RGBA',f.size,'#d5d6c8');bg.alpha_composite(f);contact.paste(bg.convert('RGB').resize((128,128)),(i*128,24));draw.text((i*128+4,4),str(i),fill='white')
    contact.save(out/'contact.jpg',quality=94)
    y=np.array(head_positions)[:,1]*90/body.height
    data={'normalizationVersion':2,'source':str(source.relative_to(ROOT)),'sourceIndices':indices,'sourceToMasterScale':scale,
          'headAreaVariationCv':float(np.std(areas)/np.mean(areas)),
          'cell':cell,'canvasPadding':padding,'bodyReferenceHeight':body.height,'masterGround':body.ground+padding,'masterHeadCentroid':(ref+padding).tolist(),
          'masterPath':str(master_path.relative_to(ROOT)),'sourcePhaseOffset':phase_offset,'rootAnchor':'approved master head centroid',
          'sourceHeadYDriftDisplayPx':float(np.ptp(np.array(features)[:,1])*scale*90/body.height),
          'finalHeadYDriftDisplayPx':float(np.ptp(y)),'edgePixels':edge,'frames':len(frames),
          'cycleMs':800,'tilesPerCycle':1,'anatomicalGaitStatus':'not-certified-by-registration'}
    (out/'normalization.json').write_text(json.dumps(data,indent=2)+'\n')
    return data


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--pilot',action='store_true');parser.add_argument('--cast',default='garan');parser.add_argument('--common-work',type=Path);args=parser.parse_args()
    out=ROOT/'artifacts/walk-standard-v1/root-normalization'
    if args.common_work:
        work=args.common_work.resolve();jobs=json.loads((work/'retakes.json').read_text())['jobs'];results=[]
        def common_job(j):
            if j.get('localBodyOnly'):return
            candidate=work/j['cast']/j['direction']/'candidates.json'
            if not candidate.exists():return
            c=json.loads(candidate.read_text())
            if c['job_id']!=j.get('job_id'):return
            dest=work/'normalized'/j['cast']/j['direction'];prior=dest/'normalization.json'
            if prior.exists():
                previous=json.loads(prior.read_text())
                if (previous.get('job_id')==j['job_id'] and previous.get('normalizationVersion')==2
                    and previous.get('sourceIndices')==c['candidates'][0]['sourceIndices']
                    and previous.get('canvasPadding')==32):return
            d=normalize(ROOT/j['directory'],c['candidates'][0]['sourceIndices'],ROOT/j['directory']/'master.png',dest,0,j.get('keyedDirectory','keyed-v2'),padding=32)
            d.update(index=j['index'],cast=j['cast'],direction=j['direction'],job_id=j['job_id'])
            prior.write_text(json.dumps(d,indent=2)+'\n');results.append(d);print(json.dumps(d),flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(common_job,jobs))
        return
    elif args.pilot:
        work=ROOT/'artifacts/walk-standard-v1/pilot';j=json.loads((work/'retakes.json').read_text())['jobs'][0]
        c=json.loads((work/'garan/E/candidates.json').read_text())['candidates'][0]
        print(json.dumps(normalize(ROOT/j['directory'],c['sourceIndices'],ROOT/j['directory']/'master.png',out/'pilot-garan-E',
                                   0 if j.get('commonDrivingCycles') else 5/13,j.get('keyedDirectory','keyed-v2'))))
    else:
        manifest=json.loads((ROOT/'src/view/walk-v2.json').read_text())
        jobs=[]
        for cast,ds in manifest.items():
            if args.cast!='all' and cast!=args.cast:continue
            for direction,a in ds.items():
                m=json.loads((ROOT/('public'+a['path'].replace('.png','.json'))).read_text());source=ROOT/m['sourceDirectory']
                offset=m.get('gaitContacts',{}).get('contacts',[{'frame':0}])[0]['frame']/a['frames']
                jobs.append((cast,direction,source,m['sourceIndices'],offset))
        def job(j):
            cast,direction,source,ids,offset=j
            d=normalize(source,ids,source/'master.png',out/f'{cast}-{direction}',offset)
            result={'cast':cast,'direction':direction,**d};print(json.dumps(result),flush=True);return result
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(job,jobs))
        (out/'index.json').write_text(json.dumps({'status':'registration-only-not-gait-approved','jobs':results},indent=2)+'\n')


if __name__=='__main__':main()
