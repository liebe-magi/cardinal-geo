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
