"""Match the two previously identified W palette errors to their N references.

Material masks retain original alpha, silhouette and all five landmark positions.
Hue/saturation/value median ratios preserve the original painted light variation.
"""
import colorsys
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/standing-cast-review-v1'
OUT=ROOT/'artifacts/standing-cast-repairs-local-v1'


def masks(image,cast):
    hsv=np.asarray(image.convert('RGB').convert('HSV')).astype(float)/255
    h,s,v=hsv.transpose(2,0,1);y,x=np.indices(h.shape);opaque=np.asarray(image)[...,3]>180
    if cast=='toma':
        regions={
            'hair':(y<156)&(h>.02)&(h<.15)&(s>.20)&(v<.80),
            'coat':(y>=155)&(y<236)&(h>.48)&(h<.72)&(s>.10),
            'pants':(y>=233)&(y<251)&(s<.34)&(v<.65),
            'boots':(y>=249)&(h>.02)&(h<.16)&(s>.24),
        }
    else:
        coat_roi=((x>=102)&(x<=154)&(y>=149)&(y<235))|((y>=211)&(y<235)&(x>=88)&(x<169))|((y>=155)&(y<182)&(x>=88)&(x<169))
        regions={
            'hair':(y<148)&(h>.025)&(h<.15)&(s>.035)&(s<.43)&(v<.94),
            'coat':coat_roi&(h>.005)&(h<.105)&(s>.35)&(v<.9),
            'scarf':(y>=140)&(y<189)&(h>=.105)&(h<.22)&(s>.18),
            'pants':(y>=235)&(y<252)&(s<.36)&(v<.70),
            'boots':(y>=250)&(h>.015)&(h<.17)&(s>.18),
        }
    return hsv,{k:opaque&m for k,m in regions.items()}


def main():
    active=json.loads((WORK/'repairs-active.json').read_text())
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Unicode.ttf',16)
    board=Image.new('RGB',(1024,660),'#d5d6c8');dr=ImageDraw.Draw(board)
    for row,cast in enumerate(['toma','delegation']):
        key=cast+'/W';record=active[key];source=Image.open(OUT/cast/'W/five-point-aligned.png').convert('RGBA')
        reference=Image.open(WORK/'original'/cast/'N/standing.png').convert('RGBA')
        src,src_masks=masks(source,cast);ref,ref_masks=masks(reference,cast)
        y,x=np.indices(src.shape[:2]);opaque=np.asarray(source)[...,3]>0
        # Broad geometric material regions avoid threshold speckling inside hair
        # and trousers. Skin in the visible profile is excluded from the hair.
        src_masks['hair']=opaque&(y<148 if cast=='delegation' else y<156)&~((x<119)&(y>132))
        src_masks['pants']=opaque&(y>=235)&(y<251)
        ref_masks['pants']=(np.asarray(reference)[...,3]>180)&(y>=235)&(y<251)
        if cast=='delegation':
            rh,rs,rv=ref.transpose(2,0,1)
            ref_masks['scarf']=(np.asarray(reference)[...,3]>180)&(y>=143)&(y<161)&(rh>.05)&(rh<.22)&(rs>.15)
        rgb=np.asarray(source.convert('RGB')).astype(float)/255;changes={}
        for material,mask in src_masks.items():
            if mask.sum()<12 or ref_masks[material].sum()<12:continue
            median=np.median(src[mask],axis=0);target=np.median(ref[ref_masks[material]],axis=0)
            dh=float(np.clip(target[0]-median[0],-.08,.08))
            sr=float(np.clip(target[1]/max(median[1],.02),.6,1.5))
            vr=float(np.clip(target[2]/max(median[2],.02),.45,1.5))
            weight=np.asarray(Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.1))).astype(float)/255
            region=weight>.001
            values=src[region].copy();values[:,0]=(values[:,0]+dh)%1;values[:,1]=np.clip(values[:,1]*sr,0,1);values[:,2]=np.clip(values[:,2]*vr,0,1)
            corrected=np.array([colorsys.hsv_to_rgb(*v) for v in values]);t=weight[region,None]
            rgb[region]=rgb[region]*(1-t)+corrected*t
            changes[material]={'pixels':int(mask.sum()),'hueShift':dh,'saturationRatio':sr,'valueRatio':vr}
        result=Image.fromarray(np.dstack((np.round(np.clip(rgb,0,1)*255).astype('uint8'),np.asarray(source)[...,3])))
        assert np.array_equal(np.asarray(source)[...,3],np.asarray(result)[...,3])
        path=OUT/cast/'W/material-colour-matched.png';result.save(path)
        record.update({'image':str(path.relative_to(ROOT)),'label':'N基準・5点補正＋色調整案',
            'colourAdjustments':changes,'colourReference':'N','alphaPixelsUnchangedByColourAdjustment':True,
            'status':'geometry aligned; material-colour correction candidate; equipment differences remain',
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        (OUT/cast/'W/material-colour-review.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
        for col,(im,label) in enumerate([(reference,'N基準'),(source,'W 色修正前'),(result,'W 色修正案')]):
            tile=Image.new('RGBA',(256,300),'#d5d6c8');tile.alpha_composite(im);board.paste(tile.convert('RGB'),(col*320,row*330+25));dr.text((col*320+5,row*330+3),cast+' '+label,font=font,fill='black')
    (WORK/'repairs-active.json').write_text(json.dumps(active,ensure_ascii=False,indent=2)+'\n')
    board.save(WORK/'audit/toma-delegation-colour-candidates.png')
    print('Two W material-colour candidates saved; alpha and geometry unchanged.')


if __name__=='__main__':main()
