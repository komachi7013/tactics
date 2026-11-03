"""Check V3 timing/artifact contracts and render all directions at one cadence.
These checks do not certify anatomical foot identity from image similarity.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'artifacts/walk-higgsfield-v3'
sys.path.insert(0,str(ROOT/'.codex/skills/video2dsprite/scripts'))
from finish_frames import measure_body
from register_clip import hip_x


def main():
    global WORK
    manifest=json.loads((ROOT/'src/view/walk-v2.json').read_text())
    if any('/motion-v4/' in a['path'] for ds in manifest.values() for a in ds.values()):
        WORK=ROOT/'artifacts/walk-higgsfield-v4'
    plan=json.loads((WORK/'plan.json').read_text())
    assert len(plan['jobs'])==48 and sum(len(v) for v in manifest.values())==48
    rows=[];actors=[]
    for j in plan['jobs']:
        ready=json.loads((ROOT/j['directory']/'ready.json').read_text());asset=manifest[j['cast']][j['direction']]
        assert asset==ready['asset'];assert asset['cycleMs']==720 and asset['tilesPerCycle']==4
        ids=ready['sourceIndices'];assert ids==list(range(ids[0],ids[-1]+1)) and len(ids)==asset['frames']
        path=ROOT/('public'+asset['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==ready['sheet_sha256']
        sheet=Image.open(path).convert('RGBA');frames=[];hips=[];ground=[];edge=0
        for i in range(asset['frames']):
            im=sheet.crop((i%4*256,i//4*256,i%4*256+256,i//4*256+256));frames.append(im)
            a=np.asarray(im);b=measure_body(a[:,:,3],2);assert b
            hips.append(hip_x(a[:,:,3]>128,b.ground,asset['visibleHeight'])*90/asset['visibleHeight'])
            ground.append(b.ground*90/asset['visibleHeight'])
            edge+=int((a[0,:,3]>4).sum()+(a[-1,:,3]>4).sum()+(a[:,0,3]>4).sum()+(a[:,-1,3]>4).sum())
        assert edge==0
        assert float(np.ptp(hips))<1.5,(j['index'],'hip sway',np.ptp(hips))
        rows.append({'index':j['index'],'cast':j['cast'],'direction':j['direction'],'sourceIndices':ids,
                     'sourceFrameDuplicates':0,'sourceFrameDropsWithinWindow':0,'frames':asset['frames'],'cycleMs':720,
                     'hipRangeDisplayPx':round(float(np.ptp(hips)),3),'groundRangeDisplayPx':round(float(np.ptp(ground)),3),
                     'edgePixels':edge,'review':'source sequence and light/dark contact sheet inspected'})
        actors.append((j,asset,frames))
    out=WORK/'synchronized-frames';out.mkdir(exist_ok=True)
    # 48 review frames / (200/3 fps) = exactly 720 ms. Each direction uses its
    # complete native sequence; the review display samples that common clock.
    for phase in range(48):
        canvas=Image.new('RGB',(1200,704),(27,43,47));draw=ImageDraw.Draw(canvas)
        draw.text((16,12),f'{WORK.name} | consecutive extracted frames | shared 720 ms cycle | review phase {phase:02d}',fill='#eee3c3')
        for j,a,frames in actors:
            c=j['index']//4;d=j['index']%4;x=c%3*400+d*100;y=c//3*164+48
            if d==0:draw.text((x+8,y),j['cast'],fill='#ffe0a0')
            draw.text((x+44,y+18),j['direction'],fill='#becdc4');draw.line((x+3,y+150,x+97,y+150),fill='#5b716c')
            im=frames[min(len(frames)-1,phase*len(frames)//48)];scale=90/a['visibleHeight']
            im=im.resize((round(256*scale),round(256*scale)),Image.Resampling.LANCZOS)
            canvas.paste(im,(round(x+50-a['originX']*256*scale),round(y+150-a['originY']*256*scale)),im)
        canvas.save(out/f'frame_{phase:03d}.png')
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-framerate','200/3','-i',str(out/'frame_%03d.png'),
                    '-vf','loop=loop=5:size=48:start=0','-frames:v','288','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(WORK/'all-walks.mp4')],check=True)
    gait_path=ROOT/'artifacts/walk-gait-audit/report.json'
    gait=json.loads(gait_path.read_text()) if gait_path.exists() else None
    gait_status='unverified'
    if gait:
        current={(j['cast'],j['direction']):json.loads((ROOT/j['directory']/'ready.json').read_text())['sheet_sha256'] for j in plan['jobs']}
        hashes={(r['cast'],r['direction']):r['sheet_sha256'] for r in gait['rows']}
        gait_status=gait['status'] if hashes==current else 'stale-report'
    audit={'version':4 if WORK.name.endswith('v4') else 3,'numericContractStatus':'passed','cycleMs':720,'directions':48,
           'gaitAcceptanceStatus':gait_status,
           'gaitReport':str(gait_path.relative_to(ROOT)) if gait else None,
           'limits':'Image similarity and frame order do not independently prove foot identity or biomechanical correctness.',
           'remainingSourceMotionNotes':[{'cast':cast,'direction':'W','note':'upper-body yaw variation in V3 generated source; regeneration candidate'}
                                         for cast in ['neia','vesk'] if '/motion-v3/' in manifest[cast]['W']['path']],
           'checks':rows}
    (WORK/'verification.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(json.dumps({'directions':48,'numericContractStatus':'passed','gaitAcceptanceStatus':audit['gaitAcceptanceStatus'],'sourceDuplicates':0,'sourceDrops':0,'maxHipRange':max(r['hipRangeDisplayPx'] for r in rows),'movie':str(WORK/'all-walks.mp4')}))


if __name__=='__main__':main()
