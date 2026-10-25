# 調査・参照・実施範囲

確認日: 2026-10-17 / 対象: `<project-root>`

## 初期状態

| 確認対象 | 結果 |
|---|---|
| 適用AGENTS.md | `/`、`/Users`、`~`、`<project-parent>`、プロジェクト直下に存在せず。プロジェクト配下の探索でも見つからなかった |
| README・既存企画・実装 | 発見なし。直下は `.codex/` と `.venv/` のみ |
| `.agents/skills` | `.agents` 自体が存在しない |
| プロジェクトスキル | `.codex/skills/generate2dmap`、`generate2dsprite`、`video2dsprite` |
| 司令塔 | プロジェクトローカルの独立した司令塔スキルは未発見。Game Studioのルーティングと親担当による統合・役割分担で補完 |
| Git・変更状態 | `git status --short` は「not a git repository」。差分・ブランチ・過去コミットの比較はできない |
| Python | `.venv/bin/python` が存在し `Python 3.13.16` と応答。実行は必ずこのパスを使用 |
| Node / npm | `node --version`: v24.19.0 / `npm --version`: 11.17.0。ゲーム依存は未導入 |

既存ファイルは編集対象にせず、資料のみ新設。`.codex` の既存20ファイルはSHA-256で作業前後を照合する。`.venv` の設定変更やパッケージ追加は行わない。Gitがないため「ユーザー差分なし」とは断定しない。他のRPGの過去設定を参照・流用していない。

## 読んだスキルと企画への適用

| スキル | 読んだ実体・範囲 | 今回の適用 |
|---|---|---|
| Game Studio / game-studio | インストール済みGame Studioの `skills/game-studio/SKILL.md` | 2D標準の判定、専門スキルへの振り分け、統合計画 |
| web-game-foundations | 同 `skills/web-game-foundations/SKILL.md` | 純粋シミュレーション・描画・入力・保存境界 |
| phaser-2d-game | 同 `skills/phaser-2d-game/SKILL.md` | Phaser + TypeScript + Vite、薄いScene、DOM HUD |
| game-ui-frontend | 同 `skills/game-ui-frontend/SKILL.md` | 戦場を隠さないUI、情報階層、モバイルと入力境界 |
| sprite-pipeline | 同 `skills/sprite-pipeline/SKILL.md` | 参照原画、共通スケール・足元、QA。生の生成形状は下記ローカル規約を優先 |
| game-playtest | 同 `skills/game-playtest/SKILL.md` | 将来の起動・入力・画面遷移・スクリーンショットQA計画。今回ブラウザ実機検証は未実施 |
| [generate2dmap](../../.codex/skills/generate2dmap/SKILL.md) | SKILL.md、map-strategies.md、layered-map-contract.md | `grid_mode`、地形データと絵の分離、地形・水門・ユニットの別レイヤー、遮蔽QA |
| [generate2dsprite](../../.codex/skills/generate2dsprite/SKILL.md) | SKILL.md、prompt-rules.md | 一動作ずつ複数行グリッド生成、#FF00FF除去、足元とスケール統一、FX別生成 |
| [video2dsprite](../../.codex/skills/video2dsprite/SKILL.md) | SKILL.md | Grok Build専用と確認。Codexでは使用しない。採用候補から除外 |

Game Studio実体の根は `~/.codex/plugins/cache/openai-curated-remote/game-studio/0.1.2/`。初めに提供されたスキル参照で本文を取得し、後にローカル実体も確認した。ローカルスプライト規約と汎用sprite-pipelineの「生ストリップ生成」が異なるため、本件ではローカルのアクション別グリッドを採用し、ストリップは検品後の決定的な組立だけに使う。

これは制作方針への適用であり、画像・動画生成を実行した意味ではない。

## 担当分離

- 統合 `/root`: 初期調査、仕様決定、文書化、修正、資料検査。
- 企画 `/root/planning`: 核・代替案・規模・UI・制作計画の独立提案。
- 戦術 `/root/tactics`: 戦闘・育成・水門・試作・受入条件の独立提案。
- 物語 `/root/story`: 世界・人物・全編構成・政治決着の独立提案。
- 批評 `/root/review`: 統合原稿を読んで、制作担当と分離した矛盾・実現性レビュー。

制作3担当の案は統合時に選択しており、未採用案を最終仕様として扱わない。批評担当は自分で企画を書き換えず、指摘と再確認を担当する。レビューの実施内容と修正回数は [review.md] に残す。修正上限は3回。

## 外部技術資料

2026-10-17閲覧。技術方針を裏付ける一次資料として利用。

- [Phaser公式 Vite TypeScriptテンプレート](https://github.com/phaserjs/template-vite-ts): この構成の公式例を確認。ページの概要にPhaser 3、本文にPhaser 4との異なる表記があるため、今回メジャー版の確定根拠にはしない。将来の最小描画検証で固定する。
- [Vite公式ガイド](https://vite.dev/guide/): TypeScriptのvanillaテンプレート、開発サーバー・ビルドの役割を確認。導入時は選んだ版のNode要件とローカル環境を再照合する。
- Phaser公式サイトとTilemapsの文書は取得失敗。Tilemap APIの対応状況や高さ表現の実機適合は未確認。ゲーム盤面は独自JSONを正とし、特定APIへの依存を確定しない。

最新メジャー版・性能・依存互換性を検証済みとはしない。今回はインストール、テンプレート複製、公開、pushを行っていない。

## 今回検証したもの／残るもの

実施: ファイル配置の探索、関連スキル本文の確認、ランタイムのバージョン応答、独立した企画提案、統合原稿の静的レビュー、Markdownのファイル参照と必要項目・12戦IDの検査、既存スキルのハッシュ照合。

未実施: ゲーム起動、戦闘シミュレーション、AI、数値バランス、経路探索の実行、セーブ復元、画像生成・目視QA、ブラウザ／タッチ／性能試験、第三者によるプレイテスト。文章の整合性とゲームとして成立することを区別する。最終的な検査結果はレビュー記録を参照。
