# Cardinal - Geography Practice App / 地理練習アプリ

A web application to practice relative city locations (North, South, East, West) inspired by the board game "Nantettatte Honolulu".
ボードゲーム「なんてったってホノルル」にインスパイアされた、2都市の相対的な位置（東西南北）を練習するWebアプリです。

## Features

- **Five Game Modes**
  - **Survival Mode (Rated)**: Continue answering until you make a mistake.
  - **Daily Challenge (Rated)**: 10 daily questions exactly the same for all players. Compete for the highest daily score.
  - **Starter Mode (Rated)**: Practice with well-known world capitals to build a solid foundation.
  - **Regional Mode (Rated)**: Focus training on specific regions like Europe, Asia, Africa, etc.
  - **Learning Mode (Practice)**: Review mode that prioritizes your weak spots.

- **Statistics & Dashboards**
  - **Global Ranking**: View leaderboards for Rating, Survival, and Daily Challenge modes.
  - **Global Stats**: Deep dive into game metadata, including a City Difficulty chart.
  - **My Data**: Personal dashboard tracking rating history, top scores, and weakness maps.

- **Interactive Map Feedback & Bilingual Support**

## Setup / セットアップ

This project uses [bun](https://bun.sh) for package management.
このプロジェクトはパッケージ管理に [bun](https://bun.sh) を使用しています。

```bash
# Install dependencies / 依存関係のインストール
bun install

# Generate city data / 都市データの生成
bun run convert-csv

# Start development server / 開発サーバーの起動
bun run dev

# Production build / 本番ビルド
bun run build
```

## Checks / 検証

`bun install --frozen-lockfile` で依存を揃え、`bun test`、`bun run lint`、
`bun run build` を実行します。CIではBun 1.3.2とNode 24を使います。
ビルドには `.env.example` の `VITE_SITE_URL` と `VITE_GA_ID` が必要です。
CIでは公開先や計測先へ接続しないテスト用の値を指定しています。
既存のlintの型に関する警告と、ビルドのチャンクサイズに関する警告は失敗とは区別します。

方角は経度の数値比較、同緯度・同経度は北・東、部分正解は0点、
Dailyの切り替えはUTCという現行ルールを回帰テストで固定しています。

## Deploy / デプロイ

This project can be deployed to [Vercel](https://vercel.com) with the following settings:
このプロジェクトは以下の設定で [Vercel](https://vercel.com) にデプロイできます。

- **Framework Preset**: Vite
- **Build Command**: `bun run build`
- **Output Directory**: `dist`

## Tech Stack / 技術スタック

- Vite
- TypeScript
- Leaflet (Map display)

## Saved results and sharing / 結果保存と共有

採点は認証付きサーバーRPCで確定し、結果画面とログは同じ保存済みゲームを読みます。
公開リンクは本人の操作時だけ作成し、共有時点の成績を固定します。
DB移行・旧クライアントの停止・Vercel Functionsの設定は
[移行手順](docs/result-migrations.md) を確認してください。
静的Viteサーバーだけでは `/s/` と共有画像APIは動きません。

DB検証はPostgreSQL 17の空の使い捨てDBを用意して実行します。
`PGDATABASE` は誤操作防止のため `cardinal_geo_test` で始まる名前に限定します。
`psql` とテスト用DBへの管理接続が必要です。通常のSupabase環境では実行しないでください。

```fish
env PGHOST=localhost PGPORT=5432 PGUSER=postgres PGDATABASE=cardinal_geo_test bun run test:db
```

CIのdatabaseジョブは専用のPostgreSQLサービスで同じ手順を実行します。
回答の原子性・権限・再試行に加え、dblinkの独立した接続で同時回答を検証します。
[Issueごとの検証状況](docs/issue-validation.md) に、ローカルで確認済みの範囲と公開後に必要な確認を記載しています。
