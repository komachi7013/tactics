"""Existing-art head-width correction only. No gait regeneration or body warp."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v2'
OUT=ROOT/'artifacts/lise-s-head-local-v1'

def width(frames,m):
    values=[]
    for a in frames:
        world=280+(np.arange(a.shape[0])-m['masterGround'])*180/m['bodyReferenceHeight']
        yy,xx=np.where((a[:,:,3]>128)&(world[:,None]>=100)&(world[:,None]<=153))
        values.append(float(np.percentile(xx,99)-np.percentile(xx,1))*180/m['bodyReferenceHeight'])
    return float(np.median(values))

def main():
    rows=json.loads((WORK/'review-before.json').read_text())['rows']
    refs={d:next(r for r in rows if r['cast']=='lise' and r['direction']==d) for d in ['E','S']}
    frames={d:[np.asarray(Image.open(ROOT/refs[d]['directory'].lstrip('/')/f'frame_{i:03d}.png').convert('RGBA')) for i in range(19)] for d in refs}
    target=width(frames['E'],refs['E']['metadata']);before=width(frames['S'],refs['S']['metadata']);factor=target/before
    assert .8<=factor<=1
    m=refs['S']['metadata'];world=280+(np.arange(m['cell'])-m['masterGround'])*180/m['bodyReferenceHeight']
    t=np.clip((world-153)/12,0,1);blend=t*t*(3-2*t);row_factor=factor+(1-factor)*blend
    x=np.arange(m['cell'])[None,:];center=m['masterHeadCentroid'][0]
    sx=center+(x-center)/row_factor[:,None];x0=np.floor(sx).astype(int);weights=(sx-x0)[:,:,None];y=np.arange(m['cell'])[:,None]
    OUT.mkdir(exist_ok=True);result=[];protected=[]
    for i,a in enumerate(frames['S']):
        p=a.astype(float)/255;p[:,:,:3]*=p[:,:,3:4]
        left=p[y,np.clip(x0,0,m['cell']-1)].copy();right=p[y,np.clip(x0+1,0,m['cell']-1)].copy()
        left[(x0<0)|(x0>=m['cell'])]=0;right[(x0+1<0)|(x0+1>=m['cell'])]=0
        b=left*(1-weights)+right*weights;alpha=b[:,:,3:4]
        b[:,:,:3]=np.divide(b[:,:,:3],alpha,out=np.zeros_like(b[:,:,:3]),where=alpha>1e-8)
        b=np.rint(np.clip(b,0,1)*255).astype('uint8');b[world>=165]=a[world>=165]
        assert np.array_equal(b[world>=165],a[world>=165])
        protected.append(hashlib.sha256(a[world>=165].tobytes()).hexdigest());result.append(b)
        Image.fromarray(b).save(OUT/f'frame_{i:03d}.png')
    after=width(result,m);assert abs(after-target)<1
    sheet=Image.new('RGBA',(m['cell']*4,m['cell']*5))
    for i,a in enumerate(result):sheet.alpha_composite(Image.fromarray(a),(i%4*m['cell'],i//4*m['cell']))
    sheet.save(OUT/'walk.png')
    correction={'artSource':'existing','newGeneration':False,'costCredits':0,'type':'head horizontal width only','widthFactor':factor,'referenceDirection':'E',
        'headWidthBeforePx':before,'referenceHeadWidthPx':target,'headWidthAfterPx':after,'fullCorrectionThroughWorldY':153,'unchangedBelowWorldY':165,
        'lowerBodyFramesByteIdentical':19,'lowerBodySha256PerFrame':protected,'kneeFlexionRepaired':False,'sourceSheet':refs['S']['directory']+'/walk.png'}
    meta={**m,'headWidthCorrection':correction,'anatomicalGaitStatus':'known knee flexion remains; gait not repaired'}
    meta.pop('headAreaVariationCv',None)
    (OUT/'normalization.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
    (OUT/'verification.json').write_text(json.dumps(correction,ensure_ascii=False,indent=2)+'\n')
    proof=Image.new('RGB',(768,340),'#d5d6c8');draw=ImageDraw.Draw(proof)
    for n,(title,a,mm) in enumerate([('E reference',frames['E'][0],refs['E']['metadata']),('S before',frames['S'][0],m),('S head-width only',result[0],m)]):
        im=Image.fromarray(a);s=180/mm['bodyReferenceHeight'];im=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS)
        cell=Image.new('RGBA',(256,300));cell.alpha_composite(im,(round(128-mm['cell']*.5*s),round(280-mm['masterGround']*s)))
        proof.paste(cell,(n*256,30),cell);draw.text((n*256+5,5),title,fill='black')
        for yline in [100,280]:draw.line((n*256,yline+30,n*256+255,yline+30),fill='#819587')
    proof.save(OUT/'compare.png');print(json.dumps(correction,ensure_ascii=False))

if __name__=='__main__':main()
