// Private profile statistics and rating history.
import { supabase } from './supabase';

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
    globalRatingRes,
  ] = await Promise.all([
    // Profile for best scores
    supabase
      .from('profiles')
      .select('best_score_survival_rated, best_score_survival_unrated')
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
    // Current global rating from user_mode_ratings
    supabase
      .from('user_mode_ratings')
      .select('rating')
      .eq('user_id', userId)
      .eq('mode', 'global')
      .single(),
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

  // Calculate highest rating (from history or current global rating if history doesn't exceed it)
  const currentRating = globalRatingRes?.data?.rating ?? 1500;
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
  _userId: string,
  mode = 'global',
): Promise<{ rank: number; total: number } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_rating_rank', { p_mode: mode });
  if (error) {
    console.error('Error fetching rating rank:', error);
    return null;
  }
  return data;
}
