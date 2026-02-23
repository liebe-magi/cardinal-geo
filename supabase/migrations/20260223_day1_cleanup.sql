-- =============================================================
-- Day 1 クリーンアップ: Steps 3, 4, 6
-- 本番DB に SQL Editor で実行する
-- 実行日: 2026-02-23
-- =============================================================

-- =============================================================
-- Step 3: 未使用 RPC 関数の削除
-- settle_pending_matches — クライアント側で実装済み、DB関数は未使用
-- get_challenge_unrated_ranking — 呼び出し元なし
-- =============================================================
DROP FUNCTION IF EXISTS public.settle_pending_matches();
DROP FUNCTION IF EXISTS public.get_challenge_unrated_ranking();

-- =============================================================
-- Step 4: match_history.mode CHECK 制約の緩和
-- アプリ側でバリデーション済み。DB側の制約は新モード追加の妨げになる。
-- =============================================================
ALTER TABLE public.match_history
  DROP CONSTRAINT IF EXISTS match_history_mode_check;

-- =============================================================
-- Step 6: ゴースト RPC の正式化
-- update_best_survival_unrated は本番に存在する可能性がある。
-- CREATE OR REPLACE で安全に定義。
-- =============================================================
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

-- =============================================================
-- 検証クエリ
-- =============================================================

-- 削除した関数が存在しないことを確認
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('settle_pending_matches', 'get_challenge_unrated_ranking');
-- → 0 行

-- match_history_mode_check が消えていることを確認
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.match_history'::regclass
  AND conname = 'match_history_mode_check';
-- → 0 行

-- update_best_survival_unrated が存在することを確認
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'update_best_survival_unrated';
-- → 1 行
