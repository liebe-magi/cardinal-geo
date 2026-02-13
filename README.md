# Cardinal - Geography Practice App / 地理練習アプリ

A web application to practice relative city locations (North, South, East, West) inspired by the board game "Nantettatte Honolulu".
ボードゲーム「なんてったってホノルル」にインスパイアされた、2都市の相対的な位置（東西南北）を練習するWebアプリです。

## Features / 機能

- **Three Game Modes / 3つのゲームモード**
  - **Survival Mode / サバイバルモード**: Continue answering until you make a mistake. / 間違えるまで回答し続けるエンドレスモード。
  - **Time Attack Mode / タイムアタックモード**: Answer as many questions as possible in 60 seconds. / 60秒間の制限時間内にできるだけ多く正解するモード。
  - **10 Questions Challenge / 10問チャレンジ**: Accuracy challenge for 10 questions. / 10問中何問正解できるかを競うモード。

- **Bilingual Support / バイリンガル対応**
  - Switch between Japanese and English. / 日本語と英語の切り替えが可能。

- **Interactive Map Feedback / インタラクティブな地図フィードバック**
  - View correct locations on a map after each answer (except Time Attack). / 各回答後に地図上で正しい位置を確認できます（タイムアタック除く）。

- **Final Result Screen / 最終結果画面**
  - Score, accuracy, and answer history displayed at the end of each game. / ゲーム終了後にスコア・正答率・回答履歴を表示。

- **Direction Logic / 方角判定**
  - Simple latitude/longitude numeric comparison (does not wrap across the 180th meridian). / 緯度・経度の数値の大小で判定（東経180度をまたがない）。

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
