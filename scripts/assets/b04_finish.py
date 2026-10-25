"""Normalize built-in generated Dani portrait and publish B04 QC; use .venv/bin/python.

Only crops/scales/composites existing generated pixels; no creative art drawing.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public/assets'
IVA = ASSETS / 'units/iva'
B04 = ASSETS / 'b04'
PORTRAITS = ASSETS / 'portraits'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

raw = Image.open(PORTRAITS / 'dani-raw.png').convert('RGBA')
assert raw.getchannel('A').getextrema() == (0, 255), 'Expected generated true alpha'
raw.putalpha(raw.getchannel('A').point(lambda a: 0 if a < 8 else a))
bbox = raw.getchannel('A').getbbox()
assert bbox and bbox[0] > 0 and bbox[1] > 0 and bbox[2] < raw.width and bbox[3] < raw.height
bust = raw.crop(bbox)
bust.thumbnail((224, 224), Image.Resampling.LANCZOS)
portrait = Image.new('RGBA', (256, 256))
portrait.alpha_composite(bust, ((256-bust.width)//2, (256-bust.height)//2))
portrait.save(PORTRAITS / 'dani.png')

meta = json.loads((IVA / 'pipeline-meta.json').read_text())
sheet = Image.open(IVA / 'sheet-transparent.png').convert('RGBA')
assert sheet.size == (512,512)
assert meta['qc_summary']['valid_frame_count'] == 4
assert not meta['edge_touch_frames'] and not meta['empty_frames'] and not meta['paste_clamped_frames']
sources = json.loads((B04 / 'generation-sources.json').read_text())
manifest = {
    'source': 'built-in image_gen', 'generationCalls': 2,
    'style': 'project-native clean HD hand-painted chibi',
    'iva': {'path': 'units/iva/sheet-transparent.png',
            'rawOriginal': sources['iva'], 'rawCopy': 'units/iva/raw-sheet.png',
            'rawSHA256': sha(IVA/'raw-sheet.png'), 'sha256': sha(IVA/'sheet-transparent.png'),
            'sheetSize': [512,512], 'frameSize': [256,256], 'rows': 2, 'columns': 2,
            'directions': ['N','E','S','W'], 'origin': [.5,237/256],
            'prompt': 'units/iva/prompt-used.txt', 'pipelinePromptField': 'empty processor field; prompt source is prompt-used.txt',
            'qc': meta['qc_summary']},
    'dani': {'path': 'portraits/dani.png', 'rawOriginal': sources['dani'],
             'rawCopy': 'portraits/dani-raw.png', 'rawSHA256': sha(PORTRAITS/'dani-raw.png'),
             'sha256': sha(PORTRAITS/'dani.png'), 'prompt': 'portraits/dani-prompt-used.txt',
             'size': [256,256], 'rawSize': list(raw.size), 'alphaNoiseFloor': 8,
             'sourceBBox': list(bbox), 'outputBBox': list(portrait.getbbox()),
             'alphaExtrema': list(portrait.getchannel('A').getextrema())},
    'map': {'mode': 'grid_mode', 'source': 'existing generated terrain/gate assets; geometry and capture markers remain engine data'},
    'qa': 'b04/b04-contact-sheet.png',
    'scope': 'Iva four static directions, Dani static portrait. No walk/attack sprite animation.',
    'limitations': ['Author file-image QC only; parent performs native browser visual QA.',
                    'Exact ages are story metadata, not established by chibi apparent age.']
}
(B04/'b04-provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
contact = Image.new('RGBA', (1280,512), '#b7b2a5')
contact.alpha_composite(Image.open(ASSETS/'units/sena/sheet-transparent.png').convert('RGBA'), (0,0))
contact.alpha_composite(sheet, (512,0))
contact.alpha_composite(portrait, (1024,0))
contact.alpha_composite(portrait.resize((96,96), Image.Resampling.LANCZOS), (1104,320))
contact.save(B04/'b04-contact-sheet.png')
print(json.dumps(manifest, ensure_ascii=False))
