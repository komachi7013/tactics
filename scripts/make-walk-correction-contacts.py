"""Render every corrected frame at a useful inspection size with fixed guides."""
import json
from pathlib import Path
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v2'
for j in json.loads((WORK/'retakes.json').read_text())['jobs']:
    d=WORK/'normalized'/j['cast']/j['direction'];path=d/'normalization.json'
    if not path.exists():continue
    m=json.loads(path.read_text())
    if m['job_id']!=j.get('job_id'):continue
    sheet=Image.new('RGB',(960,800),'#d5d6c8');draw=ImageDraw.Draw(sheet)
    draw.text((4,3),f"{j['index']} {j['cast']} {j['direction']} - all 19 frames / 800 ms",fill='black')
    for i in range(19):
        im=Image.open(d/f'frame_{i:03d}.png');cell=Image.new('RGBA',(256,300));s=180/m['bodyReferenceHeight']
        im=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS)
        cell.alpha_composite(im,(round(128-m.get('cell',256)*.5*s),round(280-m['masterGround']*s)))
        cell=cell.resize((160,188),Image.Resampling.LANCZOS);x=i%5*192;y=i//5*192+26
        sheet.paste(cell,(x,y),cell);draw.text((x+4,y+1),str(i),fill='black')
        for line in (100,280):draw.line((x,y+round(line*188/300),x+160,y+round(line*188/300)),fill='#819587')
    sheet.save(d/'inspection.jpg',quality=95)
    print(j['index'],d/'inspection.jpg')
