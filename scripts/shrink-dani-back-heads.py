"""User-requested small head reduction for Dani N/W, with equal pair landmarks."""
import hashlib
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/standing-cast-review-v1'
width_tools=runpy.run_path(str(ROOT/'scripts/match-standing-head-widths.py'))
geometry=runpy.run_path(str(ROOT/'scripts/align-standing-direction-pairs.py'))


def main():
    active=json.loads((WORK/'repairs-active.json').read_text())
    guides=json.loads((WORK/'landmark-overrides.json').read_text())
    qa=[]
    for d in ['N','W']:
        key='dani/'+d
        record=active.get(key,{})
        path=ROOT/'artifacts/standing-cast-repairs-local-v1/dani'/d/'head-size-smaller.png'
        source=record.get('image',f'artifacts/standing-cast-review-v1/original/dani/{d}/standing.png')
        if source==str(path.relative_to(ROOT)):source=record['headSizeCorrection']['sourceImage']
        original=Image.open(ROOT/source).convert('RGBA')
        vertical=geometry['warp'](original,[0,100,159,178,300],[0,100,154,178,300])
        preserved=np.asarray(vertical).copy()
        preserved[178:]=np.asarray(original)[178:]
        vertical=Image.fromarray(preserved)
        before_width=width_tools['width'](original,159)
        current_width=width_tools['width'](vertical,154)
        ratio=67/current_width
        candidates=[]
        for scale in [ratio,*np.linspace(ratio-.025,ratio+.025,41)]:
            im=width_tools['resize_head_width'](vertical,float(scale),154)
            candidates.append((abs(width_tools['width'](im,154)-67),abs(scale-ratio),im))
        error,_,result=min(candidates,key=lambda v:(v[0],v[1]))
        assert error==0
        assert np.array_equal(np.asarray(original)[178:],np.asarray(result)[178:])
        sy,sx=np.where(np.asarray(result)[...,3]>128)
        assert int(sy.min())==100 and int(sy.max()+1)==280
        result.save(path)
        correction={'sourceImage':source,'headHeightBeforePx':59,'headHeightAfterPx':54,
            'headWidthBeforePx':before_width,'headWidthAfterPx':67,
            'bodyPixelsUnchangedFromRow':178,'neckTransition':[154,178]}
        landmarks={'head':100,'jaw':154,'waist':198,'knee':239,'ground':280}
        record.update({'cast':'dani','direction':d,'image':str(path.relative_to(ROOT)),
            'label':'N/W頭部を縮小・5点位置補正','jaw':154,'landmarks':landmarks,
            'headSizeCorrection':correction,'higgsfieldAdditionalCredits':0,
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        active[key]=record
        guides[key]={'jaw':154,'landmarks':landmarks,'pairReference':'W',
            'method':'user-requested head reduction for both N/W; common manual body landmarks'}
        qa.append({'direction':d,**correction})
    (WORK/'repairs-active.json').write_text(json.dumps(active,ensure_ascii=False,indent=2)+'\n')
    (WORK/'landmark-overrides.json').write_text(json.dumps(guides,ensure_ascii=False,indent=2)+'\n')
    (WORK/'dani-back-head-size-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
    print('Dani N/W heads: common width67px, height59->54px; body below178 unchanged; shared five points retained.')


if __name__=='__main__':main()
