"""Key Higgsfield still proposals and compare without changing any walk art."""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'artifacts/lise-neia-s-design-v1'
spec=importlib.util.spec_from_file_location('head_review_key',ROOT/'.codex/skills/generate2dsprite/scripts/master_still.py')
key=importlib.util.module_from_spec(spec);sys.modules[spec.name]=key;spec.loader.exec_module(key)

def frame(im):
    a=np.asarray(im.convert('RGBA'));ys,xs=np.where(a[:,:,3]>128);assert len(ys)
    box=(int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1));s=180/(box[3]-box[1])
    out=Image.new('RGBA',(256,300));scaled=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS)
    out.alpha_composite(scaled,(round(128-(box[0]+box[2])/2*s),round(280-box[3]*s)))
    return out,{'sourceBodyBox':box,'uniformScale':s,'referenceBodyHeight':180,'headTopLine':100,'headComparisonLine':160,'soleLine':280}

def main():
    before=json.loads((ROOT/'artifacts/walk-standard-v1/cast-review-v2/review-before.json').read_text())['rows'];records=[]
    for cast in ['lise','neia']:
        for direction in ['E','S']:
            ref=next(r for r in before if r['cast']==cast and r['direction']==direction)
            folder=WORK/'references'/cast/direction;folder.mkdir(parents=True,exist_ok=True)
            im,info=frame(Image.open(ROOT/ref['metadata']['masterPath']).convert('RGBA'));im.save(folder/'display.png')
            (folder/'framing.json').write_text(json.dumps(info,indent=2)+'\n')
    for request in json.loads((WORK/'master-requests.json').read_text()):
        folder=WORK/'masters'/request['cast']/request['direction'];raw=folder/'generated.png'
        if not raw.exists():continue
        rgba,qa=key.key_subject(np.asarray(Image.open(raw).convert('RGBA')),'#FF00FF','soft')
        im=Image.fromarray(rgba);im.save(folder/'keyed.png');display,info=frame(im);display.save(folder/'display.png')
        (folder/'matte.json').write_text(json.dumps(qa,indent=2)+'\n');(folder/'framing.json').write_text(json.dumps(info,indent=2)+'\n')
        records.append({'index':request['index'],'cast':request['cast'],'direction':request['direction'],'status':'still proposal only; not gait approved','framing':info,'matte':qa})
    (WORK/'review.json').write_text(json.dumps({'credits':8.25,'walkAssetsChanged':False,'rows':records},ensure_ascii=False,indent=2)+'\n')
    for cast in ['lise','neia']:
        cards=[('E original',WORK/'references'/cast/'E/display.png'),('S original',WORK/'references'/cast/'S/display.png'),('S Higgsfield still',WORK/'masters'/cast/'S/display.png')]
        if (WORK/'masters'/cast/'E/display.png').exists():cards.insert(1,('E Higgsfield still',WORK/'masters'/cast/'E/display.png'))
        sheet=Image.new('RGB',(256*len(cards),330),'#d5d6c8');draw=ImageDraw.Draw(sheet)
        for i,(title,path) in enumerate(cards):
            im=Image.open(path);sheet.paste(im,(i*256,25),im);draw.text((i*256+5,5),title,fill='black')
            for line in [100,160,280]:draw.line((i*256,line+25,(i+1)*256-1,line+25),fill='#af8052' if line==160 else '#819587')
        sheet.save(WORK/f'{cast}-comparison.png')
    print(json.dumps({'stillsPrepared':len(records),'newGenerationInThisScript':False}))

if __name__=='__main__':main()
