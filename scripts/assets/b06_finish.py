"""Audit and compare generated Toma pixels only; run with .venv/bin/python."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public/assets'
TOMA = ASSETS / 'units/toma'
OUT = ASSETS / 'b06'
OUT.mkdir(parents=True, exist_ok=True)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

meta = json.loads((TOMA / 'pipeline-meta.json').read_text())
sheet = Image.open(TOMA / 'sheet-transparent.png').convert('RGBA')
qc = meta['qc_summary']
assert sheet.size == (512, 512)
assert qc['valid_frame_count'] == 4
for key in ['edge_touch_frames', 'empty_frames', 'paste_clamped_frames']:
    assert not meta[key], key
assert qc['body_scale_cv'] <= .08
assert qc['anchor_y_std'] <= .05
boxes = []
for i in range(4):
    frame = sheet.crop(((i % 2)*256, (i // 2)*256, (i % 2+1)*256, (i // 2+1)*256))
    box = frame.getchannel('A').getbbox()
    assert box and min(box[:2]) > 0 and max(box[2:]) < 256
    boxes.append(list(box))

# A neutral inspection canvas composites accepted pixels; it does not draw art.
contact = Image.new('RGBA', (1536, 512), '#b7b2a5')
for x, name in enumerate(['sena', 'iva', 'toma']):
    contact.alpha_composite(Image.open(ASSETS / f'units/{name}/sheet-transparent.png').convert('RGBA'), (512*x, 0))
contact.save(OUT / 'b06-contact-sheet.png')
source = json.loads((OUT / 'generation-source.json').read_text())
original_path = Path(source['rawOriginal'])
original = Image.open(original_path)
raw = Image.open(TOMA / 'raw-sheet.png')
assert original.mode == 'RGB' and raw.mode == 'RGBA'
assert original.size == raw.size
assert original.convert('RGBA').tobytes() == raw.tobytes(), 'RGBA conversion must preserve every pixel'
manifest = {
    'source': 'built-in image_gen', 'generationCalls': 1,
    'character': 'Toma, unarmed male clerk, story age 31',
    'style': 'project-native clean HD hand-painted chibi',
    'reference': 'units/iva/sheet-transparent.png; style/camera only; inspected Sena and Iva',
    'rawOriginal': source['rawOriginal'], 'rawCopy': 'units/toma/raw-sheet.png',
    'originalSHA256': sha(original_path), 'originalMode': original.mode,
    'rawMode': raw.mode,
    'rawConversion': 'RGB original to RGBA PNG; identical RGBA pixels, not a byte-for-byte copy',
    'rgbaPixelsIdentical': True,
    'rawSHA256': sha(TOMA / 'raw-sheet.png'),
    'path': 'units/toma/sheet-transparent.png',
    'sha256': sha(TOMA / 'sheet-transparent.png'),
    'sheetSize': [512, 512], 'frameSize': [256, 256], 'rows': 2, 'columns': 2,
    'directions': ['N', 'E', 'S', 'W'], 'origin': [.5, 237/256],
    'prompt': 'units/toma/prompt-used.txt',
    'pipelinePromptField': 'processor field only; actual generation text is prompt-used.txt',
    'frameAlphaBBoxes': boxes, 'qc': qc,
    'qa': 'b06/b06-contact-sheet.png',
    'scope': 'Four static facing frames. GIF cycles directions for inspection, not walking animation.',
    'limitations': ['Native browser scale/overlap is a separate acceptance gate.',
                    'Exact age is story metadata rather than visually proven.']
}
(OUT / 'b06-provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(manifest, ensure_ascii=False))
