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
