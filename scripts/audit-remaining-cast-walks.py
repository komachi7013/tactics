"""Audit the authorized 36 serial takes and comparison packages without generating."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    queue = read(WORK/'remaining-cast-sequential-v1.json')
    plan = read(WORK/'plan.json')
    refs = read(WORK/'remaining-cast-reference-media.json')
    six = re.findall(r'^[1-6]\. .*$', (WORK/'remaining-cast-prompt-template.txt').read_text(), re.M)
    assert len(six) == 6
    assert len(queue['order']) == 36
    assert all(r['status'] in ('candidate','rejected') for r in queue['order']), 'unfinished directions remain'
    game_sha = sha(ROOT/'src/view/walk-v2.json')
    results = []
    for row in queue['order']:
        cast, direction = row['cast'], row['direction']
        job = next(j for j in plan['jobs'] if (j['cast'],j['direction']) == (cast,direction))
        take = ROOT/job['reviewDirectory']
        request = read(take/'request.json')
        params = request['params']
        assert params['model'] == 'seedance_2_5' and params['count'] == 1
        assert request['quote']['cost']['credits'] == 28
        assert len(request['submission']['results']) == 1
        assert request['submission']['results'][0]['id'] == row['job_id'] == job['job_id']
        assert re.findall(r'^[1-6]\. .*$',params['prompt'],re.M) == six
        assert params['medias'] == [
            {'role':'start_image','value':read(WORK/f'{cast}-input-media.json')[direction]},
            {'role':'video','value':refs[f'{row["referenceCast"]}/{direction}']}]
        assert sha(WORK/cast/direction/'master.png') == job['masterSha256']
        assert (take/'game-walk-before.sha256').read_text().strip() == game_sha
        assert (take/'source.mp4').stat().st_size > 1000
        review = read(take/'review.json')
        assert review['gameApplied'] is False and review['userApproved'] is False
        entry = {'cast':cast,'direction':direction,'status':row['status'],
                 'jobId':row['job_id'],'referenceCast':row['referenceCast'],
                 'sourceSha256':sha(take/'source.mp4'),'issues':review['issues']}
        if row['status'] == 'candidate':
            candidate = ROOT/job['candidateDirectory']
            animation = read(candidate/'animation.json')
            assert animation['frames'] == 19 and animation['cycleMs'] == 800
            assert len(animation['durationsMs']) == 19 and sum(animation['durationsMs']) == 800
            indices = animation['sourceIndices']
            assert len(indices) == 19 and all(a < b for a,b in zip(indices,indices[1:])), 'nonchronological frames'
            assert animation['sourceVideoSha256'] == entry['sourceSha256']
            assert sha(candidate/'walk.png') == animation['sheetSha256']
            assert animation['gameApplied'] is False
            assert review['all19FramesViewedOnLight'] and review['all19FramesViewedOnDark']
            assert review['referenceVideoCount'] == 1
            assert read(take/'keyed-reviewed/frames-clean/matte-report.json')['status'] == 'pass'
            frames = sorted(candidate.glob('frame_*.png'))
            assert len(frames) == 19
            for frame in frames:
                im = Image.open(frame)
                assert im.mode == 'RGBA' and im.size == (256,300)
                bounds = im.getchannel('A').getbbox()
                assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < 256 and bounds[3] < 300
            probe = json.loads(subprocess.check_output(['ffprobe','-v','quiet','-of','json',
                '-show_streams','-show_format',str(candidate/'walk.mp4')]))
            assert int(probe['streams'][0]['nb_frames']) == 114
            assert abs(float(probe['format']['duration'])-4.8) < .01
            entry.update(frames=19,cycleMs=800,videoFrames=114,videoSeconds=4.8,
                         nativeFullCycleSeconds=review['nativeFullCycleSeconds'],
                         automaticGaitLoopStatus=review['automaticGaitLoopStatus'])
        else:
            assert review['referenceMotionReady'] is False
        results.append(entry)
    candidates = sum(r['status']=='candidate' for r in results)
    report = {'status':'comparison-deliverables-verified','generatedDirections':36,
              'comparisonCandidates':candidates,'rejected':36-candidates,
              'quotedCredits':1008,'extraRetakes':0,'model':'seedance_2_5',
              'gameWalkingUnchanged':True,'gameWalkingSha256':game_sha,
              'scopeStandingMastersUnchanged':True,
              'scope':'File, media-input and timing verification plus recorded manual reviews. Not motion-capture or anatomical certification; user visual review pending.',
              'directions':results}
    (WORK/'remaining36-final-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='directions'},ensure_ascii=False))


if __name__ == '__main__':
    main()
