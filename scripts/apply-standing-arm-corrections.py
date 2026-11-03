"""Apply the two requested straight-arm poses through local protected masks."""
import hashlib
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/standing-cast-review-v1'
OUT=ROOT/'artifacts/standing-cast-repairs-local-v1'
WARP=runpy.run_path(str(ROOT/'scripts/align-standing-direction-pairs.py'))['warp']
SPECS={
 'dani/E':{'jaw':155,'waist':198,'knee':238,'top':160,'bottom':230,
   'polygon':[(104,160),(128,162),(140,172),(140,187),(130,196),(123,208),(120,224),(106,226),(99,211),(95,197),(93,183),(98,168)]},
 'vesk/W':{'jaw':145,'waist':184,'knee':244,'top':151,'bottom':231,
   'polygon':[(106,152),(118,157),(119,183),(118,208),(114,227),(102,229),(95,216),(91,202),(80,199),(79,184),(91,173),(99,159)]}
}


def main():
    active=json.loads((WORK/'repairs-active.json').read_text())
    manifest=json.loads((WORK/'manifest.json').read_text())
    guides=json.loads((WORK/'landmark-overrides.json').read_text())
    board=Image.new('RGB',(1024,330),'#d5d6c8');bd=ImageDraw.Draw(board)
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Unicode.ttf',15);qa=[]
    for i,(key,spec) in enumerate(SPECS.items()):
        cast,d=key.split('/');folder=OUT/cast/d;output=folder/'arm-straight-corrected.png'
        record=dict(active.get(key,{}));original_record=next(r for r in manifest['rows'] if r['cast']==cast and r['direction']==d)
        source=record.get('image',original_record['original'].lstrip('/'))
        if source==str(output.relative_to(ROOT)):source=record['armCorrection']['sourceImage']
        base=Image.open(ROOT/source).convert('RGBA');base.save(folder/'arm-before.png')
        generated=Image.open(folder/'arm-generated.png').convert('RGBA');a=np.asarray(generated);yy,xx=np.where(a[...,3]>128);top=int(yy.min());ground=int(yy.max()+1);scale=180/(ground-top)
        target=guides[key]['landmarks'];sy,sx=np.where((a[...,3]>128)&(np.indices(a.shape[:2])[0]<top+(target['jaw']-100)/scale));bc=np.where(np.asarray(base)[100:target['jaw']+1,:,3]>128)[1]
        center=(int(sx.min())+int(sx.max()+1))/2;target_center=(int(bc.min())+int(bc.max()+1))/2
        normalized=generated.transform((256,300),Image.Transform.AFFINE,(1/scale,0,center-target_center/scale,0,1/scale,top-100/scale),Image.Resampling.BICUBIC)
        patch=WARP(normalized,[0,100,spec['jaw'],spec['waist'],spec['knee'],280,300],[0,100,target['jaw'],target['waist'],target['knee'],280,300])
        mask=Image.new('L',(256,300));ImageDraw.Draw(mask).polygon(spec['polygon'],fill=255);mask=mask.filter(ImageFilter.GaussianBlur(.5));weights=np.asarray(mask).astype(float)/255;weights[:spec['top']]=0;weights[spec['bottom']:]=0
        original=np.asarray(base);p=np.asarray(patch).astype(float)/255;b=original.astype(float)/255;t=weights[...,None];pa=p[...,3:4];ba=b[...,3:4];alpha=pa*t+ba*(1-t);premult=p[...,:3]*pa*t+b[...,:3]*ba*(1-t);rgb=np.divide(premult,alpha,out=np.zeros_like(premult),where=alpha>1e-6)
        result=np.round(np.clip(np.concatenate((rgb,alpha),axis=2),0,1)*255).astype('uint8');result[weights==0]=original[weights==0]
        assert np.array_equal(result[:spec['top']],original[:spec['top']])
        assert np.array_equal(result[spec['bottom']:],original[spec['bottom']:])
        Image.fromarray(result).save(output)
        correction={'sourceImage':source,'anatomicalArm':'right' if cast=='dani' else 'left','pose':'straight downward beside torso',
            'headPixelsPreservedThroughRow':spec['top']-1,'lowerBodyPixelsPreservedFromRow':spec['bottom'],
            'outsideArmMaskPixelsUnchanged':True,'higgsfieldAdditionalCredits':0}
        record.update({'cast':cast,'direction':d,'image':str(output.relative_to(ROOT)),'jaw':target['jaw'],'landmarks':target,
            'label':record.get('label','基準画像').split('・腕を下ろす補正')[0]+'・腕を下ろす補正',
            'armCorrection':correction,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
        active[key]=record;qa.append({'cast':cast,'direction':d,**correction})
        for side,(im,label) in enumerate([(base,'前'),(Image.fromarray(result),'腕補正案')]):
            tile=Image.new('RGBA',(256,300),'#d5d6c8');tile.alpha_composite(im);board.paste(tile.convert('RGB'),(i*512+side*256,25));bd.text((i*512+side*256+4,4),key+' '+label,font=font,fill='#18282c')
    (WORK/'repairs-active.json').write_text(json.dumps(active,ensure_ascii=False,indent=2)+'\n')
    (WORK/'arm-corrections-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
    board.save(WORK/'audit/arm-corrections-review.png')
    print('Dani E right arm and Vesk W left arm corrected locally; head/lower-body pixel protection passed.')


if __name__=='__main__':main()
