-- Hotfix: update_best_survival_unrated の SECURITY DEFINER → SECURITY INVOKER 変更
-- Day 1 cleanup で作成済みの関数を上書き。auth.uid() チェックを追加。
-- 本番 SQL Editor で実行すること。

CREATE OR REPLACE FUNCTION public.update_best_survival_unrated(
  p_user_id uuid,
  p_score integer
)
RETURNS void AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'update_best_survival_unrated: cannot modify another user''s profile';
  END IF;

  UPDATE public.profiles
  SET best_score_survival_unrated = GREATEST(best_score_survival_unrated, p_score)
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
