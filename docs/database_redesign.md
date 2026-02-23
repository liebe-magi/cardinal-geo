# データベース再設計方針

## 背景

複数回のマイグレーションを経て、以下の問題が蓄積しています。

- **schema.sql が実態と乖離**: 9本のマイグレーションの変更が未反映。新環境に schema.sql を適用しても正しく動かない
- **RPC関数が4世代にまたがる**: `submit_rated_answer` が schema.sql / composite_rating / per_mode_ratings / fix_global_ratings に分散
- **レガシーカラムの残存**: `profiles.rating/rd/vol` は書き込みが停止しているが、フォールバック読み取りが残っている
- **未使用関数の放置**: `settle_pending_matches`, `get_challenge_unrated_ranking` など
- **match_history のスナップショット不足**: 当時の相手RD/vol/composite opponentが記録されず、事故後の再計算が不可能

## 現状の全テーブル・カラム棚卸し

### 1. profiles

| カラム                      | 使用状況                                                            | 判定     |
| --------------------------- | ------------------------------------------------------------------- | -------- |
| id                          | 全認証フローで使用                                                  | **維持** |
| username                    | プロフィール、ランキングで使用                                      | **維持** |
| rating                      | user_mode_ratings.global のフォールバック読み取りのみ。書き込みなし | **廃止** |
| rd                          | 同上                                                                | **廃止** |
| vol                         | 同上                                                                | **廃止** |
| best_score_survival_rated   | ランキング、プロフィールで使用                                      | **維持** |
| best_score_survival_unrated | ランキング、プロフィールで使用                                      | **維持** |
| weakness_scores             | 17箇所で読み書き                                                    | **維持** |
| created_at                  | select('\*') 経由で読み取り                                         | **維持** |
| updated_at                  | トリガーで自動更新                                                  | **維持** |

### 2. user_mode_ratings

全カラム使用中。変更不要。 **維持**

### 3. questions

| カラム                                                          | 使用状況                                | 判定                          |
| --------------------------------------------------------------- | --------------------------------------- | ----------------------------- |
| 基本カラム (id, city_a/b_code, city_a/b_capital, correct_ns/ew) | 全使用                                  | **維持**                      |
| rating, rd, vol                                                 | Glicko-2 レーティング                   | **維持**                      |
| play_count, win_count                                           | 統計表示                                | **維持**                      |
| composite_rating                                                | migration で追加。supabaseApi.ts で送信 | **維持（schema.sql に反映）** |
| created_at                                                      |                                         | **維持**                      |

### 4. match_history

| カラム                   | 使用状況                | 判定         |
| ------------------------ | ----------------------- | ------------ |
| 全既存カラム             | 全使用                  | **維持**     |
| _(不足)_ opponent_rating | 未記録（教訓: Ryo事象） | **新規追加** |
| _(不足)_ opponent_rd     | 未記録                  | **新規追加** |
| _(不足)_ opponent_vol    | 未記録                  | **新規追加** |
| _(不足)_ user_rd_before  | 未記録                  | **新規追加** |
| _(不足)_ user_vol_before | 未記録                  | **新規追加** |
| _(不足)_ user_rd_after   | 未記録                  | **新規追加** |
| _(不足)_ user_vol_after  | 未記録                  | **新規追加** |

mode の CHECK 制約は拡張が面倒なので、TEXT のみに変更しアプリ側でバリデーションする。

### 5. daily_challenge_results

全カラム使用中。変更不要。 **維持**

### 6. challenge_unrated_results

使用中（insert / select / ランキング計算）。 **維持**

### 7. city_ratings（migration のみで定義）

使用中（supabaseApi.ts, GlobalStats.tsx）。 **維持（schema.sql に反映）**

## 未使用・廃止対象

### テーブル

なし（全テーブル使用中）

### カラム

| 対象            | 理由                                              |
| --------------- | ------------------------------------------------- |
| profiles.rating | user_mode_ratings.global に統合済み。書き込みなし |
| profiles.rd     | 同上                                              |
| profiles.vol    | 同上                                              |

### RPC 関数

| 対象                            | 理由                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| settle_pending_matches()        | アプリはクライアントサイドで settlement を実行。DB関数版はGlicko-2更新をスキップしており不完全 |
| get_challenge_unrated_ranking() | アプリコードに呼び出しなし                                                                     |
| submit_rated_answer(9引数版)    | 旧オーバーロード。本番からは既に削除済み                                                       |

### ゴースト RPC

| 対象                         | 状況                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| update_best_survival_unrated | アプリが呼ぶが schema.sql / migration に定義なし。schema.sql に正式定義するか、直接 update に統一 |

## 理想スキーマの設計方針

### A. profiles テーブル（簡素化）

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  best_score_survival_rated integer not null default 0,
  best_score_survival_unrated integer not null default 0,
  weakness_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- rating/rd/vol を削除
- アプリ側フォールバックコードも削除（user_mode_ratings.global を正とする）

### B. match_history テーブル（スナップショット強化）

```sql
create table if not exists public.match_history (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  session_id uuid not null,
  mode text not null,                          -- CHECK制約を廃止
  status text not null default 'pending'
    check (status in ('pending', 'win', 'lose')),

  -- Player snapshot (before / after)
  user_rating_before double precision not null,
  user_rd_before double precision not null,
  user_vol_before double precision not null,
  user_rating_after double precision,
  user_rd_after double precision,
  user_vol_after double precision,
  rating_change double precision not null default 0,

  -- Opponent snapshot (composite opponent used for Glicko-2 calc)
  -- NULL許容: 既存行にはデータがないため。新規行では常に値が入る。
  opponent_rating double precision,
  opponent_rd double precision,
  opponent_vol double precision,

  -- Question rating snapshot (before)
  question_rating_before double precision not null,
  question_rating_after double precision,

  created_at timestamptz not null default now(),
  answered_at timestamptz
);
```

- mode の CHECK 制約を廃止（新モード追加時にマイグレーション不要）
- player の RD/vol before/after を記録
- composite opponent の rating/rd/vol を記録
- これにより事故発生時の厳密再計算が可能

### C. questions テーブル（composite_rating 反映）

```sql
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  city_a_code text not null,
  city_b_code text not null,
  city_a_capital text not null,
  city_b_capital text not null,
  correct_ns char(1) not null check (correct_ns in ('N', 'S')),
  correct_ew char(1) not null check (correct_ew in ('E', 'W')),
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  composite_rating double precision,              -- 追加
  play_count integer not null default 0,
  win_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(city_a_code, city_b_code)
);
```

### D. city_ratings テーブル（schema.sql に正式追加）

```sql
create table if not exists public.city_ratings (
  country_code text primary key,
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  play_count integer not null default 0
);
```

### E. RPC 関数（統合・整理）

| 関数                          | 方針                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- |
| submit_rated_answer           | fix_global_ratings の最終版を正とし、match_history のスナップショット列対応を追加 |
| get_or_create_question        | 現行維持                                                                          |
| save_daily_progress           | 現行維持                                                                          |
| get_daily_progress            | 現行維持                                                                          |
| get_rating_ranking            | fix_global_ratings 版 (default='global') を正とする                               |
| get_daily_average_ranking     | migration から schema.sql に統合                                                  |
| get_global_activity_stats     | migration から schema.sql に統合                                                  |
| get_rating_history_aggregated | migration から schema.sql に統合                                                  |
| settle_pending_matches        | **削除**                                                                          |
| get_challenge_unrated_ranking | **削除**                                                                          |
| update_best_survival_unrated  | schema.sql に正式定義を追加                                                       |

## 移行手順

### Phase 1: schema.sql の統合（コード変更なし）

1. schema.sql を理想スキーマで全面書き直し
2. 全マイグレーション内容を schema.sql に統合
3. 差分が無いことを `diff` で確認

### Phase 2: match_history スナップショット列の追加

1. マイグレーション SQL を作成
   - match_history に 7 列追加（user_rd_before, user_vol_before, user_rd_after, user_vol_after, opponent_rating, opponent_rd, opponent_vol）
   - 既存行は null 許容
   - 新規行は NOT NULL 制約（default 付き）
2. submit_rated_answer を更新して新列に書き込み
3. アプリ側 (`createPendingMatch`, `submitRatedAnswer`) を更新

### Phase 3: profiles レガシーカラム削除

1. 全ユーザーに user_mode_ratings.global 行が存在することを確認
   ```sql
   select count(*) from profiles p
   where not exists (
     select 1 from user_mode_ratings umr
     where umr.user_id = p.id and umr.mode = 'global'
   );
   ```
2. 結果が 0 なら:
   - アプリ側フォールバックコード削除（gameStore.ts, Profile.tsx, ModeSelect.tsx 等）
   - profiles から rating/rd/vol カラムを DROP
3. 結果が 0 でなければ:
   - 欠損ユーザーに global 行を INSERT してから上記を実行

### Phase 4: 未使用関数の削除

1. settle_pending_matches() を DROP
2. get_challenge_unrated_ranking() を DROP
3. 旧 submit_rated_answer(9引数) は本番で既に削除済み（確認のみ）

### Phase 5: match_history.mode CHECK 制約の緩和

1. 既存 CHECK 制約を DROP
2. 新モード追加時にマイグレーション不要な状態にする

## リスクと注意点

| リスク                                   | 対策                                           |
| ---------------------------------------- | ---------------------------------------------- |
| profiles.rating 削除でフォールバック喪失 | Phase 3 で全ユーザーの global 行存在を事前確認 |
| match_history 列追加で既存クエリが壊れる | 新列は全て NULL 許容。既存行は影響なし         |
| RPC 関数の差し替えで一時的な不整合       | トランザクション内で DROP + CREATE を実行      |
| CHECK 制約緩和で不正な mode が入る       | アプリ側バリデーションを先に実装               |

## 優先度

1. **最優先**: schema.sql の統合（Phase 1）— 今すぐ実施可能、リスクなし
2. **高**: match_history スナップショット（Phase 2）— 再発防止の根本対策
3. **中**: profiles レガシーカラム削除（Phase 3）— 整理目的
4. **低**: 未使用関数削除（Phase 4）、CHECK 制約緩和（Phase 5）

---

## デプロイ手順（実行順）

### 前提

- **アプリ**: Vite + React SPA（静的ビルド → ホスティングにデプロイ）
- **DB**: Supabase（SQL Editor で手動マイグレーション）
- **デプロイの独立性**: アプリとDBは別々にデプロイ可能。ただし、アプリが参照するカラム/関数がDBから消えると即エラーになるため、**順序が重要**

### 原則

```
カラム/関数の追加 → DB先、アプリ後（どちらが先でも安全）
カラム/関数の削除 → アプリ先（参照を消す）、DB後（実体を消す）
カラム/関数の変更 → 後方互換なら DB先、破壊的ならアプリ先
```

---

### Step 1: schema.sql の統合（ドキュメント整備のみ）

**作業**: schema.sql を全マイグレーション反映済みの最新版に書き直す
**DB操作**: なし（schema.sql はリファレンスドキュメント。本番DBには適用しない）
**アプリデプロイ**: 不要
**リスク**: なし

```
[ ] schema.sql を書き直し
[ ] git commit & push
```

---

### Step 2: match_history スナップショット列の追加

**DB操作（SQL Editor）**: 列追加 + submit_rated_answer 関数更新
**アプリ変更**: createPendingMatch / submitRatedAnswer に新列の送信を追加
**順序**: **DB先 → アプリ後**（新列は NULL 許容なので、旧アプリが動いても壊れない）

```
[ ] 2-a. SQL Editor でマイグレーション実行
       - match_history に 7 列追加（全て NULL 許容）
       - submit_rated_answer を更新（新列を受け取り保存）
[ ] 2-b. アプリコード変更
       - supabaseApi.ts: createPendingMatch に user_rd_before, user_vol_before を追加
       - supabaseApi.ts: submitRatedAnswer に opponent_*, user_rd/vol_after を追加
       - gameStore.ts: submitAnswer 内で新パラメータを渡す
[ ] 2-c. アプリデプロイ
[ ] 2-d. 動作確認（新規プレイで match_history にスナップショットが記録されることを確認）
```

---

### Step 3: 未使用 RPC 関数の削除

**DB操作（SQL Editor）**: 関数 DROP
**アプリ変更**: なし（呼び出し元が存在しないため）
**順序**: **DB のみ**

```
[ ] 3-a. SQL Editor で実行
       - DROP FUNCTION IF EXISTS public.settle_pending_matches();
       - DROP FUNCTION IF EXISTS public.get_challenge_unrated_ranking();
[ ] 3-b. schema.sql から該当関数定義を削除（Step 1 で対応済みのはず）
[ ] 3-c. git commit & push
```

---

### Step 4: match_history.mode CHECK 制約の緩和

**DB操作（SQL Editor）**: CHECK 制約を DROP
**アプリ変更**: なし（アプリ側バリデーションは既に実装済み）
**順序**: **DB のみ**

```
[ ] 4-a. SQL Editor で実行
       - ALTER TABLE public.match_history DROP CONSTRAINT IF EXISTS match_history_mode_check;
[ ] 4-b. schema.sql を更新（CHECK 制約を削除した定義に）
[ ] 4-c. git commit & push
```

---

### Step 5: profiles レガシーカラム削除（最も慎重に）

**前提確認（SQL Editor）**:

```sql
-- global 行が無いユーザーが 0 件であること
select count(*) from profiles p
where not exists (
  select 1 from user_mode_ratings umr
  where umr.user_id = p.id and umr.mode = 'global'
);
```

0 でなければ先にバックフィル:

```sql
insert into user_mode_ratings (user_id, mode, rating, rd, vol, updated_at)
select id, 'global', rating, rd, vol, updated_at
from profiles p
where not exists (
  select 1 from user_mode_ratings umr
  where umr.user_id = p.id and umr.mode = 'global'
)
on conflict (user_id, mode) do nothing;
```

**順序**: **アプリ先 → DB後**（アプリがカラムを参照しなくなってから DROP）

```
[ ] 5-a. アプリコード変更（フォールバック参照の削除）
       - authStore.ts: Profile 型から rating/rd/vol を削除
       - gameStore.ts: getProfileRatingForMode の profile.rating フォールバック削除
       - Header.tsx: ?? profile?.rating フォールバック削除
       - ModeSelect.tsx: ?? profile.rating フォールバック削除
       - QuestionResult.tsx: ?? profile?.rating フォールバック削除
       - Profile.tsx: ?? profile.rating / profile.rd / profile.vol フォールバック削除
       - supabaseApi.ts: settlePendingMatches の profileData フォールバック削除
       - supabaseApi.ts: select('...rating') から profiles.rating 参照を削除
[ ] 5-b. アプリデプロイ
[ ] 5-c. 動作確認（全画面でレーティング表示が正常であることを確認）
[ ] 5-d. SQL Editor でカラム DROP
       - ALTER TABLE public.profiles DROP COLUMN IF EXISTS rating;
       - ALTER TABLE public.profiles DROP COLUMN IF EXISTS rd;
       - ALTER TABLE public.profiles DROP COLUMN IF EXISTS vol;
[ ] 5-e. schema.sql を更新
[ ] 5-f. git commit & push
```

---

### Step 6: ゴースト RPC の正式定義

**DB操作（SQL Editor）**: update_best_survival_unrated を schema.sql の定義で CREATE
**アプリ変更**: なし（既に呼び出し済み）
**順序**: **DB のみ**

```
[ ] 6-a. SQL Editor で関数を CREATE（既に本番に存在するなら CREATE OR REPLACE）
[ ] 6-b. schema.sql に定義を追加
[ ] 6-c. git commit & push
```

---

### 全体タイムライン

```
Day 1  Step 1 (schema.sql 統合)        — コードのみ、本番影響なし
       Step 3 (未使用関数 DROP)         — DB のみ、アプリ影響なし
       Step 4 (CHECK 制約緩和)          — DB のみ、アプリ影響なし
       Step 6 (ゴースト RPC 正式化)     — DB のみ、アプリ影響なし

Day 2  Step 2-a (match_history 列追加)  — DB マイグレーション
       Step 2-b,c (アプリ変更+デプロイ) — アプリデプロイ
       Step 2-d (動作確認)

Day 3  Step 5-a,b (アプリからレガシー参照削除+デプロイ)
       Step 5-c (動作確認)
       Step 5-d (profiles カラム DROP)
```

Day 1 は本番への影響がゼロの作業だけなので、即日実施可能です。
Day 2 / Day 3 は別日にする必要はなく、確認が取れ次第連続で進められます。
