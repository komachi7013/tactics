"""Key repaired directional stills and prepare fixed-canvas review inputs."""
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v2'
spec=importlib.util.spec_from_file_location('master_still_repair',ROOT/'.codex/skills/generate2dsprite/scripts/master_still.py')
master=importlib.util.module_from_spec(spec);sys.modules[spec.name]=master;spec.loader.exec_module(master)


def main():
    before=json.loads((WORK/'review-before.json').read_text())['rows']
    contact=Image.new('RGB',(768,330*9),'#d5d6c8');draw=ImageDraw.Draw(contact)
    records=[]
    for k,r in enumerate(json.loads((WORK/'master-requests.json').read_text())):
        folder=WORK/'masters'/r['cast']/r['direction'];raw=folder/'generated.png'
        if not raw.exists():continue
        pixels=np.asarray(Image.open(raw).convert('RGBA'));rgba,qa=master.key_subject(pixels,'#FF00FF','soft')
        keyed=Image.fromarray(rgba);keyed.save(folder/'keyed.png');bbox=keyed.getbbox();assert bbox
        x0,y0,x1,y1=bbox;scale=200/(y1-y0);image=keyed.resize((round(keyed.width*scale),round(keyed.height*scale)),Image.Resampling.LANCZOS)
        out=Image.new('RGBA',(256,256));out.alpha_composite(image,(round(128-(x0+x1)*scale/2),round(240-y1*scale)));out.save(folder/'master.png')
        inp=Image.new('RGBA',(1152,1152),'#ff00ff');inp.alpha_composite(out.resize((640,640),Image.Resampling.LANCZOS),(256,212));inp.convert('RGB').save(folder/'input.png')
        (folder/'matte.json').write_text(json.dumps(qa,indent=2)+'\n')
        for col,(d,label) in enumerate([('E','identity E'),(r['direction'],'before'),(None,'repaired')]):
            if d is None:im=out;s=.9;ground=240
            else:
                m=next(x['metadata'] for x in before if x['cast']==r['cast'] and x['direction']==d);im=Image.open(ROOT/m['masterPath']).convert('RGBA');s=180/m['bodyReferenceHeight'];ground=m['masterGround']-m.get('canvasPadding',0)
            tile=Image.new('RGBA',(256,300),'#d5d6c8');td=ImageDraw.Draw(tile)
            for y in [100,280]:td.line([(0,y),(255,y)],fill='#819587')
            im=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS);tile.alpha_composite(im,(round(128-128*s),round(280-ground*s)));contact.paste(tile.convert('RGB'),(col*256,k*330+24));draw.text((col*256+5,k*330+5),r['cast']+' '+r['direction']+' '+label,fill='black')
        records.append({'index':r['index'],'cast':r['cast'],'direction':r['direction'],'directory':str(folder.relative_to(ROOT)),'status':'needs-visual-review','matte':qa})
    contact.save(WORK/'master-comparison.jpg',quality=96)
    (WORK/'master-processing.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps({'prepared':len(records)}))

if __name__=='__main__':main()
