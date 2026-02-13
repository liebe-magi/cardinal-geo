export type GameMode = 'survival' | 'timeAttack' | 'challenge';

export interface GameState {
  mode: GameMode;
  score: number;
  questionCount: number;
  isGameOver: boolean;
  timeLeft?: number; // for timeAttack
  history: boolean[]; // Correct/Incorrect history
}

export const STORAGE_KEYS = {
  HIGH_SCORE_SURVIVAL: 'cardinal_hs_survival',
  HIGH_SCORE_TIMEATTACK: 'cardinal_hs_timeattack',
  HIGH_SCORE_CHALLENGE: 'cardinal_hs_challenge', // Max score (e.g. 10)
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
