"""Review aids only: decode a submitted take or render an existing candidate.

No generation, contact annotation, adoption, or automatic visual approval.
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['decode', 'evidence'])
    parser.add_argument('--cast', required=True)
    parser.add_argument('--direction', choices=['N', 'E', 'S', 'W'], required=True)
    parser.add_argument('--candidate-dir', type=Path)
    args = parser.parse_args()
    base = WORK / args.cast / args.direction
    assert base.resolve().is_relative_to(WORK.resolve())
    plan = json.loads((WORK / 'plan.json').read_text())
    job = next(j for j in plan['jobs'] if j['cast'] == args.cast and j['direction'] == args.direction)
    take = ROOT / job['reviewDirectory']
    if args.action == 'decode':
        raw = take / 'keyed/frames-raw'
        assert not raw.exists(), 'do not overwrite a decoded take'
        raw.mkdir(parents=True)
        probe = subprocess.check_output(['ffprobe', '-v', 'quiet', '-of', 'json', '-show_streams',
                                         '-show_format', str(take / 'source.mp4')])
        (take / 'probe.json').write_bytes(probe)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(take / 'source.mp4'), '-fps_mode',
                        'passthrough', str(raw / 'raw_%04d.png')], check=True)
        files = sorted(raw.glob('*.png'))
        for kind, indices in [('raw-contact', list(range(0, len(files), 4))),
                              ('feet-even', list(range(0, len(files), 2)))]:
            tw, th = (160, 180) if kind == 'raw-contact' else (140, 170)
            sheet = Image.new('RGB', (tw * 8, th * ((len(indices) + 7) // 8)), '#20343a')
            draw = ImageDraw.Draw(sheet)
            for n, index in enumerate(indices):
                im = Image.open(files[index]).convert('RGB')
                if kind == 'feet-even':
                    # Include the canvas bottom: generated feet can sit below
                    # 90% even while the full video correctly retains them.
                    im = im.crop((round(im.width * .25), round(im.height * .60),
                                  round(im.width * .75), im.height))
                im.thumbnail((tw, th - 25))
                sheet.paste(im, (n % 8 * tw, n // 8 * th + 25))
                draw.text((n % 8 * tw + 4, n // 8 * th + 4), str(index), fill='white')
            sheet.save(take / f'{kind}.jpg', quality=95)
        print(json.dumps({'frames': len(files), 'fps': json.loads(probe)['streams'][0]['r_frame_rate']}))
        return
    candidate = args.candidate_dir or base / 'candidate'
    assert candidate.resolve().is_relative_to(base.resolve())
    frames = [Image.open(f).convert('RGBA') for f in sorted(candidate.glob('frame_*.png'))]
    assert len(frames) == 19
    sheet = Image.new('RGB', (960, 992), '#18282c')
    draw = ImageDraw.Draw(sheet)
    centers = []
    jaw = job['landmarks']['landmarks']['jaw']
    for i, im in enumerate(frames):
        bg = Image.new('RGBA', im.size, '#18282c')
        bg.alpha_composite(im)
        sheet.paste(bg.resize((192, 225)).convert('RGB'), (i % 5 * 192, i // 5 * 248 + 23))
        draw.text((i % 5 * 192 + 4, i // 5 * 248 + 4), str(i), fill='white')
        alpha = np.asarray(im)[..., 3].astype(float)
        alpha[jaw:] = 0
        centers.append([(alpha.sum(axis=0) * np.arange(im.width)).sum() / alpha.sum(),
                        (alpha.sum(axis=1) * np.arange(im.height)).sum() / alpha.sum()])
    sheet.save(candidate / 'all-19-frames-dark.jpg', quality=95)
    contacts = json.loads((take / 'contacts.json').read_text())['contacts']
    compare = Image.new('RGB', (1024, 330), '#d5d6c8')
    draw = ImageDraw.Draw(compare)
    images = [Image.open(base / 'master.png').convert('RGBA'), frames[0], frames[10], frames[18]]
    labels = ['standing ' + args.direction, contacts[0]['foot'] + ' support',
              contacts[1]['foot'] + ' support', 'last -> first']
    for i, im in enumerate(images):
        compare.paste(im, (i * 256, 25), im)
        draw.text((i * 256 + 5, 5), labels[i], fill='black')
    compare.save(candidate / 'standing-comparison.png')
    feet = [np.asarray(im).astype(float)[220:] for im in frames]
    distance = lambda a, b: float(np.mean(np.abs(a - b)))
    boxes = [im.getbbox() for im in frames]
    metrics = {'headCentroidRangePx': np.ptp(centers, axis=0).tolist(),
               'footRegionSeamOverMedianStep': distance(feet[-1], feet[0]) / np.median(
                   [distance(a, b) for a, b in zip(feet, feet[1:])]),
               'headTopRangePx': [min(b[1] for b in boxes), max(b[1] for b in boxes)],
               'groundRangePx': [min(b[3] for b in boxes), max(b[3] for b in boxes)]}
    (candidate / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
    print(json.dumps(metrics))


if __name__ == '__main__':
    main()
