-- Restrict rating history aggregation to global-equivalent rated modes only
-- Global history should reflect the same scope as global ranking:
-- survival_rated + challenge_rated.

CREATE OR REPLACE FUNCTION get_rating_history_aggregated(
  p_user_id uuid,
  p_period text -- 'day', 'week', 'month'
)
RETURNS TABLE (
  period_label text,
  open numeric,
  close numeric,
  high numeric,
  low numeric,
  match_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Forbidden: p_user_id must match auth.uid()';
  END IF;

  RETURN QUERY
  WITH bucketing AS (
    SELECT
      user_rating_before,
      user_rating_after,
      answered_at,
      CASE p_period
        WHEN 'day' THEN date_trunc('day', answered_at)
        WHEN 'week' THEN date_trunc('week', answered_at)
        WHEN 'month' THEN date_trunc('month', answered_at)
        ELSE date_trunc('day', answered_at)
      END AS bucket_date
    FROM match_history
    WHERE user_id = v_uid
      AND mode IN ('survival_rated', 'challenge_rated')
      AND status != 'pending'
      AND user_rating_after IS NOT NULL
      AND answered_at IS NOT NULL
  ),
  aggregated AS (
    SELECT
      bucket_date,
      count(*) as count,
      min(user_rating_after) as min_after,
      max(user_rating_after) as max_after,
      min(user_rating_before) as min_before,
      max(user_rating_before) as max_before,
      min(answered_at) as first_match_time,
      max(answered_at) as last_match_time
    FROM bucketing
    GROUP BY bucket_date
  ),
  joined AS (
    SELECT
      a.bucket_date,
      a.count,
      LEAST(a.min_after, a.min_before) as low_val,
      GREATEST(a.max_after, a.max_before) as high_val,
      (SELECT user_rating_before FROM bucketing b WHERE b.bucket_date = a.bucket_date AND b.answered_at = a.first_match_time ORDER BY user_rating_before LIMIT 1) as open_val,
      (SELECT user_rating_after FROM bucketing b WHERE b.bucket_date = a.bucket_date AND b.answered_at = a.last_match_time ORDER BY user_rating_after DESC LIMIT 1) as close_val
    FROM aggregated a
  )
  SELECT
    CASE p_period
      WHEN 'day' THEN to_char(bucket_date, 'YYYY-MM-DD')
      WHEN 'week' THEN to_char(bucket_date, 'YYYY-MM-DD')
      WHEN 'month' THEN to_char(bucket_date, 'YYYY-MM')
      ELSE to_char(bucket_date, 'YYYY-MM-DD')
    END AS period_label,
    open_val::numeric AS open,
    close_val::numeric AS close,
    high_val::numeric AS high,
    low_val::numeric AS low,
    count AS match_count
  FROM joined
  ORDER BY bucket_date ASC;
END;
$$;
