"""Validated-palette magenta matte; preserve boots the generic matte eroded.

Lise's approved palette has no purple garment or accessory. This is not a cast-wide
matte profile and must not be applied blindly to another character.
"""
import json
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def smooth(a, low, high):
    t = np.clip((a - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def main():
    parser = argparse.ArgumentParser()
    # Both validated references have brown/cream/blue palettes with no purple costume.
    # Keep a closed allowlist rather than silently applying this matte cast-wide.
    parser.add_argument('--cast', choices=['lise', 'garan', 'neia', 'sena', 'iva', 'dani', 'guard', 'archer', 'vesk', 'toma', 'worker', 'delegation'], default='lise')
    parser.add_argument('--direction', choices=['N', 'E', 'S', 'W'], default='E')
    parser.add_argument('--take', type=Path)
    parser.add_argument('--key-profile', choices=['magenta', 'pink'], default='magenta')
    args = parser.parse_args()
    assert args.cast != 'neia' or args.direction in ('E', 'N', 'S', 'W'), 'palette not validated for this direction'
    assert args.key_profile != 'pink' or args.cast in ('sena', 'dani', 'archer') or (args.cast == 'neia' and args.direction in ('N', 'W')) or (args.cast == 'guard' and args.direction in ('S', 'W')), 'pink profile is scoped to reviewed Neia N/W, Sena, Dani, Archer, or Guard S/W palettes'
    base = ROOT / f'artifacts/walk-from-standing-v1/{args.cast}/{args.direction}'
    take = args.take or base / 'motion-reference'
    assert take.resolve().is_relative_to(base.resolve()), 'take is outside the character direction workspace'
    clean = take / 'keyed-reviewed/frames-clean'
    clean.mkdir(parents=True, exist_ok=True)
    count, residue, edge = 0, 0, 0
    for path in sorted((take / 'keyed/frames-raw').glob('*.png')):
        rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        dominance = np.minimum(r - g, b - g)
        background = smooth(dominance, 8, 35)
        if args.key_profile == 'magenta':
            background *= smooth(b / np.maximum(r, 1), .60, .82)
        # Iva's reviewed hair includes dark violet. Bright studio magenta is
        # removed, while the dark hair colour is retained without recolouring.
        if args.cast == 'iva':
            background *= smooth(np.maximum(r, b), 100, 180)
        alpha = np.rint((1 - background) * 255).astype('uint8')
        # Avoid invisible RGB affecting numeric image comparisons.
        rgba = np.dstack([rgb.astype('uint8'), alpha])
        rgba[alpha == 0, :3] = 0
        Image.fromarray(rgba).save(clean / f'clean_{count:04d}.png')
        key = (dominance > 35) & ((b > r * .82) if args.key_profile == 'magenta' else True)
        if args.cast == 'iva':
            key &= np.maximum(r, b) >= 180
        residue += int((key & (alpha > 200)).sum())
        edge += sum(int((a > 128).sum()) for a in [alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]])
        count += 1
    assert count >= 19, 'No complete frame sequence decoded; matte cannot pass'
    report = {'status': 'pass' if residue == 0 and edge == 0 else 'fail',
              'frames': count, 'opaqueKeyPixels': residue, 'edgePixels': edge,
              'scope': 'key-colour residue and canvas clipping only; not anatomy or design certification',
              'method': f'{args.cast} {args.direction} validated palette; {args.key_profile} smooth chroma dominance; no erosion; original RGB retained',
              'visualReview': 'required on light and dark backgrounds'}
    (clean / 'matte-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
