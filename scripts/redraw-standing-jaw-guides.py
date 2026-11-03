"""Annotate visually inspected jaw/nape positions; never edit source art."""
import hashlib
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'artifacts/standing-cast-review-v1'
# Positions are manual visual annotations on the registered 256x300 stills.
# They are not an anatomy detector or an acceptance criterion.
POSITIONS={
 'lise':{'N':160,'E':156,'W':161,'S':155},
 'garan':{'N':149,'E':155,'W':149,'S':156},
 'neia':{'N':164,'E':167,'W':164,'S':169},
 'sena':{'N':162,'E':155,'W':160,'S':155},
 'iva':{'N':158,'E':155,'W':157,'S':155},
 'dani':{'N':160,'E':155,'W':159,'S':154},
 'guard':{'N':155,'E':158,'W':152,'S':160},
 'archer':{'N':160,'E':158,'W':160,'S':156},
 'vesk':{'N':145,'E':146,'W':144,'S':146},
 'toma':{'N':156,'E':155,'W':152,'S':156},
 'worker':{'N':150,'E':152,'W':149,'S':152},
 'delegation':{'N':145,'E':147,'W':146,'S':147},
}
VISIBLE_PROFILE={('garan','W'),('vesk','N'),('vesk','W'),('worker','N'),('worker','W')}
COLOUR_NOTES={'toma':{'directions':['W'],'parts':['髪','上着','ズボン'],'status':'Eとの差異を目視確認・未補正'},
 'delegation':{'directions':['W'],'parts':['髪','上着','ズボン','靴'],'status':'Eとの差異を目視確認・未補正'}}

def main():
    m=json.loads((WORK/'manifest.json').read_text());order=['N','E','W','S'];casts=list(POSITIONS)
    active_path=WORK/'repairs-active.json'
    active=json.loads(active_path.read_text()) if active_path.exists() else {}
    guide_path=WORK/'landmark-overrides.json'
    guide_overrides=json.loads(guide_path.read_text()) if guide_path.exists() else {}
    for cast,note in COLOUR_NOTES.items():
        if active.get(cast+'/W',{}).get('colourAdjustments'):
            note['status']='N基準の色調整案を適用・デザイン差は未解消'
    font_path='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
    font=ImageFont.truetype(font_path,16);small=ImageFont.truetype(font_path,11);title=ImageFont.truetype(font_path,22)
    board=Image.new('RGB',(1024,125+len(casts)*350),'#d5d6c8');bd=ImageDraw.Draw(board)
    bd.text((8,8),'修正前の立ち絵48枚：顎の位置を画像ごとに描き直し',font=title,fill='#18282c')
    bd.text((8,42),'橙の実線＝目視した顎下端／橙の破線＝背面のうなじ目安（顎は見えません）',font=font,fill='#18282c')
    bd.text((8,70),'頭頂100・腰比較200・膝比較240・足元280は共通線。画像の絵柄・頭身・色は未変更。',font=font,fill='#18282c')
    html='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>修正前の立ち絵48枚・顎線を描き直し</title><style>body{background:#18282c;color:#eee;font:15px system-ui;margin:16px}h1{font-size:23px}h2{font-size:19px}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;max-width:1060px}.card{text-align:center;border:1px solid #78938a;padding:4px}.card img{width:100%;max-width:256px;display:block;margin:auto}a{color:#ffe0a0}.note{line-height:1.7;max-width:1080px}section{margin-bottom:20px}small{display:block;color:#d3c9ba}.issue{color:#ffc9a1}</style><h1>修正前の立ち絵一覧：顎線を48枚それぞれ描き直し</h1><p class="note">N・E・W・S順。橙の実線は画像を拡大して目視した顎の下端です。顎が見えない背面は、うなじの目安を橙の破線で表示しています。<br>頭頂100・足元280は表示位置の基準、腰200・膝240は共通の比較線です。顎160の固定線は取り除きました。<br>線の修正だけです。絵柄・頭身・色の修正、画像生成、追加課金は行っていません。</p><p><a href="./all-standing-five-guides.png?v=jaw2">48枚の一覧画像</a></p><label><input id="lines" type="checkbox" checked>線を表示</label>'''
    if active:
        html=html.replace('修正前の立ち絵48枚・顎線を描き直し','立ち絵48枚・方向別比較')
        html=html.replace('修正前の立ち絵一覧：顎線を48枚それぞれ描き直し','立ち絵一覧：方向別の修正案を比較')
        html=html.replace('線の修正だけです。絵柄・頭身・色の修正、画像生成、追加課金は行っていません。',f'差し替え：{len(active)}枚。各カードに変更内容を表示しています。基準方向は各キャラの選択欄で選べます。選択はこのブラウザーに保存され、画像の生成や変更は実行しません。全方向の統一は未完了です。')
        html=html.replace('頭頂100・足元280は表示位置の基準、腰200・膝240は共通の比較線です。顎160の固定線は取り除きました。','頭頂・顎（背面はうなじ）・腰・膝・足元の5本線です。修正案の腰・膝は目視した位置の目安、未修正画像の「腰比較」「膝比較」は共通線です。隠れた関節の位置は推定です。')
        if len(guide_overrides)==48:
            html=html.replace('立ち絵一覧：方向別の修正案を比較','立ち絵一覧：N/W・E/Sの5点位置を比較')
            html=html.replace('頭頂・顎（背面はうなじ）・腰・膝・足元の5本線です。修正案の腰・膝は目視した位置の目安、未修正画像の「腰比較」「膝比較」は共通線です。隠れた関節の位置は推定です。','頭頂・顎（背面はうなじ）・腰・膝・足元の5本を、N/W・E/Sの組ごとに選択された基準へ合わせています。線と別に画像の比率も補正しています。腰・膝は衣装越しの目視推定です。')
            html=html.replace('全方向の統一は未完了です。','5点位置の補正を反映済みです。衣装・装備などのデザイン差は残っています。')
        html+='<label style="margin-left:20px"><input id="before" type="checkbox">差し替え前を表示</label>'
        bd.rectangle((0,0,1024,100),fill='#d5d6c8')
        bd.text((8,8),f'立ち絵48枚：{len(active)}枚の差し替え案・方向別比較',font=title,fill='#18282c')
        bd.text((8,42),'橙＝顎／背面のうなじ目安。「腰比較」「膝比較」は共通線。',font=font,fill='#18282c')
    for row,cast in enumerate(casts):
        records=[next(r for r in m['rows'] if r['cast']==cast and r['direction']==d) for d in order];name=records[0]['name']
        bd.text((8,125+row*350),name,font=font,fill='#18282c');html+=f'<section id="{cast}"><h2>{name}</h2>'
        html+=f'<p><label>N・Wの基準 <select data-choice="{cast}/NW" aria-label="{name} N・Wの基準"><option value="">未選択</option><option>N</option><option>W</option><option>両方修正</option><option>現状でよい</option></select></label>　<label>E・Sの基準 <select data-choice="{cast}/ES" aria-label="{name} E・Sの基準"><option value="">未選択</option><option>E</option><option>S</option><option>両方修正</option><option>現状でよい</option></select></label></p>'
        if cast in COLOUR_NOTES:
            note=COLOUR_NOTES[cast]
            colour_text='N基準の色調整案を適用しました。' if active.get(cast+'/W',{}).get('colourAdjustments') else 'Eと異なります。未補正です。'
            html+=f'<p class="issue">Wの'+ '・'.join(note['parts'])+'：'+colour_text+'</p>'
        html+='<div class="row">'
        for col,r in enumerate(records):
            direction=r['direction'];repair=active.get(f'{cast}/{direction}')
            annotation=guide_overrides.get(f'{cast}/{direction}',{})
            jaw=annotation.get('jaw',repair.get('jaw',POSITIONS[cast][direction]) if repair else POSITIONS[cast][direction])
            visible=direction in ['E','S'] or (cast,direction) in VISIBLE_PROFILE
            kind='顎' if visible else 'うなじ目安'
            im=Image.open(ROOT/(repair['image'] if repair else r['original'].lstrip('/'))).convert('RGBA')
            tile=Image.new('RGBA',(256,300),'#d5d6c8');tile.alpha_composite(im);dr=ImageDraw.Draw(tile)
            landmarks=annotation.get('landmarks',repair.get('landmarks',{}) if repair else {})
            for y,label,colour in [(landmarks.get('head',100),'頭頂','#547d79'),(landmarks.get('waist',200),'腰目安' if landmarks else '腰比較','#8166a4'),(landmarks.get('knee',240),'膝目安' if landmarks else '膝比較','#a37a21'),(landmarks.get('ground',280),'足元','#547d79')]:
                dr.line((0,y,255,y),fill=colour);dr.text((3,y-13),label,font=small,fill=colour)
            if visible:dr.line((0,jaw,255,jaw),fill='#b35e2b')
            else:
                for x in range(0,256,12):dr.line((x,jaw,min(x+6,255),jaw),fill='#b35e2b')
            dr.text((3,jaw-13),f'{kind} {jaw}',font=small,fill='#a35326')
            target=WORK/'five-guides'/cast/f'{direction}.png';target.parent.mkdir(parents=True,exist_ok=True)
            before_target=target.with_name(f'{direction}-before.png')
            if not before_target.exists():
                if target.exists(): before_target.write_bytes(target.read_bytes())
                else: tile.save(before_target)
            tile.save(target)
            bd.text((col*256+120,125+row*350+23),direction,font=font,fill='#18282c');board.paste(tile.convert('RGB'),(col*256,125+row*350+45))
            version=hashlib.sha256(target.read_bytes()).hexdigest()[:10]
            guide=f'./five-guides/{cast}/{direction}.png?v={version}';before_original='./'+r['original'].split('/standing-cast-review-v1/')[1]
            original='/'+repair['image'] if repair else before_original
            before_guide=f'./five-guides/{cast}/{direction}-before.png'
            label=f'・{repair["label"]}' if repair else ''
            html+=f'<div class="card"><strong>{direction}</strong><img data-guide="{guide}" data-original="{original}" data-before-guide="{before_guide}" data-before-original="{before_original}" src="{guide}" alt="{name} {direction} {kind}の位置{jaw}px"><small>{kind}：{jaw}px{label}</small></div>'
            r['jawAnnotation']={'y':jaw,'label':kind,'visibleJaw':visible,'method':'manual visual annotation','estimatedUncertaintyPx':2,'imageWasNotWarped':not bool(repair and repair.get('geometryRemap') and repair.get('geometryRemapChanged',True))}
            assert hashlib.sha256((ROOT/r['source']).read_bytes()).hexdigest()==r['sourceSha256']
        html+='</div></section>'
    decisions_path=WORK/'reference-decisions.json'
    decisions=json.loads(decisions_path.read_text()) if decisions_path.exists() else {}
    html+='<script>const referenceDecisions='+json.dumps(decisions,ensure_ascii=False)+'</script>'
    html+='''<p>基準を選んだ後、このチャットに「選択しました」とお知らせください。</p><script>function update(){const before=document.querySelector('#before')?.checked;const lines=document.querySelector('#lines').checked;for(const im of document.querySelectorAll('.card img'))im.src=before?(lines?im.dataset.beforeGuide:im.dataset.beforeOriginal):(lines?im.dataset.guide:im.dataset.original)}document.querySelector('#lines').onchange=update;const before=document.querySelector('#before');if(before)before.onchange=update;for(const s of document.querySelectorAll('[data-choice]')){s.value=referenceDecisions[s.dataset.choice]||'';try{s.value=localStorage.getItem('standing-reference/'+s.dataset.choice)||s.value}catch{}s.onchange=()=>{try{localStorage.setItem('standing-reference/'+s.dataset.choice,s.value)}catch{}}}</script></html>'''
    (WORK/'preview.html').write_text(html);board.save(WORK/'all-standing-five-guides.png')
    m['guides']={'headTopReference':100,'jaw':'per-image manual annotation','waistReference':200,'kneeReference':240,'groundReference':280}
    if len(guide_overrides)==48:m['guides']={'headTopReference':100,'jaw':'per-pair selected reference','waist':'per-pair manual visual landmark','knee':'per-pair manual visual estimate','groundReference':280}
    m['colourDifferences']=COLOUR_NOTES;m['status']=f'{len(active)} active standing replacements; per-character references pending user selection' if active else 'source art unchanged; individual jaw annotations; no generation'
    m['activeRepairs']=active
    if len(guide_overrides)==48:m['status']='24 pairs geometrically aligned to user-selected references; manual anatomy estimates; equipment/design differences remain'
    (WORK/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    print('48 individual jaw/nape annotations saved; all original source hashes unchanged.')

if __name__=='__main__':main()
