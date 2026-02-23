-- Create RPC to get daily challenge average scoring
CREATE OR REPLACE FUNCTION get_daily_average_ranking()
RETURNS TABLE (
  id uuid,
  username text,
  rating numeric,
  play_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username,
    ROUND(AVG(d.score)::numeric, 1) AS rating,
    COUNT(d.id)::integer AS play_count
  FROM
    profiles p
  JOIN
    daily_challenge_results d ON p.id = d.user_id
  WHERE
    d.status = 'completed'
  GROUP BY
    p.id, p.username
  HAVING
    COUNT(d.id) > 0
  ORDER BY
    rating DESC, play_count DESC
  LIMIT 100;
END;
$$;
