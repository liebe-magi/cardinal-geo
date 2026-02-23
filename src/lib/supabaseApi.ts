/**
 * Supabase API functions for rated mode, daily challenge, and data sync.
 */

import type { QuadDirection, Question } from '../types/game';
import { type CityRating, DEFAULT_CITY_RATING } from './compositeRating';
import { calculateNewRatings, type GlickoRating } from './glicko2';
import { normalizePair } from './quiz';
import { supabase } from './supabase';

// ============================================================
// Types matching DB schema
// ============================================================

export interface DbQuestion {
  id: string;
  city_a_code: string;
  city_b_code: string;
  city_a_capital: string;
  city_b_capital: string;
  correct_ns: 'N' | 'S';
  correct_ew: 'E' | 'W';
  rating: number;
  rd: number;
  vol: number;
  play_count: number;
  win_count: number;
}

export interface DbMatchHistory {
  id: number;
  user_id: string;
  question_id: string;
  session_id: string;
  mode: 'survival_rated' | 'challenge_rated';
  status: 'pending' | 'win' | 'lose';
  user_rating_before: number;
  user_rating_after: number | null;
  question_rating_before: number;
  question_rating_after: number | null;
  rating_change: number;
  created_at: string;
  answered_at: string | null;
}

export interface DbDailyChallengeResult {
  id: number;
  user_id: string;
  challenge_date: string;
  score: number;
  total_rating_change: number;
  status: 'in_progress' | 'completed';
  current_question: number;
  answers: unknown[];
  completed_at: string | null;
}

// ============================================================
// Pending Settlement
// ============================================================

/**
 * Settle any pending matches from a previous session.
 * Fetches pending matches, calculates Glicko-2 rating changes (as losses),
 * and resolves each one via submitRatedAnswer.
 * Returns the number of settled (lost) matches.
 */
export async function settlePendingMatches(userId: string): Promise<number> {
  if (!supabase) return 0;

  // 1. Fetch all pending matches with their question ratings
  const { data: pendingMatches, error: fetchError } = await supabase
    .from('match_history')
    .select('id, mode, user_rating_before, question_rating_before, question_id')
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (fetchError) {
    console.error('Error fetching pending matches:', fetchError);
    return 0;
  }

  if (!pendingMatches || pendingMatches.length === 0) return 0;

  let settledCount = 0;

  // Legacy fallback for users who may not yet have a global mode row.
  const { data: profileData } = await supabase
    .from('profiles')
    .select('rating, rd, vol')
    .eq('id', userId)
    .single();

  // 2. Get current user mode ratings
  const { data: modeRatingsData } = await supabase
    .from('user_mode_ratings')
    .select('mode, rating, rd, vol')
    .eq('user_id', userId);

  const modeRatings: Record<string, GlickoRating> = {};
  if (modeRatingsData) {
    for (const row of modeRatingsData) {
      modeRatings[row.mode] = { rating: row.rating, rd: row.rd, vol: row.vol };
    }
  }

  // 3. Process each pending match sequentially (order matters for rating)
  for (const match of pendingMatches) {
    const mode = match.mode;
    const ratingMode = mode === 'survival_rated' || mode === 'challenge_rated' ? 'global' : mode;
    const currentPlayerRating: GlickoRating =
      modeRatings[ratingMode] ||
      (ratingMode === 'global' && profileData
        ? { rating: profileData.rating, rd: profileData.rd, vol: profileData.vol }
        : {
            rating: 1500,
            rd: 350,
            vol: 0.06,
          });

    // Fetch current question rating
    const { data: questionData } = await supabase
      .from('questions')
      .select('rating, rd, vol')
      .eq('id', match.question_id)
      .single();

    if (!questionData) continue;

    const questionRating: GlickoRating = {
      rating: questionData.rating,
      rd: questionData.rd,
      vol: questionData.vol,
    };

    // Calculate as a loss (score = 0)
    const result = calculateNewRatings(currentPlayerRating, questionRating, 0);

    // Submit via the existing RPC (updates match_history, profiles, questions)
    const success = await submitRatedAnswer(
      match.id,
      false,
      result.player,
      result.question,
      result.ratingChange,
    );

    if (success) {
      settledCount++;
      // Update running player rating for next pending match in the same mode
      modeRatings[ratingMode] = result.player;
    }
  }

  return settledCount;
}

// ============================================================
// Question Management
// ============================================================

/**
 * Get or create a question record for a city pair.
 * Normalizes the pair order (alphabetical by countryCode) before DB lookup
 * to ensure (A,B) and (B,A) map to the same entry.
 * Returns the DB question with its current Glicko-2 rating.
 */
export async function getOrCreateQuestion(question: Question): Promise<DbQuestion | null> {
  if (!supabase) return null;

  // Normalize pair order for DB storage
  const { normalizedA, normalizedB, correctDirection } = normalizePair(
    question.cityA,
    question.cityB,
  );

  const { data, error } = await supabase.rpc('get_or_create_question', {
    p_city_a_code: normalizedA.countryCode,
    p_city_b_code: normalizedB.countryCode,
    p_city_a_capital: normalizedA.capitalEn,
    p_city_b_capital: normalizedB.capitalEn,
    p_correct_ns: correctDirection.ns,
    p_correct_ew: correctDirection.ew,
  });

  if (error) {
    console.error('Error getting/creating question:', error);
    return null;
  }

  return data as DbQuestion;
}

/**
 * Fetch city ratings for two city codes.
 * Returns defaults for missing cities (e.g., first encounter).
 */
export async function fetchCityRatings(
  codeA: string,
  codeB: string,
): Promise<{ cityA: CityRating; cityB: CityRating }> {
  const defaults = (code: string): CityRating => ({
    countryCode: code,
    ...DEFAULT_CITY_RATING,
  });

  if (!supabase) return { cityA: defaults(codeA), cityB: defaults(codeB) };

  const { data, error } = await supabase
    .from('city_ratings')
    .select('country_code, rating, rd, vol, play_count')
    .in('country_code', [codeA, codeB]);

  if (error || !data) {
    console.error('Error fetching city ratings:', error);
    return { cityA: defaults(codeA), cityB: defaults(codeB) };
  }

  const findOrDefault = (code: string): CityRating => {
    const row = data.find((r) => r.country_code === code);
    if (!row) return defaults(code);
    return {
      countryCode: row.country_code,
      rating: row.rating,
      rd: row.rd,
      vol: row.vol,
      playCount: row.play_count,
    };
  };

  return { cityA: findOrDefault(codeA), cityB: findOrDefault(codeB) };
}

// ============================================================
// Match History (Pending Commitment)
// ============================================================

/**
 * Create a pending match history record when a question is viewed.
 * This acts as the anti-cheat commitment — if the player disconnects,
 * the pending record stays as a loss.
 */
export async function createPendingMatch(
  userId: string,
  questionId: string,
  sessionId: string,
  mode: string,
  userRatingBefore: number,
  questionRatingBefore: number,
): Promise<number | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('match_history')
    .insert({
      user_id: userId,
      question_id: questionId,
      session_id: sessionId,
      mode,
      status: 'pending',
      user_rating_before: userRatingBefore,
      question_rating_before: questionRatingBefore,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating pending match:', error);
    return null;
  }

  return data.id;
}

/**
 * Submit a rated answer — resolves the pending match to win/lose
 * and updates player, question (pair), and city ratings.
 *
 * @param cityUpdates - Optional city rating updates. When null (e.g. settlement),
 *   only player and pair ratings are updated; city ratings are left unchanged.
 */
export async function submitRatedAnswer(
  matchHistoryId: number,
  isCorrect: boolean,
  newPlayerRating: GlickoRating,
  newQuestionRating: GlickoRating,
  ratingChange: number,
  compositeRating?: number,
  cityUpdates?: {
    cityACode: string;
    cityA: GlickoRating;
    cityBCode: string;
    cityB: GlickoRating;
  } | null,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.rpc('submit_rated_answer', {
    p_match_history_id: matchHistoryId,
    p_is_correct: isCorrect,
    p_new_user_rating: newPlayerRating.rating,
    p_new_user_rd: newPlayerRating.rd,
    p_new_user_vol: newPlayerRating.vol,
    p_new_question_rating: newQuestionRating.rating,
    p_new_question_rd: newQuestionRating.rd,
    p_new_question_vol: newQuestionRating.vol,
    p_rating_change: ratingChange,
    p_composite_rating: compositeRating ?? null,
    p_city_a_code: cityUpdates?.cityACode ?? null,
    p_city_a_rating: cityUpdates?.cityA.rating ?? null,
    p_city_a_rd: cityUpdates?.cityA.rd ?? null,
    p_city_a_vol: cityUpdates?.cityA.vol ?? null,
    p_city_b_code: cityUpdates?.cityBCode ?? null,
    p_city_b_rating: cityUpdates?.cityB.rating ?? null,
    p_city_b_rd: cityUpdates?.cityB.rd ?? null,
    p_city_b_vol: cityUpdates?.cityB.vol ?? null,
  });

  if (error) {
    console.error('Error submitting rated answer:', error);
    return false;
  }

  return true;
}

// ============================================================
// Daily Challenge
// ============================================================

/**
 * Get the current daily challenge progress for the user.
 */
export async function getDailyProgress(
  challengeDate: string,
): Promise<DbDailyChallengeResult | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_daily_progress', {
    p_challenge_date: challengeDate,
  });

  if (error) {
    console.error('Error getting daily progress:', error);
    return null;
  }

  return data as DbDailyChallengeResult | null;
}

/**
 * Save daily challenge progress (partial or complete).
 */
export async function saveDailyProgress(
  challengeDate: string,
  score: number,
  currentQuestion: number,
  answers: unknown[],
  totalRatingChange: number,
  completed: boolean,
): Promise<DbDailyChallengeResult | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('save_daily_progress', {
    p_challenge_date: challengeDate,
    p_score: score,
    p_current_question: currentQuestion,
    p_answers: answers,
    p_total_rating_change: totalRatingChange,
    p_completed: completed,
  });

  if (error) {
    console.error('Error saving daily progress:', error);
    return null;
  }

  return data as DbDailyChallengeResult;
}

// ============================================================
// Challenge Unrated Results
// ============================================================

export interface ModeStats {
  best: number;
  avg: number;
  count: number;
}

/**
 * Fetch stats for all game modes for a user.
 */
export async function fetchAllModeStats(userId: string): Promise<{
  survivalRated: ModeStats;
  survivalUnrated: ModeStats;
  challengeDaily: ModeStats;
  challengeUnrated: ModeStats;
  highestRating: number;
  totalRatedMatches: number;
} | null> {
  if (!supabase) return null;

  // Fetch all data in parallel
  const [
    profileRes,
    survivalRatedRes,
    survivalUnratedRes,
    dailyRes,
    unratedRes,
    highestRatingRes,
    totalRatedMatchesRes,
  ] = await Promise.all([
    // Profile for best scores and falling back to current rating
    supabase
      .from('profiles')
      .select('best_score_survival_rated, best_score_survival_unrated, rating')
      .eq('id', userId)
      .single(),
    // Survival rated: count matches with mode='survival_rated'
    supabase
      .from('match_history')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('mode', 'survival_rated')
      .neq('status', 'pending'),
    // Survival unrated: need a different approach — survival unrated doesn't go through match_history
    // We'll count from match_history with mode check, but survival_unrated doesn't use match_history
    // Actually check what modes exist
    supabase
      .from('match_history')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('mode', 'survival_unrated')
      .neq('status', 'pending'),
    // Daily challenge results
    supabase
      .from('daily_challenge_results')
      .select('score')
      .eq('user_id', userId)
      .eq('status', 'completed'),
    // Challenge unrated results
    supabase.from('challenge_unrated_results').select('score').eq('user_id', userId),
    // Highest rating found in match history
    supabase
      .from('match_history')
      .select('user_rating_after')
      .eq('user_id', userId)
      .in('mode', ['survival_rated', 'challenge_rated'])
      .neq('status', 'pending')
      .not('user_rating_after', 'is', null)
      .order('user_rating_after', { ascending: false })
      .limit(1),
    // Total rated matches count
    supabase
      .from('match_history')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('status', 'pending')
      .not('user_rating_after', 'is', null),
  ]);

  if (profileRes.error) return null;

  const bestSurvivalRated = profileRes.data?.best_score_survival_rated ?? 0;
  const bestSurvivalUnrated = profileRes.data?.best_score_survival_unrated ?? 0;

  // Daily challenge stats
  const dailyScores = (dailyRes.data || []).map((r) => r.score as number);
  const dailyCount = dailyScores.length;
  const dailyAvg = dailyCount > 0 ? dailyScores.reduce((a, b) => a + b, 0) / dailyCount : 0;
  const dailyBest = dailyCount > 0 ? Math.max(...dailyScores) : 0;

  // Challenge unrated stats
  const unratedScores = (unratedRes.data || []).map((r) => r.score as number);
  const unratedCount = unratedScores.length;
  const unratedAvg = unratedCount > 0 ? unratedScores.reduce((a, b) => a + b, 0) / unratedCount : 0;
  const unratedBest = unratedCount > 0 ? Math.max(...unratedScores) : 0;

  // Calculate highest rating (from history or current profile rating if history doesn't exceed it)
  const currentRating = profileRes.data?.rating ?? 1500;
  const historyHighest = highestRatingRes?.data?.[0]?.user_rating_after;
  const highestRating =
    historyHighest !== undefined ? Math.max(currentRating, historyHighest) : currentRating;

  return {
    survivalRated: {
      best: bestSurvivalRated,
      avg: 0, // Survival doesn't have a meaningful average (variable length)
      count: survivalRatedRes.count ?? 0,
    },
    survivalUnrated: {
      best: bestSurvivalUnrated,
      avg: 0,
      count: survivalUnratedRes.count ?? 0,
    },
    challengeDaily: {
      best: dailyBest,
      avg: Math.round(dailyAvg * 10) / 10,
      count: dailyCount,
    },
    challengeUnrated: {
      best: unratedBest,
      avg: Math.round(unratedAvg * 10) / 10,
      count: unratedCount,
    },
    highestRating,
    totalRatedMatches: totalRatedMatchesRes.count ?? 0,
  };
}

/**
 * Save a challenge unrated result for ranking.
 */
export async function saveChallengeUnratedResult(userId: string, score: number): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('challenge_unrated_results')
    .insert({ user_id: userId, score });

  if (error) {
    console.error('Error saving challenge unrated result:', error);
    return false;
  }

  return true;
}

/**
 * Get average score for challenge unrated from Supabase.
 */
export async function getChallengeUnratedAvgScore(userId: string): Promise<number | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('challenge_unrated_results')
    .select('score')
    .eq('user_id', userId);

  if (error || !data || data.length === 0) return null;

  const avg = data.reduce((sum, r) => sum + r.score, 0) / data.length;
  return avg;
}

// ============================================================
// Weakness Score Sync
// ============================================================

/**
 * Sync weakness scores to Supabase profile.
 */
export async function syncWeaknessScores(
  userId: string,
  scores: Record<string, number>,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('profiles')
    .update({ weakness_scores: scores })
    .eq('id', userId);

  if (error) {
    console.error('Error syncing weakness scores:', error);
    return false;
  }

  return true;
}

/**
 * Fetch weakness scores from Supabase profile.
 */
export async function fetchWeaknessScores(userId: string): Promise<Record<string, number> | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('weakness_scores')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching weakness scores:', error);
    return null;
  }

  return (data?.weakness_scores as Record<string, number>) || {};
}

export async function fetchFamousCities(): Promise<string[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('city_ratings')
    .select('country_code')
    .order('rating', { ascending: true })
    .limit(30);

  if (error) {
    console.error('Error fetching famous cities:', error);
    return [];
  }
  return data.map((row) => row.country_code);
}

// ============================================================
// Best Score Updates
// ============================================================

/**
 * Update best survival unrated score on Supabase profile.
 */
export async function updateBestSurvivalUnratedScore(
  userId: string,
  score: number,
): Promise<boolean> {
  if (!supabase) return false;

  // Use a raw SQL update with GREATEST to avoid race conditions
  const { error } = await supabase.rpc('update_best_survival_unrated', {
    p_user_id: userId,
    p_score: score,
  });

  // Fallback if RPC doesn't exist yet — direct update
  if (error) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ best_score_survival_unrated: score })
      .eq('id', userId)
      .gte('best_score_survival_unrated', 0);

    if (updateError) {
      console.error('Error updating best score:', updateError);
      return false;
    }
  }

  return true;
}

/**
 * Update best survival rated score on Supabase profile.
 */
export async function updateBestSurvivalRatedScore(
  userId: string,
  score: number,
): Promise<boolean> {
  if (!supabase) return false;

  // Direct conditional update — only if new score is higher
  const { error } = await supabase
    .from('profiles')
    .update({ best_score_survival_rated: score })
    .eq('id', userId)
    .lt('best_score_survival_rated', score);

  if (error) {
    console.error('Error updating best survival rated score:', error);
    return false;
  }

  return true;
}

/**
 * Update weakness scores atomically in the DB.
 * Reads the current scores from the profile, applies the delta, and writes back.
 */
export async function updateWeaknessScoreDb(
  userId: string,
  countryCodeA: string,
  countryCodeB: string,
  isCorrect: boolean,
): Promise<Record<string, number> | null> {
  if (!supabase) return null;

  // Fetch current weakness scores
  const { data, error: fetchError } = await supabase
    .from('profiles')
    .select('weakness_scores')
    .eq('id', userId)
    .single();

  if (fetchError) {
    console.error('Error fetching weakness scores for update:', fetchError);
    return null;
  }

  const scores: Record<string, number> = (data?.weakness_scores as Record<string, number>) || {};
  const delta = isCorrect ? -1 : 1;
  scores[countryCodeA] = (scores[countryCodeA] || 0) + delta;
  scores[countryCodeB] = (scores[countryCodeB] || 0) + delta;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ weakness_scores: scores })
    .eq('id', userId);

  if (updateError) {
    console.error('Error updating weakness scores:', updateError);
    return null;
  }

  return scores;
}

/**
 * Reset weakness scores in DB (set to empty object).
 */
export async function resetWeaknessScoresDb(userId: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('profiles')
    .update({ weakness_scores: {} })
    .eq('id', userId);

  if (error) {
    console.error('Error resetting weakness scores:', error);
    return false;
  }

  return true;
}

/**
 * Migrate local data to DB profile on first login.
 * Updates best scores only if local values are higher.
 */
export async function migrateLocalDataToDb(
  userId: string,
  localData: {
    weaknessScores: Record<string, number>;
    bestSurvivalRated: number;
    bestSurvivalUnrated: number;
  },
): Promise<boolean> {
  if (!supabase) return false;

  try {
    // Merge weakness scores: local wins for keys that don't exist remotely
    const { data } = await supabase
      .from('profiles')
      .select('weakness_scores, best_score_survival_rated, best_score_survival_unrated')
      .eq('id', userId)
      .single();

    if (!data) return false;

    const remoteScores = (data.weakness_scores as Record<string, number>) || {};
    const mergedScores = { ...localData.weaknessScores };
    // Remote values override local for existing keys
    for (const [key, val] of Object.entries(remoteScores)) {
      mergedScores[key] = val;
    }

    const updates: Record<string, unknown> = { weakness_scores: mergedScores };

    // Only update best scores if local is higher
    if (localData.bestSurvivalRated > (data.best_score_survival_rated || 0)) {
      updates.best_score_survival_rated = localData.bestSurvivalRated;
    }
    if (localData.bestSurvivalUnrated > (data.best_score_survival_unrated || 0)) {
      updates.best_score_survival_unrated = localData.bestSurvivalUnrated;
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);

    if (error) {
      console.error('Error migrating local data to DB:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Migration error:', err);
    return false;
  }
}

// ============================================================
// Rating History
// ============================================================

export interface RatingHistoryPoint {
  rating: number;
  ratingBefore: number;
  timestamp: string;
}

export interface AggregatedCandle {
  label: string;
  open: number;
  close: number;
  high: number;
  low: number;
  count: number;
}

/**
 * Fetch the user's rating history from match_history.
 * Returns rating after each resolved match, ordered chronologically.
 */
export async function fetchRatingHistory(
  userId: string,
  limit = 200,
): Promise<RatingHistoryPoint[]> {
  if (!supabase) return [];

  if (limit <= 0) return [];

  const pageSize = Math.min(1000, limit);
  let from = 0;
  const rows: Array<{
    user_rating_before: number | null;
    user_rating_after: number | null;
    answered_at: string | null;
  }> = [];

  while (rows.length < limit) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from('match_history')
      .select('id, user_rating_before, user_rating_after, answered_at')
      .eq('user_id', userId)
      .in('mode', ['survival_rated', 'challenge_rated'])
      .neq('status', 'pending')
      .not('user_rating_after', 'is', null)
      .not('answered_at', 'is', null)
      .order('answered_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching rating history:', error);
      return [];
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(
      ...data.map((row) => ({
        user_rating_before: row.user_rating_before as number | null,
        user_rating_after: row.user_rating_after as number | null,
        answered_at: row.answered_at as string | null,
      })),
    );

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows
    .slice(0, limit)
    .reverse()
    .map((row) => ({
      rating: row.user_rating_after as number,
      ratingBefore: row.user_rating_before as number,
      timestamp: row.answered_at as string,
    }));
}

/**
 * Fetch the user's rating history aggregated by period (day, week, month).
 */
export async function fetchRatingHistoryAggregated(
  userId: string,
  period: 'day' | 'week' | 'month',
): Promise<AggregatedCandle[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_rating_history_aggregated', {
    p_user_id: userId,
    p_period: period,
  });

  if (error) {
    console.error('Error fetching aggregated history:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    label: row.period_label,
    open: Number(row.open),
    close: Number(row.close),
    high: Number(row.high),
    low: Number(row.low),
    count: Number(row.match_count),
  }));
}

// ============================================================
// Question Direction Helpers
// ============================================================

/**
 * Fetch the user's rating rank (1-based position among all users) for a specific mode.
 * Returns { rank, total } or null on error.
 */
export async function fetchRatingRank(
  userId: string,
  mode: string = 'global',
): Promise<{ rank: number; total: number } | null> {
  if (!supabase) return null;

  // First, get the user's own rating for the mode
  const { data: userData, error: errUser } = await supabase
    .from('user_mode_ratings')
    .select('rating')
    .eq('user_id', userId)
    .eq('mode', mode)
    .single();

  if (errUser || !userData) {
    // If no rating exists for this mode, assume default 1500
    const userRating = 1500;

    // Count users with strictly higher rating
    const { count: higherCount, error: err1 } = await supabase
      .from('user_mode_ratings')
      .select('*', { count: 'exact', head: true })
      .eq('mode', mode)
      .gt('rating', userRating)
      .neq('user_id', userId);

    if (err1) {
      console.error('Error fetching higher count:', err1);
      return null;
    }

    // Count total users with a rating in this mode
    const { count: totalCount, error: err2 } = await supabase
      .from('user_mode_ratings')
      .select('*', { count: 'exact', head: true })
      .eq('mode', mode);

    if (err2) {
      console.error('Error fetching total count:', err2);
      return null;
    }

    return {
      rank: (higherCount ?? 0) + 1,
      total: totalCount ?? 0,
    };
  }

  const userRating = userData.rating as number;

  // Count users with strictly higher rating (exclude self to avoid float precision issues)
  const { count: higherCount, error: err1 } = await supabase
    .from('user_mode_ratings')
    .select('*', { count: 'exact', head: true })
    .eq('mode', mode)
    .gt('rating', userRating)
    .neq('user_id', userId);

  if (err1) {
    console.error('Error fetching rating rank:', err1);
    return null;
  }

  // Count total users
  const { count: totalCount, error: err2 } = await supabase
    .from('user_mode_ratings')
    .select('*', { count: 'exact', head: true })
    .eq('mode', mode);

  if (err2) {
    console.error('Error fetching total users:', err2);
    return null;
  }

  return {
    rank: (higherCount ?? 0) + 1,
    total: totalCount ?? 0,
  };
}

/**
 * Convert DB question direction to QuadDirection.
 */
export function dbQuestionToDirection(q: DbQuestion): QuadDirection {
  return {
    ns: q.correct_ns as 'N' | 'S',
    ew: q.correct_ew as 'E' | 'W',
  };
}
