"""Upload explicitly listed generation inputs inside the standing-walk workspace."""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'
parser = argparse.ArgumentParser()
parser.add_argument('--requests', type=Path, required=True)
args = parser.parse_args()
assert args.requests.resolve().is_relative_to(WORK.resolve())
for row in json.loads(args.requests.read_text()):
    path = (WORK / row['path']).resolve()
    assert path.is_relative_to(WORK.resolve()) and path.is_file()
    assert row['upload_url'].startswith('https://upload.higgsfield.ai/')
    r = subprocess.run(['curl', '-sS', '-f', '-X', 'PUT', '-H', 'Content-Type: ' + row['content_type'],
                        '--upload-file', str(path), row['upload_url'], '-w', '%{http_code}'],
                       capture_output=True, check=True)
    assert r.stdout.decode().endswith('200')
    print(row['path'] + ': HTTP 200', flush=True)
