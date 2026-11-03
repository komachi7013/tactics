"""Package a visually annotated two-step interval with one fixed clip transform.

The contact record must identify actual anatomical feet in the source video.
Image recurrence alone is deliberately not sufficient to produce a candidate.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def bbox(im):
    return Image.fromarray((np.asarray(im)[..., 3] > 128).astype('uint8') * 255).getbbox()


def head_center(im, box):
    a = np.asarray(im)[..., 3].astype(float)
    top, bottom = box[1], box[3]
    a[:top] = 0
    a[top + round((bottom - top) * .3):] = 0
    return float((a.sum(axis=0) * np.arange(im.width)).sum() / a.sum())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--take', type=Path, required=True)
    parser.add_argument('--master', type=Path, required=True)
    parser.add_argument('--contacts', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    record = json.loads(args.contacts.read_text())
    clean = args.take / record.get('framesDirectory', 'keyed/frames-clean')
    matte = json.loads((clean / 'matte-report.json').read_text())
    assert matte.get('status') == 'pass' or record.get('matteOverrideReason'), 'matte QA failed; inspect and correct before packaging'
    digest = hashlib.sha256((args.take / 'source.mp4').read_bytes()).hexdigest()
    assert record['videoSha256'] == digest, 'contact annotations belong to another take'
    assert record.get('visualReviewed') is True, 'anatomical contact review is required'
    events = record['contacts']
    assert len(events) == 3 and events[0]['foot'] == events[2]['foot']
    assert {e['foot'] for e in events} == {'L', 'R'}
    start, middle, end = [e['frame'] for e in events]
    assert 0 <= start < middle < end
    assert abs((middle - start) / (end - start) - .5) < .1, 'unequal source step intervals'
    files = sorted(clean.glob('*.png'))
    assert end < len(files)
    assert not args.output.exists(), 'never overwrite a previously reviewed output'
    args.output.mkdir(parents=True)
    master = Image.open(args.master).convert('RGBA')
    first = Image.open(files[0]).convert('RGBA')
    mb, fb = bbox(master), bbox(first)
    scale = (mb[3] - mb[1]) / (fb[3] - fb[1])
    assert scale < 1, 'process native source rather than upscaling finished frames'
    offset = (round(head_center(master, mb) - scale * head_center(first, fb)),
              round(mb[3] - scale * fb[3]))
    selected = [round(start + i / 9.5 * (middle - start)) if i < 9.5 else
                round(middle + (i - 9.5) / 9.5 * (end - middle)) for i in range(19)]
    assert all(b > a for a, b in zip(selected, selected[1:])), 'duplicated or reversed source frame'
    frames = []
    sheet = Image.new('RGBA', (256 * 5, 300 * 4))
    contact = Image.new('RGB', (192 * 5, 248 * 4), '#20343a')
    draw = ImageDraw.Draw(contact)
    metrics = []
    for i, index in enumerate(selected):
        raw = Image.open(files[index]).convert('RGBA')
        frame = Image.new('RGBA', (256, 300))
        frame.alpha_composite(raw.resize((round(raw.width * scale), round(raw.height * scale)),
                                        Image.Resampling.LANCZOS), offset)
        frame.save(args.output / f'frame_{i:03d}.png')
        sheet.alpha_composite(frame, (i % 5 * 256, i // 5 * 300))
        view = Image.new('RGBA', frame.size, '#d5d6c8')
        view.alpha_composite(frame)
        tile = view.resize((192, 225), Image.Resampling.LANCZOS)
        contact.paste(tile.convert('RGB'), (i % 5 * 192, i // 5 * 248 + 23))
        draw.text((i % 5 * 192 + 4, i // 5 * 248 + 4), f'{i:02d} / source {index}', fill='white')
        b = bbox(frame)
        metrics.append({'headTop': b[1], 'ground': b[3], 'width': b[2] - b[0]})
        frames.append(frame)
    sheet.save(args.output / 'walk.png')
    contact.save(args.output / 'all-19-frames.jpg', quality=95)
    durations = [round((i + 1) * 800 / 19) - round(i * 800 / 19) for i in range(19)]
    assert len(frames) == 19 and sum(durations) == 800
    data = {'frames': 19, 'cycleMs': 800, 'fpsRational': [95, 4], 'durationsMs': durations,
            'sourceIndices': selected, 'sourceVideoSha256': digest,
            'sheetSha256': hashlib.sha256((args.output / 'walk.png').read_bytes()).hexdigest(),
            'fixedScale': scale, 'fixedOffset': offset, 'frameGeometry': metrics,
            'contactReview': record, 'status': 'candidate-needs-full-19-frame-design-and-seam-review',
            'matteReportStatus': matte.get('status'), 'matteOverrideReason': record.get('matteOverrideReason'),
            'gameApplied': False, 'art_source': 'Higgsfield image-to-video'}
    (args.output / 'animation.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    # A six-repeat video preserves the exact rational rate (19 frames / 800 ms).
    movie = args.output / 'movie'
    movie.mkdir()
    for i, im in enumerate(frames):
        bg = Image.new('RGBA', im.size, '#d5d6c8')
        bg.alpha_composite(im)
        bg.convert('RGB').save(movie / f'{i:03d}.png')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', '95/4', '-stream_loop', '5',
                    '-i', str(movie / '%03d.png'), '-frames:v', '114', '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(args.output / 'walk.mp4')], check=True)
    print(json.dumps({'frames': 19, 'cycleMs': 800, 'status': data['status']}))


if __name__ == '__main__':
    main()
