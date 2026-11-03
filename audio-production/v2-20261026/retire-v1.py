#!/usr/bin/env python3
"""One-time, recoverable relocation of superseded audio only. Never deletes."""
from pathlib import Path
import hashlib,json,shutil,datetime
STAGE=Path(__file__).resolve().parent;ROOT=STAGE.parents[1]
report=json.loads((STAGE/'delivery-verification.json').read_text());browser=json.loads((STAGE/'browser-verification.json').read_text())
assert len(report['deliveryFiles'])==35 and browser['all35HTTP_SHA_decode_sourceStart'] is True
for c in report['deliveryFiles']:
 path=ROOT/'public/audio/v2'/f"{c['id']}.wav"
 assert hashlib.sha256(path.read_bytes()).hexdigest()==c['sha256']
 assert c['http']['status']==200
for path in (ROOT/'src').rglob('*.ts'):
 text=path.read_text();assert '/audio/v1/' not in text and 'bgm-tactics' not in text and 'se-move' not in text,path
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target=Path.home()/'.Trash'/('tactics-audio-v1-'+stamp)
assert not target.exists()
paths=[ROOT/'assets/audio/v1',ROOT/'public/audio/v1',ROOT/'dist/audio/v1']
receipt={'createdUTC':stamp,'method':'shutil.move into ordinary ~/.Trash; no permanent deletion or emptying','target':str(target),'moves':[],'complete':False}
for source in paths:
 if not source.exists():continue
 files=[{'source':str(f),'relative':str(f.relative_to(source)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in source.rglob('*') if f.is_file()]
 receipt['moves'].append({'source':str(source),'target':str(target/str(source.relative_to(ROOT)).replace('/','__')),'files':files,'moved':False})
(STAGE/'trash-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
target.mkdir()
for item in receipt['moves']:
 shutil.move(item['source'],item['target'])
 assert not Path(item['source']).exists()
 for f in item['files']:assert hashlib.sha256((Path(item['target'])/f['relative']).read_bytes()).hexdigest()==f['sha256']
 item['moved']=True
 (STAGE/'trash-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
receipt['complete']=True
(STAGE/'trash-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'target':str(target),'movedDirectories':len(receipt['moves']),'movedFiles':sum(len(x['files']) for x in receipt['moves']),'hashesVerified':True,'permanentlyDeleted':False},ensure_ascii=False))
