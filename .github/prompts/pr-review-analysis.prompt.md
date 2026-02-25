---
agent: agent
description: PRレビューコメントの妥当性と修正優先度を表形式で分析する
---

こちらのPull Requestについているレビューコメントを確認し、各レビューコメントの指摘の妥当性および現段階での修正の必要性を分析して下さい。
分析結果は表形式でわかりやすく記述して下さい。

以下の列を含めてください。

- 番号 (連番)
- レビューコメント（要約）
- 妥当性（妥当 / 一部妥当 / 妥当性が低い）
- 根拠（コード・仕様・ベストプラクティス観点）
- 修正必要性（高 / 中 / 低 / 不要）
- 推奨対応（今すぐ修正 / 別PRで対応 / 説明コメントでクローズ）
- 備考（影響範囲・リスク）

最後に「優先度順の対応リスト」を示してください（件数は制限しない）。

このリポジトリはプライベートリポジトリのため、レビューコメント取得時は以下の方法を使用してください。

- `gh auth status` で `repo` スコープ付きで認証済みであることを確認
- `gh api graphql` で `reviewThreads` / `reviews` / `comments` を同時取得する
- 実行コマンド（テンプレート）:

```bash
gh api graphql -f query='query($owner:String!, $name:String!, $number:Int!) {
	repository(owner:$owner, name:$name) {
		pullRequest(number:$number) {
			number
			title
			url
			reviewThreads(first:100) {
				nodes {
					isResolved
					isOutdated
					path
					comments(first:100) {
						nodes {
							id
							body
							author { login }
							createdAt
							url
							path
							line
							originalLine
							diffHunk
						}
					}
				}
			}
			reviews(first:100) {
				nodes {
					id
					state
					body
					author { login }
					submittedAt
					url
					comments(first:100) {
						nodes {
							id
							body
							author { login }
							createdAt
							url
							path
							line
							originalLine
							diffHunk
						}
					}
				}
			}
			comments(first:100) {
				nodes {
					id
					body
					author { login }
					createdAt
					url
				}
			}
		}
	}
}' -F owner=<OWNER> -F name=<REPO> -F number=<PR番号>
```

- 取得後は `reviewThreads.nodes[].comments.nodes[]` と
  `reviews.nodes[].comments.nodes[]` の重複（同一 `id`）を必ず排除する
- 分析対象は「レビュー指摘コメント」を主対象とし、CI通知やBot定型コメントは除外可

上記の取得結果をもとに、指摘単位で重複を整理し、分析表にまとめてください。
