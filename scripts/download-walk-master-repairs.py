"""Download only explicitly submitted directional master repair jobs."""
import argparse
import concurrent.futures
import json
import urllib.request
from pathlib import Path

def main():
    parser=argparse.ArgumentParser();parser.add_argument('status',type=Path);parser.add_argument('--work',type=Path,required=True);args=parser.parse_args()
    requests={r['index']:r for r in json.loads((args.work/'master-requests.json').read_text())}
    def download(j):
        if j['status']!='completed':return
        r=requests[j['index']];dest=args.work/'masters'/r['cast']/r['direction'];dest.mkdir(parents=True,exist_ok=True)
        output=dest/'generated.png'
        if not output.exists():
            tmp=output.with_suffix('.part');urllib.request.urlretrieve(j['result_url'],tmp);tmp.replace(output)
        (dest/'generation.json').write_text(json.dumps({**r,'job_id':j['job_id'],'result_url':j['result_url']},indent=2)+'\n')
        return {'index':j['index'],'bytes':output.stat().st_size}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(download,json.loads(args.status.read_text())):
            if result:print(json.dumps(result),flush=True)

if __name__=='__main__':main()
