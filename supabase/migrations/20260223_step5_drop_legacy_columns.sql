-- =============================================================
-- Step 5: profiles レガシーカラム削除
-- ⚠️ アプリデプロイ後に実行すること（アプリが参照しなくなってから DROP）
-- =============================================================

-- 事前確認: global 行が無いユーザーが 0 件であること
SELECT count(*) AS users_without_global
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM user_mode_ratings umr
  WHERE umr.user_id = p.id AND umr.mode = 'global'
);
-- → 0 であること。0 でなければ以下のバックフィルを先に実行:

-- バックフィル（必要な場合のみ）
-- INSERT INTO user_mode_ratings (user_id, mode, rating, rd, vol, updated_at)
-- SELECT id, 'global', rating, rd, vol, updated_at
-- FROM profiles p
-- WHERE NOT EXISTS (
--   SELECT 1 FROM user_mode_ratings umr
--   WHERE umr.user_id = p.id AND umr.mode = 'global'
-- )
-- ON CONFLICT (user_id, mode) DO NOTHING;

-- カラム削除
ALTER TABLE public.profiles DROP COLUMN IF EXISTS rating;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS rd;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS vol;

-- 検証
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('rating', 'rd', 'vol');
-- → 0 行
