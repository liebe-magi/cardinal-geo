-- Hotfix: migrate per-mode ratings to Global model
-- Purpose:
-- 1) Move existing survival_rated rows to global (without data loss)
-- 2) Ensure submit_rated_answer maps survival/challenge to global
-- 3) Ensure get_rating_ranking('global') counts both survival + challenge matches

-- ------------------------------------------------------------------
-- 1) Data fix: survival_rated -> global
-- ------------------------------------------------------------------
-- If a user already has a global row, keep that row and ignore survival copy.
INSERT INTO public.user_mode_ratings (user_id, mode, rating, rd, vol, updated_at)
SELECT user_id, 'global', rating, rd, vol, updated_at
FROM public.user_mode_ratings
WHERE mode = 'survival_rated'
ON CONFLICT (user_id, mode) DO NOTHING;

-- Remove legacy survival_rated rows only when matching global row exists.
-- This avoids accidental data loss if a copy step is interrupted.
DELETE FROM public.user_mode_ratings s
WHERE s.mode = 'survival_rated'
  AND EXISTS (
    SELECT 1
    FROM public.user_mode_ratings g
    WHERE g.user_id = s.user_id
      AND g.mode = 'global'
  );

-- ------------------------------------------------------------------
-- 2) RPC fix: submit_rated_answer
-- ------------------------------------------------------------------
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
  p_city_b_vol double precision DEFAULT NULL
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

  -- Global rating should include both survival and challenge modes.
  IF v_mode IN ('survival_rated', 'challenge_rated') THEN
    v_rating_mode := 'global';
  ELSE
    v_rating_mode := v_mode;
  END IF;

  UPDATE public.match_history
  SET
    status = CASE WHEN p_is_correct THEN 'win' ELSE 'lose' END,
    user_rating_after = p_new_user_rating,
    question_rating_after = p_new_question_rating,
    rating_change = p_rating_change,
    answered_at = now()
  WHERE id = p_match_history_id;

  INSERT INTO public.user_mode_ratings (user_id, mode, rating, rd, vol)
  VALUES (auth.uid(), v_rating_mode, p_new_user_rating, p_new_user_rd, p_new_user_vol)
  ON CONFLICT (user_id, mode) DO UPDATE SET
    rating = EXCLUDED.rating,
    rd = EXCLUDED.rd,
    vol = EXCLUDED.vol;

  UPDATE public.questions
  SET
    rating = p_new_question_rating,
    rd = p_new_question_rd,
    vol = p_new_question_vol,
    play_count = play_count + 1,
    win_count = CASE WHEN p_is_correct THEN win_count + 1 ELSE win_count END,
    composite_rating = COALESCE(p_composite_rating, composite_rating)
  WHERE id = match_rec.question_id;

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

-- ------------------------------------------------------------------
-- 3) RPC fix: get_rating_ranking
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_rating_ranking();

CREATE OR REPLACE FUNCTION public.get_rating_ranking(p_mode text DEFAULT 'global')
RETURNS TABLE(id uuid, username text, rating double precision, play_count bigint) AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id,
      p.username,
      umr.rating,
      count(mh.id) AS play_count
    FROM public.profiles p
    JOIN public.user_mode_ratings umr
      ON umr.user_id = p.id AND umr.mode = p_mode
    LEFT JOIN public.match_history mh
      ON mh.user_id = p.id
      AND mh.status != 'pending'
      AND (
        (p_mode = 'global' AND mh.mode IN ('survival_rated', 'challenge_rated'))
        OR (p_mode <> 'global' AND mh.mode = p_mode)
      )
    GROUP BY p.id, p.username, umr.rating
    ORDER BY umr.rating DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
