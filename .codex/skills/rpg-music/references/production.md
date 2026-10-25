# 制作経路と音声QA

## ローカルのMIDI・レンダリング補助

`scripts/bgm.py` は参照元rpg-bgm-composerの補助スクリプトを基にする。Python標準ライブラリでMIDI出力・環境検出・PCMループ検査を行い、WAVレンダリングだけはFluidSynthと利用可能なSoundFontを必要とする。自動作曲、SE合成、LUFS測定は行わない。

以下の相対パスはスキルフォルダ基準。実行時は配置先を解決し、出力先は対象プロジェクトの制作ディレクトリへ変更する。出力先の親ディレクトリを用意し、既存の成果物を上書きしない。

```sh
python3 scripts/bgm.py probe
python3 scripts/bgm.py midi assets/cue.example.json --out /absolute/project/audio/cue.mid
# assets直下の.sf2が1件なら自動選択
python3 scripts/bgm.py render /absolute/project/audio/cue.mid --out /absolute/project/audio/cue.wav
# 明示指定はassets内の候補数にかかわらず優先
python3 scripts/bgm.py render /absolute/project/audio/cue.mid --soundfont /absolute/path/font.sf2 --out /absolute/project/audio/cue.wav
python3 scripts/bgm.py verify /absolute/project/audio/loop.wav --start 0 --end 176400 --out /absolute/project/audio/qa.json
```

最後のendは例。実音声のサンプルレート・音楽構造から決める。renderで生成した残響込みの全長を、そのままループ長としない。

SoundFontは `--soundfont` の明示指定を最優先する。指定がなければスキルのassets直下の `.sf2` を列挙し、1件なら使用、複数ならエラーとする。`default.sf2` も候補の1件として数え、特別扱いしない。拡張子の大文字・小文字は区別しない。0件ならrenderは音源不足のエラーを返す。明示指定が存在しないか `.sf2` でなければエラーとし、自動選択へ戻らない。存在と拡張子だけで品質・奏法・利用条件を確認済みにしない。

### MIDI入力

`assets/cue.example.json` は2小節の技術確認用スケッチであり、完成曲やループ品質の見本ではない。指定シーンに応じて作曲し直す。

- `schema_version`: 1。`tempo_bpm`: 一定テンポ。`meter`: [分子, 分母]。`bars`: 小節数。
- `tracks`: name、channel（0基準、9は打楽器）、program（0基準）、notes。
- `notes`: beat/durationは四分音符単位、pitchはMIDI番号0〜127、velocityは1〜127。休符はノートのない区間。
- 同一チャンネルは1トラック。同音高の重複と小節範囲外のノートは不可。
- CC、テンポ変化、pitch bend、keyswitchは非対応。必要な表現はDAWや対応MIDIライブラリで制作する。

一定テンポでは四分音符数 = 小節数 × 拍子分子 × 4 / 拍子分母、秒数 = 四分音符数 × 60 / BPM。テンポ変化がある場合はテンポマップから求める。

## 制作経路の判断

DAWと専用楽器音源が使えるなら、フレーズ・アーティキュレーションとミックスをそこで作る。FluidSynth＋SoundFontは編集可能なMIDIから音声を再現できるが、GM programだけで細かな奏法や映画的な演奏品質を保証しない。BGMの主旋律、和声、低音、対旋律の役割を保持し、非対応奏法は代替と制約を記録する。

SE・環境音には録音、利用許可のある素材の加工、波形/ノイズ合成、利用可能な生成ツールを選べる。材質と動作を、アタック・胴鳴り・摩擦・残響など必要な成分で表現する。元素材、処理、生成パラメータを保存する。足音やUI音に不要な長い残響を加えない。

生成サービス使用時はプロンプト、モデル版、seed（対応時）、元音声、加工手順を保存する。利用可能なサービスがなければ、存在しないツールを呼び出す代わりに設計/MIDIと未生成項目を渡す。

## ループを作る

残響があるBGMは、同じセクションを複数周レンダリングし、残響が安定した中央の1周を取り出す方法を検討する。和声・拍・フレーズを循環させる。イントロがあればintro→loopとloop→loopを別々に確認する。クロスフェードは拍の二重化や位相の打消しを試聴し、単なる末尾フェードを連続ループとして扱わない。

ループsample indexはチャンネルごとの個別値ではなくPCMフレーム位置とする。ループ秒 = sample index / sample rate。終了exclusiveで `[start, end)`。リサンプルやエンコード後は再デコードし、最終ファイルに対応する位置を取り直す。再生側が区間ループに非対応ならイントロとループを別ファイルにするなど、対応方式を記載する。

## 数値検査と試聴

verifyは整数PCM 16/24/32-bit、mono/stereo WAVの指定区間を検査する。sample peak、PCM上限到達サンプル、DC、境界ジャンプ、境界の傾き、前後20msのRMSを報告する。float WAVや圧縮音声は利用可能なツールで対応PCMへデコードする。区間外のイントロや尾も別途検査する。

境界ジャンプ0.02 full-scale超、DC 0.005超、境界RMS差6dB超、PCM上限到達を要確認フラグにする。これらは診断目安であり合否や音量目標ではない。警告なしでも無音、拍、和声が途切れる場合がある。ワンショットSEに境界連続性を要求しない。

FFmpeg等が利用できれば、全ファイルのピーク・無音・必要なLUFS/true peakを測定し、計測方法と値を残す。sample peak検査だけでtrue peakやLUFS測定を完了したと扱わない。マスターは非圧縮WAV、配信形式はプロジェクト指定に従う。短いSEは単独試聴と連続・重ね合わせの聞こえ方を優先する。

試聴ではループ3周、接続前後、SE連続発火、想定最大同時音数、BGM/環境音/重要SEのバランスを確認する。実際に聴ける再生手段がない場合は、試聴用ファイルを提供して聴感未検証とする。音声生成やファイル表示だけで試聴済みにはしない。
