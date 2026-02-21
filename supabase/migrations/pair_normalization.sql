-- =================================================================
-- Pair Normalization Migration
-- ペア正規化マイグレーション
--
-- This migration merges duplicate reversed pairs (A,B) and (B,A)
-- into a single normalized entry where city_a_code < city_b_code.
--
-- Run in Supabase SQL Editor.
-- Step 1 (dry run) should be run separately first to inspect duplicates.
-- Steps 2-6 are wrapped in a transaction for atomicity.
-- =================================================================

-- Step 1: Check for duplicates (dry run — inspect before proceeding)
-- ステップ1: 重複の確認（ドライラン — 実行前に確認）
-- Run this SELECT separately to inspect results before running the migration.
SELECT
  q1.id as keep_id,
  q1.city_a_code as keep_a,
  q1.city_b_code as keep_b,
  q1.play_count as keep_plays,
  q1.rating as keep_rating,
  q2.id as remove_id,
  q2.city_a_code as remove_a,
  q2.city_b_code as remove_b,
  q2.play_count as remove_plays,
  q2.rating as remove_rating
FROM questions q1
JOIN questions q2
  ON q1.city_a_code = q2.city_b_code
 AND q1.city_b_code = q2.city_a_code
WHERE q1.city_a_code < q1.city_b_code;  -- keep the normalized one

-- =================================================================
-- Steps 2-6: Run as a single transaction after inspecting Step 1.
-- ステップ2-6: ステップ1を確認後、単一トランザクションとして実行。
-- =================================================================

BEGIN;

-- Step 2: Update match_history foreign keys to point to the kept (normalized) question
-- ステップ2: match_historyの外部キーを正規化された方のquestionに付け替え
UPDATE match_history mh
SET question_id = dups.keep_id
FROM (
  SELECT q1.id as keep_id, q2.id as remove_id
  FROM questions q1
  JOIN questions q2
    ON q1.city_a_code = q2.city_b_code
   AND q1.city_b_code = q2.city_a_code
  WHERE q1.city_a_code < q1.city_b_code
) dups
WHERE mh.question_id = dups.remove_id;

-- Step 3: Merge stats from reversed pair into the normalized pair
-- ステップ3: 逆順ペアの統計を正規化ペアにマージ
-- Note: win_count from reversed pair means "player got the direction right
-- for the reversed order", which maps to the same geographic relationship.
-- Since the DB stores correct_ns/correct_ew for the normalized order,
-- and we only care about total play_count and win_count for Glicko-2 RD,
-- we simply add both.
-- vol is intentionally NOT merged: it defaults to 0.06 and rarely changes
-- significantly, so keeping the existing value is acceptable.
-- 注意: 逆順ペアのwin_countは同じ地理的関係を指すため、単純に加算する。
-- volは意図的にマージしない: デフォルト0.06からほとんど変動しないため、
-- 既存値を保持する。
UPDATE questions q_keep
SET
  play_count = q_keep.play_count + q_rev.play_count,
  win_count = q_keep.win_count + q_rev.win_count,
  -- Use weighted average for rating based on play counts
  -- プレイ数に基づく加重平均でレーティングを統合
  rating = CASE
    WHEN q_keep.play_count + q_rev.play_count = 0 THEN 1500
    ELSE (q_keep.rating * q_keep.play_count + q_rev.rating * q_rev.play_count)
         / (q_keep.play_count + q_rev.play_count)
  END,
  -- Use the lower (more confident) RD
  -- より信頼度の高い（低い）RDを使用
  rd = LEAST(q_keep.rd, q_rev.rd)
FROM questions q_rev
WHERE q_keep.city_a_code = q_rev.city_b_code
  AND q_keep.city_b_code = q_rev.city_a_code
  AND q_keep.city_a_code < q_keep.city_b_code;

-- Step 4: Delete the reversed (non-normalized) duplicates
-- ステップ4: 逆順（非正規化）の重複を削除
DELETE FROM questions
WHERE id IN (
  SELECT q2.id
  FROM questions q1
  JOIN questions q2
    ON q1.city_a_code = q2.city_b_code
   AND q1.city_b_code = q2.city_a_code
  WHERE q1.city_a_code < q1.city_b_code
);

-- Step 5: Normalize any remaining entries where city_a_code > city_b_code
-- (entries that had no reversed duplicate)
-- ステップ5: city_a_code > city_b_code の残りのエントリを正規化
-- （逆順の重複がなかったエントリ）
UPDATE questions
SET
  city_a_code = city_b_code,
  city_b_code = city_a_code,
  city_a_capital = city_b_capital,
  city_b_capital = city_a_capital,
  correct_ns = CASE correct_ns WHEN 'N' THEN 'S' WHEN 'S' THEN 'N' END,
  correct_ew = CASE correct_ew WHEN 'E' THEN 'W' WHEN 'W' THEN 'E' END
WHERE city_a_code > city_b_code;

-- Step 6: Verify — all entries should now satisfy city_a_code < city_b_code
-- ステップ6: 検証 — 全エントリが city_a_code < city_b_code を満たすことを確認
SELECT count(*) as total_pairs,
       count(*) FILTER (WHERE city_a_code < city_b_code) as normalized,
       count(*) FILTER (WHERE city_a_code >= city_b_code) as not_normalized
FROM questions;

COMMIT;
