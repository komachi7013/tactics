"""Render generation status and review evidence without publishing game assets."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/walk-from-standing-v1'


def main():
    plan = json.loads((WORK / 'plan.json').read_text())
    guide_rows = json.loads((ROOT / 'artifacts/standing-cast-review-v1/landmark-overrides.json').read_text())
    cards = []
    for job in plan['jobs']:
        cast, direction = job['cast'], job['direction']
        folder = WORK / cast / direction
        candidate_folder = ROOT / job['candidateDirectory'] if job.get('candidateDirectory') else folder / 'candidate'
        candidate_url = str(candidate_folder.relative_to(WORK))
        review_folder = (folder / 'motion-reference' if (folder / 'motion-reference/source.mp4').exists() else
                         folder / 'retake-2' if (folder / 'retake-2/source.mp4').exists() else folder)
        if job.get('reviewDirectory'):
            review_folder = ROOT / job['reviewDirectory']
        qa_path = review_folder / 'review.json'
        qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
        status = qa.get('status', '生成済み・確認待ち' if job['status'] == 'completed' else
                        '生成中' if job['status'] in ('pending', 'queued', 'in_progress') else '準備済み')
        notes = ' / '.join(qa.get('issues', []))
        video_src = str((review_folder / 'source.mp4').relative_to(WORK))
        video = (f'<video src="./{video_src}" controls muted loop playsinline></video>'
                 if (review_folder / 'source.mp4').exists() else '<p>未生成</p>')
        evidence = review_folder / 'raw-contact.jpg'
        if evidence.exists():
            video += f'<a href="./{evidence.relative_to(WORK)}">時間順の確認画像</a>'
        motion = folder / 'motion-reference'
        if (motion / 'source.mp4').exists() and motion != review_folder:
            mq = json.loads((motion / 'review.json').read_text()) if (motion / 'review.json').exists() else {}
            video += f'<p>動作参照・無料枠の試作：{html.escape(mq.get("status", "確認中"))}</p><video src="./{cast}/{direction}/motion-reference/source.mp4" controls muted loop playsinline></video>'
        candidate = ''
        if (candidate_folder / 'walk.png').exists():
            status = qa.get('status', '19コマ・0.8秒の歩行候補')
            notes = (f'{direction}立ち絵1枚と{job.get("motionRequirementCount",5)}項目の文章のみで生成。参照動画は不使用。原動画の周期を0.8秒に調整した比較候補です。' if 'still only +' in job.get('inputMethod','') else
                     '立ち絵と動作参照から作成した比較素材。歩行のゲーム適用は行っていません。')
            video = '<details><summary>生成原動画・検証記録</summary>' + video + '</details>'
            points = guide_rows[f'{cast}/{direction}']['landmarks']
            lines = html.escape(json.dumps([points[k] for k in ['head','jaw','waist','knee','ground']]))
            notes += ' ' + ' / '.join(qa.get('issues', []))
            candidate = (f'<canvas width="256" height="300" data-guides="{lines}" data-sheet="./{candidate_url}/walk.png"></canvas>'
                         '<p>19フレーム / 0.8秒：検証用候補</p>')
            if qa.get('referenceMotionReady') is False:
                candidate = '<p>以下の19コマは以前の候補です。今回の不採用結果とは別です。</p>' + candidate
        cards.append(f'<article><h2>{cast} {direction}</h2><p class="status">{html.escape(status)}</p>'
                     f'<div class="pair"><figure><img src="./{cast}/{direction}/master.png"><figcaption>完成した立ち絵</figcaption></figure>'
                     f'<figure>{video}<figcaption>生成原動画・未採用</figcaption></figure></div>{candidate}'
                     f'<p>{html.escape(notes)}</p></article>')
    hero = ''
    if (WORK / 'lise/E/candidate/walk.png').exists():
        hero = '''<section class="hero"><h2>リセ E：歩行作成の基準</h2>
<p>Genjutsu無料枠1回の結果から、19フレーム・0.8秒に整えた基準です。この動きを参照して、他キャラの歩行を順次作成・検証しています。歩行はゲーム未適用です。<br>
頭部幅：立ち絵70px／候補中央値66px。頭部面積比97.8%。これは画像測定で、デザイン一致の保証ではありません。<br>
着地位相は原動画を目視して右→左→右を記録。影と背景を除去し、全19コマを同じ倍率で処理しています。</p>
<label><input id="guides" type="checkbox" checked> 5本の比較線</label>
<label><input id="paused" type="checkbox"> 一時停止</label>
<label>コマ <input id="frame" type="range" min="0" max="18" value="0"><span id="frame-number">0</span></label>
<div class="hero-pair"><figure><canvas width="256" height="300" data-still="./lise/E/master.png"></canvas><figcaption>完成した立ち絵 E</figcaption></figure>
<figure><canvas width="256" height="300" data-sheet="./lise/E/candidate/walk.png"></canvas><figcaption>歩行候補 E：19フレーム／0.8秒</figcaption></figure></div>
<p><a href="./lise/E/candidate/walk.mp4">6周期の再生動画（4.8秒）</a> / <a href="./lise/E/candidate/all-19-frames.jpg">全19コマ</a> / <a href="./lise/E/candidate/standing-comparison.png">立ち絵と両足の位相比較</a></p></section>'''
    for job in plan['jobs']:
        cast, direction = job['cast'], job['direction']
        candidate_folder = ROOT / job['candidateDirectory'] if job.get('candidateDirectory') else WORK / cast / direction / 'candidate'
        candidate_url = str(candidate_folder.relative_to(WORK))
        if (cast, direction) == ('lise','E') or not (candidate_folder/'walk.png').exists():
            continue
        current_take = ROOT / job['reviewDirectory'] if job.get('reviewDirectory') else WORK / cast / direction
        current_review = json.loads((current_take/'review.json').read_text()) if (current_take/'review.json').exists() else {}
        if current_review.get('referenceMotionReady') is False:
            take_url = str(current_take.relative_to(WORK))
            issues = html.escape(' / '.join(current_review.get('issues', [])))
            hero += f'''<section class="hero" id="{cast}-{direction}"><h2>{cast} {direction}：今回の生成は不採用</h2><p>{issues}</p>
<div class="hero-pair"><figure><img src="./{cast}/{direction}/input.jpg"><figcaption>入力した完成立ち絵</figcaption></figure>
<figure><video src="./{take_url}/source.mp4" controls muted loop playsinline></video><figcaption>今回の原動画・不採用</figcaption></figure></div>
<p><a href="./{take_url}/prompt.txt">入力プロンプト</a> / <a href="./{take_url}/source.mp4">不採用の原動画</a> / <a href="./{candidate_url}/walk.mp4">以前の歩行候補</a></p></section>'''
            continue
        points = guide_rows[f'{cast}/{direction}']['landmarks']
        lines = html.escape(json.dumps([points[k] for k in ['head','jaw','waist','knee','ground']]))
        method = (f'完成した{direction}立ち絵1枚と{job.get("motionRequirementCount",5)}項目の文章のみで生成。参照動画は使用していません。原動画の周期を手動選択し、0.8秒に調整しました。' if 'still only +' in job.get('inputMethod','') else
                  'リセEの確認済み周期を動作参照として作成。')
        if job.get('drivingCast'):
            method = f'完成した{direction}立ち絵＋元の6条件＋{job["drivingCast"]} {job["drivingDirection"]}の歩行動画を動作参照として入力。'
        if job.get('reviewDirectory'):
            review_path = ROOT / job['reviewDirectory'] / 'review.json'
            if review_path.exists():
                review = json.loads(review_path.read_text())
                method += ' ' + html.escape(' / '.join(review.get('issues', [])))
        hero += f'''<section class="hero" id="{cast}-{direction}"><h2>{cast} {direction}：歩行比較候補</h2><p>{method} 19フレーム・0.8秒、歩行はゲーム未適用です。線はこのキャラ・方向の立ち絵を基準に表示します。</p>
<div class="hero-pair"><figure><canvas width="256" height="300" data-guides="{lines}" data-still="./{cast}/{direction}/master.png"></canvas><figcaption>完成した立ち絵</figcaption></figure>
<figure><canvas width="256" height="300" data-guides="{lines}" data-sheet="./{candidate_url}/walk.png"></canvas><figcaption>歩行候補：19フレーム／0.8秒</figcaption></figure></div>
<p><a href="./{candidate_url}/walk.mp4">6周期の動画</a> / <a href="./{candidate_url}/all-19-frames.jpg">全19コマ</a></p></section>'''
    page = '''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>完成した立ち絵からの歩行検証</title><style>
body{font:15px system-ui;background:#18282c;color:#eee;margin:20px}h1{font-size:24px}h2{font-size:18px}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}article{border:1px solid #68827b;padding:12px}
.pair{display:flex;gap:8px}figure{margin:0;min-width:0;flex:1}img,video,canvas{width:100%;background:#d5d6c8;display:block}
img{aspect-ratio:1;object-fit:contain}figcaption{text-align:center;font-size:12px}.status{color:#ffd18c}a{color:#bfe2ff}
canvas{width:256px;max-width:100%;margin:auto}p{line-height:1.6}</style>
<h1>完成した立ち絵からの歩行検証</h1><p>目標：19フレーム・1周期0.8秒。全48方向の入力を固定。少数ずつ生成して検証しています。<br>
__CREDIT_STATUS__<br>
以下の原動画は比較用で、19コマ・0.8秒の採用素材ではありません。<br>
__GAME_STANDING_STATUS__ 歩行は比較用として作成中で、ゲームの既存歩行は変更していません。</p>
<p><a href="../standing-cast-review-v1/preview.html">立ち絵の比較へ</a></p>'''+hero+'''<h2>48方向の入力・試作状況</h2><main>'''+''.join(cards)+'''</main>
<style>.hero{border:2px solid #e5bf66;padding:16px;max-width:1060px;margin:20px 0}.hero-pair{display:flex;gap:16px;max-width:560px;margin:auto}.hero-pair img{aspect-ratio:auto}.hero label{display:inline-block;margin:6px 12px 6px 0}</style><script>
const canvases=[...document.querySelectorAll('canvas')].map(c=>({c,im:new Image(),ctx:c.getContext('2d'),visible:false}));
const canvasMap=new Map(canvases.map(item=>[item.c,item]));
const observer=new IntersectionObserver(entries=>{for(const entry of entries){const item=canvasMap.get(entry.target);item.visible=entry.isIntersecting;if(item.visible&&!item.im.src)item.im.src=item.c.dataset.sheet||item.c.dataset.still}},{rootMargin:'300px'});
for(const item of canvases)observer.observe(item.c);
const paused=document.querySelector('#paused'),range=document.querySelector('#frame'),guides=document.querySelector('#guides');let time=0,last;
if(range)range.oninput=()=>{paused.checked=true;time=Number(range.value)*800/19};
function draw(t){if(last!==undefined&&!paused?.checked)time=(time+t-last)%800;last=t;const i=Math.min(18,Math.floor(time*19/800+1e-8));
if(range){range.value=i;document.querySelector('#frame-number').textContent=i}
for(const{c,im,ctx,visible}of canvases){if(!visible||!im.complete||!im.naturalWidth)continue;ctx.fillStyle='#d5d6c8';ctx.fillRect(0,0,256,300);
if(c.dataset.still)ctx.drawImage(im,0,0);else ctx.drawImage(im,i%5*256,Math.floor(i/5)*300,256,300,0,0,256,300);
if(guides?.checked)for(const y of JSON.parse(c.dataset.guides||'[100,156,192,235,280]')){ctx.strokeStyle='#819587';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke()}}
requestAnimationFrame(draw)}requestAnimationFrame(draw)</script></html>'''
    ledger = plan.get('creditLedger', {'paidJobs': 8, 'quotedPaidCredits': 40})
    page = page.replace('__CREDIT_STATUS__', f'有料試作{ledger["paidJobs"]}本の見積合計{ledger["quotedPaidCredits"]}クレジット＋Genjutsu無料枠1回。')
    page = page.replace('__GAME_STANDING_STATUS__', '完成した立ち絵48方向はゲームへ反映済みです。' if plan.get('standingGameApplied') else '立ち絵は比較用です。')
    queue_path = WORK / 'remaining-cast-sequential-v1.json'
    if queue_path.exists():
        queue = json.loads(queue_path.read_text())
        rows = queue['order']
        candidates = sum(r['status'] == 'candidate' for r in rows)
        rejected = sum(r['status'] == 'rejected' for r in rows)
        active = sum(r['status'] in ('in_progress','generated','submission_unknown') for r in rows)
        queued = sum(r['status'] == 'queued' for r in rows)
        names = {'sena':'セナ','iva':'イヴァ','dani':'ダニ','guard':'ガード','archer':'アーチャー','vesk':'Vesk','toma':'トマ','worker':'労働者','delegation':'代表者'}
        links = ' / '.join(f'<a href="./{cast}-reference.html">{names[cast]}</a>' for cast in names if (WORK/f'{cast}-reference.html').exists())
        summary = f'<p>今回の残り36方向：処理済み{candidates+rejected}/36（比較候補{candidates}・不採用{rejected}）、生成・検証中{active}、未着手{queued}。1方向ずつ進めています。<br>{links}</p>'
        labels = {'queued':'順番待ち','in_progress':'生成中','generated':'検証中','candidate':'比較候補','rejected':'不採用','submission_unknown':'送信結果不明'}
        table_rows = []
        for cast, name in names.items():
            cells = []
            for direction in ['E','N','S','W']:
                row = next(r for r in rows if (r['cast'],r['direction']) == (cast,direction))
                label = labels[row['status']]
                if (WORK/f'{cast}-reference.html').exists():
                    label = f'<a href="./{cast}-reference.html">{label}</a>'
                cells.append(f'<td>{label}</td>')
            table_rows.append(f'<tr><th scope="row">{name}</th>'+''.join(cells)+'</tr>')
        summary += '<table style="border-collapse:collapse;line-height:2.2;max-width:700px;width:100%;text-align:center"><caption>今回の36方向の進捗（比較候補は利用者確認待ち）</caption><thead><tr><th>キャラ</th><th>E</th><th>N</th><th>S</th><th>W</th></tr></thead><tbody>'+''.join(table_rows)+'</tbody></table>'
        if (WORK/'remaining36-final-audit.json').exists():
            audit = json.loads((WORK/'remaining36-final-audit.json').read_text())
            summary += f'<p>初回36本のチェック：入力・モデル・参照動画と、当時の候補{audit["comparisonCandidates"]}方向の19フレーム／0.8秒・動画4.8秒を確認。立ち絵原本とゲーム歩行は変更なし。<br>初回36本の見積合計1,008クレジット。<a href="./remaining36-final-audit.json">検証記録</a></p>'
            summary += '<p>初回不採用の<a href="./dani-reference.html">ダニS</a>・<a href="./guard-reference.html">ガードS</a>は再試行しています。最新のエンジン・状態・検証結果は上の表と各比較ページをご覧ください。<a href="./iva-reference.html">イヴァS・W</a>は髪の縁の紫寄りの色、<a href="./toma-reference.html">トマ</a>は立ち絵由来の袖・手首の欠けとWの足元位置を確認してください。比較候補は最終採用前です。</p>'
        page = page.replace('<h1>完成した立ち絵からの歩行検証</h1>', '<h1>完成した立ち絵からの歩行検証</h1>' + summary)
    page = page.replace('<video ', '<video preload="none" ').replace('<img ', '<img loading="lazy" ')
    (WORK / 'preview.html').write_text(page)
    print('Walk review status updated')


if __name__ == '__main__':
    main()
