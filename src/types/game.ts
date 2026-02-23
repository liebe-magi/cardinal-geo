import type { GlickoRating } from '../lib/glicko2';
import type { Region } from '../lib/regions';
import type { City } from './city';

export type GameMode = 'survival' | 'challenge' | 'learning' | 'starter' | Region;
export type GameSubMode = 'rated' | 'unrated';

export type Direction = 'N' | 'S' | 'E' | 'W';
export type QuadDirection = { ns: 'N' | 'S'; ew: 'E' | 'W' };

export interface Question {
  cityA: City;
  cityB: City;
  correctDirection: QuadDirection;
}

export interface QuestionRecord {
  cityA: City;
  cityB: City;
  correctDirection: QuadDirection;
  userAnswer: QuadDirection;
  isCorrect: boolean;
  ratingChange?: number;
  /** True if one axis (NS or EW) matched */
  isPartialCorrect?: boolean;
}

export interface GameState {
  mode: GameMode;
  subMode: GameSubMode;
  score: number;
  questionCount: number;
  isGameOver: boolean;
  history: boolean[];
  questionHistory: QuestionRecord[];
  /** UUID for rated session tracking */
  sessionId?: string;
  /** Current match_history ID for rated mode */
  currentMatchHistoryId?: number;
  /** Total rating change accumulated during the session */
  totalRatingChange: number;
  /** User's rating at the start of this rated session */
  ratingBefore?: number;
  /** Locally-chained player rating within the session (avoids stale fetchProfile reads) */
  currentPlayerRating?: GlickoRating;
}

export function createInitialGameState(mode: GameMode, subMode: GameSubMode): GameState {
  return {
    mode,
    subMode,
    score: 0,
    questionCount: 0,
    isGameOver: false,
    history: [],
    questionHistory: [],
    totalRatingChange: 0,
  };
}
