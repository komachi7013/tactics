"""Evaluate correction drafts against Garan E's fixed head and sole lines.

No quantile/median foot envelope, and no automatic anatomy acceptance.
"""
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v2'
spec=importlib.util.spec_from_file_location('geometry_check',ROOT/'scripts/check-garan-body-proportions.py')
geometry=importlib.util.module_from_spec(spec);spec.loader.exec_module(geometry)


def main():
    before=json.loads((WORK/'review-before.json').read_text())['rows']
    plan={j['index']:j for j in json.loads((WORK/'retakes.json').read_text())['jobs']}
    issue_plan=json.loads((WORK/'issues.json').read_text())['issues'];issues={r['index']:r for r in issue_plan}
    manual_file=WORK/'manual-reviews.json';manual=json.loads(manual_file.read_text()) if manual_file.exists() else {}
    results=[]
    for old in before:
        index=old['index'];j=plan.get(index);out=WORK/'normalized'/old['cast']/old['direction']
        candidate=out/'normalization.json';row={'index':index,'cast':old['cast'],'direction':old['direction'],'issues':issues.get(index,{}).get('issues',[]),'before':old}
        if not j:
            row['status']='unchanged';row['display']=old;results.append(row);continue
        master_path=ROOT/j['directory']/'master.png'
        body=geometry.norm.revise.measure_body(np.asarray(Image.open(master_path).convert('RGBA'))[:,:,3],2)
        row['masterGeometry']={'cell':256,'bodyReferenceHeight':body.height,'masterGround':body.ground,'frames':1}
        if not candidate.exists() or json.loads(candidate.read_text()).get('job_id')!=j.get('job_id'):
            row['status']='processing' if j.get('job_id') else 'awaiting-generation';row['display']=old
            rejection=ROOT/j['directory']/'rejection.json'
            if rejection.exists():row['status']='source-rejected';row['rejection']=json.loads(rejection.read_text())
            results.append(row);continue
        m=json.loads(candidate.read_text());metrics=geometry.measure(out)
        import hashlib
        sha=hashlib.sha256((out/'walk.png').read_bytes()).hexdigest()
        reasons=[]
        if abs(metrics['headTopMedianPx']-100)>1.5:reasons.append('head-top-position')
        if abs(metrics['lowestFootRangePx'][1]-280)>2:reasons.append('sole-line-extent')
        if m['frames']!=19 or m['cycleMs']!=800:reasons.append('cadence')
        if m['sourceIndices']!=list(range(m['sourceIndices'][0],m['sourceIndices'][0]+19)):reasons.append('source-order')
        if m['edgePixels']:reasons.append('output-clipping')
        qa=json.loads((ROOT/j['directory']/'source-qa.json').read_text())
        if qa['clipped'] or qa['frames']!=84:reasons.append('source-clipping')
        review=manual.get(str(index),{});bound=review.get('sheetSha256')==sha and review.get('job_id')==j.get('job_id')
        checks=['identityMatch','bodyProportionsAccepted','feetFacingConsistent','legsAlternateVisually','contactBandAccepted']
        accepted=bound and review.get('allFramesInspected')==19 and all(review.get(c) is True for c in checks)
        visual_rejected=bound and any(review.get(c) is False for c in checks)
        candidate_file=WORK/old['cast']/old['direction']/'candidates.json'
        evidence=json.loads(candidate_file.read_text()) if candidate_file.exists() else {}
        # Image recurrence can select a two-cycle harmonic. It never proves
        # that both anatomical feet have stepped within the exported window.
        recurrence={'detectedLag':evidence.get('legPeriod'),'sourceFps':evidence.get('sourceFps'),
                    'anatomicalCycleCertified':False,'interpretation':'recurrence only; full two-step cycle requires visual review'}
        row.update(status='visual-rejected' if visual_rejected else 'geometry-rejected' if reasons else 'verified-draft' if accepted else 'needs-visual-review',geometryReasons=reasons,metrics=metrics,recurrenceEvidence=recurrence,manualReview=review if bound else None,
            display={'index':index,'cast':old['cast'],'direction':old['direction'],'directory':'/'+str(out.relative_to(ROOT)),'metadata':m,'sha256':sha})
        results.append(row)
    report={'frames':19,'cycleMs':800,'baseline':'unchanged Garan E; head top y100 / maximum sole extent y280','status':'draft corrections; no game publication','rows':results}
    (WORK/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({s:sum(r['status']==s for r in results) for s in sorted({r['status'] for r in results})}))
    for r in results:
        if r.get('metrics'):print(r['index'],r['cast'],r['direction'],r['status'],r['metrics']['headTopMedianPx'],r['metrics']['lowestFootRangePx'][1])

if __name__=='__main__':main()
