"""Upload only the four prepared pilot images to issued Higgsfield URLs."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
work = root / 'artifacts/walk-from-standing-v1'
rows = json.loads((work / 'pilot-upload-requests.json').read_text())
for row in rows:
    path = work / 'lise' / row['direction'] / 'input.jpg'
    assert row['direction'] in 'NESW'
    assert row['upload_url'].startswith('https://upload.higgsfield.ai/')
    result = subprocess.run(['curl', '-sS', '-f', '-X', 'PUT', '-H', 'Content-Type: image/jpeg',
                             '--upload-file', str(path), row['upload_url'], '-w', '%{http_code}'],
                            capture_output=True, check=True)
    assert result.stdout.decode().endswith('200')
    print(row['direction'] + ': HTTP 200', flush=True)
