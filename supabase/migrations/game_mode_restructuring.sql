-- Game Mode Restructuring: Allow new rated mode values
-- Run this in Supabase SQL Editor BEFORE deploying the new frontend.

-- Drop the existing CHECK constraint
ALTER TABLE public.match_history
  DROP CONSTRAINT IF EXISTS match_history_mode_check;

-- Add updated CHECK constraint with all rated mode values
ALTER TABLE public.match_history
  ADD CONSTRAINT match_history_mode_check
  CHECK (mode IN (
    'survival_rated', 'challenge_rated',
    'starter_rated',
    'asia_rated', 'europe_rated', 'africa_rated',
    'americas_rated', 'oceania_rated'
  ));
