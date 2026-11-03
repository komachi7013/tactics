"""Show a failed direction transfer honestly; never label it a walk reference."""
import importlib.util
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'
ISSUES = {
    'N': '背面Nの立ち絵に対し、生成結果は顔の見える正面寄りの向き。Eの姿勢が混入。',
    'S': '左向きSの立ち絵に対し、生成結果は右向き。参照したEの向きが混入。',
    'W': '右側にあるカバンが、生成結果では反対側に大きく現れる。Eの装備配置が混入。',
}


def main():
    spec = importlib.util.spec_from_file_location('cycle', ROOT/'scripts/package-standing-walk-cycle.py')
    cycle = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cycle)
    guides = json.loads((ROOT/'artifacts/standing-cast-review-v1/landmark-overrides.json').read_text())
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', 16)
    board = Image.new('RGB', (1024, 3*340), '#20343a')
    draw = ImageDraw.Draw(board)
    for row, (direction, issue) in enumerate(ISSUES.items()):
        folder = WORK/'lise'/direction/'motion-reference'
        first = folder/'first-frame.png'
        subprocess.run(['ffmpeg','-v','error','-i',str(folder/'source.mp4'),'-frames:v','1','-y',str(first)],check=True)
        rgb = np.asarray(Image.open(first).convert('RGB')).astype(float)
        r,g,b = rgb[...,0],rgb[...,1],rgb[...,2]
        def smooth(v,low,high):
            x=np.clip((v-low)/(high-low),0,1)
            return x*x*(3-2*x)
        alpha=np.rint((1-smooth(np.minimum(r-g,b-g),8,35)*smooth(b/np.maximum(r,1),.60,.82))*255).astype('uint8')
        raw=Image.fromarray(np.dstack([rgb.astype('uint8'),alpha]))
        master=Image.open(WORK/'lise'/direction/'master.png').convert('RGBA')
        mb,fb=cycle.bbox(master),cycle.bbox(raw)
        scale=(mb[3]-mb[1])/(fb[3]-fb[1])
        offset=(round(cycle.head_center(master,mb)-scale*cycle.head_center(raw,fb)),round(mb[3]-scale*fb[3]))
        result=Image.new('RGBA',(256,300));result.alpha_composite(raw.resize((round(raw.width*scale),round(raw.height*scale)),Image.Resampling.LANCZOS),offset)
        result.save(folder/'rejected-preview.png')
        for col, (im,label) in enumerate([(master,'完成した立ち絵'),(result,'不採用の生成結果')]):
            bg=Image.new('RGBA',im.size,'#d5d6c8');bg.alpha_composite(im);d=ImageDraw.Draw(bg)
            for y in guides['lise/'+direction]['landmarks'].values():
                d.line((0,y,255,y),fill='#819587')
            board.paste(bg.convert('RGB'),(col*256,row*340+35));draw.text((col*256+5,row*340+7),direction+' '+label,font=font,fill='white')
        draw.text((525,row*340+40),issue[:24],font=font,fill='#ffc3a8')
        draw.text((525,row*340+70),issue[24:48],font=font,fill='#ffc3a8')
        draw.text((525,row*340+100),issue[48:],font=font,fill='#ffc3a8')
        review={'status':'不採用：方向・装備の転用失敗','issues':[issue],
                'referenceMotionReady':False,'gameApplied':False,
                'reviewMethod':'native temporal contact sheets inspected; sufficient to reject, no anatomical gait approval',
                'additionalPaidRetakeSubmitted':False}
        (folder/'review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
    board.save(WORK/'lise-three-direction-rejections.png')
    print('Three failed transfers documented; no false 19-frame references exported')


if __name__=='__main__':
    main()
