#!/usr/bin/env python3
"""rpg-music skill pipeline. Only writes within this isolated production folder."""
import hashlib, importlib.util, json, math, pathlib, shutil, subprocess, types, wave
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SKILL = ROOT / '.codex/skills/rpg-music'
FONT = SKILL / 'assets/GeneralUser-GS.sf2'
RATE = 44100
spec = importlib.util.spec_from_file_location('rpg_music', SKILL / 'scripts/bgm.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

# id, title, bpm, bars, tonic, mode, orchestration/rhythmic character, source rationale
CUES = [
 ('title','岸を越える地図',96,24,62,'major',0,'スタート画面: 冒険への期待。主題をホルンから木管へ渡す。'),
 ('prologue','二年前の薄明',80,20,62,'minor',1,'src/view/prologue.ts: 過去の放流と改竄された地図の回想。'),
 ('briefing','盤上の水路',256/3,32,62,'dorian',2,'全戦共通の作戦説明・準備: 判断の余白と期待。'),
 ('b01','渡し場の水位痕',100,40,62,'dorian',3,'B01 トルネ渡し場: 水位記録確保と脱出。水路の流れを分散弦で。'),
 ('b02','閉ざされる石橋',108,44,64,'minor',4,'B02 旧セラ堤: 高低差と石橋閉鎖までの時間圧。下降低音と短い応答。'),
 ('b03','名簿と車輪',96,40,57,'minor',5,'B03 ラウム救護倉: 負傷者の荷車を護送。穏やかな決意の旋律、重い刻み。'),
 ('b04','乾いた支渠へ',104,40,60,'dorian',6,'B04 乾いた支渠: 取水拠点保持。乾いたピチカートと水を戻す木管。'),
 ('b05','署名の影',100,40,59,'minor',7,'B05 イェルン文書蔵: 必須文書と自身の署名、封鎖迫る室内戦。低い弦とファゴット。'),
 ('b06','鎖門を越える証言',106,44,62,'minor',8,'B06 ケスト運河鎖門: 開門後の証人護送。交互の弦と金管、波のような木管。'),
 ('b07','二つの退避路',112,44,65,'dorian',9,'B07 ヴァセル段丘村: 北段と南道の避難。二声の応答と切迫した弦。'),
 ('b08','南北の補助堰',102,44,60,'minor',10,'B08 ベルカ補助堰: 独立二水路と操作所保持。低音と高音が交差する対位。'),
 ('b09','公開の場への道',100,44,67,'dorian',11,'B09 水段回廊: 代表・証人の一行護送。歩みを守る低弦、毅然としたホルン。'),
 ('b10','救援を迎える港',110,44,62,'mixolydian',12,'B10 首府外港: 鎖門信号と検問保持、場外船団。開けた金管、抑制した打楽器。'),
 ('b11','保守路の手',104,44,59,'minor',13,'B11 下層保守路: 保守員救出と補助弁復旧。ファゴットとヴィオラの低い応答。'),
 ('b12','誰の堤か',112,48,62,'minor',14,'B12 上層操作台: 二操作点保持と非致死制圧。主題の集約、密度を落とす中間部。'),
 ('ending','同じ杭に記す明日',80,24,62,'major',15,'終幕: タイトル主題の穏やかな再編曲。フルート・ハープ・柔らかな弦。'),
]
# Compositions are independently authored; rendering is the only shared pipeline.
cspec=importlib.util.spec_from_file_location('individual_compositions',HERE/'compositions.py')
composer=importlib.util.module_from_spec(cspec); cspec.loader.exec_module(composer)
score=composer.authored_score
CUES=[tuple(list(c[:2])+[composer.PLANS[c[0]]['bpm'],composer.PLANS[c[0]]['bars']]+list(c[4:])) for c in CUES]

def write(path,data,rate=RATE):
    a=np.clip(np.rint(data),-32768,32767).astype('<i2')
    with wave.open(str(path),'wb') as f:
        f.setparams((2,2,rate,0,'NONE','not compressed')); f.writeframes(a.tobytes())

def read(path):
    with wave.open(str(path),'rb') as f:
        assert f.getnchannels()==2 and f.getsampwidth()==2
        return np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,2).copy(),f.getframerate()

def metrics(path,loop):
    a,rate=read(path); d=a.astype(np.float64)/32768
    out=dict(file=str(path.relative_to(HERE)),sha256=sha(path),bytes=path.stat().st_size,sampleRate=rate,channels=2,frames=len(a),seconds=len(a)/rate,samplePeak=float(np.max(np.abs(d))),rmsDbFS=float(20*np.log10(max(1e-12,np.sqrt(np.mean(d*d))))),dc=np.mean(d,axis=0).tolist(),railSamples=int(np.sum((a==32767)|(a==-32768))),loop=[0,len(a)] if loop else None,loopEndExclusive=loop)
    assert .005<out['samplePeak']<=.501 and max(abs(v) for v in out['dc'])<.005 and out['railSamples']==0
    if loop:
        n=round(rate*.02); h=d[:n]; t=d[-n:]
        jump=h[0]-t[-1]; ratio=20*np.log10(np.maximum(1e-12,np.sqrt(np.mean(h*h,axis=0)))/np.maximum(1e-12,np.sqrt(np.mean(t*t,axis=0))))
        out['boundary']=dict(jump=jump.tolist(),rmsDifferenceDb=ratio.tolist(),slopeError=np.maximum(np.abs(jump-(t[-1]-t[-2])),np.abs((h[1]-h[0])-jump)).tolist(),numericalFlags=['jump' for v in jump if abs(v)>.02]+['rms' for v in ratio if abs(v)>6])
    return out

def deliver(ident,a,loop):
    peak=.32 if loop else .48
    a=a.astype(np.float64); a-=np.mean(a,axis=0)
    a*=peak*32767/max(1,np.max(np.abs(a)))
    master=HERE/'masters'/f'{ident}.wav'; delivery=HERE/'delivery'/f'{ident}.wav'
    write(master,a)
    if loop:
        # Resample with cyclic context, then extract the central cycle. Converting
        # a single cycle introduces edge filter padding that breaks its seam.
        padded=HERE/'render'/f'{ident}-resample-context.wav'
        converted=HERE/'render'/f'{ident}-resampled.wav'
        write(padded,np.tile(a,(3,1)))
        subprocess.run(['afconvert',str(padded),str(converted),'-f','WAVE','-d','LEI16@22050','-c','2'],check=True)
        decoded,r=read(converted); n=len(a)//2
        write(delivery,decoded[n:2*n],r)
        padded.unlink(); converted.unlink()
    else:
        subprocess.run(['afconvert',str(master),str(delivery),'-f','WAVE','-d','LEI16@22050','-c','2'],check=True)
    result=dict(id=ident,master=metrics(master,loop),delivery=metrics(delivery,loop),listeningVerified=False)
    if loop:
        decoded,rate=read(delivery)
        write(HERE/'listen'/f'{ident}-three-loops.wav',np.tile(decoded,(3,1)),rate)
        n=3*rate
        write(HERE/'listen'/f'{ident}-boundary.wav',np.concatenate([decoded[-n:],decoded[:n]]),rate)
    return result

SE = {'ui':.095,'cancel':.12,'invalid':.14,'sword':.28,'arrow':.3,'impact':.24,'miss':.22,'guard':.3,'skill':.5,'heal':.65,'chest':.65,'record':.42,'mechanism':1.0,'exit':.7,'cart':.9,'turn':.18,'down':.45}

def main():
    for name in ('scores','masters','delivery','listen','render'): (HERE/name).mkdir(exist_ok=True)
    assert sha(FONT)=='9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe'
    font_bytes=FONT.read_bytes(); marker=font_bytes.index(b'ICMT'); size=int.from_bytes(font_bytes[marker+4:marker+8],'little')
    license_text=font_bytes[marker+8:marker+8+size].rstrip(b'\0').decode('utf-8')
    assert 'License v2.0' in license_text
    (HERE/'soundfont-license.txt').write_text(license_text)
    save(HERE/'probe.json',helper.probe(types.SimpleNamespace(soundfont=[str(FONT)],out=None)))
    metadata=json.loads((HERE/'metadata.json').read_text())
    previous={c['id']:c for c in metadata['cues']}
    selected=set(__import__('sys').argv[1].split('=',1)[1].split(',')) if len(__import__('sys').argv)>1 and __import__('sys').argv[1].startswith('--only=') else {c[0] for c in CUES}
    catalog=[]
    for c in CUES:
        if c[0] not in selected:
            catalog.append(previous['bgm-'+c[0]]); continue
        ident='bgm-'+c[0]; final=HERE/'delivery'/f'{ident}.wav'; cue=score(c)
        fingerprint=hashlib.sha256(json.dumps(cue,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        cached_path=HERE/'scores'/f'{ident}-result.json'
        cached=json.loads(cached_path.read_text()) if cached_path.exists() else {}
        if final.exists() and cached.get('scoreFingerprint')==fingerprint and sha(final)==cached['delivery']['sha256']:
            catalog.append(cached); continue
        source=HERE/'scores'/f'{ident}.json'; midi=source.with_suffix('.mid'); save(source,cue)
        helper.midi(types.SimpleNamespace(spec=str(source),out=str(midi)))
        repeated=json.loads(json.dumps(cue)); beats=cue['bars']*cue['meter'][0]*4/cue['meter'][1]; repeated['bars']*=3
        for track in repeated['tracks']: track['notes']=[dict(n,beat=n['beat']+k*beats) for k in range(3) for n in track['notes']]
        rs=HERE/'render'/f'{ident}.json'; rm=rs.with_suffix('.mid'); raw=rs.with_suffix('.wav')
        save(rs,repeated); helper.midi(types.SimpleNamespace(spec=str(rs),out=str(rm)))
        if not raw.exists(): helper.render(types.SimpleNamespace(midi=str(rm),soundfont=str(FONT),out=str(raw),rate=RATE))
        a,rate=read(raw)
        # MIDI tempo is integer microseconds; use precisely its rendered duration.
        cycle=round(beats*round(60000000/cue['tempo_bpm'])/1000000*RATE/2)*2
        # Rotate within a sustained opening (150–350ms); preserve full beat cycle.
        # Compare amplitude AND adjacent slopes, away from downbeat transients.
        offsets=np.arange(round(RATE*.15),round(RATE*.35),2); starts=cycle+offsets; ends=starts+cycle
        jump=a[starts].astype(float)-a[ends-1]
        errors=np.sum(jump**2+(jump-(a[ends-1].astype(float)-a[ends-2]))**2+((a[starts+1].astype(float)-a[starts])-jump)**2,axis=1)
        offset=int(offsets[np.argmin(errors)]); start=cycle+offset
        result=deliver(ident,a[start:start+cycle],True)
        result.update(scoreFingerprint=fingerprint,compositionRevision='independent-r2',title=c[1],usage=previous[ident].get('usage',c[7]),bpm=cue['tempo_bpm'],bars=cue['bars'],meter=cue['meter'],mode=composer.PLANS[c[0]]['mode'],rationale=c[7],direction=cue['direction'],source=str(source.relative_to(HERE)),midi=str(midi.relative_to(HERE)),renderCycles=3,extractStartFrame=start,rotationSeconds=offset/RATE,motif=cue['motif'])
        save(HERE/'scores'/f'{ident}-result.json',result); catalog.append(result)
        print(ident,round(result['delivery']['seconds'],3),result['delivery']['boundary'],flush=True)
        # Only this run's large intermediate render; editable score/MIDI retained.
        raw.unlink()
    # SE / result jingles are outside this revision and must remain byte-identical.
    catalog += [c for c in metadata['cues'] if c['id'].startswith('se-')]
    metadata.update(version='audio-v2-independent-r2',compositionRevision='independent-r2',scriptSha256=sha(pathlib.Path(__file__)),compositionSourceSha256=sha(HERE/'compositions.py'),cues=catalog,listeningVerified=False,gameVerified=False,browserDecodeVerified=False)
    save(HERE/'metadata.json',metadata)
    print('COMPLETE',len(selected),'BGM; SE UNCHANGED',flush=True)

if __name__=='__main__': main()
