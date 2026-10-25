"""Normalize generated B03 cart and record provenance. Run .venv/bin/python.

No original art is drawn; all pixels originate from built-in image_gen.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public/assets'
cart_dir = ASSETS / 'escort'
raw = Image.open(cart_dir / 'raw.png').convert('RGBA')
assert raw.getchannel('A').getextrema() == (0, 255), 'Expected actual alpha'
raw.putalpha(raw.getchannel('A').point(lambda value: 0 if value < 8 else value))
bbox = raw.getchannel('A').getbbox()
assert bbox and bbox[0] > 0 and bbox[1] > 0 and bbox[2] < raw.width and bbox[3] < raw.height
cart = raw.crop(bbox)
cart.thumbnail((204, 184), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (256, 256))
canvas.alpha_composite(cart, ((256-cart.width)//2, round(256*.92)-cart.height))
canvas.save(cart_dir / 'cart.png')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

sena_dir = ASSETS / 'units/sena'
meta = json.loads((sena_dir / 'pipeline-meta.json').read_text())
sena = Image.open(sena_dir / 'sheet-transparent.png').convert('RGBA')
assert sena.size == (512, 512)
assert meta['qc_summary']['valid_frame_count'] == 4
assert not meta['edge_touch_frames'] and not meta['empty_frames'] and not meta['paste_clamped_frames']

manifest = {
    'source': 'built-in image_gen', 'generationCalls': 2,
    'style': 'project-native clean_hd hand-painted chibi',
    'sena': {'rawOriginal': 'generated_images/exec-2732f46d-885e-4a95-952e-86802db40ef7.png',
             'path': 'units/sena/sheet-transparent.png', 'frameSize': [256,256],
             'sheetSize': [512,512], 'rows': 2, 'columns': 2,
             'directions': ['N','E','S','W'], 'origin': [.5,237/256],
             'rawSHA256': sha(sena_dir/'raw-sheet.png'),
             'sha256': sha(sena_dir/'sheet-transparent.png'),
             'prompt': 'units/sena/prompt-used.txt', 'qc': meta['qc_summary']},
    'cart': {'rawOriginal': 'generated_images/exec-3bdf6654-1479-4836-a617-2eb9f7040ba6.png',
             'path': 'escort/cart.png', 'size': [256,256], 'origin': [.5,.92],
             'rawSHA256': sha(cart_dir/'raw.png'), 'sha256': sha(cart_dir/'cart.png'),
             'prompt': 'escort/prompt-used.txt', 'rawSize': list(raw.size),
             'alphaNoiseFloor': 8,
             'sourceBBox': list(bbox), 'outputBBox': list(canvas.getbbox()),
             'alphaExtrema': list(canvas.getchannel('A').getextrema()),
             'worldFootprint': [1,1], 'occlusionClass': 'escort_occupant',
             'occupantPolicy': 'cart occupies its own cell; no standing combat unit shares the cell'},
    'scope': 'Four static directional Sena frames; one static cart. Runtime tween movement only. No walk or attack animation.',
    'qa': 'escort/b03-contact-sheet.png',
    'limitations': ['No in-engine visual inspection performed by asset author; parent performs Mac browser QA.',
                    'Sena adult age is story metadata; chibi art does not establish exact apparent age.']
}
(cart_dir/'b03-provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
preview = Image.new('RGBA', (1024,512), '#b7b2a5')
preview.alpha_composite(Image.open(ASSETS/'units/rise/sheet-transparent.png').convert('RGBA'), (0,0))
preview.alpha_composite(sena,(512,0))
preview.alpha_composite(canvas.resize((128,128), Image.Resampling.LANCZOS),(448,384))
preview.save(cart_dir/'b03-contact-sheet.png')
print(json.dumps(manifest, ensure_ascii=False))
