#!/usr/bin/env python3
"""Read-only audit of decoded delivery PCM and conservative runtime mix headroom."""
from pathlib import Path
import array, hashlib, json, math, sys, wave
ROOT = Path(__file__).resolve().parent.parent
metadata = json.loads((ROOT/'assets/audio/v1/metadata.json').read_text())
expected = {'bgm-briefing','bgm-tactics','bgm-ending','se-ui','se-move','se-impact','se-heal','se-record','se-mechanism','se-victory','se-defeat'}
assert {c['id'] for c in metadata['cues']} == expected and len(metadata['cues']) == len(expected)
results=[]
for cue in metadata['cues']:
    spec=cue['delivery'];path=ROOT/spec['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==spec['sha256'],cue['id']
    with wave.open(str(path),'rb') as wav:
        assert (wav.getframerate(),wav.getnchannels(),wav.getsampwidth())==(22050,2,2)
        frames=wav.getnframes(); assert frames==spec['frames'];raw=wav.readframes(frames)
    values=array.array('h');values.frombytes(raw)
    if sys.byteorder!='little':values.byteswap()
    assert len(values)==frames*2 and frames>0
    peak=max(abs(v) for v in values)/32768
    rms=math.sqrt(sum((v/32768)**2 for v in values)/len(values))
    dc=[sum(values[ch::2])/frames/32768 for ch in (0,1)]
    rails=sum(v in (-32768,32767) for v in values)
    assert peak>0.001 and rails==0 and max(map(abs,dc))<.005,cue['id']
    assert abs(peak-spec['samplePeak'])<1/32768
    if cue['kind']=='bgm':
        assert spec['loop']==[0,frames] and spec['loopEndExclusive'] is True
    else:assert spec['loop'] is None
    results.append({'id':cue['id'],'frames':frames,'seconds':frames/22050,'samplePeak':peak,'rms':rms,'dc':dc,'railSamples':rails,'sha256':spec['sha256']})
bgm_peak=max(x['samplePeak'] for x in results if x['id'].startswith('bgm'))
se_peak=max(x['samplePeak'] for x in results if x['id'].startswith('se'))
# Bounding two crossfading music voices and three simultaneous SE at category volume=1.
# This is a conservative arithmetic PCM bound, not a browser true-peak or listening test.
headroom=.35
assert 'export const AUDIO_HEADROOM = 0.35' in (ROOT/'src/audio.ts').read_text()
bound=headroom*(2*bgm_peak+3*se_peak)
assert bound<1
report={'deliveryFiles':results,'conservativeMaximumPCMAmplitude':bound,'boundDbFS':20*math.log10(bound),'headroom':headroom,'maximumMusicVoices':2,'maximumSEVoices':3,'sampleClippingBound':'below full-scale under stated voice and gain limits','truePeak':'not measured','LUFS':'not measured','listening':'not performed','nativeBrowser':'not performed'}
print(json.dumps(report,ensure_ascii=False,indent=2))
