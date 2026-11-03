"""Side-by-side four-direction reference; real sheets only, no synthetic motion."""
import html
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cast', choices=['lise', 'garan', 'neia', 'sena', 'iva', 'dani', 'guard', 'archer', 'vesk', 'toma', 'worker', 'delegation'], default='lise')
    cast = parser.parse_args().cast
    guides = json.loads((ROOT / 'artifacts/standing-cast-review-v1/landmark-overrides.json').read_text())
    jobs = json.loads((WORK / 'plan.json').read_text())['jobs']
    cards = []
    for direction in (['N','E','W','S'] if cast in ('lise','garan') else ['E','N','S','W']):
        folder = WORK / cast / direction
        points = guides[cast + '/' + direction]['landmarks']
        lines = html.escape(json.dumps([points[k] for k in ['head','jaw','waist','knee','ground']]))
        job = next(j for j in jobs if j['cast']==cast and j['direction']==direction)
        candidate = ROOT / job['candidateDirectory'] if job.get('candidateDirectory') else folder / 'candidate'
        ready = (candidate / 'walk.png').exists()
        candidate_url = str(candidate.relative_to(WORK))
        take = ROOT / job['reviewDirectory'] if job.get('reviewDirectory') else folder/'motion-reference'
        take_url = str(take.relative_to(WORK))
        review = json.loads((take/'review.json').read_text()) if (take/'review.json').exists() else {}
        pending_label = ('生成中' if job['status'] in ('pending','queued','in_progress') else
                         '生成失敗' if job['status'] == 'failed' else
                         '生成済み・検証待ち' if job['status'] == 'completed' else '未着手（順番待ち）')
        status = review.get('status', '比較候補' if ready else pending_label)
        rejected = review.get('referenceMotionReady') is False
        animation = (f'<img class="rejected" src="./{take_url}/rejected-preview.png" alt="不採用の今回の生成結果">' if rejected and (take/'rejected-preview.png').exists() else
                     f'<video class="rejected" src="./{take_url}/source.mp4" controls muted playsinline></video>' if rejected and (take/'source.mp4').exists() else
                     f'<div class="pending">{html.escape(status)}</div>' if rejected else
                     f'<canvas width="256" height="300" data-sheet="./{candidate_url}/walk.png" data-lines="{lines}"></canvas>' if ready else f'<div class="pending">{html.escape(pending_label)}</div>')
        links = (f'<a href="./{take_url}/source.mp4">不採用の原動画</a>' if rejected and (take/'source.mp4').exists() else
                 '' if rejected else
                 f'<a href="./{candidate_url}/walk.mp4">動画</a> / <a href="./{candidate_url}/all-19-frames.jpg">全19コマ</a>' if ready else '')
        if rejected and ready:
            links += f' / <a href="./{candidate_url}/walk.mp4">以前の候補</a>'
        if job.get('previousCandidateDirectory'):
            previous_url = str((ROOT / job['previousCandidateDirectory']).relative_to(WORK))
            links += f' / <a href="./{previous_url}/walk.mp4">再生成前</a>'
        if (take / 'prompt.txt').exists():
            links += f' / <a href="./{take_url}/prompt.txt">入力プロンプト</a>'
        if (take / 'standing-design-comparison.png').exists():
            links += f' / <a href="./{take_url}/standing-design-comparison.png">立ち絵と今回の比較</a>'
        if (take / 'feet-consecutive-32-55.jpg').exists():
            links += f' / <a href="./{take_url}/feet-consecutive-32-55.jpg">足元の連続コマ</a>'
        if (take / 'feet-consecutive-34-57.jpg').exists():
            links += f' / <a href="./{take_url}/feet-consecutive-34-57.jpg">足元の連続コマ</a>'
        if job.get('drivingCast'):
            links += f' / <a href="./{job["drivingCast"]}/{job["drivingDirection"]}/candidate/walk.mp4">動作参照</a>'
        issues = ' / '.join(review.get('issues', []))
        engine = 'Seedance 2.5' if job.get('model')=='seedance_2_5' else 'Genjutsu（既存参考を保持）' if direction=='E' and cast in ('lise','garan') else 'Genjutsu' if job.get('model')=='hf_mult_motion_control' else job.get('model','')
        cards.append(f'<article><h2>{direction}'+('（動作の基準）' if direction=='E' else '')+f'</h2>{animation}<p class="engine">{html.escape(engine)}</p><p class="status">{html.escape(status)}</p><p class="issues">{html.escape(issues)}</p><p class="links">{links}</p>'
                     f'<h3>完成した立ち絵 {direction}</h3><canvas width="256" height="300" data-still="./{cast}/{direction}/master.png" data-lines="{lines}"></canvas></article>')
    page = '''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>リセ：4方向の歩行参考モーション</title><style>
body{margin:20px;background:#18282c;color:#eee;font:15px system-ui}h1{font-size:24px}h2{font-size:19px;line-height:28px;height:28px;margin:12px 0}h3{font-size:15px}p{line-height:1.6}
main{display:grid;grid-template-columns:repeat(4,minmax(0,256px));gap:12px}article{box-sizing:border-box;border:2px solid #82968c;padding:6px;text-align:center}article:nth-child(2){border-color:#e4bd68}
canvas,.rejected,video{display:block;width:100%;background:#d5d6c8}.pending{aspect-ratio:256/300;background:#31443e;display:grid;place-items:center}.status{color:#ffd18c;min-height:48px}.issues{min-height:110px}.links{min-height:72px;font-size:13px}
a{color:#ffe0a0}label{display:inline-block;margin:6px 18px 6px 0}.toolbar{position:sticky;top:0;background:#18282cf2;padding:12px 0;z-index:2}
@media(max-width:760px){main{grid-template-columns:repeat(2,minmax(0,256px))}}</style>
<h1>リセ：4方向の歩行参考モーション</h1><p>Eは既存のGenjutsu参考を保持しています。N・S・Wの画像のみ試作はSeedance 2.5です。Nは5条件、S・Wは全身保持を加えた6条件で、それぞれの立ち絵1枚と文章だけを入力しています。参照動画は渡していません。目標は各19フレーム・1周期0.8秒です。<br>
上段は方向ごとの生成・検証結果、下段は完成した立ち絵。未採用の結果は参考モーションとして扱っていません。<br>
5本線は方向ごとの立ち絵の頭頂・顎（背面はうなじ）・腰・膝・足元です。歩行はゲーム未適用です。</p>
<div class="toolbar"><label><input id="paused" type="checkbox">一時停止</label><label><input id="guides" type="checkbox" checked>5本線</label>
<label>コマ<input id="frame" type="range" min="0" max="18" value="0"><span id="number">0</span></label>
<label>再生速度<select id="speed"><option value="1">1倍</option><option value="0.5">0.5倍</option></select></label></div>
<main>'''+''.join(cards)+'''</main><p><a href="./preview.html">全キャラの比較へ</a></p><script>
const list=[...document.querySelectorAll('canvas')].map(c=>{const im=new Image();im.src=c.dataset.sheet||c.dataset.still;return{c,im,ctx:c.getContext('2d')}});
const paused=document.querySelector('#paused'),slider=document.querySelector('#frame'),number=document.querySelector('#number'),guides=document.querySelector('#guides'),speed=document.querySelector('#speed');let time=0,last;
slider.oninput=()=>{paused.checked=true;time=Number(slider.value)*800/19;number.textContent=slider.value};
function tick(now){if(last!==undefined&&!paused.checked)time=(time+(now-last)*Number(speed.value))%800;last=now;const i=Math.min(18,Math.floor(time*19/800+1e-8));slider.value=i;number.textContent=i;
for(const{c,im,ctx}of list){if(!im.complete||!im.naturalWidth)continue;ctx.fillStyle='#d5d6c8';ctx.fillRect(0,0,256,300);
if(c.dataset.sheet)ctx.drawImage(im,i%5*256,Math.floor(i/5)*300,256,300,0,0,256,300);else ctx.drawImage(im,0,0);
if(guides.checked)for(const y of JSON.parse(c.dataset.lines)){ctx.strokeStyle='#819587';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke()}}
requestAnimationFrame(tick)}requestAnimationFrame(tick)</script></html>'''
    if cast == 'garan':
        page = page.replace('リセ：4方向の歩行参考モーション', 'ガラン：4方向の歩行参考モーション')
        page = page.replace('Nは5条件、S・Wは全身保持を加えた6条件で、', 'N・S・Wはいずれも全身保持を含む6条件で、')
    elif cast == 'neia':
        page = page.replace('リセ：4方向の歩行参考モーション', 'ネイア：4方向の歩行参考モーション')
        page = page.replace('Eは既存のGenjutsu参考を保持しています。N・S・Wの画像のみ試作はSeedance 2.5です。Nは5条件、S・Wは全身保持を加えた6条件で、',
                            'E→N→S→Wの順に1方向ずつ生成・確認します。Seedance 2.5と同じ6条件で、')
        w_job = next(j for j in jobs if j['cast'] == 'neia' and j['direction'] == 'W')
        if w_job.get('additionalRequirementCount'):
            page = page.replace('Seedance 2.5と同じ6条件で、',
                                'Seedance 2.5と基本6条件を使用。現在のWには体の揺れ・歩幅・持ち上げ・交互接地・固定視点などの追加条件も指定し、')
        page = page.replace('E（動作の基準）', 'E')
        page = page.replace('article:nth-child(2){border-color:#e4bd68}', '')
        referenced = [j for j in jobs if j['cast'] == cast and j.get('drivingCast')]
        if referenced:
            start = page.index('<h1>ネイア：4方向の歩行参考モーション</h1><p>')
            end = page.index('<br>', start)
            directions = '・'.join(j['direction'] for j in referenced)
            page = page[:start] + '<h1>ネイア：4方向の歩行参考モーション</h1><p>' + f'{directions}はSeedance 2.5に、元の6条件＋各方向のネイア立ち絵＋同方向のガラン歩行動画を入力しています。静止画を外見、動画を動作の参照として指定。目標は各19フレーム・1周期0.8秒です。' + page[end:]
    if cast not in ('lise','garan','neia'):
        names = {'sena':'セナ','iva':'イヴァ','dani':'ダニ','guard':'ガード','archer':'アーチャー','vesk':'Vesk','toma':'トマ','worker':'労働者','delegation':'代表者'}
        name = names[cast]
        page = page.replace('リセ：4方向の歩行参考モーション', f'{name}：4方向の歩行参考モーション')
        start = page.index(f'<h1>{name}：4方向の歩行参考モーション</h1><p>')
        end = page.index('<br>', start)
        page = page[:start] + f'<h1>{name}：4方向の歩行参考モーション</h1><p>Seedance 2.5で、元の6条件＋各方向の完成立ち絵＋同方向の歩行動画を入力し、E→N→S→Wの順に1方向ずつ生成・確認します。静止画が外見、動画が動作の参照です。目標は19フレーム・1周期0.8秒。' + page[end:]
        page = page.replace('E（動作の基準）', 'E').replace('article:nth-child(2){border-color:#e4bd68}', '')
    retries = [j for j in jobs if j['cast'] == cast and j.get('model') == 'hf_mult_motion_control' and cast != 'lise']
    if retries:
        directions = '・'.join(j['direction'] for j in retries)
        page = page.replace('Seedance 2.5で、元の6条件', f'{directions}はGenjutsuで再試行、その他はSeedance 2.5。元の6条件')
    (WORK / f'{cast}-reference.html').write_text(page)
    print(f'Four-direction {cast} reference page updated')


if __name__ == '__main__':
    main()
