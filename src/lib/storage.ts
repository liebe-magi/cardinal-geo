export const STORAGE_KEYS = {
  LANG: 'cardinal_lang',
  // Migration keys (read-only, cleared after migration)
  WEAKNESS_SCORES: 'cardinal_weakness',
  HIGH_SCORE_SURVIVAL_RATED: 'cardinal_hs_survival_rated',
  HIGH_SCORE_SURVIVAL_UNRATED: 'cardinal_hs_survival_unrated',
  HIGH_SCORE_CHALLENGE_UNRATED: 'cardinal_hs_challenge_unrated',
  SCORE_HISTORY_CHALLENGE_UNRATED: 'cardinal_scores_challenge_unrated',
  DAILY_RESULT_PREFIX: 'cardinal_daily_',
};

// --- Migration helpers (used once on first login) ---

export interface LocalMigrationData {
  weaknessScores: Record<string, number>;
  bestSurvivalRated: number;
  bestSurvivalUnrated: number;
}

/**
 * Collect all game data from LocalStorage for migration to DB.
 * Returns null if there is no meaningful data to migrate.
 */
export function collectLocalDataForMigration(): LocalMigrationData | null {
  const weaknessRaw = localStorage.getItem(STORAGE_KEYS.WEAKNESS_SCORES);
  const weaknessScores: Record<string, number> = weaknessRaw ? JSON.parse(weaknessRaw) : {};
  const bestSurvivalRated = parseInt(
    localStorage.getItem(STORAGE_KEYS.HIGH_SCORE_SURVIVAL_RATED) || '0',
    10,
  );
  const bestSurvivalUnrated = parseInt(
    localStorage.getItem(STORAGE_KEYS.HIGH_SCORE_SURVIVAL_UNRATED) || '0',
    10,
  );

  const hasData =
    Object.keys(weaknessScores).length > 0 || bestSurvivalRated > 0 || bestSurvivalUnrated > 0;

  return hasData ? { weaknessScores, bestSurvivalRated, bestSurvivalUnrated } : null;
}

/**
 * Clear all game data from LocalStorage after successful migration.
 */
export function clearLocalGameData(): void {
  localStorage.removeItem(STORAGE_KEYS.WEAKNESS_SCORES);
  localStorage.removeItem(STORAGE_KEYS.HIGH_SCORE_SURVIVAL_RATED);
  localStorage.removeItem(STORAGE_KEYS.HIGH_SCORE_SURVIVAL_UNRATED);
  localStorage.removeItem(STORAGE_KEYS.HIGH_SCORE_CHALLENGE_UNRATED);
  localStorage.removeItem(STORAGE_KEYS.SCORE_HISTORY_CHALLENGE_UNRATED);
  // Clear daily result caches
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEYS.DAILY_RESULT_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}
