"""Plan reversible cleanup, retaining final48 and file references from retained pages/stills."""
import json,re
from pathlib import Path
from urllib.parse import unquote,urlsplit
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'artifacts/walk-from-standing-v1'
plan=json.loads((WORK/'plan.json').read_text());finals={ROOT/j.get('candidateDirectory',f"artifacts/walk-from-standing-v1/{j['cast']}/{j['direction']}/candidate") for j in plan['jobs']}
assert len(finals)==48 and all((p/'walk.png').is_file() and (p/'walk.mp4').is_file() for p in finals)
keep_pages={WORK/'preview.html',WORK/'game-contact-check.html'}|{WORK/f"{j['cast']}-reference.html" for j in plan['jobs']}
protected=set();todo=set()
# Exact final master and final assets; movie PNGs duplicate the exported frame files.
for final in finals:
 protected.update(p for p in final.rglob('*') if p.is_file() and 'movie' not in p.relative_to(final).parts)
for j in plan['jobs']:protected.add(WORK/j['cast']/j['direction']/'master.png')
# Old comparison pages and standing manifests may still reference specific intermediate files.
def remember(value,owner):
 if not isinstance(value,str) or len(value)>800 or '\n' in value:return
 value=unquote(urlsplit(value).path) if not value.startswith('artifacts/') else value
 if not value or value.startswith(('http:','https:','data:')):return
 paths=[]
 if value.startswith('/assets/'): paths=[ROOT/'public'/value.lstrip('/')]
 elif value.startswith('/artifacts/'):paths=[ROOT/value.lstrip('/')]
 elif value.startswith('artifacts/'):paths=[ROOT/value]
 elif '/' in value or value.endswith(('.png','.jpg','.mp4','.webm','.gif')):paths=[owner.parent/value,ROOT/value]
 for path in paths:
  path=path.resolve()
  if path.is_file():protected.add(path)
for owner in (ROOT/'artifacts').rglob('*.html'):
 if WORK in owner.parents and owner not in keep_pages:continue
 for value in re.findall(r'''["']([^"'<>]+)["']''',owner.read_text(errors='ignore')):remember(value,owner)
# Preserve standing-source provenance references, including their original masters.
for owner in (ROOT/'artifacts/standing-cast-review-v1').rglob('*.json'):
 def visit(obj):
  if isinstance(obj,str):remember(obj,owner)
  elif isinstance(obj,list):
   for x in obj:visit(x)
  elif isinstance(obj,dict):
   for x in obj.values():visit(x)
 try:visit(json.loads(owner.read_text()))
 except ValueError:pass
# Current production: retire all non-final take trees, input derivatives and old proof images.
for job in plan['jobs']:
 folder=WORK/job['cast']/job['direction'];final=ROOT/job.get('candidateDirectory',str(folder.relative_to(ROOT)/'candidate'))
 for item in folder.iterdir():
  if item==final:
   if (item/'movie').exists():todo.add(item/'movie')
  elif item.is_dir():todo.add(item)
  elif item not in protected and item.suffix.lower() in {'.png','.jpg','.mp4','.webm','.gif'}:todo.add(item)
for item in WORK.iterdir():
 if item.is_file() and ((item.suffix=='.html' and item not in keep_pages) or (item.suffix.lower() in {'.png','.jpg'} and item.name not in {'game-walk-browser-proof.png','game-contact-browser-proof.png','game-standing-applied-proof.png'})):todo.add(item)
# Previous walking production: remove decoded/keyed/encoding frames only, keep linked assets.
for name in ['walk-higgsfield-v2','walk-higgsfield-v3','walk-higgsfield-v4','walk-standard-v1']:
 base=ROOT/'artifacts'/name
 for item in base.rglob('*'):
  if item.is_dir() and item.name in {'frames-raw','frames-clean','movie','driving-frames','synchronized-frames'}:todo.add(item)
# Split any nominated directory containing a referenced file; never move a protected file.
selected=[]
def select(item):
 if item.is_symlink():return
 if item in protected:return
 if item.is_dir() and any(item in p.parents for p in protected):
  for child in item.iterdir():select(child)
 else:selected.append(item)
for item in sorted(todo,key=lambda p:len(p.parts)):
 if not any(parent==item or parent in item.parents for parent in selected):select(item)
records=[]
for item in selected:
 files=[p for p in item.rglob('*') if p.is_file()] if item.is_dir() else [item]
 assert not any(p in protected for p in files)
 records.append({'path':str(item.relative_to(ROOT)),'files':len(files),'bytes':sum(p.stat().st_size for p in files)})
result={'status':'planned','finalDirections':48,'protectedFiles':len(protected),'items':records,'fileCount':sum(r['files'] for r in records),'bytes':sum(r['bytes'] for r in records)}
(WORK/'intermediate-cleanup-plan.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='items'}))
