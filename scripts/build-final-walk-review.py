"""Final-48 comparison pages independent of discarded generation intermediates."""
import json,html
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'artifacts/walk-from-standing-v1'
plan=json.loads((WORK/'plan.json').read_text()); guides=json.loads((ROOT/'artifacts/standing-cast-review-v1/landmark-overrides.json').read_text())
style='body{margin:20px;background:#19292d;color:#eee;font:15px system-ui}a{color:#ffdc94}header{position:sticky;top:0;background:#19292df5;padding:10px;z-index:1}main{display:grid;grid-template-columns:repeat(4,256px);gap:12px}article{border:1px solid #7a9388;padding:6px}canvas{width:240px;background:#d5d6c8}p{line-height:1.6}label,button{margin-right:14px}'
script='''<script>let time=0,prev=performance.now();const entries=[];for(const node of document.querySelectorAll('canvas')){const image=new Image();image.src=node.dataset.src;entries.push({node,image});}document.querySelector('#step').onclick=()=>{document.querySelector('#pause').checked=true;time+=800/19;};function draw(now){if(!document.querySelector('#pause').checked)time+=(now-prev)*Number(document.querySelector('#speed').value);prev=now;const frame=Math.floor(time/800*19)%19;document.querySelector('#status').textContent=`コマ ${frame}/18`;for(const {node,image} of entries){if(!image.complete||!image.naturalWidth)continue;const ctx=node.getContext('2d');ctx.fillStyle='#d5d6c8';ctx.fillRect(0,0,256,300);if(node.dataset.still)ctx.drawImage(image,0,0);else ctx.drawImage(image,frame%5*256,Math.floor(frame/5)*300,256,300,0,0,256,300);if(document.querySelector('#guides').checked){ctx.strokeStyle='#658776';for(const y of JSON.parse(node.dataset.lines)){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}}}requestAnimationFrame(draw);}requestAnimationFrame(draw);</script>'''
cards=[]
for job in plan['jobs']:
 cast,direction=job['cast'],job['direction'];candidate=ROOT/job.get('candidateDirectory',f'artifacts/walk-from-standing-v1/{cast}/{direction}/candidate');url=str(candidate.relative_to(WORK));points=guides[f'{cast}/{direction}']['landmarks'];lines=html.escape(json.dumps([points[k] for k in ['head','jaw','waist','knee','ground']]),quote=True)
 take=ROOT/job.get('reviewDirectory',job['directory']); review_path=take/'review.json' if (take/'review.json').exists() else candidate/'provenance/review.json'; review=json.loads(review_path.read_text()) if review_path.exists() else {}
 provenance=candidate/'provenance';provenance.mkdir(exist_ok=True)
 for name in ['review.json','prompt.txt','request.json','contacts.json','contact-review.json']:
  source=take/name
  if source.exists():(provenance/name).write_bytes(source.read_bytes())
 notes=html.escape(' / '.join(review.get('issues',[])).replace('ゲーム未適用','ゲーム適用前の検証記録'))
 card=f'<article><h2>{cast} {direction}</h2><canvas width="256" height="300" data-src="./{url}/walk.png" data-lines="{lines}"></canvas><p>19フレーム／0.8秒・ゲーム適用済み<br>接地・滑りは未解消です。</p><p>{notes}</p><p><a href="./{url}/walk.mp4">最終動画</a> ／ <a href="./{url}/all-19-frames.jpg">全19コマ</a> ／ <a href="./{url}/animation.json">再生情報</a></p><h3>立ち絵</h3><canvas width="256" height="300" data-still="1" data-src="./{cast}/{direction}/master.png" data-lines="{lines}"></canvas></article>'
 cards.append((cast,card))
def write(name,title,selected):
 page=f'<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><style>{style}</style><header><h1>{title}</h1><p>ゲームに反映した最終48方向。制作途中・不採用テイクは整理しました。<a href="./preview.html">全員の一覧</a> ／ <a href="./game-contact-check.html">接地・滑り検証</a></p><label><input id="pause" type="checkbox">停止</label><label><input id="guides" type="checkbox" checked>5本の比較線</label><label>速度<select id="speed"><option value="1">1倍</option><option value="0.25">0.25倍</option></select></label><button id="step">1コマ進む</button><span id="status"></span></header><main>'+''.join(selected)+'</main>'+script+'</html>'
 (WORK/name).write_text(page)
write('preview.html','最終48方向：歩行比較',[c for _,c in cards])
for cast in dict.fromkeys(cast for cast,_ in cards):write(f'{cast}-reference.html',f'{cast}：最終4方向',[c for who,c in cards if who==cast])
print('Rebuilt final48 comparison and 12 cast pages; copied provenance')
