import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCoord, formatDirection } from '../lib/quiz';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';

export function FinalResult() {
  const navigate = useNavigate();
  const { lang, t } = useSettingsStore();
  const { gameState, startGame } = useGameStore();
  const [openAccordion, setOpenAccordion] = useState<number | null>(null);
  const accordionMapRefs = useRef<Map<number, L.Map>>(new Map());
  const accordionContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const correctCount = gameState.history.filter((h) => h).length;
  const totalQuestions = gameState.questionCount;
  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Determine high score category
  type HighScoreCategory = 'survival_rated' | 'survival_unrated';
  const getCategory = (): HighScoreCategory | null => {
    if (gameState.mode === 'survival' && gameState.subMode === 'rated') return 'survival_rated';
    if (gameState.mode === 'survival' && gameState.subMode === 'unrated') return 'survival_unrated';
    return null;
  };

  const { isAuthenticated, profile } = useAuthStore();
  const category = getCategory();
  // For authenticated users, compare against DB best score (already updated via gameStore)
  // The profile state is updated optimistically in submitAnswer, so prevHighScore reflects
  // the score BEFORE this game (we use the already-updated value; new high score was set
  // during the game). We detect "new high score" if the final score equals the profile best.
  const prevHighScore = (() => {
    if (!isAuthenticated || !profile || !category) return 0;
    if (category === 'survival_rated') return profile.best_score_survival_rated ?? 0;
    return profile.best_score_survival_unrated ?? 0;
  })();
  const isNewHighScore = category && gameState.score >= prevHighScore && gameState.score > 0;

  const titleText =
    gameState.mode === 'survival' ||
    (gameState.mode !== 'challenge' && gameState.mode !== 'learning')
      ? t.ui.gameOver
      : t.ui.challengeComplete;

  // Cleanup accordion maps on unmount
  useEffect(() => {
    return () => {
      accordionMapRefs.current.forEach((map) => map.remove());
      accordionMapRefs.current.clear();
    };
  }, []);

  const setAccordionContainerRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (el) {
        accordionContainerRefs.current.set(index, el);
      }
    },
    [],
  );

  const toggleAccordion = useCallback(
    (index: number) => {
      if (openAccordion === index) {
        // Close
        const map = accordionMapRefs.current.get(index);
        if (map) {
          map.remove();
          accordionMapRefs.current.delete(index);
        }
        setOpenAccordion(null);
      } else {
        // Close previous
        if (openAccordion !== null) {
          const prevMap = accordionMapRefs.current.get(openAccordion);
          if (prevMap) {
            prevMap.remove();
            accordionMapRefs.current.delete(openAccordion);
          }
        }
        setOpenAccordion(index);

        // Initialize map after DOM update
        setTimeout(() => {
          const container = accordionContainerRefs.current.get(index);
          if (!container || accordionMapRefs.current.has(index)) return;

          const q = gameState.questionHistory[index];
          if (!q) return;

          const accMap = L.map(container, {
            worldCopyJump: false,
            maxBounds: [
              [-90, -180],
              [90, 180],
            ],
            maxBoundsViscosity: 1.0,
          }).setView([0, 0], 2);

          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            noWrap: true,
          }).addTo(accMap);

          const latlngA: [number, number] = [q.cityA.lat, q.cityA.lon];
          const latlngB: [number, number] = [q.cityB.lat, q.cityB.lon];
          const labelA = lang === 'ja' ? q.cityA.capitalJp : q.cityA.capitalEn;
          const labelB = lang === 'ja' ? q.cityB.capitalJp : q.cityB.capitalEn;

          L.marker(latlngA).addTo(accMap).bindPopup(`${labelA}<br>(Target)`);
          L.marker(latlngB).addTo(accMap).bindPopup(`${labelB}<br>(Origin)`);
          L.polyline([latlngA, latlngB], { color: 'red' }).addTo(accMap);

          const group = new L.FeatureGroup([L.marker(latlngA), L.marker(latlngB)]);
          accMap.fitBounds(group.getBounds().pad(0.1));

          accordionMapRefs.current.set(index, accMap);
        }, 100);
      }
    },
    [openAccordion, gameState.questionHistory, lang],
  );

  // History dots
  const historyDots = gameState.history.map((correct, i) => (
    <span
      key={i}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border ${
        correct
          ? 'bg-success/10 text-success border-success/20'
          : 'bg-error/10 text-error border-error/20'
      }`}
      title={`Q${i + 1}`}
    >
      {correct ? '○' : '✕'}
    </span>
  ));

  // Rating change display
  const totalRatingChange = gameState.totalRatingChange;
  const isRatedGame = gameState.mode !== 'learning';
  const ratingBefore = gameState.ratingBefore;
  const ratingAfter = ratingBefore !== undefined ? ratingBefore + totalRatingChange : undefined;

  return (
    <>
      <Header />
      <div className="glass-card p-5 sm:p-8 animate-fade-in">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-2 text-text-primary">
          {titleText}
        </h2>
        {isNewHighScore && (
          <p className="text-center text-accent font-bold animate-pulse-once mb-3">
            🎉 {t.ui.newHighScore}
          </p>
        )}

        {/* Score & Rating */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 mb-5">
          {/* Score */}
          <div className="text-center">
            <span className="text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-primary via-cyan-300 to-primary bg-clip-text text-transparent">
              {gameState.score}
            </span>
            <div className="text-text-secondary text-sm mt-1.5 uppercase tracking-wider font-medium">
              {t.ui.score}
            </div>
          </div>

          {/* Rating before → after */}
          {isRatedGame && ratingBefore !== undefined && ratingAfter !== undefined && (
            <>
              <div className="w-px h-16 bg-white/10" />
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-xs text-text-secondary mb-0.5">{t.ui.ratingBefore}</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {Math.round(ratingBefore)}
                  </div>
                </div>
                <div className="text-text-secondary text-xl">→</div>
                <div className="text-center">
                  <div className="text-xs text-text-secondary mb-0.5">{t.ui.ratingAfter}</div>
                  <div
                    className={`text-2xl font-bold ${totalRatingChange >= 0 ? 'text-success' : 'text-error'}`}
                  >
                    {Math.round(ratingAfter)}
                  </div>
                </div>
                <div
                  className={`text-sm font-bold px-2.5 py-1 rounded-lg ${
                    totalRatingChange >= 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                  }`}
                >
                  {totalRatingChange >= 0 ? '+' : ''}
                  {Math.round(totalRatingChange)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-surface-light/60 border border-white/5 rounded-xl p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-text-primary">{totalQuestions}</div>
            <div className="text-xs text-text-secondary mt-1">{t.ui.totalQuestions}</div>
          </div>
          <div className="bg-surface-light/60 border border-white/5 rounded-xl p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-text-primary">{accuracy}%</div>
            <div className="text-xs text-text-secondary mt-1">{t.ui.accuracy}</div>
          </div>
        </div>

        {/* History dots */}
        <div className="flex flex-wrap gap-1.5 justify-center mb-5">{historyDots}</div>

        {/* Accordion */}
        {gameState.questionHistory.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">
              {t.ui.reviewAnswers}
            </h3>
            <div className="flex flex-col gap-1.5">
              {gameState.questionHistory.map((q, i) => {
                const nameA = lang === 'ja' ? q.cityA.capitalJp : q.cityA.capitalEn;
                const nameB = lang === 'ja' ? q.cityB.capitalJp : q.cityB.capitalEn;
                const countryA = lang === 'ja' ? q.cityA.nameJp : q.cityA.nameEn;
                const countryB = lang === 'ja' ? q.cityB.nameJp : q.cityB.nameEn;
                const correctDirText = formatDirection(q.correctDirection, lang);
                const userDirText = formatDirection(q.userAnswer, lang);
                const wikiA = `https://${lang}.wikipedia.org/wiki/${nameA}`;
                const wikiB = `https://${lang}.wikipedia.org/wiki/${nameB}`;
                const isOpen = openAccordion === i;

                return (
                  <div
                    key={i}
                    className="bg-surface-light/40 border border-white/5 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleAccordion(i)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 cursor-pointer bg-transparent border-none text-text-primary text-left hover:bg-surface-hover transition-all duration-200"
                    >
                      <span className="text-xs text-text-secondary font-bold">Q{i + 1}</span>
                      <span
                        className={`text-sm font-bold ${q.isCorrect ? 'text-success' : 'text-error'}`}
                      >
                        {q.isCorrect ? '○' : '✕'}
                      </span>
                      <span className="text-xs text-text-primary truncate flex-1">
                        {nameA} → {nameB}
                      </span>
                      <span className="text-text-secondary text-xs">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="text-center bg-surface/40 rounded-lg p-2">
                            <div className="text-xs text-text-secondary uppercase tracking-wider">
                              {t.ui.correctAnswer}
                            </div>
                            <div className="text-success font-bold text-sm mt-0.5">
                              {correctDirText}
                            </div>
                          </div>
                          <div className="text-center bg-surface/40 rounded-lg p-2">
                            <div className="text-xs text-text-secondary uppercase tracking-wider">
                              {t.ui.yourAnswer}
                            </div>
                            <div
                              className={`font-bold text-sm mt-0.5 ${q.isCorrect ? 'text-success' : 'text-error'}`}
                            >
                              {userDirText}
                            </div>
                          </div>
                        </div>
                        {q.ratingChange !== undefined && (
                          <div className="text-center mb-3">
                            <span
                              className={`text-xs font-bold ${q.ratingChange >= 0 ? 'text-success' : 'text-error'}`}
                            >
                              {q.ratingChange >= 0 ? '+' : ''}
                              {Math.round(q.ratingChange)} Rate
                            </span>
                          </div>
                        )}
                        <div
                          ref={setAccordionContainerRef(i)}
                          className="w-full h-36 md:h-48 rounded-xl overflow-hidden mb-3 border border-white/5"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            {
                              role: 'Target',
                              name: nameA,
                              country: countryA,
                              city: q.cityA,
                              wiki: wikiA,
                              colorClass: 'text-primary',
                            },
                            {
                              role: 'Origin',
                              name: nameB,
                              country: countryB,
                              city: q.cityB,
                              wiki: wikiB,
                              colorClass: 'text-secondary',
                            },
                          ].map((info) => (
                            <div key={info.role} className="text-center">
                              <span className={`text-[10px] font-semibold ${info.colorClass}`}>
                                {info.role}
                              </span>
                              <div className="text-xs font-bold text-text-primary">{info.name}</div>
                              <div className="text-[10px] text-text-secondary">{info.country}</div>
                              <div className="text-[10px] text-text-secondary">
                                {formatCoord(info.city.lat, 'lat')} /{' '}
                                {formatCoord(info.city.lon, 'lon')}
                              </div>
                              <a
                                href={info.wiki}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline"
                              >
                                Wikipedia ↗
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Guest CTA */}
        {!isAuthenticated && (
          <div className="mb-5 p-5 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-xl text-center">
            <h3 className="text-text-primary font-bold mb-2">もっと楽しむには？</h3>
            <p className="text-text-secondary text-xs leading-relaxed mb-4">
              アカウントを作成すると、全198カ国から出題されるレーティング戦に参加でき、毎日のプレイ記録やスコアを保存できます！
            </p>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-2.5 bg-primary text-bg font-bold rounded-lg hover:bg-cyan-400 transition-colors text-sm"
            >
              無料アカウント作成 / ログイン
            </button>
          </div>
        )}

        {/* Action buttons */}
        {gameState.mode !== 'challenge' && (
          <button
            onClick={async () => {
              await startGame(gameState.mode, gameState.subMode);
              navigate('/quiz', { replace: true });
            }}
            className="btn-glow w-full py-3.5 rounded-xl text-base mb-2"
          >
            {t.ui.retry}
          </button>
        )}
        <button
          onClick={() => navigate('/play')}
          className="w-full py-2.5 rounded-xl bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200 text-sm font-medium"
        >
          {t.ui.backToTop}
        </button>
      </div>
    </>
  );
}
