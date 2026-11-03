"""Checkpoint a strictly serial cast review queue. Never calls a generation API."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'
NAMES = {'sena':'セナ','iva':'イヴァ','dani':'ダニ','guard':'ガード','archer':'アーチャー','vesk':'Vesk','toma':'トマ','worker':'労働者','delegation':'代表者'}
VIEWS = {'E':'右下向き、正面斜め','N':'右上向き、背面斜め','S':'左下向き、正面斜め','W':'左上向き、背面斜め'}


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('action', choices=['prepare','record','complete','annotate','candidate','reject','failed'])
    ap.add_argument('--cast', choices=list(NAMES), required=True)
    ap.add_argument('--direction', choices=list(VIEWS), required=True)
    ap.add_argument('--result-url')
    ap.add_argument('--start', type=int)
    ap.add_argument('--middle', type=int)
    ap.add_argument('--end', type=int)
    ap.add_argument('--first-foot', choices=['L','R'])
    ap.add_argument('--note')
    ap.add_argument('--reviewed-all19', action='store_true')
    args = ap.parse_args()
    queue = read(WORK / 'remaining-cast-sequential-v1.json')
    index = next(i for i, r in enumerate(queue['order']) if (r['cast'], r['direction']) == (args.cast, args.direction))
    row = queue['order'][index]
    plan = read(WORK / 'plan.json')
    job = next(j for j in plan['jobs'] if (j['cast'], j['direction']) == (args.cast, args.direction))
    base = WORK / args.cast / args.direction
    take = base / 'reference-v1'
    candidate = base / 'candidate'
    request_file = WORK / f'{args.cast}-{args.direction}-reference-v1-request.json'
    if args.action in ('prepare','record'):
        assert all(r['status'] in ('candidate','rejected') for r in queue['order'][:index]), 'prior direction must be reviewed first'
    if args.action == 'prepare':
        assert row['status'] == 'queued' and not request_file.exists()
        assert hashlib.sha256((base/'master.png').read_bytes()).hexdigest() == job['masterSha256']
        ref = row['referenceCast']
        template = (WORK/'remaining-cast-prompt-template.txt').read_text().strip()
        replacements = {'{{SUBJECT}}':NAMES[args.cast], '{{REF}}':'リセ' if ref == 'lise' else 'ガラン', '{{DIR}}':args.direction, '{{VIEW}}':VIEWS[args.direction]}
        for key, value in replacements.items():
            template = template.replace(key, value)
        params = {'model':'seedance_2_5','mode':'omni_reference','duration':4,'resolution':'720p',
                  'generate_audio':False,'count':1,'aspect_ratio':'1:1','prompt':template,
                  'medias':[{'role':'start_image','value':read(WORK/f'{args.cast}-input-media.json')[args.direction]},
                            {'role':'video','value':read(WORK/'remaining-cast-reference-media.json')[ref+'/'+args.direction]}]}
        take.mkdir(exist_ok=True)
        write(take/'request-params.json', params)
        print(json.dumps({'paramsFile':str((take/'request-params.json').relative_to(ROOT))}))
        return
    if args.action == 'record':
        assert row['status'] == 'queued'
        request = read(request_file)
        assert request['params']['model'] == 'seedance_2_5' and request['quote']['cost']['credits'] == 28
        take.mkdir(exist_ok=True)
        write(take/'request.json', request)
        (take/'prompt.txt').write_text(request['params']['prompt'])
        (take/'game-walk-before.sha256').write_text(hashlib.sha256((ROOT/'src/view/walk-v2.json').read_bytes()).hexdigest())
        job.update(directory=str(take.relative_to(ROOT)),reviewDirectory=str(take.relative_to(ROOT)),
                   status='in_progress',model='seedance_2_5',params=request['params'],prompt=request['params']['prompt'],
                   media_id=request['params']['medias'][0]['value'],job_id=request['submission']['results'][0]['id'],
                   inputMethod='own standing + same-direction reference video + original six conditions',
                   motionRequirementCount=6,drivingCast=row['referenceCast'],drivingDirection=args.direction)
        plan['creditLedger']['paidJobs'] += 1
        plan['creditLedger']['quotedPaidCredits'] += 28
        row.update(status='in_progress',job_id=job['job_id'])
    elif args.action == 'complete':
        assert row['status'] == 'in_progress' and args.result_url.startswith('https://d8j0ntlcm91z4.cloudfront.net/')
        job.update(status='completed',type='video',result_url=args.result_url)
        row.update(status='generated')
    elif args.action == 'annotate':
        assert row['status'] == 'generated' and args.note and args.first_foot
        assert 0 <= args.start < args.middle < args.end
        other = 'R' if args.first_foot == 'L' else 'L'
        annotation = {'videoSha256':hashlib.sha256((take/'source.mp4').read_bytes()).hexdigest(),
                      'visualReviewed':True,'framesDirectory':'keyed-reviewed/frames-clean',
                      'estimatedContactUncertaintyFrames':2,
                      'contacts':[{'frame':args.start,'foot':args.first_foot},{'frame':args.middle,'foot':other},{'frame':args.end,'foot':args.first_foot}],
                      'reviewNote':args.note + ' Estimated support phases, not motion capture.'}
        write(take/'contacts.json', annotation)
        subprocess.run([sys.executable,str(ROOT/'scripts/package-standing-walk-cycle.py'),'--take',str(take),'--master',str(base/'master.png'),'--contacts',str(take/'contacts.json'),'--output',str(candidate)],check=True)
        subprocess.run([sys.executable,str(ROOT/'scripts/review-standing-walk-take.py'),'evidence','--cast',args.cast,'--direction',args.direction],check=True)
        result = subprocess.run([sys.executable,str(ROOT/'.codex/skills/video2dsprite/scripts/gait_loop.py'),'select','--frames-dir',str(take/'keyed-reviewed/frames-clean'),'--fps','24','--state','walk','--evaluate',f'{args.start}:{args.end}','--output-dir',str(take/'gait-audit'),'--no-aids'],capture_output=True,text=True)
        write(take/'automatic-review.json',{'returncode':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
        print(json.dumps({'automaticReturnCode':result.returncode,'automaticOutput':result.stdout or result.stderr}))
        return
    elif args.action == 'candidate':
        assert row['status'] == 'generated' and args.reviewed_all19 and args.note
        annotation = read(take/'contacts.json')
        auto = read(take/'automatic-review.json')
        automatic = 'automatic selection requires visual review' if auto['returncode']==0 else 'automatic loop gate not passed; manual contact window used'
        subprocess.run([sys.executable,str(ROOT/'scripts/finalize-standing-walk-review.py'),'--cast',args.cast,'--direction',args.direction,'--native-period-frames',str(annotation['contacts'][-1]['frame']-annotation['contacts'][0]['frame']),'--automatic-status',automatic,'--issues',args.note,'--all-19-visually-reviewed'],check=True)
        job['candidateDirectory'] = str(candidate.relative_to(ROOT))
        row.update(status='candidate',reviewNote=args.note)
    elif args.action == 'failed':
        assert row['status'] == 'in_progress' and args.note
        job.update(status='failed',error=args.note)
        write(take/'review.json',{'status':'生成失敗','referenceMotionReady':False,'gameApplied':False,'userApproved':False,'issues':[args.note],'quotedCreditsThisRequest':28})
        row.update(status='rejected',reviewNote='Generation failed: '+args.note)
    elif args.action == 'reject':
        assert row['status'] == 'generated' and args.note
        files = sorted((take/'keyed/frames-raw').glob('*.png'))
        im = Image.open(files[min(24,len(files)-1)])
        im.thumbnail((600,600))
        im.save(take/'rejected-preview.png')
        write(take/'review.json',{'status':'不採用：'+args.note,'referenceMotionReady':False,'gameApplied':False,'userApproved':False,'referenceVideoCount':1,'issues':[args.note],'quotedCreditsThisRequest':28})
        row.update(status='rejected',reviewNote=args.note)
    plan['activeTask'] = f'Remaining36 serial generation: {args.cast}/{args.direction} {row["status"]}'
    write(WORK/'plan.json',plan)
    write(WORK/'remaining-cast-sequential-v1.json',queue)
    progress = read(WORK/'latest-progress.json')
    counts = {state:sum(r['status']==state for r in queue['order']) for state in ['queued','in_progress','generated','candidate','rejected']}
    progress.update(currentTask=plan['activeTask'],remainingCastProgress=counts,
                    remainingCastQuotedCreditsSpent=28*(36-counts['queued']),
                    remainingCastQuotedCreditAllocation=1008,
                    quotedPaidCreditsThisWalkingPhase=plan['creditLedger']['quotedPaidCredits'],
                    walkingGameApplied=False)
    write(WORK/'latest-progress.json',progress)
    if args.action in ('record','candidate','reject','failed'):
        subprocess.run([sys.executable,str(ROOT/'scripts/build-lise-walk-reference.py'),'--cast',args.cast],check=True)
        subprocess.run([sys.executable,str(ROOT/'scripts/build-standing-walk-review.py')],check=True)
    print(json.dumps({'cast':args.cast,'direction':args.direction,'status':row['status'],'job_id':row.get('job_id')}))


if __name__ == '__main__':
    main()
