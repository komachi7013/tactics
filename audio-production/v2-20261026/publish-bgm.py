"""Publish selected validated BGM in place. Never writes SE bytes."""
from pathlib import Path
import hashlib,json,shutil,sys,wave
P=Path(__file__).resolve().parent;R=P.parents[1]
m=json.loads((P/'metadata.json').read_text());selected=set(sys.argv[1:]) or {c['id'] for c in m['cues'] if c['id'].startswith('bgm-')}
se_before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (R/'public/audio/v2').glob('se-*.wav')}
for c in m['cues']:
 if c['id'] not in selected:continue
 assert c.get('compositionRevision')=='independent-r2'
 assert not c['delivery']['boundary']['numericalFlags'],c['id']
 source=P/c['delivery']['file'];assert hashlib.sha256(source.read_bytes()).hexdigest()==c['delivery']['sha256']
 shutil.copyfile(source,R/'public/audio/v2'/source.name)
 if c['id'] in ('bgm-title','bgm-prologue','bgm-b12'):
  with wave.open(str(source),'rb') as w:params=w.getparams();data=w.readframes(w.getframerate()*20)
  with wave.open(str(P/'short-previews'/f"tactics-{c['id'][4:]}-preview-20s.wav"),'wb') as w:w.setparams(params);w.writeframes(data)
versions={c['id']:hashlib.sha256((R/'public/audio/v2'/f"{c['id']}.wav").read_bytes()).hexdigest()[:12] for c in m['cues'] if c['id'].startswith('bgm-')}
(R/'src/audio-versions.json').write_text(json.dumps(versions,indent=2)+'\n')
manifest={'revision':'independent-r2','updatedBGM':[c['id'] for c in m['cues'] if c.get('compositionRevision')=='independent-r2'],'cues':[dict(id=c['id'],title=c['title'],sha256=hashlib.sha256((R/'public/audio/v2'/f"{c['id']}.wav").read_bytes()).hexdigest(),revision=c.get('compositionRevision','unchanged')) for c in m['cues']]}
(R/'public/audio/v2/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
assert se_before=={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (R/'public/audio/v2').glob('se-*.wav')}
(P/'se-preservation-r2.json').write_text(json.dumps({'all19Unchanged':True,'sha256':se_before},indent=2)+'\n')
print('Overwritten BGM:',sorted(selected),'SE unchanged:',len(se_before))
