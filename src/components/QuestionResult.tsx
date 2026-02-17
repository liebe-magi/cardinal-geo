import { useNavigate } from 'react-router-dom';
import { formatCoord, formatDirection } from '../lib/quiz';
import { useGameStore } from '../stores/gameStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';
import { ResultMap } from './ResultMap';

export function QuestionResult() {
  const navigate = useNavigate();
  const { lang, t } = useSettingsStore();
  const { gameState, currentQuestion, lastAnswerResult, nextQuestion, endGame } = useGameStore();

  if (!currentQuestion || !lastAnswerResult) {
    navigate('/', { replace: true });
    return null;
  }

  const { isCorrect, isPartialCorrect, ratingChange } = lastAnswerResult;
  const { cityA, cityB, correctDirection } = currentQuestion;
  const userAnswer = gameState.questionHistory[gameState.questionHistory.length - 1]?.userAnswer;

  // Determine banner text
  let bannerText = isCorrect ? t.ui.correct : t.ui.incorrect;
  let partialInfo = '';
  if (isPartialCorrect) {
    bannerText = t.ui.partialCorrect;
    if (userAnswer) {
      if (userAnswer.ns === correctDirection.ns) {
        partialInfo = t.ui.nsCorrect;
      } else {
        partialInfo = t.ui.ewCorrect;
      }
    }
  }

  const correctDir = formatDirection(correctDirection, lang);
  const userDir = userAnswer ? formatDirection(userAnswer, lang) : '';

  const cityAName = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
  const cityBName = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;
  const cityACountry = lang === 'ja' ? cityA.nameJp : cityA.nameEn;
  const cityBCountry = lang === 'ja' ? cityB.nameJp : cityB.nameEn;
  const wikiA = `https://${lang}.wikipedia.org/wiki/${cityAName}`;
  const wikiB = `https://${lang}.wikipedia.org/wiki/${cityBName}`;

  const handleNext = async () => {
    if (
      gameState.mode === 'survival' &&
      gameState.history.length > 0 &&
      !gameState.history[gameState.history.length - 1]
    ) {
      await endGame();
      navigate('/result/final', { replace: true });
    } else if (gameState.mode === 'challenge' && gameState.questionCount >= 10) {
      await endGame();
      navigate('/result/final', { replace: true });
    } else {
      await nextQuestion();
      navigate('/quiz', { replace: true });
    }
  };

  return (
    <>
      <Header />
      <div className="glass-card p-5 sm:p-8 animate-fade-in">
        {/* Result banner */}
        <div
          className={`flex items-center justify-center gap-3 py-3.5 px-5 rounded-xl mb-5 border ${
            isCorrect
              ? 'bg-success/10 text-success border-success/20'
              : isPartialCorrect
                ? 'bg-warning/10 text-warning border-warning/20'
                : 'bg-error/10 text-error border-error/20'
          }`}
        >
          <span className="text-3xl font-bold">{isCorrect ? '○' : '✕'}</span>
          <div>
            <span className="text-lg font-bold">{bannerText}</span>
            {ratingChange !== undefined && (
              <span
                className={`ml-2 text-sm font-bold ${ratingChange >= 0 ? 'text-success' : 'text-error'}`}
              >
                ({ratingChange >= 0 ? '+' : ''}
                {Math.round(ratingChange)} Rate)
              </span>
            )}
            {partialInfo && <div className="text-xs mt-0.5 opacity-80">{partialInfo}</div>}
          </div>
        </div>

        {/* Score badge */}
        <div className="flex justify-center mb-5">
          <div className="bg-surface-light/60 border border-white/5 px-5 py-2.5 rounded-full">
            <span className="text-text-secondary text-sm mr-2">{t.ui.score}</span>
            <span className="text-xl font-bold text-text-primary">{gameState.score}</span>
          </div>
        </div>

        {/* Direction comparison — side by side on wider screens */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-surface-light/60 border border-white/5 rounded-xl p-4 text-center">
            <div className="text-text-secondary text-xs mb-1.5 uppercase tracking-wider font-medium">
              {t.ui.correctAnswer}
            </div>
            <div className="text-success font-bold text-xl">{correctDir}</div>
          </div>
          <div className="bg-surface-light/60 border border-white/5 rounded-xl p-4 text-center">
            <div className="text-text-secondary text-xs mb-1.5 uppercase tracking-wider font-medium">
              {t.ui.yourAnswer}
            </div>
            <div className={`font-bold text-xl ${isCorrect ? 'text-success' : 'text-error'}`}>
              {userDir}
            </div>
          </div>
        </div>

        {/* Map */}
        <ResultMap cityA={cityA} cityB={cityB} />

        {/* City info cards */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            {
              role: 'Target',
              name: cityAName,
              country: cityACountry,
              city: cityA,
              wiki: wikiA,
              color: 'primary',
              borderColor: 'border-primary/20',
              bgColor: 'bg-primary/5',
            },
            {
              role: 'Origin',
              name: cityBName,
              country: cityBCountry,
              city: cityB,
              wiki: wikiB,
              color: 'secondary',
              borderColor: 'border-secondary/20',
              bgColor: 'bg-secondary/5',
            },
          ].map((info) => (
            <div
              key={info.role}
              className={`${info.bgColor} border ${info.borderColor} rounded-xl p-4 flex flex-col items-center gap-1.5`}
            >
              <span
                className={`text-[10px] font-semibold text-${info.color} uppercase tracking-wider`}
              >
                {info.role}
              </span>
              <span className="text-sm font-bold text-text-primary text-center">{info.name}</span>
              <span className="text-xs text-text-secondary">{info.country}</span>
              <span className="text-xs text-text-secondary font-mono">
                {formatCoord(info.city.lat, 'lat')} / {formatCoord(info.city.lon, 'lon')}
              </span>
              <a
                href={info.wiki}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:text-cyan-300 transition-colors"
              >
                Wikipedia ↗
              </a>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <button onClick={handleNext} className="btn-glow w-full py-3.5 rounded-xl text-base mb-2">
          {t.ui.next}
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full py-2.5 rounded-xl bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200 text-sm font-medium"
        >
          {t.ui.backToTop}
        </button>
      </div>
    </>
  );
}
