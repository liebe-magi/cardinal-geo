import { useNavigate } from 'react-router-dom';
import { formatDirection } from '../../lib/quiz';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Header } from '../Header';
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
  } = useGameStore();

  // Redirect if no question or showing result
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
    // Navigate to result page
    if (gameState.isGameOver) {
      navigate('/result/final', { replace: true });
    } else {
      navigate('/result', { replace: true });
    }
    return null;
  }

  const { cityA, cityB } = currentQuestion;
  const cityAName = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
  const cityBName = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;

  const handleSubmit = async () => {
    await submitAnswer();
    navigate('/result');
  };

  return (
    <>
      <Header />
      <div className="scene">
        <StatsBar gameState={gameState} />

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

        {/* Compass grid */}
        <CompassGrid
          userGuess={userGuess}
          onSelect={setUserGuess}
          cityAName={cityAName}
          cityBName={cityBName}
        />

        {/* Direction display */}
        <div className="direction-display">
          {formatDirection(userGuess, lang)} {t.ui.direction}
        </div>

        {/* Submit button */}
        <button onClick={handleSubmit} disabled={isProcessing} className="submit-btn">
          {isProcessing ? t.ui.loading : t.ui.submit}
        </button>
      </div>
    </>
  );
}
