"""Normalize generated pixels and audit B07 civilian gathering-point art only."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/b07'
SOURCE = ROOT / 'generated_images/exec-8958e700-15b0-41c7-8fe1-d32b7d270086.png'
clean = Image.open(OUT / 'processed/clean.png').convert('RGBA')
crop = clean.crop(clean.getchannel('A').getbbox())
height = 190
width = round(crop.width * height / crop.height)
body = crop.resize((width, height), Image.Resampling.LANCZOS)
sprite = Image.new('RGBA', (256, 256))
sprite.alpha_composite(body, ((256-width)//2, 238-height))
sprite.save(OUT / 'evacuees.png')
box = sprite.getchannel('A').getbbox()
assert box and sprite.size == (256, 256)
assert min(box[:2]) > 0 and max(box[2:]) < 256
assert box[3] == 238 and box[3]-box[1] == 190
alpha = list(sprite.getchannel('A').get_flattened_data())
rgba = list(sprite.get_flattened_data())
magenta = sum(1 for r,g,b,a in rgba if a > 16 and r > 180 and b > 180 and g < 100)
assert magenta == 0
contact = Image.new('RGBA', (1024, 512), '#173b40')
draw = ImageDraw.Draw(contact)
for col, name in enumerate(['sena', 'iva']):
    image = Image.open(ROOT / f'public/assets/units/{name}/idle-2.png').convert('RGBA')
    contact.alpha_composite(image, (col*256, 20))
    draw.text((col*256+12, 280), name+' / 256', fill='white')
contact.alpha_composite(sprite, (512,20))
draw.text((524,280), 'evacuees / 256', fill='white')
light = Image.new('RGBA',(256,256),'#e8dec1')
light.alpha_composite(sprite)
contact.alpha_composite(light,(768,20))
draw.text((780,280), 'light background', fill='white')
for col, name in enumerate(['sena','iva','evacuees']):
    im = sprite if name == 'evacuees' else Image.open(ROOT / f'public/assets/units/{name}/idle-2.png').convert('RGBA')
    small = im.resize((84,84),Image.Resampling.LANCZOS)
    contact.alpha_composite(small,(col*256+86,350))
    draw.text((col*256+12,455),name+' / runtime 84',fill='white')
contact.save(OUT/'contact-sheet.png')
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(SOURCE) == sha(OUT/'raw-original.png')
manifest = {
    'source':'built-in image_gen','generationCalls':1,
    'originalPath':str(SOURCE),'originalCopy':'raw-original.png',
    'originalSHA256':sha(SOURCE),'originalMode':Image.open(SOURCE).mode,
    'originalSize':list(Image.open(SOURCE).size),
    'prompt':'prompt-used.txt','promptSHA256':sha(OUT/'prompt-used.txt'),
    'referencePolicy':'Sena and Iva viewed for style; described in prompt, no reference file passed to imagegen',
    'processor':'.codex/skills/generate2dsprite/scripts/generate2dsprite.py process --target asset --mode single --single-size 256 --prompt-file public/assets/b07/prompt-used.txt',
    'normalization':'Processed alpha bbox uniformly scaled to height190, centered horizontally, bottom238. No creative pixels drawn.',
    'output':'evacuees.png','outputSHA256':sha(OUT/'evacuees.png'),
    'size':[256,256],'origin':[.5,.93],'displaySize':84,'bbox':list(box),
    'alphaRange':[min(alpha),max(alpha)],'transparentPixels':alpha.count(0),
    'opaquePixels':alpha.count(255),'visibleMagentaPixels':magenta,
    'edgeTouch':False,'empty':False,'animation':False,
    'usage':'Shared static icon at V1/V2, disappears after guidance; not an HP/attack/movable NPC',
    'contact':'contact-sheet.png','contactSHA256':sha(OUT/'contact-sheet.png'),
}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
