import type { GameMode, Question, QuadDirection } from './game';

export interface GameSession {
  id: string;
  mode: GameMode;
  status: 'in_progress' | 'completed' | 'abandoned';
  end_reason: 'mistake' | 'questions_complete' | 'replaced' | null;
  started_at: string;
  completed_at: string | null;
  challenge_date: string | null;
  rules_version: number;
  question_set: Question[];
  score: number;
  answered_count: number;
  rating_scope: string | null;
  rating_before: number | null;
  rating_after: number | null;
  total_rating_change: number;
  best_before: number | null;
}
export interface SavedAnswer {
  id: number;
  question_ordinal: number;
  presented_question: Question;
  status: 'win' | 'lose';
  user_answer_ns: QuadDirection['ns'] | null;
  user_answer_ew: QuadDirection['ew'] | null;
  user_rating_before: number;
  user_rating_after: number | null;
  user_rd_after: number | null;
  user_vol_after: number | null;
  rating_change: number;
}
export interface GameResult {
  session: GameSession;
  answers: SavedAnswer[];
}
