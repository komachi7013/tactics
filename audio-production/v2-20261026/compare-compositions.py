"""Read-only transposition-invariant event comparison, not a listening test."""
from pathlib import Path
import json,itertools,hashlib
P=Path(__file__).resolve().parent
scores={p.stem:json.loads(p.read_text()) for p in (P/'scores').glob('bgm-*.json') if not p.stem.endswith('-result')}
def tokens(track):
 n=track['notes'];return [(b['pitch']-a['pitch'],round((b['beat']-a['beat'])*96),round(a['duration']*96)) for a,b in zip(n,n[1:])]
def grams(t,n=8):return {tuple(t[i:i+n]) for i in range(max(0,len(t)-n+1))}
def jac(a,b):return len(a&b)/max(1,len(a|b))
def fingerprint(t):return hashlib.sha256(json.dumps(t,separators=(',',':')).encode()).hexdigest()
rows=[];flags=[]
for (ida,a),(idb,b) in itertools.combinations(scores.items(),2):
 ma,mb=tokens(a['tracks'][0]),tokens(b['tracks'][0]);aa,ab=tokens(a['tracks'][1]),tokens(b['tracks'][1])
 melody=jac(grams(ma),grams(mb));rhythm=jac(grams([(x[1],x[2]) for x in ma]),grams([(x[1],x[2]) for x in mb]));accomp=jac(grams(aa),grams(ab))
 row=dict(a=ida,b=idb,melody8gramJaccard=melody,rhythm8gramJaccard=rhythm,accompaniment8gramJaccard=accomp,identicalMelodyEvents=ma==mb,identicalAccompanimentEvents=aa==ab,identicalMeter=a['meter']==b['meter'],identicalHarmony=a['harmony']==b['harmony'])
 if melody>.30 or accomp>.50 or ma==mb or aa==ab:flags.append(row)
 rows.append(row)
report=dict(revision='independent-r2',cueCount=len(scores),pairCount=len(rows),method='Pitch intervals remove transposition; beat/duration tokens remove tempo changes. Compare 8-event shingles separately for lead, rhythm, accompaniment. This does not establish perceived difference or musical quality.',intentionalQuotation='Title/ending opening two bars; single 3-note river-record cameo in C of other battle/preparation cues.',sourceFingerprints={k:dict(melody=fingerprint(tokens(v['tracks'][0])),accompaniment=fingerprint(tokens(v['tracks'][1])),meter=v['meter'],bpm=v['tempo_bpm'],harmony=v['harmony'],form=v['sections']) for k,v in scores.items()},reviewFlags=flags,pairs=rows)
(P/'composition-comparison-r2.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(cues=len(scores),pairs=len(rows),maxMelody=max(r['melody8gramJaccard'] for r in rows),maxAccompaniment=max(r['accompaniment8gramJaccard'] for r in rows),maxRhythm=max(r['rhythm8gramJaccard'] for r in rows),reviewFlags=flags),ensure_ascii=False,indent=2))
assert len(scores)==16
assert not flags
