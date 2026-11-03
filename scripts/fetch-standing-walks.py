"""Download confirmed result URLs, skipping already fetched clips."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'
plan = json.loads((WORK / 'plan.json').read_text())
jobs = plan['jobs'] + [r for j in plan['jobs'] for r in j.get('retakes', [])]
for job in jobs:
    if job.get('status') != 'completed' or not job.get('result_url'):
        continue
    path = ROOT / job['directory'] / 'source.mp4'
    if path.exists() and path.stat().st_size > 1000:
        continue
    assert job['result_url'].startswith('https://')
    subprocess.run(['curl', '-sS', '-f', '-L', job['result_url'], '-o', str(path)], check=True)
    print(job['cast'] + '/' + job['direction'] + ': downloaded', flush=True)
