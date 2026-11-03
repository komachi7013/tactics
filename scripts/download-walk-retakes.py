"""Resume downloads for explicitly submitted Higgsfield replacement jobs."""
import argparse
import concurrent.futures
import json
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'artifacts/walk-higgsfield-v4'


def download(j):
    clip=ROOT/j['directory']/'clip.mp4'
    if not clip.exists():
        temp=clip.with_suffix('.part')
        urllib.request.urlretrieve(j['result_url'],temp);temp.replace(clip)
    return {'index':j['index'],'bytes':clip.stat().st_size}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('status',type=Path);parser.add_argument('--work',type=Path,default=WORK);args=parser.parse_args()
    path=args.work/'retakes.json';plan=json.loads(path.read_text())
    statuses={s['index']:s for s in json.loads(args.status.read_text())}
    for j in plan['jobs']:
        s=statuses.get(j.get('submissionIndex',j['index']),statuses.get(j['index'],{}))
        if s:
            canonical_index=j['index'];j.update(s)
            if s['index']!=canonical_index:j['submissionIndex']=s['index'];j['index']=canonical_index
    path.write_text(json.dumps(plan,indent=2)+'\n')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for r in pool.map(download,[j for j in plan['jobs'] if j.get('result_url') and j['status']=='completed']):
            print(json.dumps(r),flush=True)


if __name__=='__main__':main()
