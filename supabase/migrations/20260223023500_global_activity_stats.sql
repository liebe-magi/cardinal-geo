-- Create RPC to get global activity statistics (total players, total plays, global accuracy)
CREATE OR REPLACE FUNCTION get_global_activity_stats()
RETURNS TABLE (
  total_players bigint,
  total_plays bigint,
  global_accuracy numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_players bigint;
  v_total_plays bigint;
  v_total_wins bigint;
BEGIN
  -- Count total users in profiles
  SELECT count(*) INTO v_total_players FROM profiles;

  -- Sum play_count and win_count from questions table
  SELECT COALESCE(SUM(play_count), 0), COALESCE(SUM(win_count), 0)
  INTO v_total_plays, v_total_wins
  FROM questions;

  RETURN QUERY
  SELECT 
    v_total_players,
    v_total_plays,
    CASE 
      WHEN v_total_plays > 0 THEN ROUND((v_total_wins::numeric / v_total_plays::numeric) * 100.0, 1)
      ELSE 0.0
    END;
END;
$$;
