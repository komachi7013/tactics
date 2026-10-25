"""Deterministic crop/resize/QA assembly of built-in image_gen artwork only.

Run with .venv/bin/python. Never creates original sprite or terrain artwork.
"""
import json
import shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public/assets'
TERRAIN_SOURCE = ROOT / 'generated_images/exec-76981a7e-b96a-4dc2-b519-c61e57b81dba.png'
GATE_SOURCE = ROOT / 'generated_images/exec-188b31ef-d117-43bd-9e53-60811932f667.png'

terrain = Image.open(TERRAIN_SOURCE).convert('RGB')
shutil.copy2(TERRAIN_SOURCE, ASSETS / 'terrain/raw-sheet.png')
w, h = terrain.size
assert w * 3 == h * 2, terrain.size
for row, name in enumerate(('dry', 'shallow', 'stone')):
    for col in range(2):
        tile = terrain.crop((col*w//2, row*h//3, (col+1)*w//2, (row+1)*h//3))
        tile.resize((256, 256), Image.Resampling.LANCZOS).save(ASSETS / f'terrain/{name}-{col}.png')

shutil.copy2(GATE_SOURCE, ASSETS / 'gate/raw.png')
gate = Image.open(GATE_SOURCE).convert('RGBA')
bbox = gate.getchannel('A').getbbox()
assert bbox is not None
assert gate.getchannel('A').getextrema() == (0, 255), 'Expected actual transparent background'
gate = gate.crop(bbox)
gate.thumbnail((188, 204), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (256,256))
canvas.alpha_composite(gate, ((256-gate.width)//2, 236-gate.height))
canvas.save(ASSETS / 'gate/gate.png')

qa = Image.new('RGBA', (1280,512), '#b7b2a5')
for col, name in enumerate(('rise','garan','neia','guard','archer')):
    path = ASSETS / f'units/{name}/sheet-transparent.png'
    if path.exists():
        sheet = Image.open(path).convert('RGBA')
        sheet.thumbnail((256,256), Image.Resampling.LANCZOS)
        qa.alpha_composite(sheet, (col*256,0))
for col, name in enumerate(('dry','shallow','stone')):
    qa.alpha_composite(Image.open(ASSETS / f'terrain/{name}-0.png').convert('RGBA'), (col*256,256))
qa.alpha_composite(canvas, (768,256))
qa.save(ASSETS / 'qa-contact-sheet.png')

units = {}
for name in ('rise','garan','neia','guard','archer'):
    path = ASSETS / f'units/{name}/pipeline-meta.json'
    if path.exists():
        meta=json.loads(path.read_text())
        units[name]={'path':f'units/{name}/sheet-transparent.png','frameWidth':256,'frameHeight':256,'columns':2,'rows':2,'directions':['N','E','S','W'],'origin':[0.5,237/256],'qc':meta['qc_summary']}
manifest = {'version':1,'source':'built-in image_gen','style':'clean_hd hand-painted chibi','units':units,'terrain':{'pathTemplate':'terrain/{dry,shallow,stone}-{0,1}.png','tileSize':[256,256],'sourceLayout':{'rows':['dry','shallow','stone'],'columns':['variant0','variant1']},'projection':'opaque top-down source; runtime projects/masks onto diamond'},'gate':{'path':'gate/gate.png','size':[256,256],'origin':[0.5,236/256],'occlusionClass':'short_nonwalkable','occupantPolicy':'cell blocked by game data'},'scope':'4 directional standing frames per appearance; movement uses runtime tween; no walk/attack animation claimed','qa':'qa-contact-sheet.png'}
(ASSETS/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'unitCount':len(units),'terrainTiles':6,'gateAlpha':Image.open(ASSETS/'gate/gate.png').getchannel('A').getextrema(),'qa':'public/assets/qa-contact-sheet.png'}))
