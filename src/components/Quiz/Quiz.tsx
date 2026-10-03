import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDirection } from '../../lib/quiz';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Header } from '../Header';
import { InfoPopover } from '../InfoPopover';
import { CompassGrid } from './CompassGrid';
import { StatsBar } from './StatsBar';

export function Quiz() {
  const navigate = useNavigate();
  const { lang, t } = useSettingsStore();
  const {
    gameState,
    currentQuestion,
    userGuess,
    setUserGuess,
    submitAnswer,
    isShowingResult,
    isProcessing,
    error,
    nextQuestion,
  } = useGameStore();

  // Redirect if no question or showing result
  useEffect(() => {
    if (isShowingResult || gameState.isGameOver) {
      if (gameState.isGameOver) {
        navigate('/result/final', { replace: true });
      } else {
        navigate('/result', { replace: true });
      }
    }
  }, [isShowingResult, gameState.isGameOver, navigate]);

  if (!currentQuestion) {
    return (
      <>
        <Header />
        <div className="scene text-center">
          <p>{t.ui.loading}</p>
        </div>
      </>
    );
  }

  if (isShowingResult || gameState.isGameOver) {
    return null;
  }

  const { cityA, cityB } = currentQuestion;
  const cityAName = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
  const cityBName = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;

  const handleSubmit = async () => {
    await submitAnswer();
  };

  return (
    <>
      <Header />
      <div className="scene">
        <StatsBar gameState={gameState} />
        {error && (
          <div role="alert" className="text-center my-4">
            <p>
              {lang === 'ja'
                ? '保存を確認できませんでした。再試行すると保存状況を確認して続行します。'
                : 'Could not confirm the save. Retry to check the saved state and continue.'}
            </p>
            <button
              className="submit-btn"
              disabled={isProcessing}
              onClick={error === 'question' ? nextQuestion : submitAnswer}
            >
              {t.ui.retry}
            </button>
          </div>
        )}

        {/* Question text */}
        <div className="question-text">
          {lang === 'ja' ? (
            <>
              <span className="city-badge city-badge-target">{cityAName}</span> {t.ui.is}{' '}
              <span className="city-badge city-badge-origin">{cityBName}</span> {t.ui.of} ...
            </>
          ) : (
            <>
              <span className="city-badge city-badge-target">{cityAName}</span> {t.ui.is} ...{' '}
              {t.ui.of} <span className="city-badge city-badge-origin">{cityBName}</span>
            </>
          )}
        </div>

        <div className="text-center mb-3">
          <InfoPopover label={t.ui.cautionNote}>
            <p className="text-sm text-text-primary leading-relaxed font-medium">
              {t.landing.directionRuleTooltip}
            </p>
          </InfoPopover>
        </div>

        {/* Compass grid */}
        <CompassGrid
          userGuess={userGuess}
          onSelect={setUserGuess}
          cityAName={cityAName}
          cityBName={cityBName}
        />

        {/* Direction display */}
        <div className="direction-display">
          {userGuess ? `${formatDirection(userGuess, lang)} ${t.ui.direction}` : '\u00A0'}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={isProcessing || !userGuess || !!error}
          className="submit-btn"
        >
          {isProcessing ? t.ui.loading : t.ui.submit}
        </button>
      </div>
    </>
  );
}
