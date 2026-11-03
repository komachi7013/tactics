"""Apply user-selected Lise pair proportions without regenerating her design.

Landmarks are manual visual estimates, not an anatomy detector. N and E remain
unchanged references; W maps to N and S maps to E with a vertical local remap.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/standing-cast-review-v1'
OUT = ROOT / 'artifacts/standing-cast-repairs-local-v1/lise'


def register(im, framing, factor=4):
    scale = framing['uniformScale'] * factor
    return im.transform((256*factor, 300*factor), Image.Transform.AFFINE,
        (1/scale, 0, framing['sourceCenterX']-128*factor/scale,
         0, 1/scale, framing['sourceTop']-100*factor/scale), Image.Resampling.BICUBIC)


def remap(im, source, target, factor=4):
    rgba = np.asarray(im).astype(np.float32)/255
    alpha = rgba[..., 3:4]
    premult = np.concatenate((rgba[..., :3]*alpha, alpha), axis=2)
    source_y = np.interp(np.arange(im.height)/factor, target, source)*factor
    lo = np.floor(source_y).astype(int).clip(0, im.height-1)
    hi = (lo+1).clip(0, im.height-1)
    t = (source_y-lo)[:, None, None]
    warped = premult[lo]*(1-t)+premult[hi]*t
    a = warped[..., 3:4]
    rgb = np.divide(warped[..., :3], a, out=np.zeros_like(warped[..., :3]), where=a>1e-6)
    return Image.fromarray(np.round(np.clip(np.concatenate((rgb,a),axis=2),0,1)*255).astype('uint8'))


def main():
    manifest = json.loads((WORK/'manifest.json').read_text())
    active = json.loads((WORK/'repairs-active.json').read_text())
    larger = OUT/'S/book-larger-generated.png'
    base = Image.open(OUT/'S/left-book-protected.png').convert('RGBA')
    patch = Image.open(larger).convert('RGBA')
    assert patch.size == base.size
    mask = Image.new('L',base.size)
    ImageDraw.Draw(mask).rectangle((600,701,764,853),fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(3))
    book = Image.composite(patch,base,mask)
    assert np.array_equal(np.array(book)[:600], np.array(base)[:600])
    book.save(OUT/'S/book-larger-protected.png')
    guide_path = WORK/'landmark-overrides.json'
    guides = json.loads(guide_path.read_text()) if guide_path.exists() else {}
    specs = {
        'W': {'reference':'N','source':[0,100,161,195,240,280,300],
              'target':[0,100,160,195,241,280,300]},
        'S': {'reference':'E','source':[0,100,153,187,238,280,300],
              'target':[0,100,156,192,235,280,300]},
    }
    for direction, spec in specs.items():
        row = next(r for r in manifest['rows'] if r['cast']=='lise' and r['direction']==direction)
        if direction == 'S':
            im = book
            framing = {'uniformScale':180/948,'sourceTop':173,'sourceCenterX':635.5}
        else:
            im = Image.open(ROOT/row['source']).convert('RGBA')
            framing = row['framing']
        registered = register(im, framing)
        adjusted = remap(registered, spec['source'], spec['target'])
        folder = OUT/direction
        folder.mkdir(exist_ok=True)
        adjusted.save(folder/'pair-aligned-hires.png')
        display = adjusted.resize((256,300),Image.Resampling.LANCZOS)
        output = folder/'pair-aligned-display.png'
        display.save(output)
        target = spec['target']
        landmarks = dict(zip(['head','jaw','waist','knee','ground'],target[1:-1]))
        for d in [direction, spec['reference']]:
            guides['lise/'+d] = {'jaw':landmarks['jaw'],'landmarks':landmarks,
                'method':'manual visual landmarks; knees partly obscured, estimated +/-3px',
                'pairReference':spec['reference']}
        record = dict(active.get('lise/'+direction,{}))
        record.update({'cast':'lise','direction':direction,
            'image':str(output.relative_to(ROOT)),
            'master':str((folder/'pair-aligned-hires.png').relative_to(ROOT)),
            'jaw':landmarks['jaw'],'landmarks':landmarks,
            'label':spec['reference']+'基準・5点位置補正'+('・本を拡大' if direction=='S' else ''),
            'referenceDirection':spec['reference'],'geometryRemap':spec,
            'status':'pair-aligned review candidate; anatomy positions manually estimated',
            'approvedHairPixelsUnchanged':False,'headDesignPreserved':True,
            'originalFeetPixelsUnchanged':False,
            'protectedExceptLeftHandBookRegion':False,
            'bookEditProtectedOutsideHandRegion':direction=='S',
            'higgsfieldAdditionalCredits':0,
            'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
        active['lise/'+direction] = record
        (folder/'pair-alignment.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
        assert np.max(np.abs(np.interp(spec['source'],spec['source'],spec['target'])-spec['target'])) == 0
    (WORK/'repairs-active.json').write_text(json.dumps(active,ensure_ascii=False,indent=2)+'\n')
    guide_path.write_text(json.dumps(guides,ensure_ascii=False,indent=2)+'\n')
    decisions = json.loads((WORK/'reference-decisions.json').read_text())
    decisions.update({'lise/NW':'N','lise/ES':'E'})
    (WORK/'reference-decisions.json').write_text(json.dumps(decisions,ensure_ascii=False,indent=2)+'\n')
    print('Lise W mapped to N; S mapped to E; larger book retained. Original N/E reference art unchanged.')


if __name__ == '__main__':
    main()
