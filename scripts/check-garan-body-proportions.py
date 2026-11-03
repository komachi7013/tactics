"""Compare fixed-scale silhouette height and head-band area to the E pilot.

These are image measurements, not an anatomical gait certification. Never
rescale an output here: this check rejects short-body takes instead.
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('root_normalizer', ROOT/'scripts/normalize-walk-root.py')
norm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(norm)


def measure(directory):
    meta = json.loads((directory/'normalization.json').read_text())
    scale = 180/meta['bodyReferenceHeight']
    tops, bottoms, areas = [], [], []
    for i in range(meta['frames']):
        rgba = np.asarray(Image.open(directory/f'frame_{i:03d}.png').convert('RGBA'))
        ys, _ = np.where(rgba[:, :, 3] > 128)
        tops.append(280+(int(ys.min())-meta['masterGround'])*scale)
        bottoms.append(280+(int(ys.max())-meta['masterGround'])*scale)
        _, area = norm.head_feature(rgba, round(meta['bodyReferenceHeight']*.28))
        areas.append(area*scale**2)
    return {
        'frames': meta['frames'], 'cycleMs': meta['cycleMs'],
        'headTopMedianPx': float(np.median(tops)),
        'lowestFootMedianPx': float(np.median(bottoms)),
        'lowestFootRangePx': [float(min(bottoms)), float(max(bottoms))],
        'upperHeadBandAreaMedianPx2': float(np.median(areas)),
        'edgePixels': meta['edgePixels'],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('candidate', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    reference = measure(ROOT/'artifacts/walk-standard-v1/root-normalization/pilot-garan-E')
    candidate = measure(args.candidate)
    head_ratio = candidate['upperHeadBandAreaMedianPx2']/reference['upperHeadBandAreaMedianPx2']
    foot_delta = candidate['lowestFootMedianPx']-reference['lowestFootMedianPx']
    top_delta = candidate['headTopMedianPx']-reference['headTopMedianPx']
    passed = (abs(head_ratio-1) <= .05 and abs(foot_delta) <= 5 and abs(top_delta) <= 2
              and candidate['edgePixels'] == 0 and candidate['cycleMs'] == 800)
    report = {'reference': reference, 'candidate': candidate,
              'headAreaRatio': head_ratio, 'footMedianDeltaPx': foot_delta,
              'headTopMedianDeltaPx': top_delta, 'imageGeometryCheckPassed': passed,
              'scope': 'image geometry only; identity, proportions and gait require visual review'}
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if passed else 1)


if __name__ == '__main__':
    main()
