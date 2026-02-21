-- =============================================================
-- Phase 2: City Ratings + Composite Rating Migration
-- フェーズ2: 都市レーティング + 合成レーティングのマイグレーション
-- =============================================================

-- Step 1: Create city_ratings table
-- ステップ1: city_ratingsテーブルの作成
create table if not exists public.city_ratings (
  country_code text primary key,
  rating double precision not null default 1500,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  play_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Enable RLS and allow authenticated users to read
alter table public.city_ratings enable row level security;

create policy "city_ratings_select"
  on public.city_ratings for select
  to authenticated
  using (true);

-- =============================================================
-- Step 2: Bootstrap city ratings from existing pair data
-- ステップ2: 既存ペアデータから都市レーティングをブートストラップ
-- Weighted average of pair ratings per city code, weighted by play_count
-- =============================================================
INSERT INTO public.city_ratings (country_code, rating, rd, play_count)
SELECT
  city_code,
  CASE WHEN total_plays > 0
    THEN weighted_rating_sum / total_plays
    ELSE 1500
  END as rating,
  CASE WHEN total_plays > 0
    THEN GREATEST(50, 350 - (total_plays * 2))  -- RD decreases with more data
    ELSE 350
  END as rd,
  total_plays as play_count
FROM (
  SELECT
    city_code,
    SUM(rating * play_count) as weighted_rating_sum,
    SUM(play_count) as total_plays
  FROM (
    -- Each city appears in both city_a and city_b positions
    SELECT city_a_code as city_code, rating, play_count FROM public.questions
    UNION ALL
    SELECT city_b_code as city_code, rating, play_count FROM public.questions
  ) all_appearances
  GROUP BY city_code
) aggregated
ON CONFLICT (country_code) DO NOTHING;

-- =============================================================
-- Step 3: Add composite_rating column to questions table
-- ステップ3: questionsテーブルにcomposite_ratingカラムを追加
-- =============================================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS composite_rating double precision NOT NULL DEFAULT 1500;

-- Initialize composite_rating from existing pair rating
-- 既存のペアレーティングでcomposite_ratingを初期化
UPDATE public.questions SET composite_rating = rating;

-- Index for fast matchmaking queries
-- 高速マッチング用のインデックス
CREATE INDEX IF NOT EXISTS idx_questions_composite ON public.questions(composite_rating);

-- =============================================================
-- Step 4: Update submit_rated_answer RPC
-- ステップ4: submit_rated_answer RPCの更新
-- Now accepts optional city rating updates and composite_rating
-- =============================================================
CREATE OR REPLACE FUNCTION public.submit_rated_answer(
  p_match_history_id bigint,
  p_is_correct boolean,
  p_new_user_rating double precision,
  p_new_user_rd double precision,
  p_new_user_vol double precision,
  p_new_question_rating double precision,
  p_new_question_rd double precision,
  p_new_question_vol double precision,
  p_rating_change double precision,
  -- New parameters for composite rating system
  p_composite_rating double precision DEFAULT NULL,
  p_city_a_code text DEFAULT NULL,
  p_city_a_rating double precision DEFAULT NULL,
  p_city_a_rd double precision DEFAULT NULL,
  p_city_a_vol double precision DEFAULT NULL,
  p_city_b_code text DEFAULT NULL,
  p_city_b_rating double precision DEFAULT NULL,
  p_city_b_rd double precision DEFAULT NULL,
  p_city_b_vol double precision DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  match_rec public.match_history;
BEGIN
  -- Verify ownership and pending status
  SELECT * INTO match_rec
  FROM public.match_history
  WHERE id = p_match_history_id
    AND user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or already resolved';
  END IF;

  -- Update match history
  UPDATE public.match_history
  SET
    status = CASE WHEN p_is_correct THEN 'win' ELSE 'lose' END,
    user_rating_after = p_new_user_rating,
    question_rating_after = p_new_question_rating,
    rating_change = p_rating_change,
    answered_at = now()
  WHERE id = p_match_history_id;

  -- Update user rating
  UPDATE public.profiles
  SET
    rating = p_new_user_rating,
    rd = p_new_user_rd,
    vol = p_new_user_vol
  WHERE id = auth.uid();

  -- Update question (pair) rating and stats
  UPDATE public.questions
  SET
    rating = p_new_question_rating,
    rd = p_new_question_rd,
    vol = p_new_question_vol,
    play_count = play_count + 1,
    win_count = CASE WHEN p_is_correct THEN win_count + 1 ELSE win_count END,
    composite_rating = COALESCE(p_composite_rating, composite_rating)
  WHERE id = match_rec.question_id;

  -- Update city ratings (if provided)
  -- 都市レーティングの更新（提供された場合のみ）
  IF p_city_a_code IS NOT NULL AND p_city_a_rating IS NOT NULL THEN
    INSERT INTO public.city_ratings (country_code, rating, rd, vol, play_count)
    VALUES (p_city_a_code, p_city_a_rating, p_city_a_rd, p_city_a_vol, 1)
    ON CONFLICT (country_code) DO UPDATE SET
      rating = EXCLUDED.rating,
      rd = EXCLUDED.rd,
      vol = EXCLUDED.vol,
      play_count = city_ratings.play_count + 1;
  END IF;

  IF p_city_b_code IS NOT NULL AND p_city_b_rating IS NOT NULL THEN
    INSERT INTO public.city_ratings (country_code, rating, rd, vol, play_count)
    VALUES (p_city_b_code, p_city_b_rating, p_city_b_rd, p_city_b_vol, 1)
    ON CONFLICT (country_code) DO UPDATE SET
      rating = EXCLUDED.rating,
      rd = EXCLUDED.rd,
      vol = EXCLUDED.vol,
      play_count = city_ratings.play_count + 1;
  END IF;

  -- Update best survival score if applicable
  IF match_rec.mode = 'survival_rated' THEN
    UPDATE public.profiles
    SET best_score_survival_rated = greatest(
      best_score_survival_rated,
      (SELECT count(*) FROM public.match_history
       WHERE session_id = match_rec.session_id AND status = 'win')::integer
    )
    WHERE id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- Step 5: Verification queries
-- ステップ5: 検証クエリ
-- =============================================================

-- Check city_ratings count (should be ~198)
-- 都市レーティング数の確認（~198行であるべき）
SELECT count(*) as city_count FROM public.city_ratings;

-- Check composite_rating is populated
-- composite_ratingが設定されていることを確認
SELECT
  count(*) as total_pairs,
  count(*) FILTER (WHERE composite_rating != 1500) as non_default,
  avg(composite_rating) as avg_composite
FROM public.questions;
