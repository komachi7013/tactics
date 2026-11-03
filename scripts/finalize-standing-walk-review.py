"""Record a completed manual review explicitly; never generates or adopts game art."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cast', required=True)
    parser.add_argument('--direction', choices=['N', 'E', 'S', 'W'], required=True)
    parser.add_argument('--native-period-frames', type=int, required=True)
    parser.add_argument('--automatic-status', required=True)
    parser.add_argument('--issues', required=True)
    parser.add_argument('--all-19-visually-reviewed', action='store_true', required=True)
    parser.add_argument('--candidate-dir', type=Path)
    args = parser.parse_args()
    plan = json.loads((WORK / 'plan.json').read_text())
    job = next(j for j in plan['jobs'] if j['cast'] == args.cast and j['direction'] == args.direction)
    take = ROOT / job['reviewDirectory']
    base = WORK / args.cast / args.direction
    candidate = args.candidate_dir or base / 'candidate'
    assert candidate.resolve().is_relative_to(base.resolve())
    assert take.resolve().is_relative_to(WORK.resolve())
    assert not (take / 'review.json').exists(), 'review already recorded'
    before = (take / 'game-walk-before.sha256').read_text().strip()
    assert hashlib.sha256((ROOT / 'src/view/walk-v2.json').read_bytes()).hexdigest() == before
    for file in ['all-19-frames.jpg', 'all-19-frames-dark.jpg', 'standing-comparison.png']:
        assert (candidate / file).is_file()
    annotation = json.loads((take / 'contacts.json').read_text())
    assert annotation['visualReviewed'] and annotation['contacts'][-1]['frame'] - annotation['contacts'][0]['frame'] == args.native_period_frames
    report = json.loads((take / 'keyed-reviewed/frames-clean/matte-report.json').read_text())
    assert report['status'] == 'pass'
    metrics = json.loads((candidate / 'metrics.json').read_text())
    source_probe = json.loads((take / 'probe.json').read_text())
    fps_parts = source_probe['streams'][0]['r_frame_rate'].split('/')
    source_fps = float(fps_parts[0]) / float(fps_parts[1])
    native = args.native_period_frames / source_fps
    model_name = 'Genjutsu' if job.get('model') == 'hf_mult_motion_control' else 'Seedance2.5'
    request = json.loads((take / 'request.json').read_text())
    quoted_credits = request.get('quote', {}).get('cost', {}).get('credits', 28)
    review = {'status': f'比較候補：Seedance2.5・{args.direction}画像のみ・6条件',
              'inputImageCount': 1, 'inputDirection': args.direction,
              'referenceVideoCount': sum(m.get('role') in ('video', 'video_references') for m in job.get('params', {}).get('medias', [])),
              'motionRequirementCount': 6, 'equipmentInstructionsIncluded': False,
              'frames': 19, 'cycleMs': 800, 'nativeFullCycleSeconds': native,
              'retimeSpeedMultiplier': native / .8,
              'all19FramesViewedOnLight': True, 'all19FramesViewedOnDark': True,
              'facingRetainedInAllSelectedFrames': True, 'fullBodyAndBothSolesInsideSelectedFrames': True,
              'nativeCanvasEdgePixels': report['edgePixels'], 'contactReview': annotation,
              'selectedOutputSeamReviewed': True, 'automaticGaitLoopStatus': args.automatic_status,
              'issues': [args.issues], 'gameApplied': False, 'userApproved': False,
              'referenceMotionReady': True, 'art_source': 'Higgsfield / Seedance 2.5 image-to-video',
              'generationCountThisRequest': 1, 'quotedCreditsThisRequest': quoted_credits, **metrics}
    if job.get('drivingCast'):
        driver_name = {'lise':'リセ','garan':'ガラン'}.get(job['drivingCast'],job['drivingCast'])
        review.update(drivingCast=job['drivingCast'], drivingDirection=job['drivingDirection'],
                      appearanceSource='own standing image', motionSource='same-direction reference video',
                      art_source=f'Higgsfield / {model_name} image + video reference',
                      status=f'比較候補：{model_name}・{args.direction}立ち絵＋{driver_name}{job["drivingDirection"]}動画・6条件')
    animation = json.loads((candidate / 'animation.json').read_text())
    assert animation['frames'] == 19 and sum(animation['durationsMs']) == 800
    animation.update(status='visually-reviewed-comparison-candidate; user review pending',
                     userApproved=False, nativeFullCycleSeconds=native, retimeSpeedMultiplier=native / .8,
                     automaticGaitLoopStatus=args.automatic_status, art_source=review['art_source'])
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'quiet', '-show_streams',
                                              '-show_format', '-of', 'json', str(candidate / 'walk.mp4')]))
    assert probe['streams'][0]['nb_frames'] == '114' and probe['streams'][0]['r_frame_rate'] == '95/4'
    assert abs(float(probe['format']['duration']) - 4.8) < .02
    (take / 'review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
    (candidate / 'animation.json').write_text(json.dumps(animation, ensure_ascii=False, indent=2) + '\n')
    progress = json.loads((WORK / 'latest-progress.json').read_text())
    key = args.cast + '/' + args.direction
    if key not in progress['walkCandidates']:
        progress['walkCandidates'].append(key)
        progress['remainingWalkDirections'] -= 1
    progress.update(currentTask=key + ' comparison candidate reviewed; no game walking applied',
                    walkingGameApplied=False, quotedPaidCreditsThisWalkingPhase=plan['creditLedger']['quotedPaidCredits'])
    (WORK / 'latest-progress.json').write_text(json.dumps(progress, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'direction': key, 'frames': 19, 'cycleMs': 800, 'gameWalkingUnchanged': True}))


if __name__ == '__main__':
    main()
