# Supabase セットアップガイド

## 1. Supabase プロジェクト作成

1. [Supabase](https://supabase.com/) にアクセスしアカウントを作成
2. 「New Project」をクリック
3. プロジェクト名・データベースパスワード・リージョンを設定して作成

## 2. 環境変数の設定

プロジェクトダッシュボードの **Settings > API** から以下の値を取得し、`.env` ファイルに設定：

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

## 3. データベーススキーマの設定

Supabase ダッシュボードの **SQL Editor** で以下のファイルを順番に実行：

### 3-1. スキーマ作成

`supabase/schema.sql` の内容をコピーして実行。

このファイルには以下が含まれます：

- **profiles** テーブル（ユーザー情報・レーティング）
- **questions** テーブル（問題の Glicko-2 レーティング）
- **match_history** テーブル（対戦履歴・pending コミットメント）
- **daily_challenge_results** テーブル（日替わりチャレンジ結果）
- **challenge_unrated_results** テーブル（チャレンジ Unrated 結果）
- RLS ポリシー（Row Level Security）
- RPC 関数（settle_pending_matches, submit_rated_answer, etc.）

### 3-2. 問題データのシード

```bash
bun run seed
```

これにより `supabase/seed_questions.sql` が生成されます。
このファイルの内容を SQL Editor に貼り付けて実行してください。

> **注意**: ファイルサイズが大きい場合、Supabase CLI を使った方が効率的です：
>
> ```bash
> npx supabase db push --file supabase/seed_questions.sql
> ```

## 4. OAuth 認証の設定

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) で OAuth 2.0 クライアント ID を作成
2. 承認済みリダイレクト URI に `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` を追加
3. Supabase ダッシュボードの **Authentication > Providers > Google** で Client ID と Secret を設定

### GitHub OAuth

1. [GitHub Developer Settings](https://github.com/settings/developers) で OAuth App を作成
2. Authorization callback URL に `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` を設定
3. Supabase ダッシュボードの **Authentication > Providers > GitHub** で Client ID と Secret を設定

## 5. メール認証の設定

Supabase ダッシュボードの **Authentication > Settings** から：

- Email Auth を有効化（デフォルトで有効）
- 必要に応じて確認メールテンプレートをカスタマイズ

## 6. 動作確認

```bash
bun run dev
```

ブラウザで `http://localhost:5173` を開き：

1. ログイン画面が表示されることを確認
2. Google/GitHub/メールでログインできることを確認
3. Survival Rated モードでプレイし、レーティングが変動することを確認
4. ランキングページにデータが表示されることを確認

## テーブル構造

```
profiles
├── id (UUID, auth.users FK)
├── username (TEXT, UNIQUE)
├── rating (1500), rd (350), vol (0.06)
├── best_score_survival_rated (INT)
├── best_score_survival_unrated (INT)
├── weakness_scores (JSONB)
└── created_at, updated_at

questions
├── id (UUID)
├── city_a_code, city_b_code (TEXT)
├── city_a_capital, city_b_capital (TEXT)
├── correct_ns (N/S), correct_ew (E/W)
├── rating (1500), rd (350), vol (0.06)
├── play_count, win_count (INT)
└── created_at

match_history
├── id (BIGSERIAL)
├── user_id → profiles, question_id → questions
├── session_id (UUID)
├── mode (survival_rated | challenge_rated)
├── status (pending | win | lose)
├── user_rating_before/after, question_rating_before/after
├── rating_change
└── created_at, answered_at

daily_challenge_results
├── id (BIGSERIAL)
├── user_id → profiles
├── challenge_date (DATE, UNIQUE with user_id)
├── score, total_rating_change
├── status (in_progress | completed)
├── current_question, answers (JSONB)
└── created_at, completed_at

challenge_unrated_results
├── id (BIGSERIAL)
├── user_id → profiles
├── score (0-10)
└── created_at
```
