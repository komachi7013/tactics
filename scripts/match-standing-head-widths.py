"""Match the three requested E/S head widths while retaining vertical landmarks.

Only horizontal sampling changes. Below the head/neck transition, pixels remain
identical. Target widths come from the user's selected reference directions.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/standing-cast-review-v1'
OUT=ROOT/'artifacts/standing-cast-repairs-local-v1'
SPECS=[('sena','E','iva','E'),('sena','S','iva','E'),
       ('iva','S','iva','E'),('dani','S','dani','E')]


def width(image,jaw):
    alpha=np.asarray(image)[96:jaw+1,:,3]
    yy,xx=np.where(alpha>128)
    return int(xx.max()+1-xx.min())


def resize_head_width(image,ratio,jaw):
    rgba=np.asarray(image).astype(np.float32)/255
    alpha=rgba[...,3:4]
    premult=np.concatenate((rgba[...,:3]*alpha,alpha),axis=2)
    yy,xx=np.indices(rgba.shape[:2])
    # The entire head gets one horizontal scale. Ease back to the original
    # neck width over 14 rows without changing any vertical coordinates.
    progress=np.clip((yy-jaw)/14,0,1)
    weight=(1+np.cos(progress*np.pi))/2
    scales=1+(ratio-1)*weight
    sx=(xx-128)/scales+128
    lo=np.floor(sx).astype(int)
    hi=lo+1
    valid_lo=(lo>=0)&(lo<image.width)
    valid_hi=(hi>=0)&(hi<image.width)
    t=(sx-lo)[...,None]
    sampled=premult[yy,lo.clip(0,image.width-1)]*(1-t)*valid_lo[...,None]+premult[yy,hi.clip(0,image.width-1)]*t*valid_hi[...,None]
    a=sampled[...,3:4]
    rgb=np.divide(sampled[...,:3],a,out=np.zeros_like(sampled[...,:3]),where=a>1e-6)
    result=np.round(np.clip(np.concatenate((rgb,a),axis=2),0,1)*255).astype('uint8')
    # Preserve even invisible RGB values outside the corrected head region.
    result[jaw+14:]=np.asarray(image)[jaw+14:]
    return Image.fromarray(result)


def main():
    active=json.loads((WORK/'repairs-active.json').read_text())
    manifest=json.loads((WORK/'manifest.json').read_text())
    guides=json.loads((WORK/'landmark-overrides.json').read_text())
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Unicode.ttf',17)
    board=Image.new('RGB',(1200,len(SPECS)*270),'#d5d6c8');dr=ImageDraw.Draw(board)
    qa=[]
    for row,(cast,target,reference_cast,reference) in enumerate(SPECS):
        record=active[cast+'/'+target]
        folder=OUT/cast/target
        path=folder/'head-width-matched.png'
        input_path=record['image']
        if input_path==str(path.relative_to(ROOT)):
            input_path=record['headWidthCorrection']['sourceImage']
        source=Image.open(ROOT/input_path).convert('RGBA')
        reference_record=next(r for r in manifest['rows'] if r['cast']==reference_cast and r['direction']==reference)
        reference_path=active.get(reference_cast+'/'+reference,{}).get('image',reference_record['original'].lstrip('/'))
        ref=Image.open(ROOT/reference_path).convert('RGBA')
        jaw=guides[cast+'/'+target]['jaw']
        before=width(source,jaw);wanted=width(ref,jaw)
        ratio=wanted/before
        # Choose the closest scale that also matches the displayed alpha width.
        candidates=[]
        for scale in [ratio,*np.linspace(ratio-.025,ratio+.025,41)]:
            candidate=resize_head_width(source,float(scale),jaw)
            candidates.append((abs(width(candidate,jaw)-wanted),abs(scale-ratio),float(scale),candidate))
        error,_,scale,result=min(candidates,key=lambda c:(c[0],c[1]))
        assert error==0,(cast,before,wanted,width(result,jaw))
        assert np.array_equal(np.asarray(source)[jaw+14:],np.asarray(result)[jaw+14:])
        sy,sx=np.where(np.asarray(source)[...,3]>128)
        ry,rx=np.where(np.asarray(result)[...,3]>128)
        assert int(sy.min())==int(ry.min())
        assert int(sy.max())==int(ry.max())
        result.save(path)
        correction={'referenceCast':reference_cast,'referenceDirection':reference,'sourceImage':input_path,
            'referenceImage':reference_path,'beforeWidthPx':before,'targetWidthPx':wanted,
            'afterWidthPx':width(result,jaw),'horizontalScale':scale,
            'verticalCoordinatesUnchanged':True,'unchangedPixelsFromRow':jaw+14,
            'alphaTopBefore':int(sy.min()),'alphaTopAfter':int(ry.min()),
            'alphaGroundBefore':int(sy.max()+1),'alphaGroundAfter':int(ry.max()+1),
            'method':'horizontal head-only resampling with a smooth neck transition',
            'measurement':'hair/head alpha silhouette through jaw row at alpha >128'}
        record.update({'image':str(path.relative_to(ROOT)),
            'label':record['label'].split('・頭幅')[0]+'・頭幅補正',
            'headWidthCorrection':correction,
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        (folder/'head-width-correction.json').write_text(json.dumps(correction,ensure_ascii=False,indent=2)+'\n')
        qa.append({'cast':cast,'target':target,**correction})
        for col,(image,label) in enumerate([(ref,reference_cast+' '+reference+' 基準'),(source,cast+' '+target+' 補正前'),(result,cast+' '+target+' 横幅補正')]):
            tile=Image.new('RGBA',(256,300),'#d5d6c8');tile.alpha_composite(image)
            crop=tile.crop((65,95,195,170)).resize((390,225),Image.Resampling.NEAREST)
            board.paste(crop.convert('RGB'),(col*400,row*270+25))
            dr.text((col*400+5,row*270+3),label,font=font,fill='#18282c')
        print(f'{cast} {target}: {before}px -> {wanted}px; reference {reference_cast} {reference}; body unchanged below {jaw+14}')
    (WORK/'repairs-active.json').write_text(json.dumps(active,ensure_ascii=False,indent=2)+'\n')
    (WORK/'head-width-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
    board.save(WORK/'audit/three-head-widths-corrected.png')


if __name__=='__main__':main()
