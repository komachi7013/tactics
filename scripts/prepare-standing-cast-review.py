"""Collect the actual 48 directional stills used as walk references.

Source art is immutable. Uniform full-figure framing is comparison registration,
not a certification that the heads or character designs match.
"""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/standing-cast-review-v1'
NAMES={'lise':'リセ','garan':'ガラン','neia':'ネイア','sena':'セナ','iva':'イヴァ','dani':'ダニ','guard':'ガード','archer':'アーチャー','vesk':'Vesk','toma':'トマ','worker':'労働者','delegation':'代表者'}

def guides(im):
    tile=Image.new('RGBA',(256,300),'#d5d6c8');tile.alpha_composite(im);draw=ImageDraw.Draw(tile)
    for y in [100,160,280]:draw.line((0,y,255,y),fill='#ae7948' if y==160 else '#819587')
    return tile

def main():
    before=json.loads((ROOT/'artifacts/walk-standard-v1/cast-review-v2/review-before.json').read_text())['rows']
    OUT.mkdir(exist_ok=True);records=[]
    for r in before:
        source=ROOT/r['metadata']['masterPath'];im=Image.open(source).convert('RGBA');a=np.asarray(im);ys,xs=np.where(a[:,:,3]>128)
        top=int(ys.min());ground=int(ys.max()+1);scale=180/(ground-top);center=(int(xs.min())+int(xs.max()+1))/2
        # A single similarity transform preserves every original proportion.
        framed=im.transform((256,300),Image.Transform.AFFINE,(1/scale,0,center-128/scale,0,1/scale,top-100/scale),Image.Resampling.BICUBIC)
        folder=OUT/'original'/r['cast']/r['direction'];folder.mkdir(parents=True,exist_ok=True);framed.save(folder/'standing.png')
        records.append({'index':r['index'],'cast':r['cast'],'name':NAMES[r['cast']],'direction':r['direction'],
            'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'original':'/'+str((folder/'standing.png').relative_to(ROOT)),
            'framing':{'type':'uniform similarity','sourceTop':top,'sourceGround':ground,'uniformScale':scale,'sourceCenterX':center,'targetTop':100,'targetGround':280},
            'headBottomOriginal':None,'status':'head proportions not aligned yet'})
    (OUT/'manifest.json').write_text(json.dumps({'guides':{'headTop':100,'headBottom':160,'ground':280},'source':'directional master stills used by the current walk set','rows':records},ensure_ascii=False,indent=2)+'\n')
    for cast in NAMES:
        contact=Image.new('RGB',(1024,330),'#d5d6c8');draw=ImageDraw.Draw(contact)
        for i,direction in enumerate(['N','E','S','W']):
            r=next(r for r in records if r['cast']==cast and r['direction']==direction);im=Image.open(ROOT/r['original'].lstrip('/'));contact.paste(guides(im).convert('RGB'),(i*256,25));draw.text((i*256+5,5),cast+' '+direction,fill='black')
        contact.save(OUT/f'{cast}-original.png')
    print('Collected 48 original standing images; no AI generation, no source edits.')

if __name__=='__main__':main()
