"""Apply the 48 approved stills without altering walk assets or their manifest."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'


def main():
    plan = json.loads((WORK / 'plan.json').read_text())
    code_path = ROOT / 'src/view/castMotion.ts'
    code = code_path.read_text()
    old_json = code.split('export const CAST_IDLE=', 1)[1].split(';\nexport function castIdle', 1)[0]
    backup = WORK / 'game-idle-before.json'
    if not backup.exists():
        backup.write_text(old_json + '\n')
    previous = json.loads(backup.read_text())
    walk_path = ROOT / 'src/view/walk-v2.json'
    walk_digest = hashlib.sha256(walk_path.read_bytes()).hexdigest()
    cast, records = {}, []
    for job in plan['jobs']:
        source = ROOT / job['source']
        assert hashlib.sha256(source.read_bytes()).hexdigest() == job['sourceSha256']
        original = Image.open(source).convert('RGBA')
        assert original.size == (256, 300)
        a = np.asarray(original)
        assert not (a[:44, :, 3] > 0).any(), 'crop would remove visible art'
        output = original.crop((0, 44, 256, 300))
        digest = hashlib.sha256(output.tobytes()).hexdigest()[:10]
        character, direction = job['cast'], job['direction']
        relative = f'assets/characters/standing-v1/{character}/idle-{direction}-{digest}.png'
        target = ROOT / 'public' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        output.save(target)
        assert np.array_equal(np.asarray(Image.open(target)), a[44:])
        rows = np.where(a[:, :, 3] > 128)[0]
        height = int(rows.max() - rows.min())
        cast.setdefault(character, {})[direction] = {
            'key': previous[character][direction]['key'],
            'path': '/' + relative, 'originX': .5, 'originY': 236 / 256,
            'visibleHeight': height,
        }
        records.append({'cast': character, 'direction': direction, 'source': job['source'],
                        'sourceSha256': job['sourceSha256'], 'path': relative,
                        'crop': [0, 44, 256, 300], 'visiblePixelsUnchanged': True})
    assert len(records) == 48 and len(cast) == 12
    replacement = json.dumps(cast, ensure_ascii=False, indent=2)
    code = code.replace('export const CAST_IDLE=' + old_json,
                        'export const CAST_IDLE=' + replacement, 1)
    code_path.write_text(code)
    assert hashlib.sha256(walk_path.read_bytes()).hexdigest() == walk_digest
    report = {'status': 'applied-to-game', 'standingDirections': 48,
              'walkManifestSha256': walk_digest, 'walkManifestUnchanged': True,
              'method': 'remove 44 transparent top rows; no rescaling or art modification',
              'records': records}
    (WORK / 'game-standing-application.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('Applied 48 standing images; all visible pixels preserved; walk manifest unchanged')


if __name__ == '__main__':
    main()
