import { supabase } from './supabase';
import type { GameResult, GameSession } from '../types/result';
import type { GameMode, Question, QuadDirection } from '../types/game';

async function gameRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Database unavailable');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  if (!data) throw new Error('Missing game response');
  return data as T;
}

export function startSavedGame(mode: GameMode, requestId: string) {
  return gameRpc<GameResult>('start_game', { p_mode: mode, p_request_id: requestId });
}
export function issueSavedQuestion(sessionId: string) {
  return gameRpc<{ id: number; question: Question }>('issue_game_question', {
    p_session_id: sessionId,
  });
}
export function answerSavedQuestion(
  sessionId: string,
  matchId: number,
  answer: QuadDirection,
  requestId: string,
) {
  return gameRpc<GameResult>('answer_game_question', {
    p_session_id: sessionId,
    p_match_id: matchId,
    p_answer: answer,
    p_request_id: requestId,
  });
}

export async function getTodaysGame(): Promise<GameResult | null> {
  if (!supabase) throw new Error('Database unavailable');
  const { data, error } = await supabase
    .from('game_sessions')
    .select('id')
    .eq('challenge_date', new Date().toISOString().slice(0, 10))
    .maybeSingle();
  if (error) throw error;
  return data ? getGameResult(data.id) : null;
}

export async function getGameResult(id: string): Promise<GameResult | null> {
  if (!supabase) throw new Error('Database unavailable');
  const { data, error } = await supabase.rpc('get_game_result', { p_session_id: id });
  if (error) throw error;
  return data as GameResult | null;
}

/** Session-level pagination never splits a game's answers. */
export async function listGameSessions(
  mode: string,
  before?: Pick<GameSession, 'started_at' | 'id'>,
): Promise<GameSession[]> {
  if (!supabase) throw new Error('Database unavailable');
  let query = supabase
    .from('game_sessions')
    .select('*')
    .eq('mode', mode)
    .order('started_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(30);
  if (before)
    query = query.or(
      `started_at.lt.${before.started_at},and(started_at.eq.${before.started_at},id.lt.${before.id})`,
    );
  const { data, error } = await query;
  if (error) throw error;
  return data as GameSession[];
}
