"""Record an explicitly requested retry without deleting the prior take."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'

def read(p):
    return json.loads(p.read_text())

def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('action', choices=['record', 'complete', 'finish'])
    ap.add_argument('--cast', choices=['dani', 'guard'], required=True)
    ap.add_argument('--url')
    ap.add_argument('--take-name', choices=['genjutsu-retry-v1', 'genjutsu-retry-v2', 'seedance-retry-v2', 'seedance-retry-v3', 'seedance-retry-v4'], default='genjutsu-retry-v1')
    a = ap.parse_args()
    take = WORK / a.cast / 'S' / a.take_name
    request = read(take / 'request.json')
    plan = read(WORK / 'plan.json')
    queue = read(WORK / 'remaining-cast-sequential-v1.json')
    job = next(j for j in plan['jobs'] if (j['cast'], j['direction']) == (a.cast, 'S'))
    row = next(j for j in queue['order'] if (j['cast'], j['direction']) == (a.cast, 'S'))
    if a.action == 'record':
        assert not (take / 'previous-job.json').exists(), 'retry already recorded'
        write(take / 'previous-job.json', job)
        params = request['params']
        assert params['model'] in ('hf_mult_motion_control', 'seedance_2_5') and params['count'] == 1
        if job.get('candidateDirectory'):
            job['previousCandidateDirectory'] = job.pop('candidateDirectory')
        job.update(directory=str(take.relative_to(ROOT)), reviewDirectory=str(take.relative_to(ROOT)),
                   model=params['model'], params=params, status='in_progress',
                   job_id=request['submission']['results'][0]['id'])
        plan['creditLedger']['paidJobs'] += 1
        plan['creditLedger']['quotedPaidCredits'] += request['quote']['cost']['credits']
        (take / 'game-walk-before.sha256').write_text(hashlib.sha256((ROOT / 'src/view/walk-v2.json').read_bytes()).hexdigest())
        (take / 'prompt.txt').write_text(params['prompt'])
        row.setdefault('firstAttemptStatus', row['status'])
        row.update(status='in_progress', retryModel=params['model'], retryJobId=job['job_id'])
    elif a.action == 'complete':
        assert a.url and a.url.startswith('https://d8j0ntlcm91z4.cloudfront.net/')
        job.update(status='completed', result_url=a.url)
        row['status'] = 'generated'
    else:
        review = read(take / 'review.json')
        row['status'] = 'candidate' if review['referenceMotionReady'] else 'rejected'
        row['reviewNote'] = ' / '.join(review['issues'])
        if review['referenceMotionReady']:
            version = a.take_name.rsplit('-', 1)[-1]
            engine = a.take_name.split('-', 1)[0]
            job['candidateDirectory'] = str((WORK / a.cast / 'S' / f'candidate-{engine}-{version}').relative_to(ROOT))
    plan['activeTask'] = f'{a.cast}/S {request["params"]["model"]} retry: {row["status"]}; comparison only'
    write(WORK / 'plan.json', plan)
    write(WORK / 'remaining-cast-sequential-v1.json', queue)
    progress = read(WORK / 'latest-progress.json')
    progress.update(currentTask=plan['activeTask'], walkingGameApplied=False,
                    quotedPaidCreditsThisWalkingPhase=plan['creditLedger']['quotedPaidCredits'],
                    remainingCastProgress={s:sum(r['status']==s for r in queue['order']) for s in ['queued','in_progress','generated','candidate','rejected']})
    write(WORK / 'latest-progress.json', progress)
    print(plan['activeTask'])

if __name__ == '__main__':
    main()
