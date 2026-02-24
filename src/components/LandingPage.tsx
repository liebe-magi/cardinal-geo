import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatCoord, formatDirection } from '../lib/quiz';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';
import { CompassGrid } from './Quiz/CompassGrid';
import { StatsBar } from './Quiz/StatsBar';
import { ResultMap } from './ResultMap';

export function LandingPage() {
  const { t, lang } = useSettingsStore();
  const formUrl = import.meta.env.VITE_CONTACT_FORM_URL;
  const { isAuthenticated } = useAuthStore();
  const {
    gameState,
    currentQuestion,
    userGuess,
    setUserGuess,
    submitAnswer,
    lastAnswerResult,
    startGame,
    nextQuestion,
  } = useGameStore();

  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [playState, setPlayState] = useState<'idle' | 'playing' | 'result'>('idle');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/play', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleQuickPlay = async () => {
    setIsStarting(true);
    await startGame('starter', 'unrated');
    setIsStarting(false);
    setPlayState('playing');

    // Scroll slightly down to focus on the game area
    setTimeout(() => {
      document
        .getElementById('demo-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleNextQuestion = async () => {
    await nextQuestion();
    setPlayState('playing');
    setTimeout(() => {
      document
        .getElementById('demo-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleSubmitAnswer = async () => {
    await submitAnswer();
    setPlayState('result');
    setTimeout(() => {
      document
        .getElementById('demo-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const renderGameSection = () => {
    if (playState === 'idle') {
      return (
        <div className="flex flex-col items-center justify-center gap-4 max-w-sm mx-auto animate-fade-in">
          <button
            onClick={handleQuickPlay}
            className="btn-glow w-full py-4 rounded-xl text-lg font-bold shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all flex items-center justify-center gap-2"
          >
            <span className="text-2xl">🌍</span>
            <span>{lang === 'ja' ? '今すぐお試しプレイ（無料）' : 'Play Now (Free)'}</span>
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 rounded-xl text-text-secondary hover:text-text-primary text-sm font-semibold transition-colors border border-transparent hover:border-white/10"
          >
            {t.ui.signIn} / {t.ui.signUp}
          </button>
        </div>
      );
    }

    if (playState === 'playing' && currentQuestion) {
      const { cityA, cityB } = currentQuestion;
      const cityAName = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
      const cityBName = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;

      return (
        <div className="w-full max-w-md mx-auto animate-fade-in bg-bg/80 backdrop-blur-md rounded-2xl border border-white/10 p-4 sm:p-6 shadow-2xl relative z-20">
          <div className="mb-4">
            <StatsBar gameState={gameState} />
          </div>
          <div className="question-text text-center mb-6">
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

          <CompassGrid
            userGuess={userGuess}
            onSelect={setUserGuess}
            cityAName={cityAName}
            cityBName={cityBName}
          />

          <div className="direction-display text-center my-4 font-bold text-accent">
            {userGuess ? `${formatDirection(userGuess, lang)} ${t.ui.direction}` : '\u00A0'}
          </div>

          <button
            onClick={handleSubmitAnswer}
            disabled={isStarting || !userGuess}
            className="submit-btn w-full"
          >
            {t.ui.submit}
          </button>
        </div>
      );
    }

    if (playState === 'result' && currentQuestion && lastAnswerResult) {
      const { isCorrect, isPartialCorrect } = lastAnswerResult;
      const { cityA, cityB, correctDirection } = currentQuestion;
      const userAnswer =
        gameState.questionHistory[gameState.questionHistory.length - 1]?.userAnswer;
      const correctDir = formatDirection(correctDirection, lang);
      const userDir = userAnswer ? formatDirection(userAnswer, lang) : '';

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

      return (
        <div className="w-full max-w-lg mx-auto animate-fade-in bg-bg/90 backdrop-blur-xl rounded-2xl border border-white/10 p-4 sm:p-6 shadow-2xl relative z-20">
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
              {partialInfo && <div className="text-xs mt-0.5 opacity-80">{partialInfo}</div>}
            </div>
          </div>

          <div className="flex justify-center mb-5">
            <div className="bg-surface-light/60 border border-white/5 px-5 py-2.5 rounded-full">
              <span className="text-text-secondary text-sm mr-2">{t.ui.score}</span>
              <span className="text-xl font-bold text-text-primary">{gameState.score}</span>
            </div>
          </div>

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

          <ResultMap cityA={cityA} cityB={cityB} />

          {/* City info cards */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              {
                role: 'Target',
                name: lang === 'ja' ? cityA.capitalJp : cityA.capitalEn,
                country: lang === 'ja' ? cityA.nameJp : cityA.nameEn,
                city: cityA,
                wiki: `https://${lang}.wikipedia.org/wiki/${lang === 'ja' ? cityA.capitalJp : cityA.capitalEn}`,
                color: 'primary',
                borderColor: 'border-primary/20',
                bgColor: 'bg-primary/5',
              },
              {
                role: 'Origin',
                name: lang === 'ja' ? cityB.capitalJp : cityB.capitalEn,
                country: lang === 'ja' ? cityB.nameJp : cityB.nameEn,
                city: cityB,
                wiki: `https://${lang}.wikipedia.org/wiki/${lang === 'ja' ? cityB.capitalJp : cityB.capitalEn}`,
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

          <div className="mt-8 space-y-4">
            <div className="p-5 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-xl text-center">
              {gameState.isGameOver ? (
                <>
                  <h3 className="text-xl font-bold text-text-primary mb-2">
                    {lang === 'ja' ? 'ゲームオーバー！' : 'Game Over!'}
                  </h3>
                  <p className="text-base font-bold text-accent mb-4">
                    {lang === 'ja'
                      ? `最終スコア: ${gameState.score}`
                      : `Final Score: ${gameState.score}`}
                  </p>
                  <p className="text-sm text-text-secondary mb-4">
                    {lang === 'ja'
                      ? 'アカウントを作成すると、世界中のプレイヤーとランキングを競えます。'
                      : 'Create an account to compete on the global leaderboard.'}
                  </p>
                  <button
                    onClick={() => navigate('/login')}
                    className="w-full btn-glow py-3 rounded-lg font-bold mb-3 shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all"
                  >
                    {t.ui.signUp}
                  </button>
                  <button
                    onClick={() => {
                      setPlayState('idle');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-text-secondary hover:text-text-primary text-sm underline"
                  >
                    {lang === 'ja' ? 'トップページに戻る' : 'Back to Top'}
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-text-primary mb-2">
                    {lang === 'ja'
                      ? '🎉 全198カ国の首都に挑戦しよう！'
                      : '🎉 Challenge all 198 capitals!'}
                  </h3>
                  <p className="text-sm text-text-secondary mb-4">
                    {lang === 'ja'
                      ? 'アカウントを作成すると、有名首都以外の全198カ国の首都で遊べるようになり、世界中のプレイヤーとランキングを競えます。'
                      : 'Create an account to unlock all 198 capitals beyond the famous ones, and compete on the global leaderboard.'}
                  </p>
                  <button
                    onClick={() => navigate('/login')}
                    className="w-full btn-glow py-3 rounded-lg font-bold mb-3 shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:shadow-[0_0_25px_rgba(34,211,238,0.4)] transition-all"
                  >
                    {t.ui.signUp}
                  </button>
                  <button
                    onClick={handleNextQuestion}
                    className="text-text-secondary hover:text-text-primary text-sm underline"
                  >
                    {lang === 'ja'
                      ? 'ログインせずに次の問題を試す'
                      : 'Try next question without login'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <Header />
      {/* Loading overlay */}
      {isStarting && (
        <div className="fixed inset-0 bg-bg/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card p-8 text-center">
            <div className="animate-pulse text-primary text-lg font-medium">{t.ui.loading}</div>
          </div>
        </div>
      )}

      <div className="animate-fade-in space-y-8 pb-12">
        {/* Hero Section */}
        <div className="glass-card p-8 sm:p-12 text-center relative overflow-hidden pb-16">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 pointer-events-none" />
          <div className="relative z-10">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6 tracking-tight bg-gradient-to-r from-primary via-cyan-300 to-primary bg-clip-text text-transparent">
              {t.landing.heroTitleLine1}
              <br className="block sm:hidden" />
              {t.landing.heroTitleLine2}
            </h1>
            <p className="text-text-secondary text-base sm:text-lg mb-8 max-w-2xl mx-auto leading-relaxed animate-fade-in">
              {t.landing.heroDesc}
            </p>

            <div className="flex flex-col items-center justify-center gap-4 max-w-sm mx-auto">
              <button
                onClick={() => navigate('/login')}
                className="btn-glow w-full py-4 rounded-xl text-lg font-bold shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all flex items-center justify-center gap-2"
              >
                {t.ui.signUp} / {t.ui.signIn}
              </button>
            </div>
          </div>
        </div>

        {/* --- EVERYTHING BELOW REMAINS VISIBLE REGARDLESS OF PLAYSTATE --- */}

        {/* How to Play Section */}
        <div className="glass-card p-8 sm:p-12 mb-8 relative overflow-hidden">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-text-primary mb-4">
              {t.landing.howToPlayTitle}
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto">{t.landing.howToPlayDesc}</p>
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-center gap-12">
            {/* Rules Text */}
            <div className="w-full lg:max-w-md space-y-8">
              <div className="flex gap-4 p-4 rounded-xl bg-bg/40 border border-white/5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <div>
                  <h4 className="text-lg font-bold text-text-primary mb-2">
                    {t.landing.step1Title}
                  </h4>
                  <p className="text-text-secondary text-base leading-relaxed">
                    {t.landing.step1Desc}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 p-4 rounded-xl bg-bg/40 border border-white/5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <div>
                  <h4 className="text-lg font-bold text-text-primary mb-2">
                    {t.landing.step2Title}
                  </h4>
                  <p className="text-text-secondary text-base leading-relaxed">
                    {t.landing.step2Desc}
                  </p>
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-300 text-sm leading-relaxed font-medium">
                      {t.landing.step2Note}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 p-4 rounded-xl bg-bg/40 border border-white/5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <div>
                  <h4 className="text-lg font-bold text-text-primary mb-2">
                    {t.landing.step3Title}
                  </h4>
                  <p className="text-text-secondary text-base leading-relaxed">
                    {t.landing.step3Desc}
                  </p>
                </div>
              </div>
            </div>

            {/* Mock UI Demonstration */}
            <div className="flex flex-col gap-6 w-full max-w-md">
              {/* Quiz Screen Demo */}
              <div className="relative w-full aspect-square bg-bg/50 rounded-2xl border border-primary/20 p-2 sm:p-4 shadow-xl flex-shrink-0 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                  <div className="w-full h-px bg-primary" />
                  <div className="absolute h-full w-px bg-primary" />
                </div>
                <div className="z-10 w-full h-full transform scale-90 sm:scale-100 flex items-center justify-center pointer-events-none">
                  <div className="w-[320px] h-[320px] relative flex items-center justify-center">
                    <CompassGrid
                      userGuess={{ ns: 'N', ew: 'W' }}
                      onSelect={() => {}}
                      cityAName={lang === 'ja' ? 'パリ' : 'Paris'}
                      cityBName={lang === 'ja' ? '東京' : 'Tokyo'}
                    />
                  </div>
                </div>
              </div>

              {/* Result Screen Demo */}
              <div className="glass-card p-4 sm:p-5 shadow-xl border border-white/10 animate-fade-in relative z-20">
                <div className="flex items-center justify-center gap-2 sm:gap-3 py-2.5 px-3 sm:px-4 rounded-xl mb-4 border bg-success/10 text-success border-success/20">
                  <span className="text-xl sm:text-2xl font-bold">○</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm sm:text-base font-bold">{t.ui.correct}</span>
                    <span className="text-xs sm:text-sm font-bold text-success">
                      (+40 {t.ui.rating})
                    </span>
                  </div>
                </div>
                {/* The user can directly interact with the Leaflet map because we removed pointer-events-none */}
                <div className="rounded-xl overflow-hidden">
                  <ResultMap
                    cityA={{
                      capitalEn: 'Paris',
                      capitalJp: 'パリ',
                      nameEn: 'France',
                      nameJp: 'フランス',
                      countryCode: 'FR',
                      lat: 48.8566,
                      lon: 2.3522,
                    }}
                    cityB={{
                      capitalEn: 'Tokyo',
                      capitalJp: '東京',
                      nameEn: 'Japan',
                      nameJp: '日本',
                      countryCode: 'JP',
                      lat: 35.6762,
                      lon: 139.6503,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 text-center hover-lift">
            <div className="text-4xl mb-4">🌟</div>
            <h3 className="text-xl font-bold text-text-primary mb-2">{t.landing.feature1Title}</h3>
            <p className="text-text-secondary text-sm leading-relaxed">{t.landing.feature1Desc}</p>
          </div>

          <div className="glass-card p-6 text-center hover-lift">
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-xl font-bold text-text-primary mb-2">{t.landing.feature2Title}</h3>
            <p className="text-text-secondary text-sm leading-relaxed">{t.landing.feature2Desc}</p>
          </div>

          <div className="glass-card p-6 text-center hover-lift">
            <div className="text-4xl mb-4">🌍</div>
            <h3 className="text-xl font-bold text-text-primary mb-2">{t.landing.feature3Title}</h3>
            <p className="text-text-secondary text-sm leading-relaxed">{t.landing.feature3Desc}</p>
          </div>
        </div>

        {/* Demo Call to action / Embed Area */}
        <div
          id="demo-section"
          className="glass-card p-8 text-center border-accent/20 bg-accent/5 mt-8"
        >
          <h2 className="text-2xl font-bold text-text-primary mb-3">{t.landing.tryOutTitle}</h2>
          <p className="text-text-secondary text-sm mb-6 max-w-xl mx-auto">
            {t.landing.tryOutDesc}
          </p>
          <div className="mt-8 transition-all duration-500 ease-in-out">{renderGameSection()}</div>
        </div>
      </div>

      {/* Global Footer */}
      <footer className="w-full py-8 mt-auto border-t border-white/5 bg-bg/40 backdrop-blur-sm relative z-10">
        <div className="max-w-4xl mx-auto px-4 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-6 text-sm text-text-secondary">
            <Link to="/about" className="hover:text-primary transition-colors">
              {t.ui.about}
            </Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">
              {t.ui.privacyPolicy}
            </Link>
            {formUrl && (
              <a
                href={formUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                {t.ui.contact}
              </a>
            )}
          </div>
          <div className="text-xs text-text-secondary/50">
            &copy; {new Date().getFullYear()} Cardinal Geo. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
