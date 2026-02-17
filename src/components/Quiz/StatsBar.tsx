import { useSettingsStore } from '../../stores/settingsStore';
import type { GameState } from '../../types/game';

interface StatsBarProps {
  gameState: GameState;
}

export function StatsBar({ gameState }: StatsBarProps) {
  const { t } = useSettingsStore();

  const isChallenge = gameState.mode === 'challenge';
  const isLearning = gameState.mode === 'learning';

  return (
    <div className="stats-bar">
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
