"""Individually authored BGM revision. Shared orchestration helpers, no shared tune.
Bar strings are explicit scale-degree:duration events; _ is an audible rest.
Durations are quarter-note beats, including in compound meters.
"""
import math
MODES={'major':[0,2,4,5,7,9,11],'minor':[0,2,3,5,7,8,10],'dorian':[0,2,3,5,7,9,10],'mixolydian':[0,2,4,5,7,9,10],'lydian':[0,2,4,6,7,9,11]}
# Every cue has its own two independently written themes, harmony, meter,
# phrase plan, accompaniment grid and instrumental hierarchy.
PLANS={
 'title':dict(bpm=120,meter=[6,8],bars=40,tonic=62,mode='major',lead=60,counter=73,texture=40,
  form=[('A',8),('B',12),('C',4),('A2',8),('B2',8)],
  harmony='D A Bm G D F#m Em A G D Em A'.split(),
  A=['0:.5 4:.5 7:1 6:.5 4:.5','5:.75 4:.25 2:.5 1:.5 4:1','2:.5 4:.5 6:.5 7:1 9:.5','8:1 7:.5 5:.5 4:1','7:.5 6:.5 4:.5 2:.5 0:1','1:.5 2:.25 3:.25 4:1 6:1','5:.75 4:.25 3:.5 1:.5 2:1','1:1 4:.5 2:.5 1:.5 _:.5'],
  B=['4:.75 5:.25 7:1 8:.5 9:.5','11:.5 9:.5 8:.5 7:.5 6:1','9:1 7:.5 5:.5 6:.5 4:.5','5:1.5 3:.5 2:1','4:.5 2:.5 0:.5 1:.5 3:1','2:.75 4:.25 6:.5 5:.5 4:1','3:.5 5:.5 7:.5 8:.5 6:.5 4:.5','2:1 1:.5 -1:.5 0:.5 _:.5'],
  grid=[(0,0,.32),( .5,2,.32),(1,1,.32),(1.5,3,.32),(2,1,.32),(2.5,2,.32)],bass=[(0,1.1,0),(1.5,1.1,7)],drums=[(0,36,38),(1.5,38,34)],direction='明るい6/8の冒険序曲。上行する跳躍と躍動的な8分弦、ホルンの主題、木管の遠景。'),
 'prologue':dict(bpm=72,meter=[3,4],bars=24,tonic=50,mode='minor',lead=42,counter=68,texture=49,
  form=[('A',6),('B',6),('C',6),('A2',6)],harmony='Dm Bb Gm A Dm F C A Bb Gm E7 A'.split(),
  A=['4:1.5 2:.5 3:1','1:2 _:.5 0:.5','-1:1 1:.5 4:1 _:.5','3:1.5 2:.5 1:.5 -1:.5','0:2.5 4:.5','3:1 1:1 _:.5 -1:.5'],
  B=['5:.5 4:.5 2:2','3:1 6:1 5:.5 3:.5','4:2 1:.5 2:.5','0:.5 -1:.5 -3:1 -1:1','1:1.5 2:.5 4:1','3:1 1:.5 -1:.5 0:.5 _:.5'],
  grid=[(0,0,2.6),(1,2,1.5)],bass=[(0,2.5,0)],drums=[],direction='回想の3/4。チェロ独奏の長い息と問いかけるオーボエ。短調から一瞬長調を望み、静かに戻る。'),
 'briefing':dict(bpm=100,meter=[5,4],bars=30,tonic=62,mode='lydian',lead=71,counter=68,texture=45,
  form=[('A',6),('B',8),('C',4),('A2',6),('B2',6)],harmony='D E G D Bm F#m Em A D G E A'.split(),
  A=['0:.5 1:.5 4:1 _:.5 3:.5 2:1 5:1','4:.75 6:.25 7:1 6:.5 3:.5 1:1 _:.5 2:.5','3:1 1:.5 0:.5 2:1 4:1 6:1','5:.5 4:.5 2:1 _:.5 1:.5 -1:1 0:1','4:1.5 5:.5 3:1 2:.5 0:.5 1:1','2:.5 4:.5 6:.5 5:.5 3:1 1:1 _:.5 4:.5'],
  B=['7:1 5:.5 4:.5 6:.5 7:.5 9:1 8:1','6:1.5 4:.5 3:1 5:1 7:1','5:.5 6:.5 4:1 2:.5 3:.5 1:1 0:1','-1:1 1:.5 3:.5 4:1 2:1 _:.5 1:.5','2:1 5:1 7:.5 6:.5 4:1 3:1','1:1 2:.5 4:.5 6:1 4:1 1:.5 _:.5'],
  grid=[(0,0,.35),(1,2,.35),(2,1,.35),(3,3,.35),(3.5,2,.35),(4.5,1,.35)],bass=[(0,1.5,0),(3,1.3,7)],drums=[],direction='戦略を組み立てる5/4（3+2）。ピチカートとクラリネットの軽い問答。静止したパッド主体を廃止。'),
 'b01':dict(bpm=116,meter=[6,8],bars=64,tonic=67,mode='major',lead=73,counter=68,texture=45,
  form=[('A',12),('B',16),('C',8),('A2',12),('B2',16)],harmony='G D Em C Am D G D C G Am D'.split(),
  A=['4:.5 5:.25 4:.25 2:.5 0:.5 1:1','2:.75 3:.25 4:.5 6:.5 5:.5 3:.5','2:.5 0:.5 -1:.5 1:.5 4:1','3:1 2:.5 1:.5 0:.5 _:.5','1:.5 3:.5 5:.5 4:.5 2:1','4:.5 6:.5 7:.75 6:.25 4:.5 2:.5','3:.5 2:.5 0:1 1:.5 -1:.5','0:1.5 _:.5 4:.5 5:.5'],
  B=['7:.5 9:.5 8:.5 6:.5 4:1','5:.5 6:.5 7:1 4:.5 2:.5','3:.75 5:.25 6:.5 4:.5 1:1','2:.5 1:.5 -1:.5 0:1 _:.5','4:.5 2:.5 3:.5 5:.5 7:1','6:.75 5:.25 3:.5 4:.5 2:1','1:.5 4:.5 6:.5 5:.5 3:.5 1:.5','-1:1 1:.5 2:.5 0:1'],
  grid=[(.5,1,.28),(1,3,.28),(1.75,2,.28),(2.5,1,.28)],bass=[(0,1,0),(1.5,1,7)],drums=[(1.5,81,32)],direction='流れる6/8の渡し場。フルートの細かい装飾、軽快なピチカート。最初の冒険を明るく能動的に。'),
 'b02':dict(bpm=132,meter=[7,8],bars=60,tonic=64,mode='minor',lead=56,counter=60,texture=44,
  form=[('A',10),('B',10),('C',10),('A2',10),('B2',10),('A3',10)],harmony='Em C D B Em Am C B Em G Am B'.split(),
  A=['0:.5 0:.25 1:.25 2:.5 4:.5 3:.5 1:.5 -1:.5','0:1 3:.5 2:.25 1:.25 4:1 _:.5','5:.5 4:.5 2:.5 1:.5 3:.75 2:.25 0:.5','-1:.5 1:.5 2:1 4:.5 3:.5 _:.5','6:.5 4:.5 5:.25 4:.25 2:.5 0:1 1:.5','2:1.5 1:.5 -1:.5 0:.5 _:.5'],
  B=['7:.5 6:.5 4:1 5:.5 3:.5 2:.5','4:.75 5:.25 6:.5 7:.5 4:1 2:.5','3:.5 1:.5 -1:.5 2:.5 4:.5 6:.5 5:.5','4:1 2:.5 0:.5 -1:.5 1:.5 _:.5','5:.5 3:.25 2:.25 4:.5 6:.5 4:.5 2:.5 1:.5','-1:1 2:.5 4:.5 1:1 _:.5'],
  grid=[(0,0,.22),(.5,0,.22),(1,2,.22),(1.5,1,.22),(2,3,.22),(2.5,2,.22),(3,1,.22)],bass=[(0,.65,0),(1,.65,0),(2,1.1,7)],drums=[(0,36,43),(1,38,45),(2,36,40),(3,38,34)],direction='石橋閉鎖の7/8（2+2+3）。短い反復音から跳ぶトランペット、低弦の押し出し、刻むスネア。'),
 'b03':dict(bpm=112,meter=[4,4],bars=44,tonic=65,mode='major',lead=68,counter=60,texture=48,
  form=[('A',8),('B',12),('C',8),('A2',8),('B2',8)],harmony='F C Dm Bb Gm C F A Dm Gm Bb C'.split(),
  A=['2:1 3:.5 4:.5 5:1 4:.5 2:.5','1:.75 2:.25 3:1 4:.5 2:.5 0:1','-1:.5 0:.5 1:1 3:1 2:1','0:1.5 1:.5 2:1 _:.5 4:.5','5:1 4:.5 2:.5 3:.75 4:.25 5:1','6:.5 5:.5 3:1 2:.5 0:.5 1:1','2:.5 3:.5 4:1 1:1 -1:1','0:2 _:.5 2:.5 3:.5 4:.5'],
  B=['7:1 5:1 6:.5 7:.5 9:1','8:1.5 7:.5 5:1 4:1','6:.75 5:.25 3:.5 2:.5 4:1 6:1','5:1 2:1 1:1 _:.5 0:.5','3:.5 4:.5 5:1 7:1 6:.5 4:.5','5:1.5 3:.5 2:1 0:1','1:.5 2:.5 3:.5 4:.5 2:1 -1:1','0:3 _:.5 4:.5'],
  grid=[(0,0,.5),(.75,2,.25),(1.5,1,.4),(2,3,.5),(3,2,.4),(3.5,1,.25)],bass=[(0,1.5,0),(2,1.5,7)],drums=[(1,38,30),(3,38,34)],direction='人を守る温かな4/4の行進。オーボエの歌う長い旋律とホルン、付点リズムで荷車を前へ運ぶ。'),
 'b04':dict(bpm=144,meter=[12,8],bars=40,tonic=60,mode='dorian',lead=73,counter=70,texture=45,
  form=[('A',8),('B',8),('C',4),('A2',12),('B2',8)],harmony='Cm F Bb Gm Cm Dm F G Cm Eb Bb G'.split(),
  A=['0:.5 2:.5 3:.5 4:1 2:.5 1:.5 3:.5 5:1 4:1','2:1.5 1:.5 0:.5 2:.5 4:.5 6:.5 5:1 3:1','4:.5 3:.5 1:1 2:.5 0:.5 -1:1 1:1 3:1','2:2 0:.5 1:.5 3:1 2:1 _:.5 4:.5'],
  B=['7:1 6:.5 4:.5 5:1 8:.5 7:.5 5:1 3:1','4:.5 6:.5 7:1.5 5:.5 3:1 1:.5 2:.5 4:1','5:1 4:1 2:.5 0:.5 1:.5 3:.5 6:1 5:1','3:1.5 1:.5 0:1 2:1 1:1 _:.5 -1:.5'],
  grid=[(.5,1,.35),(1,2,.35),(2,3,.35),(2.5,1,.35),(3.5,2,.35),(4,3,.35),(5,1,.35),(5.5,2,.35)],bass=[(0,1.2,0),(1.5,1.2,7),(3,1.2,0),(4.5,1.2,7)],drums=[(0,36,32),(3,81,32)],direction='水が戻る12/8。ハープの波、フルートとファゴットの立体的な応答。乾いた支渠から水の推進へ。'),
 'b05':dict(bpm=138,meter=[5,4],bars=44,tonic=59,mode='minor',lead=71,counter=70,texture=45,
  form=[('A',8),('B',8),('C',12),('A2',8),('B2',8)],harmony='Bm G Em F# Bm D A F# G C Em F#'.split(),
  A=['0:.25 1:.25 3:.5 _:.5 2:.25 0:.25 -1:.5 2:.5 4:.5 3:.5 1:1','2:.5 4:.25 3:.25 1:.5 -1:.5 _:.5 0:.5 3:.5 5:.5 4:1','6:.5 3:.5 4:.25 2:.25 1:.5 0:1 2:.5 4:.5 1:1','-1:.75 0:.25 2:.5 1:.5 3:.5 4:.5 2:1 _:.5 0:.5'],
  B=['7:.5 5:.5 6:.25 4:.25 2:.5 3:.5 5:.5 8:.5 6:.5 4:1','5:.25 6:.25 7:.5 4:1 2:.5 0:.5 1:.5 3:.5 2:1','3:.5 1:.25 0:.25 -1:.5 1:.5 4:.5 6:.5 5:1 3:1','2:1 0:.5 -1:.5 1:.25 2:.25 4:.5 1:1 _:.5 -1:.5'],
  grid=[(0,0,.13),(.25,2,.13),(.75,1,.16),(1.5,3,.16),(2.25,2,.16),(3,0,.2),(3.5,1,.16),(4.25,3,.16),(4.5,2,.16)],bass=[(0,.7,0),(1.75,.55,7),(3,.7,0),(4,.6,7)],drums=[(0,37,32),(3,37,34)],direction='文書蔵の5/4。16分ピチカート、角張ったクラリネットと低いファゴット。緊張する潜入・証拠奪取。'),
 'b06':dict(bpm=128,meter=[6,8],bars=72,tonic=62,mode='mixolydian',lead=40,counter=70,texture=48,
  form=[('A',12),('B',12),('C',12),('A2',12),('B2',12),('D',12)],harmony='D C G D Am C G A D Bm C A'.split(),
  A=['0:.75 3:.25 4:.5 2:.75 1:.25 0:.5','2:.5 5:.75 4:.25 3:.5 1:.5 2:.5','4:1 6:.5 5:.5 2:.5 3:.5','1:.75 -1:.25 0:1 _:.5 2:.5','3:.5 5:.5 7:.75 6:.25 4:.5 2:.5','5:.75 3:.25 4:.5 1:.5 2:.5 0:.5'],
  B=['7:.75 4:.25 5:.5 8:.75 6:.25 4:.5','6:.5 9:.5 7:.5 5:.75 4:.25 2:.5','3:1.5 6:.5 4:.5 1:.5','2:.5 0:.5 1:.75 3:.25 4:.5 2:.5','5:.75 6:.25 4:1 2:.5 1:.5','0:1 3:.5 2:.5 -1:.5 _:.5'],
  grid=[(0,0,.45),(.75,2,.2),(1.5,3,.45),(2.25,1,.2),(2.75,2,.16)],bass=[(0,1.2,0),(1.5,.8,7),(2.5,.3,2)],drums=[(0,36,32),(1.5,38,35)],direction='鎖門を越える6/8の舟歌型戦闘。付点の揺れ、ヴァイオリンの跳躍、低音の短い押し返し。'),
 'b07':dict(bpm=156,meter=[3,4],bars=84,tonic=69,mode='dorian',lead=72,counter=68,texture=40,
  form=[('A',12),('B',12),('C',12),('A2',12),('B2',12),('D',12),('A3',12)],harmony='Am D G Em Am C D E Am G D E'.split(),
  A=['4:.5 4:.25 5:.25 7:.5 6:.5 4:.5 2:.5','3:.5 5:.5 4:.25 2:.25 0:.5 1:.5 3:.5','2:.75 1:.25 -1:.5 0:.5 2:.5 4:.5','5:.5 3:.5 1:1 _:.5 4:.5','6:.25 7:.25 9:.5 7:.5 5:.5 4:.5 2:.5','3:.75 4:.25 2:.5 1:.5 0:.5 _:.5'],
  B=['7:.5 9:.25 8:.25 6:.5 5:.5 7:1','4:.5 6:.5 8:.5 7:.25 5:.25 3:.5 1:.5','2:.5 5:.5 7:.75 6:.25 4:.5 2:.5','3:1 1:.5 0:.5 -1:.5 1:.5','4:.25 5:.25 6:.5 4:.5 2:.5 3:1','2:1.5 1:.5 -1:.5 _:.5'],
  grid=[(0,0,.2),(.5,2,.12),(.75,1,.12),(1.5,3,.22),(2,2,.22),(2.5,1,.2)],bass=[(0,.75,0),(1.5,.75,7)],drums=[(0,38,35),(1.5,38,40),(2.5,36,30)],direction='退避路を駆ける3/4のギャロップ。短いピッコロの合図と高弦、二つの避難路を応答する旋律。'),
 'b08':dict(bpm=126,meter=[7,8],bars=60,tonic=60,mode='dorian',lead=70,counter=68,texture=45,
  form=[('A',8),('B',14),('C',8),('A2',8),('B2',14),('D',8)],harmony='Cm F Dm G Cm Bb F G Ab Fm D7 G'.split(),
  A=['0:1 4:.5 3:.5 1:.5 2:.5 5:.5','4:.5 2:1 3:.5 6:.5 4:.5 1:.5','2:.75 0:.25 -1:.5 1:.5 3:.5 2:1','4:.5 1:.5 2:.5 0:1 _:.5 3:.5','5:1 3:.5 4:.5 6:.5 2:.5 1:.5','-1:.5 1:.5 3:.75 2:.25 0:1 _:.5'],
  B=['6:.5 4:1 7:.5 5:.5 3:.5 2:.5','4:1 1:.5 3:.5 5:.75 4:.25 2:.5','3:.5 6:.5 8:.5 7:.5 4:.5 2:1','5:.75 3:.25 1:.5 -1:1 2:.5 4:.5','6:1 3:.5 4:.5 2:.5 0:.5 1:.5','2:.5 4:.5 1:1 -1:.5 0:.5 _:.5'],
  grid=[(0,0,.55),(1,2,.23),(1.5,3,.23),(2.25,1,.23),(2.5,2,.23),(3.25,3,.16)],bass=[(0,.8,0),(1,1.1,7),(2.5,.7,2)],drums=[(0,36,30),(1,37,35),(2.5,37,35)],direction='二水路を切り替える7/8（2+3+2）。ファゴットとオーボエが交差し、B02の直線的な緊迫と別の知的な推進。'),
 'b09':dict(bpm=124,meter=[4,4],bars=52,tonic=67,mode='major',lead=60,counter=41,texture=48,
  form=[('A',12),('B',12),('C',8),('A2',12),('D',8)],harmony='G Bm C D Em C Am D G Em A D'.split(),
  A=['0:1 2:1 4:1.5 5:.5','7:1 6:.5 4:.5 5:1 3:1','4:.5 2:.5 1:1 3:.5 4:.5 6:1','5:1.5 3:.5 1:1 _:.5 2:.5','4:1 7:1 6:.5 5:.5 3:1','2:2 1:.5 -1:.5 0:1'],
  B=['7:1.5 8:.5 9:1 6:1','5:.5 7:.5 8:1 6:.5 4:.5 5:1','3:1 5:1 7:1.5 4:.5','6:.5 5:.5 3:1 2:1 4:1','1:1 3:.5 5:.5 4:1 2:1','-1:1.5 1:.5 2:1 0:.5 _:.5'],
  grid=[(0,0,.65),(1,2,.4),(1.5,1,.4),(2.5,3,.4),(3.5,2,.25)],bass=[(0,1.8,0),(2.5,1.1,7)],drums=[(1,38,30),(2.5,38,33)],direction='公開の場へ進む4/4。長いホルンの旋律とヴィオラの応答。明るい行進だが力任せにしない。'),
 'b10':dict(bpm=136,meter=[2,4],bars=112,tonic=70,mode='major',lead=56,counter=57,texture=48,
  form=[('A',16),('B',24),('C',16),('A2',24),('B2',16),('D',16)],harmony='Bb F Gm Eb Cm F Bb Dm Eb Bb C7 F'.split(),
  A=['0:.25 0:.25 2:.5 4:.75 5:.25','7:.5 4:.5 2:.5 1:.5','3:.75 4:.25 5:.5 6:.5','4:1 _:.5 2:.5','5:.25 4:.25 2:.5 3:.5 1:.5','2:.75 1:.25 0:.5 _:.5','4:.5 6:.5 7:.5 5:.5','4:.75 2:.25 1:.5 -1:.5'],
  B=['7:.5 9:.25 8:.25 7:1','6:.75 4:.25 5:.5 3:.5','4:.25 5:.25 6:.5 4:.5 2:.5','3:1 1:1','2:.25 3:.25 4:.5 7:.75 6:.25','5:.5 4:.5 2:1','1:.5 4:.5 6:.5 5:.5','3:.5 1:.5 0:.5 _:.5'],
  grid=[(0,0,.3),(.5,2,.3),(1,1,.3),(1.5,3,.3)],bass=[(0,.7,0),(1,.7,7)],drums=[(0,36,38),(.5,38,32),(1.5,38,38)],direction='快活な2/4の港の行進。トランペットのファンファーレとトロンボーンの合いの手。救援を迎える明るいアクション。'),
 'b11':dict(bpm=132,meter=[9,8],bars=48,tonic=57,mode='minor',lead=71,counter=41,texture=45,
  form=[('A',9),('B',9),('C',6),('A2',9),('B2',9),('D',6)],harmony='Am F Dm E Am C G E Dm F B7 E'.split(),
  A=['0:.5 3:.5 2:.5 4:.25 3:.25 1:.5 -1:.5 2:.5 0:1','1:.75 2:.25 4:.5 5:1 3:.5 1:.5 2:.5 4:.5','6:.5 4:.5 2:.75 0:.25 1:.5 3:.5 5:.5 2:1','3:.5 1:.5 -1:1 2:.5 4:.5 1:1 _:.5','0:.25 2:.25 3:.5 5:.75 4:.25 2:.5 1:.5 -1:.5 0:1','2:1.5 1:.5 3:.5 4:.5 2:.5 0:.5 _:.5'],
  B=['7:.5 5:.75 3:.25 4:.5 6:.5 8:.5 5:1 3:.5','4:1 2:.5 5:.5 7:.75 6:.25 4:.5 2:1','3:.5 6:.5 5:.5 2:.5 0:.75 1:.25 3:.5 4:1','5:.75 4:.25 2:.5 1:1 3:.5 2:.5 -1:1','1:.5 4:.25 6:.25 5:.5 3:.5 2:.5 0:.5 1:.5 4:.5 2:.5','-1:1 1:.5 3:.5 2:1 0:1 _:.5'],
  grid=[(0,0,.2),(.5,2,.2),(1,1,.2),(1.5,3,.2),(2,2,.2),(2.5,0,.2),(3,1,.2),(3.5,3,.2),(4,2,.2)],bass=[(0,1.15,0),(1.5,.65,7),(2.5,1.5,2)],drums=[(0,37,30),(1.5,37,35),(2.5,36,32)],direction='保守路の9/8（3+2+4）。歯車のようなピチカートとクラリネット、ヴィオラの温かな返答。機敏な救出と復旧。'),
 'b12':dict(bpm=148,meter=[4,4],bars=64,tonic=62,mode='minor',lead=40,counter=56,texture=44,
  form=[('A',16),('B',12),('C',8),('D',12),('A2',16)],harmony='Dm Bb Gm A Dm C F A Bb Gm E7 A Dm F C A'.split(),
  A=['0:.25 1:.25 2:.5 4:.5 5:.25 4:.25 2:.5 1:.5 3:1','4:.5 6:.25 5:.25 3:.5 2:.5 0:.75 1:.25 4:1','5:.25 6:.25 7:.5 6:.5 4:.5 2:.25 3:.25 5:.5 4:1','3:1 1:.5 -1:.5 2:.75 4:.25 1:.5 _:.5','7:.5 4:.25 5:.25 6:.5 8:.5 7:.75 5:.25 4:1','6:.25 5:.25 3:.5 4:.5 2:.5 1:.5 0:.5 -1:1','2:.5 4:.5 5:.75 6:.25 4:.5 2:.5 1:1','-1:.5 1:.5 2:1 4:.5 3:.5 1:.5 _:.5'],
  B=['7:1 9:.5 8:.5 6:1 4:1','5:.5 7:.5 8:1 7:.75 5:.25 3:1','4:.5 6:.25 7:.25 9:.5 8:.5 6:1 5:1','3:1.5 4:.5 2:1 1:.5 -1:.5','5:1 6:.5 7:.5 4:1 2:1','3:.5 1:.5 4:1 2:1 0:.5 _:.5'],
  grid=[(0,0,.12),(.25,2,.12),(.5,1,.12),(.75,3,.12),(1.25,2,.12),(1.5,1,.12),(1.75,3,.12),(2,0,.12),(2.25,1,.12),(2.75,2,.12),(3,3,.12),(3.5,1,.12),(3.75,2,.12)],bass=[(0,.65,0),(1.5,.4,7),(2,.7,0),(3.25,.4,7)],drums=[(0,36,43),(.75,38,35),(2,36,43),(2.75,38,43),(3.5,38,34)],direction='速い4/4の決戦。独立した16分弦の主題、金管の長い答え、シンコペーション。中盤で木管へ薄くして再集結。'),
 'ending':dict(bpm=80,meter=[3,4],bars=32,tonic=62,mode='major',lead=73,counter=42,texture=49,
  form=[('A',8),('B',8),('C',8),('D',8)],harmony='D Bm G A F#m Bm Em A G D Em A D G A A'.split(),
  A=['0:.5 4:.5 7:1 6:.5 4:.5','5:1 4:.5 2:.5 1:1','2:1.5 0:.5 3:1','1:2 _:.5 4:.5','6:1 5:.5 3:.5 4:1','2:.5 1:.5 -1:1 0:1','3:1 5:1 4:.5 2:.5','1:2.5 _:.5'],
  B=['4:1.5 6:.5 7:1','9:.5 8:.5 6:1 5:1','7:1 4:.5 2:.5 3:1','5:1.5 3:.5 1:1','2:.5 4:.5 6:1 4:1','3:1 1:.5 0:.5 -1:1','1:1 2:.5 4:.5 3:1','2:1.5 1:.5 0:.5 _:.5'],
  grid=[(.15,0,2.5),(1.25,2,1.4),(2.15,1,.65)],bass=[(0,2.5,0)],drums=[],direction='穏やかな3/4の終幕。タイトルの冒頭2小節のみ引用し、独立した長いフルートの歌へ。ハープとチェロ。'),
}

PC={'C':0,'C#':1,'Db':1,'D':2,'Eb':3,'E':4,'F':5,'F#':6,'G':7,'Ab':8,'A':9,'Bb':10,'B':11}
def chord(symbol):
    root=symbol[:2] if len(symbol)>1 and symbol[1] in '#b' else symbol[:1]
    quality=symbol[len(root):];pc=PC[root]
    intervals=[0,3,7] if quality=='m' else [0,4,7,10] if quality=='7' else [0,4,7]
    return 36+pc,[48+pc+x for x in intervals]

def authored_score(c):
    ident,title,*_=c;p=PLANS[ident];beats=p['meter'][0]*4/p['meter'][1];total=p['bars']*beats
    scale=MODES[p['mode']]
    def pitch(degree):return p['tonic']+12*(degree//7)+scale[degree%7]
    definitions=[('主題',p['lead'],0),('固有リズムの弦',p['texture'],1),('チェロ/低弦',43,2),('応答声部',p['counter'],3),('ハープ',46,4),('和声の弦',48 if ident!='prologue' else 49,5),('ティンパニ',47,6),('管弦楽打楽器',0,9)]
    tracks=[dict(name=n,program=program,channel=channel,notes=[]) for n,program,channel in definitions]
    def add(track,at,dur,note,vel):
        if at<0 or at+dur>total+1e-7:return
        tracks[track]['notes'].append(dict(beat=round(at,6),duration=round(dur,6),pitch=int(note),velocity=max(20,min(90,round(vel)))))
    def phrase(track,bar,notation,velocity,octave=0):
        at=bar*beats
        for token in notation.split():
            d,length=token.split(':');length=float(length)
            if d!='_':add(track,at,length*.86,pitch(int(d))+octave,velocity+(4 if abs(at-round(at))<.01 else -3))
            at+=length
        assert at<=((bar+1)*beats)+1e-6,(ident,bar,notation,at,beats)
    sections=[];bar=0
    for section_index,(name,count) in enumerate(p['form']):
        sections.append(dict(bar=bar,bars=count,name=name))
        for local in range(count):
            pos=bar+local;at=pos*beats;is_quiet=name=='C';is_b=name.startswith('B') or name=='D'
            theme=p['B'] if is_b else p['A'];notation=theme[local%len(theme)]
            # Each cue's A/B phrases are authored above. C gives the B theme to
            # the countervoice at half density; later returns change voicing.
            if is_quiet:
                if local%2==0:phrase(3,pos,p['B'][local%len(p['B'])],50,-12 if p['counter']==60 else 0)
            else:phrase(0,pos,notation,67 if ident=='title' else 47 if ident=='prologue' else 50 if ident=='ending' else 64,0)
            root,voicing=chord(p['harmony'][pos%len(p['harmony'])])
            # Dedicated accompaniment grid per cue, never selected with style%N.
            for j,(beat,tone,dur) in enumerate(p['grid']):
                if is_quiet and j%2:continue
                n=voicing[tone%len(voicing)]
                if p['texture']==45 and ident in ('b05','b11'):n-=12 if j%3==0 else 0
                add(1,at+beat,min(dur,beats-beat-.01),n,42 if is_quiet else 52+(5 if j==0 else 0))
            for beat,dur,interval in p['bass']:
                if is_quiet and beat>0:continue
                add(2,at+beat,min(dur,beats-beat-.02),root+interval,43 if is_quiet else 56)
            if (local+section_index)%3==2 and not is_quiet:
                # Harmonic reply has cue-specific gaps and matches its meter.
                slot=beats*.5;length=min(.7,beats-slot-.1)
                add(3,at+slot,length,voicing[(local+1)%len(voicing)]+(12 if p['counter'] in (68,73,72) else 0),49)
            # Harp is prominent only where its articulation is part of the cue.
            if ident in ('title','b01','b04','ending','prologue'):
                for j,n in enumerate(voicing):
                    onset=.1+j*.24
                    if onset<beats-.1:add(4,at+onset,min(1.3,beats-onset-.05),n+12,35 if ident in ('ending','prologue') else 41)
            # Slow harmonic support is sparse, not a pad repeated every bar.
            if is_quiet or (ident in ('title','b03','b06','b09','b10','b12') and local%4==0):
                for n in voicing:add(5,at+.06,beats-.18,n,34 if is_quiet else 39)
            if p['drums'] and not is_quiet:
                for beat,n,velocity in p['drums']:
                    if beat<beats:add(7,at+beat,min(.12,beats-beat-.01),n,velocity)
                if local==0 and section_index>0:
                    add(6,at,.4,root,43)
                    if ident in ('title','b10','b12'):add(7,at,.25,49,32)
        bar+=count
    assert bar==p['bars'],ident
    # The old D–F–E is an explicit single quotation, not the tune of every bar.
    if ident not in ('title','ending','prologue'):
        quote_bar=sections[2]['bar']+1;slot=quote_bar*beats
        for b,d in [(0,0),(.5,2),(1,1)]:add(4,slot+b,.35,pitch(d),32)
    # Check and merge orchestral same-pitch coincidences rather than invalid MIDI.
    for track in tracks:
        notes=sorted(track['notes'],key=lambda n:(n['pitch'],n['beat']))
        merged=[]
        for n in notes:
            if merged and merged[-1]['pitch']==n['pitch'] and n['beat']<merged[-1]['beat']+merged[-1]['duration']:
                prior=merged[-1];prior['duration']=max(prior['duration'],n['beat']+n['duration']-prior['beat']);prior['velocity']=max(prior['velocity'],n['velocity'])
            else:merged.append(n.copy())
        track['notes']=sorted(merged,key=lambda n:(n['beat'],n['pitch']))
    return dict(schema_version=1,compositionRevision='independent-r2',tempo_bpm=p['bpm'],meter=p['meter'],bars=p['bars'],tracks=tracks,title=title,rationale=c[-1],direction=p['direction'],sections=sections,harmony=p['harmony'],sourceEvidence=['src/domain/battles.ts','src/view/storyContent.ts','src/view/prologue.ts'],motif=dict(id='river-record',version=3,quotation='single three-note cameo in C only; title/ending link restricted to opening two bars'),articulation='individual authored themes, note lengths, section density, instrument-specific phrasing; GM SoundFont constraints')
