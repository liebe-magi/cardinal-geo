import { gameModes, ratingLabel } from '../../lib/gameModes';
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

  const ratingMode = gameModes[gameState.mode].ratingScope;
  const modeRating = ratingMode ? profile?.modeRatings?.[ratingMode] : undefined;
  const currentRating = Math.round(
    gameState.currentPlayerRating?.rating ?? modeRating?.rating ?? 1500,
  );
  const ratingModeLabel = ratingLabel(gameState.mode, lang);

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
          <span className="stat-value">
            {gameState.questionCount + 1}/{gameModes[gameState.mode].questionCount}
          </span>
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
