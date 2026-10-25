# 音声追加v1 制作契約

2026-10-18。ユーザー配置 `.codex/skills/rpg-music/SKILL.md` を優先し、BGM/SEの設計・制作・ゲーム接続を行う。供給待ちは配置連絡で解消。技能本文/production/templatesを確認済み。Pythonは`.venv/bin/python`のみ。

## 範囲と依存

BGM3点: `bgm-briefing` 導入/会話/戦闘選択、`bgm-tactics` 全12戦の進行中、`bgm-ending` B12終幕。SE8点: `se-ui` 起動/防御/取消の短い応答、`se-move` 確定移動の石面一歩抽象、`se-impact` 実ダメージ、`se-heal` 手当確定、`se-record` 採取/案内確定、`se-mechanism` 水門/復旧指示確定、`se-victory` 勝利、`se-defeat` 敗北。環境音、専用ボス曲、全マス足音、声、追加録音は今回対象外。

音源はスキル内唯一のGeneralUser-GS.sf2（内部名2.0.3 BETA、SHA9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe）。FluidSynth2.6.1検出。ffmpeg/ffprobeなし、音声生成コネクタ/DAW未検出。既存afconvertが利用可能。SoundFont内ICMT License v2.0が私用/商用音楽制作を許諾、由来不明サンプルについての作者留保もそのまま記録する。sf2自体はpublicへコピーせず、オリジナル音符から楽器レンダリングしたWAVだけを使用。有料サービス/新規インストール/資格情報/永続権限なし。SEは数式/固定seed合成。

各BGMは8小節の循環、管弦楽/小編成、編集可能なJSON/MIDI、残響安定後の中央ループ切出し、PCM WAV master/deliveryと数値QA。音源限界/試聴未実施を明記。鐘/歌/既存曲旋律の再現なし。楽器は弦/木管/金管/必要な打楽器、全パート常時演奏を避ける。

UIは初期オフ、明示的「音を有効にする」の操作でAudioContextを解放。ミュート・BGM/SE各音量、再読込でオフ、設定はメモリのみで進行/QA保存を一切使わない。隠れたタブは停止、非同期の古い曲/SE要求を破棄、同曲継続、切替フェード約0.3秒、SE合計3同時/同ID間隔0.08秒。音声失敗は表示し無音で遊べる。ゲームルール/AI/マップ/画像/保存形式を変更しない。

## 役割と所有範囲

音素材担当: `scripts/build-game-audio.py`、`assets/audio/v1`、`public/audio/v1`のみ。実音声・ソース・metadata/ライセンス/QA、再現手順を作る。
再生担当: `src/audio.ts`、`src/audio-cues.ts`、`tests/audio.test.ts`のみ。WebAudio管理/テスト、上記11IDの固定catalog。
統合担当: mainへの接続と音設定DOM、必要なstyle、音イベント純関数/試験、契約/版/検証/到達点更新。
独立レビュー担当: 全体をread-only確認し、コード/音源/数値QA/権利/既存戦闘非変更を点検。試聴・実機できない項目は合格扱いしない。同ゲート修正最大3回。

## QA版の分離

変更前のB12無音r0は固定99 SHA差0を確認。ソース/試験/qa/distは `/tmp/tactics-b12-silent-r0` に退避（永続バックアップではない）、既存画像/スキル/企画/依存などはbaseline.jsonにSHA保存。停止中のChrome境界QAはこの無音版に対する観測で、音声追加版の合格根拠にはしない。main等の変更でVite HMRが起こり得るため、旧タブの途中画面の維持や旧99一致は以後保証しない。実セーブ/既存タブは操作せず、再開時に親が版と最新状態を確認する。既存証拠/manifest/旧固定99を上書きしない。音声追加版には別manifestを作る。

## 完了と引継ぎ

音声生成・配信再デコード/尺/peak/DC/ループ数値検査、独立review、型/全試験/buildを行う。聴ける入力経路がないため試聴、3周の聴感、実Chrome音量/ミュート/フォーカス/場面切替は未実施として引き継ぐ。試聴用3周WAVを用意し、自然さ/音量/材質の確認を依頼。公開/pushなし。

変更前退避はsrc/tests/qa/distとpackage/index/tsconfigまで完了。プロジェクトにvite.config.tsは存在せず、同ファイルのコピーだけFileNotFoundErrorとなった。存在しない設定を作成せず、退避済み内容を保持する。

## 独立レビュー後の修正履歴

AUD-01（音声結合ゲート1/3）: 遅延SEが旧場面を離れた後に鳴る可能性を独立担当が指摘。beginSceneで世代を更新し、旧SEのpending/再生中を停止、同曲BGMは継続。勝敗SEはresultへの移行後に1度発火する。再挑戦/導入/終幕/戦闘選択でも場面を更新する。同IDpending完了による新世代pending解除もguardする。

同回の混合余裕調整: 素材最大peak（BGM約.32、SE約.5）と想定SE3+切替BGM2を基に、各voice出力に固定0.35を乗じ、退役BGMは最大1に制限する。カテゴリスライダー0〜100%はこの基準出力に対する倍率。ブラウザ実出力のtrue peak/聴感を検査済みとはしない。

## ユーザー無音報告への調査・修正（結合2/3）

ユーザーはChrome/Safari両方でONでも聞こえないと報告。HTTP11件200/audio-wav・SHA一致・PCM復号・Range206を確認。配信不良はこのoriginでは再現せず、ユーザーの実際のURL/AudioContext/OS出力は観測できない。OS/ユーザー/ブラウザ障害へ断定しない。

コード上でresume解決だけでON表示し実stateを監視しないため、中断/休止でもON・再開ボタン無効になり得る点を修正。runtime版audio-v1-r2、実state/時刻/読込cue/選曲/エラーの確認欄、確認音、再開、5秒resume/12秒load timeoutとRIFF/WAVE確認を追加。音源・音量基準・gameルール/保存/旧素材は変更しない。ユーザーのOS/ブラウザ設定へ触れず、GUI成功・聴感合格は未確認。素材調整は3/3を維持する。
