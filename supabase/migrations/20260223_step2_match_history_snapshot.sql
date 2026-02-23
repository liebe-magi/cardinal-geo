-- =============================================================
-- Step 2: match_history スナップショット列の追加
-- 本番DB に SQL Editor で実行する
-- =============================================================
-- 目的: 事故発生時にレーティングを正確に再計算するために、
--       対戦時点の全パラメータを記録する。
--
-- 全列 NULL 許容 → 旧アプリが動き続けても壊れない。
-- =============================================================

-- 2-a. 列の追加
ALTER TABLE public.match_history
  ADD COLUMN IF NOT EXISTS user_rd_before double precision,
  ADD COLUMN IF NOT EXISTS user_vol_before double precision,
  ADD COLUMN IF NOT EXISTS opponent_rating double precision,
  ADD COLUMN IF NOT EXISTS opponent_rd double precision,
  ADD COLUMN IF NOT EXISTS opponent_vol double precision,
  ADD COLUMN IF NOT EXISTS user_rd_after double precision,
  ADD COLUMN IF NOT EXISTS user_vol_after double precision;

-- 2-b. submit_rated_answer を更新（新列を受け取り保存）
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
  p_composite_rating double precision DEFAULT NULL,
  p_city_a_code text DEFAULT NULL,
  p_city_a_rating double precision DEFAULT NULL,
  p_city_a_rd double precision DEFAULT NULL,
  p_city_a_vol double precision DEFAULT NULL,
  p_city_b_code text DEFAULT NULL,
  p_city_b_rating double precision DEFAULT NULL,
  p_city_b_rd double precision DEFAULT NULL,
  p_city_b_vol double precision DEFAULT NULL,
  -- New snapshot parameters (all optional for backward compat)
  p_opponent_rating double precision DEFAULT NULL,
  p_opponent_rd double precision DEFAULT NULL,
  p_opponent_vol double precision DEFAULT NULL,
  p_user_rd_after double precision DEFAULT NULL,
  p_user_vol_after double precision DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  match_rec public.match_history;
  v_mode text;
  v_rating_mode text;
BEGIN
  SELECT * INTO match_rec
  FROM public.match_history
  WHERE id = p_match_history_id
    AND user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or already resolved';
  END IF;

  v_mode := match_rec.mode;

  IF v_mode IN ('survival_rated', 'challenge_rated') THEN
    v_rating_mode := 'global';
  ELSE
    v_rating_mode := v_mode;
  END IF;

  -- Update match history (including new snapshot columns)
  UPDATE public.match_history
  SET
    status = CASE WHEN p_is_correct THEN 'win' ELSE 'lose' END,
    user_rating_after = p_new_user_rating,
    question_rating_after = p_new_question_rating,
    rating_change = p_rating_change,
    answered_at = now(),
    opponent_rating = COALESCE(p_opponent_rating, opponent_rating),
    opponent_rd = COALESCE(p_opponent_rd, opponent_rd),
    opponent_vol = COALESCE(p_opponent_vol, opponent_vol),
    user_rd_after = COALESCE(p_user_rd_after, user_rd_after),
    user_vol_after = COALESCE(p_user_vol_after, user_vol_after)
  WHERE id = p_match_history_id;

  -- Update user rating in user_mode_ratings
  INSERT INTO public.user_mode_ratings (user_id, mode, rating, rd, vol)
  VALUES (auth.uid(), v_rating_mode, p_new_user_rating, p_new_user_rd, p_new_user_vol)
  ON CONFLICT (user_id, mode) DO UPDATE SET
    rating = EXCLUDED.rating,
    rd = EXCLUDED.rd,
    vol = EXCLUDED.vol;

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
  IF p_city_a_code IS NOT NULL AND p_city_a_rating IS NOT NULL THEN
    INSERT INTO public.city_ratings (country_code, rating, rd, vol, play_count)
    VALUES (p_city_a_code, p_city_a_rating, p_city_a_rd, p_city_a_vol, 1)
    ON CONFLICT (country_code) DO UPDATE SET
      rating = EXCLUDED.rating,
      rd = EXCLUDED.rd,
      vol = EXCLUDED.vol,
      play_count = public.city_ratings.play_count + 1;
  END IF;

  IF p_city_b_code IS NOT NULL AND p_city_b_rating IS NOT NULL THEN
    INSERT INTO public.city_ratings (country_code, rating, rd, vol, play_count)
    VALUES (p_city_b_code, p_city_b_rating, p_city_b_rd, p_city_b_vol, 1)
    ON CONFLICT (country_code) DO UPDATE SET
      rating = EXCLUDED.rating,
      rd = EXCLUDED.rd,
      vol = EXCLUDED.vol,
      play_count = public.city_ratings.play_count + 1;
  END IF;

  -- Update best survival score if applicable
  IF v_mode = 'survival_rated' THEN
    UPDATE public.profiles
    SET best_score_survival_rated = GREATEST(
      best_score_survival_rated,
      (
        SELECT count(*)
        FROM public.match_history
        WHERE session_id = match_rec.session_id
          AND status = 'win'
      )::integer
    )
    WHERE id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 検証クエリ
-- =============================================================

-- 新列が追加されていることを確認
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'match_history'
  AND column_name IN (
    'user_rd_before', 'user_vol_before',
    'opponent_rating', 'opponent_rd', 'opponent_vol',
    'user_rd_after', 'user_vol_after'
  )
ORDER BY column_name;
-- → 7 行
