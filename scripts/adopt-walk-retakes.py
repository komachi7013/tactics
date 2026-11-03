"""Package only manually reviewed, alternating two-contact replacement loops.
Selections use consecutive source frames; old assets remain available for rollback.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'artifacts/walk-higgsfield-v4'
sys.path.insert(0,str(ROOT/'.codex/skills/video2dsprite/scripts'))
from finish_frames import measure_body
from register_clip import hip_x
spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/audit-walk-gait.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)


def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,indent=2)+'\n')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--publish',action='store_true');args=parser.parse_args()
    selections=read(WORK/'selections.json');retakes=read(WORK/'retakes.json')['jobs']
    base=read(ROOT/'artifacts/walk-higgsfield-v3/plan.json')
    backup=WORK/'previous-manifest.json'
    if not backup.exists(): shutil.copy2(ROOT/'src/view/walk-v2.json',backup)
    manifest=read(backup);adopted=[];annotations={}
    for j in retakes:
        sel=selections.get(str(j['index']))
        if not sel:continue
        assert sel.get('reviewNote') and sel.get('bodyAndEquipmentReviewed') is True
        source_qa=read(ROOT/j['directory']/'source-qa.json')
        assert source_qa['frames']==56 and source_qa['clipped'] is False
        start,end=sel['start'],sel['end'];assert 0<=start<end<=56
        dest=WORK/j['cast']/j['direction'];g=read(dest/'geometry.json')
        frames=[Image.open(dest/'full'/f'{i:03d}.png').convert('RGBA') for i in range(start,end)]
        height=float(np.median([measure_body(np.asarray(f)[:,:,3],2).height for f in frames]))
        hips=[hip_x(np.asarray(f)[:,:,3]>128,measure_body(np.asarray(f)[:,:,3],2).ground,height) for f in frames]
        target=float(np.median(hips));count=len(frames);sheet=Image.new('RGBA',(1024,math.ceil(count/4)*256))
        fixed=[]
        for i,(frame,hx) in enumerate(zip(frames,hips)):
            f=Image.new('RGBA',(256,256));f.alpha_composite(frame,(round(target-hx),0));fixed.append(f)
            sheet.alpha_composite(f,(i%4*256,i//4*256))
        buffer=io.BytesIO();sheet.save(buffer,format='PNG',optimize=True);png=buffer.getvalue();digest=hashlib.sha256(png).hexdigest()
        annotation={**sel,'sheet_sha256':digest,'resolvesReportedDefect':True,'imageSignalsReviewed':True}
        check=audit.contact_check(annotation,count,720,4,digest)
        assert check['status']=='verified-contacts',(j['index'],check)
        for f in fixed:
            a=np.asarray(f);assert not any((edge>4).any() for edge in [a[0,:,3],a[-1,:,3],a[:,0,3],a[:,-1,3]])
        a=np.stack([np.asarray(f.resize((64,64)),dtype=np.float32)/255 for f in fixed]);a[:,:,:,:3]*=a[:,:,:,3:4]
        changes=np.abs(np.diff(a,axis=0)).mean(axis=(1,2,3));seam=float(np.abs(a[0]-a[-1]).mean())/max(1e-8,float(np.percentile(changes,95)))
        assert seam<1.6,(j['index'],'loop seam',seam)
        asset={'key':f"motion-v4-walk-{j['cast']}-{j['direction']}",
               'path':f"/assets/motion-v4/{j['cast']}/walk-{j['direction']}.png",'cell':256,'frames':count,
               'originX':g['anchor'][0]/256,'originY':g['anchor'][1]/256,'visibleHeight':height,'cycleMs':720,'tilesPerCycle':4}
        ready={'index':j['index'],'cast':j['cast'],'direction':j['direction'],'job_id':j['job_id'],
               'art_source':j['art_source'],'driving_job_id':j['driving_job_id'],'asset':asset,
               'sourceIndices':list(range(start,end)),'sourceFps':16,'extractionStartSeconds':.5,
               'sheet_sha256':digest,'sourceDirectory':j['directory'],'review':'alternating-contacts-reviewed',
               'gaitContacts':annotation,'gaitCheck':check,'sourceQa':source_qa,'seamOverAdjacentP95':seam,
               'processing':'fixed transform, raw RGB shadow mask, hip registration, manually reviewed contiguous full gait'}
        (dest/'walk.png').write_bytes(png);write(dest/'ready.json',ready)
        if args.publish:
            production=ROOT/('public'+asset['path']);production.parent.mkdir(parents=True,exist_ok=True)
            production.write_bytes(png);write(production.with_suffix('.json'),ready)
        manifest[j['cast']][j['direction']]=asset
        base['jobs'][j['index']]={**j,'sourceDirectory':j['directory'],'directory':str(dest.relative_to(ROOT))}
        annotations[f"{j['cast']}-{j['direction']}"]=annotation;adopted.append(j['index'])
    write(WORK/'contacts.json',annotations);write(WORK/'plan.json',base);write(WORK/'manifest.json',manifest)
    html=(ROOT/'artifacts/walk-higgsfield-v3/preview-template.html').read_text()
    html=html.replace("'./'+j.directory.split('walk-higgsfield-v2/')[1]", "'/'+j.directory")
    html=html.replace('再検証中（歩行不具合の報告あり）','V4：対象方向を再生成・左右接地で検証（他方向はV3）')
    html=html.replace('<main>', '<p><a href="../walk-gait-audit/index.html">足元の監査結果</a></p><main>')
    (WORK/'preview.html').write_text(html)
    write(WORK/'adoption.json',{'adoptedIndices':adopted,'pendingIndices':[j['index'] for j in retakes if j['index'] not in adopted],
                               'published':args.publish,'cycleMs':720,'stepsPerCycle':2})
    if args.publish:
        write(ROOT/'src/view/walk-v2.json',manifest)
        previous=ROOT/'artifacts/walk-higgsfield-v3/preview.html'
        legacy=previous.with_name('preview-legacy.html')
        if not legacy.exists():shutil.copy2(previous,legacy)
        previous.write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../walk-higgsfield-v4/preview.html"><title>歩行確認 V4</title><a href="../walk-higgsfield-v4/preview.html">修正版V4の歩行確認へ</a></html>\n')
    print(json.dumps({'adopted':adopted,'published':args.publish}))


if __name__=='__main__':main()
