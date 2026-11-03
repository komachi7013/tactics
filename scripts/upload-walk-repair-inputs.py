"""PUT already-local sprite inputs to tool-provided upload URLs."""
import concurrent.futures
import argparse
import json
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v2'

def upload(row):
    path=(ROOT/row['path']).resolve();assert path.is_relative_to(WORK.resolve()) and path.is_file()
    result=subprocess.run(['curl','-sS','-f','-X','PUT','-H','Content-Type: '+row['content_type'],
        '--data-binary','@'+str(path),row['upload_url'],'-w','%{http_code}'],capture_output=True)
    status=result.stdout.decode(errors='replace')[-3:]
    record={k:v for k,v in row.items() if k!='upload_url'};record['httpStatus']=status
    print(json.dumps({'filename':row['filename'],'status':status}),flush=True)
    if result.returncode or status!='200':raise RuntimeError('Upload did not return HTTP 200: '+row['filename'])
    return record

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--requests',type=Path,default=Path('/tmp/walk-repair-upload-requests.json'));parser.add_argument('--output',type=Path,default=WORK/'upload-results.json');args=parser.parse_args()
    assert args.output.resolve().is_relative_to(WORK.resolve())
    rows=json.loads(args.requests.read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(upload,rows))
    args.output.write_text(json.dumps(results,indent=2)+'\n')

if __name__=='__main__':main()
