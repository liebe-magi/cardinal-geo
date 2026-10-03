// Read-only compatibility for results recorded before persisted game sessions.
import type { QuadDirection } from '../types/game';
import { readPresentation, type PresentationSnapshot } from './presentation';
import { supabase } from './supabase';

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
// Daily Challenge
// ============================================================

/**
 * Get the current daily challenge progress for the user.
 */
export async function getDailyProgress(
  challengeDate: string,
  strict = false,
): Promise<DbDailyChallengeResult | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_daily_progress', {
    p_challenge_date: challengeDate,
  });

  if (error) {
    if (strict) throw error;
    console.error('Error getting daily progress:', error);
    return null;
  }

  return data as DbDailyChallengeResult | null;
}

export interface GameLogMatch {
  id: number;
  status: 'win' | 'lose';
  ratingChange: number;
  correctDirection: QuadDirection | null;
  userAnswerDirection: QuadDirection | null;
  cityACode: string;
  cityBCode: string;
  answeredAt: string;
}

export interface GameLogSession {
  sessionId: string;
  mode: string;
  finishedAt: string;
  score: number;
  totalQuestions: number;
  accuracy: number;
  totalRatingChange: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
  matches: GameLogMatch[];
}

/**
 * Fetch recent game logs for a specific mode from match_history.
 * Returns up to `sessionLimit` sessions, each grouped by session_id.
 */
export async function fetchRecentGameLogsByMode(
  userId: string,
  mode: string,
  sessionLimit = 100,
): Promise<GameLogSession[]> {
  if (!supabase) return [];
  if (!userId || !mode || sessionLimit <= 0) return [];

  const pageSize = 500;
  const maxRows = 3000;
  let from = 0;
  const rows: Array<
    PresentationSnapshot & {
      id: number;
      session_id: string;
      mode: string;
      status: 'win' | 'lose' | 'pending';
      rating_change: number;
      user_answer_ns: 'N' | 'S' | null;
      user_answer_ew: 'E' | 'W' | null;
      user_rating_before: number | null;
      user_rating_after: number | null;
      answered_at: string | null;
      created_at: string;
      questions:
        | {
            city_a_code: string;
            city_b_code: string;
            correct_ns: 'N' | 'S';
            correct_ew: 'E' | 'W';
          }
        | Array<{
            city_a_code: string;
            city_b_code: string;
            correct_ns: 'N' | 'S';
            correct_ew: 'E' | 'W';
          }>
        | null;
    }
  > = [];

  while (rows.length < maxRows) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('match_history')
      .select(
        'id, session_id, mode, status, rating_change, presented_target_code, presented_origin_code, presented_correct_ns, presented_correct_ew, user_answer_ns, user_answer_ew, user_rating_before, user_rating_after, answered_at, created_at, questions(city_a_code, city_b_code, correct_ns, correct_ew)',
      )
      .eq('user_id', userId)
      .eq('mode', mode)
      .neq('status', 'pending')
      .order('answered_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching game logs:', error);
      return [];
    }

    if (!data || data.length === 0) break;

    rows.push(
      ...data.map((row) => ({
        presented_target_code: row.presented_target_code,
        presented_origin_code: row.presented_origin_code,
        presented_correct_ns: row.presented_correct_ns,
        presented_correct_ew: row.presented_correct_ew,
        id: row.id as number,
        session_id: row.session_id as string,
        mode: row.mode as string,
        status: row.status as 'win' | 'lose' | 'pending',
        rating_change: Number(row.rating_change ?? 0),
        user_answer_ns: (row.user_answer_ns as 'N' | 'S' | null) ?? null,
        user_answer_ew: (row.user_answer_ew as 'E' | 'W' | null) ?? null,
        user_rating_before: (row.user_rating_before as number | null) ?? null,
        user_rating_after: (row.user_rating_after as number | null) ?? null,
        answered_at: (row.answered_at as string | null) ?? null,
        created_at: row.created_at as string,
        questions:
          (row.questions as
            | {
                city_a_code: string;
                city_b_code: string;
                correct_ns: 'N' | 'S';
                correct_ew: 'E' | 'W';
              }
            | Array<{
                city_a_code: string;
                city_b_code: string;
                correct_ns: 'N' | 'S';
                correct_ew: 'E' | 'W';
              }>
            | null) ?? null,
      })),
    );

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = grouped.get(row.session_id);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.session_id, [row]);
    }
  }

  const sessions: GameLogSession[] = Array.from(grouped.entries())
    .map(([sessionId, matches]) => {
      const chronological = [...matches].sort((a, b) => {
        const ta = new Date(a.answered_at ?? a.created_at).getTime();
        const tb = new Date(b.answered_at ?? b.created_at).getTime();
        if (ta !== tb) return ta - tb;
        return a.id - b.id;
      });

      const parsedMatches: GameLogMatch[] = chronological
        .map((match) => {
          const question = Array.isArray(match.questions)
            ? (match.questions[0] ?? null)
            : match.questions;
          if (!question) return null;
          const presentation = readPresentation(match);

          return {
            id: match.id,
            status: match.status === 'win' ? 'win' : 'lose',
            ratingChange: Number(match.rating_change ?? 0),
            correctDirection: presentation?.correctDirection ?? null,
            userAnswerDirection:
              presentation && match.user_answer_ns && match.user_answer_ew
                ? {
                    ns: match.user_answer_ns,
                    ew: match.user_answer_ew,
                  }
                : null,
            cityACode: presentation?.cityACode ?? question.city_a_code,
            cityBCode: presentation?.cityBCode ?? question.city_b_code,
            answeredAt: match.answered_at ?? match.created_at,
          };
        })
        .filter((m): m is GameLogMatch => m !== null);

      const score = parsedMatches.filter((m) => m.status === 'win').length;
      const totalQuestions = parsedMatches.length;
      const totalRatingChange = parsedMatches.reduce((sum, m) => sum + m.ratingChange, 0);
      const first = chronological[0] ?? null;
      const last = chronological[chronological.length - 1] ?? null;
      const finishedAt =
        last?.answered_at ?? last?.created_at ?? first?.answered_at ?? first?.created_at ?? '';

      return {
        sessionId,
        mode: first?.mode ?? mode,
        finishedAt,
        score,
        totalQuestions,
        accuracy: totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0,
        totalRatingChange,
        ratingBefore: first?.user_rating_before ?? null,
        ratingAfter: last?.user_rating_after ?? null,
        matches: parsedMatches,
      };
    })
    .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
    .slice(0, sessionLimit);

  return sessions;
}
