"""Snapshot current displayed standing art, never the obsolete walk masters."""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/walk-from-standing-v1'
REVIEW = ROOT / 'artifacts/standing-cast-review-v1'
FACING = {'N': 'away toward screen upper-right', 'E': 'toward screen lower-right',
          'W': 'away toward screen upper-left', 'S': 'toward screen lower-left'}


def main():
    OUT.mkdir(exist_ok=True)
    if (OUT / 'plan.json').exists():
        raise SystemExit('Existing snapshot retained; do not silently replace submitted inputs')
    manifest = json.loads((REVIEW / 'manifest.json').read_text())
    overrides = json.loads((REVIEW / 'repairs-active.json').read_text())
    guides = json.loads((REVIEW / 'landmark-overrides.json').read_text())
    jobs = []
    board = Image.new('RGB', (4 * 160, 12 * 208), '#20343a')
    draw = ImageDraw.Draw(board)
    for row in manifest['rows']:
        cast, direction = row['cast'], row['direction']
        key = cast + '/' + direction
        source = ROOT / overrides.get(key, {}).get('image', row['original']).lstrip('/')
        image = Image.open(source).convert('RGBA')
        assert image.size == (256, 300), (key, image.size)
        folder = OUT / cast / direction
        folder.mkdir(parents=True, exist_ok=True)
        image.save(folder / 'master.png')
        # Fixed framing: head y=90 and ground y=540. No guide pixels in input.
        bg = Image.new('RGBA', (640, 640), '#ff00ff')
        bg.alpha_composite(image.resize((640, 750), Image.Resampling.LANCZOS), (0, -160))
        bg.convert('RGB').save(folder / 'input.jpg', quality=94, subsampling=0)
        prompt = (
            f'The exact same illustrated game character faces {FACING[direction]} throughout. '
            'Keep the precise viewing angle of this image, never turn the head or torso. '
            'Walk in place at a steady moderate walking pace, not running or marching. '
            'Repeat a complete two-step gait: left heel contact, passing pose, right heel contact, '
            'passing pose, left heel contact. The supporting leg straightens at mid-stance; '
            'do not remain crouched. Small natural vertical weight shift, modest equal strides, '
            'equal left and right step intervals. The feet move along the facing direction, '
            'not sideways. One foot always supports the body at the same ground level. '
            'Keep body centered and the same size for the entire shot. Preserve exact head '
            'width, hair, face, costume colours, bag side, straps, book, sword sheath, bow, '
            'shield and all other existing equipment from this reference. Held objects retain '
            'their grip; equipment-carrying arms do not swing freely. No added equipment. '
            'Continuous repeated walking immediately, no idle introduction, no stops. '
            'Locked orthographic camera, no pan, zoom or cuts. No floor, cast shadow, '
            'reflection, text, effects or extra objects. Preserve the hand-painted chibi style. '
            'Solid flat pure magenta #ff00ff background for the entire shot.'
        )
        (folder / 'prompt.txt').write_text(prompt + '\n')
        jobs.append({'index': len(jobs), 'cast': cast, 'direction': direction,
                     'directory': str(folder.relative_to(ROOT)), 'source': str(source.relative_to(ROOT)),
                     'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                     'masterSha256': hashlib.sha256((folder / 'master.png').read_bytes()).hexdigest(),
                     'landmarks': guides.get(key), 'status': 'prepared', 'prompt': prompt,
                     'params': {'model': 'kling3_0', 'duration': 4, 'mode': 'std',
                                'sound': 'off', 'aspect_ratio': '1:1', 'count': 1}})
        i = len(jobs) - 1
        tile = Image.new('RGBA', (160, 188), '#d5d6c8')
        tile.alpha_composite(image.resize((160, 188), Image.Resampling.LANCZOS))
        x, y = i % 4 * 160, i // 4 * 208
        board.paste(tile.convert('RGB'), (x, y + 20))
        draw.text((x + 5, y + 3), cast + ' ' + direction, fill='white')
    assert len(jobs) == 48 and len({(j['cast'], j['direction']) for j in jobs}) == 48
    (OUT / 'plan.json').write_text(json.dumps({'version': 1, 'frames': 19, 'cycleMs': 800,
        'art_source': 'Higgsfield / Kling v3.0 image-to-video',
        'scope': 'review candidates; current standing assets and game unchanged',
        'jobs': jobs}, ensure_ascii=False, indent=2) + '\n')
    board.save(OUT / 'input-lineup.jpg', quality=92)
    print(json.dumps({'jobs': len(jobs), 'plan': str(OUT / 'plan.json'),
                      'pilot': [j['cast'] + '/' + j['direction'] for j in jobs[:4]]}))


if __name__ == '__main__':
    main()
