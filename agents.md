# Agent Instructions

## Release Notes Update Rule

- ソースコードを修正した場合は、必ず `src/content/updates.json` への追記・更新を行うこと。
- 追記内容は**ユーザーが実際に認識できる変更**に限定すること。
- 内部実装の詳細（例: テーブル設計、内部関数名、運用都合、リファクタ手順）は記載しないこと。
- 文面はユーザーが読んで理解できる平易な表現にし、専門用語を避けること。
- 変更点は「何がどう良くなったか」が伝わる短い箇条書きで記述すること。
- 日英の文言は意味をそろえ、片方だけに重要情報を載せないこと。

## Writing Style for `src/content/updates.json`

- `summary` は1〜2文で簡潔に。
- `changes` はユーザー体験ベースで記述する（表示改善、操作性向上、不具合修正など）。
- 「省略」「内部対応」など、ユーザー価値が伝わらない文言は使わない。

## Examples

### Good Examples

- `summary (ja)`: 「結果画面の見やすさと、プレイ中の安定性を改善しました。」
- `changes (ja)`: 「Result Map の Origin / Target 表示を改善し、正解確認をしやすくしました。」
- `changes (ja)`: 「ランキング画面の表示崩れを修正し、比較しやすくしました。」
- `summary (en)`: "Improved result readability and overall play stability."
- `changes (en)`: "Improved Origin/Target clarity in the result map for easier review."

### Bad Examples

- 「settle_pending_matches のクエリを修正」
- 「profiles テーブルの legacy カラムを削除」
- 「内部対応のため詳細省略」
- 「fix: address PR review comments」

### Rewrite Guidance (Bad -> Good)

- Bad: 「settle_pending_matches の不具合を修正」
  - Good: 「一部の試合結果が反映されにくい問題を修正しました。」
- Bad: 「mode 列追加でロジック修正」
  - Good: 「モードごとの成績がより正確に反映されるよう改善しました。」
