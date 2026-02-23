import { regionLabels } from '../../lib/regions';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { GameState } from '../../types/game';

interface StatsBarProps {
  gameState: GameState;
}

export function StatsBar({ gameState }: StatsBarProps) {
  const { t, lang } = useSettingsStore();
  const { isAuthenticated, profile } = useAuthStore();

  const isChallenge = gameState.mode === 'challenge';
  const isLearning = gameState.mode === 'learning';
  const isRatedSession = gameState.subMode === 'rated' && isAuthenticated && !isLearning;

  const ratingMode =
    gameState.mode === 'survival' || gameState.mode === 'challenge'
      ? 'global'
      : gameState.mode === 'starter'
        ? 'starter_rated'
        : `${gameState.mode}_rated`;

  const modeRating = profile?.modeRatings?.[ratingMode];
  const currentRating =
    ratingMode === 'global'
      ? Math.round(modeRating?.rating ?? profile?.rating ?? 1500)
      : Math.round(modeRating?.rating ?? 1500);

  const ratingModeLabel =
    ratingMode === 'global'
      ? 'Global'
      : ratingMode === 'starter_rated'
        ? t.modes.starter
        : ratingMode === 'asia_rated'
          ? regionLabels.asia[lang]
          : ratingMode === 'europe_rated'
            ? regionLabels.europe[lang]
            : ratingMode === 'africa_rated'
              ? regionLabels.africa[lang]
              : ratingMode === 'americas_rated'
                ? regionLabels.americas[lang]
                : ratingMode === 'oceania_rated'
                  ? regionLabels.oceania[lang]
                  : 'Mode';

  return (
    <div className="stats-bar">
      {isRatedSession && (
        <span className="stat-badge">
          <span className="stat-icon">🏅</span>
          <span className="stat-value">
            {ratingModeLabel} {currentRating}
          </span>
        </span>
      )}
      <span className="stat-badge">
        <span className="stat-icon">⭐</span>
        <span className="stat-value">{gameState.score}</span>
      </span>
      {isChallenge && (
        <span className="stat-badge">
          <span className="stat-icon">📋</span>
          <span className="stat-value">{gameState.questionCount + 1}/10</span>
        </span>
      )}
      {isLearning && (
        <span className="stat-badge">
          <span className="stat-icon">📋</span>
          <span className="stat-value">{gameState.questionCount + 1}</span>
        </span>
      )}
      {gameState.mode === 'survival' && (
        <span className="stat-badge">
          <span className="stat-icon">📋</span>
          <span className="stat-value">
            {t.ui.question}
            {gameState.questionCount + 1}
          </span>
        </span>
      )}
      {gameState.subMode === 'rated' && <span className="stat-badge stat-badge-rated">Rated</span>}
    </div>
  );
}
