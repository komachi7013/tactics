"""Render all 48 review sprites at exact 19 / 0.8 = 95/4 fps."""
import json
import subprocess
from pathlib import Path

from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v1'


def main():
    report=json.loads((WORK/'review.json').read_text());rows=report['rows']
    assert len(rows)==48 and all(r.get('metadata') for r in rows),'all directions must be ready'
    assert all(r['metadata']['frames']==19 and r['metadata']['cycleMs']==800 for r in rows)
    folder=WORK/'movie-frames';folder.mkdir(exist_ok=True)
    for i in range(19):
        canvas=Image.new('RGB',(1024,960),'#18282c');draw=ImageDraw.Draw(canvas)
        for k,r in enumerate(rows):
            m=r['metadata'];p=ROOT/r['directory'].lstrip('/');cell=m.get('cell',256);scale=90/m['bodyReferenceHeight']
            frame=Image.open(p/f'frame_{i:03d}.png').convert('RGBA');im=frame.resize((round(cell*scale),round(cell*scale)),Image.Resampling.LANCZOS)
            tile=Image.new('RGBA',(128,150),'#d5d6c8');td=ImageDraw.Draw(tile)
            for y in [50,140]:td.line([(2,y),(126,y)],fill='#819587')
            tile.alpha_composite(im,(round(64-cell*.5*scale),round(140-m['masterGround']*scale)))
            x=k%8*128;y=k//8*160;draw.text((x+3,y+1),r['cast']+' '+r['direction'],fill='white');canvas.paste(tile.convert('RGB'),(x,y+10))
        canvas.save(folder/f'{i:03d}.png')
    subprocess.run(['ffmpeg','-y','-v','error','-framerate','95/4','-stream_loop','5','-i',str(folder/'%03d.png'),
                    '-frames:v','114','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(WORK/'all-cast-review.mp4')],check=True)
    print('Rendered 48 directions; 19 frames × 6 cycles; 4.8 seconds; 95/4 fps')


if __name__=='__main__':main()
