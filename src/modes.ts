import { City } from './cities';
import { QuadDirection } from './quiz';

export type GameMode = 'survival' | 'timeAttack' | 'challenge' | 'learning';

export interface QuestionRecord {
  cityA: City;
  cityB: City;
  correctDirection: QuadDirection;
  userAnswer: QuadDirection;
  isCorrect: boolean;
}

export interface GameState {
  mode: GameMode;
  score: number;
  questionCount: number;
  isGameOver: boolean;
  timeLeft?: number; // for timeAttack
  history: boolean[]; // Correct/Incorrect history
  questionHistory: QuestionRecord[]; // Detailed question history
}

export const STORAGE_KEYS = {
  HIGH_SCORE_SURVIVAL: 'cardinal_hs_survival',
  HIGH_SCORE_TIMEATTACK: 'cardinal_hs_timeattack',
  HIGH_SCORE_CHALLENGE: 'cardinal_hs_challenge', // Max score (e.g. 10)
  WEAKNESS_SCORES: 'cardinal_weakness',
};

export function getHighScore(mode: GameMode): number {
  const key =
    mode === 'survival'
      ? STORAGE_KEYS.HIGH_SCORE_SURVIVAL
      : mode === 'timeAttack'
        ? STORAGE_KEYS.HIGH_SCORE_TIMEATTACK
        : STORAGE_KEYS.HIGH_SCORE_CHALLENGE;
  return parseInt(localStorage.getItem(key) || '0', 10);
}

export function saveHighScore(mode: GameMode, score: number) {
  const current = getHighScore(mode);
  if (score > current) {
    const key =
      mode === 'survival'
        ? STORAGE_KEYS.HIGH_SCORE_SURVIVAL
        : mode === 'timeAttack'
          ? STORAGE_KEYS.HIGH_SCORE_TIMEATTACK
          : STORAGE_KEYS.HIGH_SCORE_CHALLENGE;
    localStorage.setItem(key, score.toString());
  }
}

// --- Weakness Score Management ---

export function getWeaknessScores(): Record<string, number> {
  const raw = localStorage.getItem(STORAGE_KEYS.WEAKNESS_SCORES);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveWeaknessScores(scores: Record<string, number>): void {
  localStorage.setItem(STORAGE_KEYS.WEAKNESS_SCORES, JSON.stringify(scores));
}

export function updateWeaknessScore(cityA: City, cityB: City, isCorrect: boolean): void {
  const scores = getWeaknessScores();
  const delta = isCorrect ? -2 : 1;
  scores[cityA.countryCode] = (scores[cityA.countryCode] || 0) + delta;
  scores[cityB.countryCode] = (scores[cityB.countryCode] || 0) + delta;
  saveWeaknessScores(scores);
}

export function resetWeaknessScores(): void {
  localStorage.removeItem(STORAGE_KEYS.WEAKNESS_SCORES);
}
