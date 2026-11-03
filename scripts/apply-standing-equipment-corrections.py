"""Publish seven generated accessory edits through protected local masks.

The original head, stance and limbs remain the comparison source. Generated
pixels supply only the straps, vacated accessory areas and relocated objects.
"""
import hashlib
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/standing-cast-review-v1'
TOOLS=runpy.run_path(str(ROOT/'scripts/align-standing-direction-pairs.py'))

# Coordinates use the registered 256x300 canvas. Native waist points are
# visually annotated before fitting; output points come from the approved pair.
SPECS={
 'toma/E':{'waist':198,'jaw':155,'knee':239,'polygons':[
   [(108,156),(122,160),(146,192),(145,203),(132,199),(108,172)],
   [(146,157),(157,163),(148,183),(130,201),(109,216),(102,208),(125,183)]],
   'rects':[(90,193,123,231),(146,192,169,229)],
   'hands':[(93,188,112,217),(153,190,168,216)],'top':156,'bottom':234},
 'toma/S':{'waist':198,'jaw':155,'knee':239,'polygons':[
   [(107,156),(121,158),(145,191),(147,205),(135,203),(110,176)],
   [(147,156),(158,163),(147,183),(130,202),(111,219),(102,211),(126,182)]],
   'rects':[(90,192,123,232),(139,191,171,232)],
   'hands':[(90,189,108,217),(153,190,171,218)],'top':156,'bottom':234},
 'garan/S':{'waist':196,'jaw':155,'knee':239,'polygons':[],
   'rects':[(91,183,117,242),(136,182,166,242)],
   'hands':[(89,190,110,213)],'top':180,'bottom':244,
   'protectPolygons':[[(158,176),(174,181),(179,203),(174,220),(156,223),(147,213),(147,190)]]},
 'sena/W':{'waist':190,'jaw':152,'knee':237,'polygons':[],
   'rects':[(96,188,131,226),(142,185,174,231)],
   'hands':[(89,188,107,218),(156,188,174,218)],'top':184,'bottom':233},
 'iva/W':{'waist':185,'jaw':157,'knee':239,'polygons':[],
   'rects':[(97,185,130,228),(144,186,175,230)],
   'hands':[],'top':183,'bottom':232,
   'protectPolygons':[[(96,183),(105,189),(104,206),(99,217),(90,212),(91,197)],
                      [(159,185),(169,192),(172,210),(166,217),(159,209)]]},
 'archer/S':{'waist':199,'jaw':158,'knee':239,'polygons':[],
   'rects':[(93,192,121,229),(146,193,174,230)],
   'hands':[],'top':190,'bottom':232,
   'protectPolygons':[[(108,177),(119,178),(155,219),(155,231),(144,233),(112,199),(103,187)]]},
 'lise/S':{'waist':195,'jaw':156,'knee':235,'polygons':[
   [(136,158),(148,164),(136,182),(116,202),(109,225),(98,222),(101,195),(119,177)]],
   'rects':[(94,197,123,233)],'hands':[(90,200,106,218)],'skinSaturationMin':.32,'top':158,'bottom':234,
   'protectRects':[(136,199,164,232)],'protectEllipses':[(106,184,121,198)]}
}


def main():
    active=json.loads((WORK/'repairs-active.json').read_text())
    records=json.loads((WORK/'equipment-edit-records.json').read_text())
    guides=json.loads((WORK/'landmark-overrides.json').read_text())
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Unicode.ttf',15)
    board=Image.new('RGB',(1024,4*330),'#d5d6c8');bd=ImageDraw.Draw(board)
    qa=[]
    for i,r in enumerate(records):
        cast,d=r['cast'],r['direction'];key=cast+'/'+d;spec=SPECS[key]
        folder=ROOT/r['generated'];folder=folder.parent
        output=folder/'equipment-corrected.png'
        record=dict(active.get(key,{}))
        base_path=record.get('image',r['sourceActiveImage'])
        if base_path==str(output.relative_to(ROOT)):base_path=record['equipmentCorrection']['sourceImage']
        base=Image.open(ROOT/base_path).convert('RGBA')
        generated=Image.open(ROOT/r['normalized']).convert('RGBA')
        target=guides[key]['landmarks']
        patch=TOOLS['warp'](generated,[0,100,spec['jaw'],spec['waist'],spec['knee'],280,300],
            [0,target['head'],target['jaw'],target['waist'],target['knee'],280,300])
        mask=Image.new('L',(256,300));md=ImageDraw.Draw(mask)
        for rect in spec['rects']:md.rectangle(rect,fill=255)
        for poly in spec['polygons']:md.polygon(poly,fill=255)
        mask=mask.filter(ImageFilter.GaussianBlur(.45))
        weights=np.asarray(mask).astype(float)/255
        weights[:spec['top']]=0;weights[spec['bottom']:]=0
        original=np.asarray(base);hsv=np.asarray(base.convert('RGB').convert('HSV')).astype(float)/255
        h,s,v=hsv.transpose(2,0,1)
        skin=((h>.025)&(h<.14)&(s>spec.get('skinSaturationMin',.15))&(s<.72)&(v>.56))|((h>.48)&(h<.76)&(s>.2)&(v>.2))
        hand_mask=np.zeros((300,256),dtype=bool)
        for x0,y0,x1,y1 in spec['hands']:hand_mask[y0:y1,x0:x1]=True
        preserve=Image.new('L',(256,300));pd=ImageDraw.Draw(preserve)
        for poly in spec.get('protectPolygons',[]):pd.polygon(poly,fill=255)
        for rect in spec.get('protectRects',[]):pd.rectangle(rect,fill=255)
        for ellipse in spec.get('protectEllipses',[]):pd.ellipse(ellipse,fill=255)
        protected=(np.asarray(preserve)>0)&(original[...,3]>0)
        protected|=hand_mask&skin&(original[...,3]>180)
        weights[protected]=0
        p=np.asarray(patch).astype(float)/255;b=original.astype(float)/255
        pa=p[...,3:4];ba=b[...,3:4];t=weights[...,None]
        alpha=pa*t+ba*(1-t)
        premult=p[...,:3]*pa*t+b[...,:3]*ba*(1-t)
        rgb=np.divide(premult,alpha,out=np.zeros_like(premult),where=alpha>1e-6)
        array=np.round(np.clip(np.concatenate((rgb,alpha),axis=2),0,1)*255).astype('uint8')
        array[weights==0]=original[weights==0]
        assert np.array_equal(array[:spec['top']],original[:spec['top']])
        assert np.array_equal(array[spec['bottom']:],original[spec['bottom']:])
        assert np.array_equal(array[protected],original[protected])
        result=Image.fromarray(array);result.save(output)
        correction={'sourceImage':base_path,'generatedImage':r['generated'],
            'anatomicalPlacement':'right hip','headPixelsPreservedThroughRow':spec['top']-1,
            'lowerBodyPixelsPreservedFromRow':spec['bottom'],
            'protectedAccessoryAndLimbPixelsUnchanged':True,
            'fivePointCoordinates':target,'higgsfieldAdditionalCredits':0,
            'status':'protected accessory edit; visual review candidate'}
        record.update({'cast':cast,'direction':d,'image':str(output.relative_to(ROOT)),
            'jaw':target['jaw'],'landmarks':target,
            'label':record.get('label','基準画像').split('・右腰の装備補正')[0]+'・右腰の装備補正',
            'equipmentCorrection':correction,'status':'equipment correction candidate; head and lower body retained',
            'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
        active[key]=record;qa.append({'cast':cast,'direction':d,**correction})
        (folder/'equipment-correction.json').write_text(json.dumps(correction,ensure_ascii=False,indent=2)+'\n')
        row,col=divmod(i,2)
        for side,(im,label) in enumerate([(base,'修正前'),(result,'装備修正案')]):
            tile=Image.new('RGBA',(256,300),'#d5d6c8');tile.alpha_composite(im)
            board.paste(tile.convert('RGB'),(col*512+side*256,row*330+25))
            bd.text((col*512+side*256+5,row*330+3),key+' '+label,font=font,fill='#18282c')
    (WORK/'repairs-active.json').write_text(json.dumps(active,ensure_ascii=False,indent=2)+'\n')
    (WORK/'equipment-corrections-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
    board.save(WORK/'audit/equipment-protected-review.png')
    print('Seven protected equipment composites prepared; heads, lower legs, book/shield/weapon protection checks passed.')


if __name__=='__main__':main()
