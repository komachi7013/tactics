#!/usr/bin/env python3
"""Read-only v2 delivery/PCM/loop/hash/HTTP audit. Use .venv/bin/python."""
from pathlib import Path
import hashlib,json,math,runpy,sys,urllib.request
ROOT=Path(__file__).resolve().parent.parent
STAGE=ROOT/'audio-production/v2-20261026'
build=runpy.run_path(str(STAGE/'build.py'))
metadata=json.loads((STAGE/'metadata.json').read_text())
origin=next((v.split('=',1)[1] for v in sys.argv if v.startswith('--origin=')),'http://127.0.0.1:5173')
expected={'bgm-'+c[0] for c in build['CUES']}|{'se-'+s for s in build['SE']}|{'se-victory','se-defeat'}
assert {c['id'] for c in metadata['cues']}==expected and len(expected)==35
results=[]
for cue in metadata['cues']:
 path=ROOT/'public/audio/v2'/f"{cue['id']}.wav"
 # metrics uses paths relative to STAGE, so inspect identical staging delivery
 # then hash actual served copy; do not regenerate or modify either file.
 assert path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==cue['delivery']['sha256'],cue['id']
 actual=build['metrics'](STAGE/cue['delivery']['file'],cue['id'].startswith('bgm'))
 assert actual==cue['delivery'],cue['id']
 assert actual['sampleRate']==22050 and actual['channels']==2
 if cue['id'].startswith('bgm'):
  assert not actual['boundary']['numericalFlags'],cue['id']
  assert actual['loop']==[0,actual['frames']]
 if '--http' in sys.argv:
  url=origin+'/audio/v2/'+path.name
  with urllib.request.urlopen(url,timeout=15) as response:
   body=response.read();assert response.status==200 and 'audio' in response.headers.get('Content-Type','')
   assert hashlib.sha256(body).hexdigest()==actual['sha256']
  actual['http']=dict(url=url,status=response.status,contentType=response.headers.get('Content-Type'),sha256='matches')
 results.append(dict(id=cue['id'],**actual))
bgm=max(c['samplePeak'] for c in results if c['id'].startswith('bgm'));se=max(c['samplePeak'] for c in results if c['id'].startswith('se'))
bound=.35*(2*bgm+3*se);assert bound<1
assert 'export const AUDIO_HEADROOM = 0.35' in (ROOT/'src/audio.ts').read_text()
assert '/audio/v1/' not in (ROOT/'src/main.ts').read_text()
print(json.dumps(dict(deliveryFiles=results,conservativeMaximumPCMAmplitude=bound,boundDbFS=20*math.log10(bound),headroom=.35,maximumMusicVoices=2,maximumSEVoices=3,truePeak='not measured',LUFS='not measured',listening='not performed',verification='PCM, loop diagnostics, SHA, optional HTTP; not acoustic quality'),ensure_ascii=False,indent=2))
