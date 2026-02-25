import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cities } from '../cities';
import { formatCoord, formatDirection } from '../lib/quiz';
import { type Region, regionLabels } from '../lib/regions';
import { fetchRecentGameLogsByMode, type GameLogSession } from '../lib/supabaseApi';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';
import { ResultMap } from './ResultMap';

type GameLogMode = 'survival_rated' | 'challenge_rated' | 'starter_rated' | `${Region}_rated`;

export function GameLog() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { t, lang } = useSettingsStore();
  const [activeMode, setActiveMode] = useState<GameLogMode>('survival_rated');
  const [sessions, setSessions] = useState<GameLogSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [openQuestions, setOpenQuestions] = useState<Record<string, boolean>>({});

  const cityByCode = useMemo(() => {
    return new Map(cities.map((city) => [city.countryCode, city]));
  }, []);

  const modeOptions = useMemo(
    () => [
      { key: 'survival_rated' as const, label: t.modes.survival },
      { key: 'challenge_rated' as const, label: t.modes.challenge },
      { key: 'starter_rated' as const, label: t.modes.starter },
      { key: 'asia_rated' as const, label: regionLabels.asia[lang] },
      { key: 'europe_rated' as const, label: regionLabels.europe[lang] },
      { key: 'africa_rated' as const, label: regionLabels.africa[lang] },
      { key: 'americas_rated' as const, label: regionLabels.americas[lang] },
      { key: 'oceania_rated' as const, label: regionLabels.oceania[lang] },
    ],
    [lang, t],
  );

  useEffect(() => {
    if (!user) {
      setSessions([]);
      return;
    }

    setLoading(true);
    setOpenSessionId(null);
    setOpenQuestions({});

    fetchRecentGameLogsByMode(user.id, activeMode, 30)
      .then((rows) => setSessions(rows))
      .finally(() => setLoading(false));
  }, [activeMode, user]);

  const toggleQuestionAccordion = (sessionId: string, matchId: number) => {
    const key = `${sessionId}:${matchId}`;
    setOpenQuestions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const formatDateTime = (iso: string) => {
    const dt = new Date(iso);
    return dt.toLocaleString(lang, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <>
      <Header />
      <div className="glass-card mb-8 p-5 sm:p-8 animate-fade-in">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-text-primary">
              🗂️ {t.ui.gameLogTitle}
            </h2>
            <p className="text-sm text-text-secondary mt-1">{t.ui.gameLogHint}</p>
          </div>
          <button
            onClick={() => navigate('/play')}
            className="px-3 py-1.5 rounded-lg bg-surface-light/40 text-text-primary border border-white/10 hover:bg-surface-hover transition-all duration-200 cursor-pointer text-sm"
          >
            ← {t.ui.backToTop}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {modeOptions.map((mode) => (
            <button
              key={mode.key}
              onClick={() => setActiveMode(mode.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border ${
                activeMode === mode.key
                  ? 'bg-primary/15 text-primary border-primary/25'
                  : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-text-secondary py-12">
            <div className="animate-pulse">{t.ui.loading}</div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center text-text-secondary py-12">{t.ui.gameLogNoData}</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const isOpen = openSessionId === session.sessionId;

              return (
                <div
                  key={session.sessionId}
                  className="bg-surface-light/40 border border-white/8 rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenSessionId(isOpen ? null : session.sessionId)}
                    className="w-full px-4 sm:px-5 py-4 text-left hover:bg-surface-hover transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-bold px-2.5 py-1 rounded-lg ${
                            session.score > 0
                              ? 'bg-success/10 text-success'
                              : 'bg-error/10 text-error'
                          }`}
                        >
                          {t.ui.score} {session.score}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {session.totalQuestions} {t.ui.totalQuestions}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {session.accuracy}% {t.ui.accuracy}
                        </span>
                      </div>
                      <span className="text-xs text-text-secondary">
                        {formatDateTime(session.finishedAt)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 border border-white/10 text-xs">
                        <span className="text-text-secondary">{t.ui.ratingBefore}:</span>
                        <span className="font-semibold text-text-primary">
                          {session.ratingBefore === null ? '-' : Math.round(session.ratingBefore)}
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 border border-white/10 text-xs">
                        <span className="text-text-secondary">{t.ui.ratingAfter}:</span>
                        <span className="font-semibold text-text-primary">
                          {session.ratingAfter === null ? '-' : Math.round(session.ratingAfter)}
                        </span>
                      </div>
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                          session.totalRatingChange >= 0
                            ? 'bg-success/10 text-success'
                            : 'bg-error/10 text-error'
                        }`}
                      >
                        {session.totalRatingChange >= 0 ? '+' : ''}
                        {Math.round(session.totalRatingChange)}
                      </div>
                      <span className="text-xs text-text-secondary ml-auto">
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {session.matches.map((match) => (
                        <span
                          key={match.id}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border ${
                            match.status === 'win'
                              ? 'bg-success/10 text-success border-success/20'
                              : 'bg-error/10 text-error border-error/20'
                          }`}
                        >
                          {match.status === 'win' ? '○' : '✕'}
                        </span>
                      ))}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 border-t border-white/5">
                      <h3 className="text-sm font-semibold text-text-secondary mt-4 mb-3 uppercase tracking-wider">
                        {t.ui.reviewAnswers}
                      </h3>
                      <div className="space-y-2">
                        {session.matches.map((match, index) => {
                          const cityA = cityByCode.get(match.cityACode);
                          const cityB = cityByCode.get(match.cityBCode);
                          const nameA = cityA
                            ? lang === 'ja'
                              ? cityA.capitalJp
                              : cityA.capitalEn
                            : match.cityACode;
                          const nameB = cityB
                            ? lang === 'ja'
                              ? cityB.capitalJp
                              : cityB.capitalEn
                            : match.cityBCode;
                          const countryA = cityA
                            ? lang === 'ja'
                              ? cityA.nameJp
                              : cityA.nameEn
                            : match.cityACode;
                          const countryB = cityB
                            ? lang === 'ja'
                              ? cityB.nameJp
                              : cityB.nameEn
                            : match.cityBCode;
                          const userAnswerText = match.userAnswerDirection
                            ? formatDirection(match.userAnswerDirection, lang)
                            : t.ui.noData;
                          const wikiA = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(nameA)}`;
                          const wikiB = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(nameB)}`;
                          const questionKey = `${session.sessionId}:${match.id}`;
                          const isQuestionOpen = !!openQuestions[questionKey];

                          return (
                            <div
                              key={match.id}
                              className="bg-surface/40 border border-white/5 rounded-xl overflow-hidden"
                            >
                              <button
                                onClick={() => toggleQuestionAccordion(session.sessionId, match.id)}
                                className="w-full flex items-center gap-2 px-4 py-3 cursor-pointer bg-transparent border-none text-text-primary text-left hover:bg-surface-hover transition-all duration-200"
                              >
                                <span className="text-xs text-text-secondary font-bold">
                                  Q{index + 1}
                                </span>
                                <span
                                  className={`text-sm font-bold ${
                                    match.status === 'win' ? 'text-success' : 'text-error'
                                  }`}
                                >
                                  {match.status === 'win' ? '○' : '✕'}
                                </span>
                                <span className="text-xs text-text-primary truncate flex-1">
                                  {nameA} → {nameB}
                                </span>
                                <span className="text-text-secondary text-xs">
                                  {isQuestionOpen ? '▲' : '▼'}
                                </span>
                              </button>

                              {isQuestionOpen && (
                                <div className="px-4 pb-4">
                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div className="text-center bg-surface-light/50 rounded-lg p-2">
                                      <div className="text-[10px] text-text-secondary uppercase tracking-wider">
                                        {t.ui.correctAnswer}
                                      </div>
                                      <div className="text-success font-bold text-xs mt-0.5">
                                        {formatDirection(match.correctDirection, lang)}
                                      </div>
                                    </div>
                                    <div className="text-center bg-surface-light/50 rounded-lg p-2">
                                      <div className="text-[10px] text-text-secondary uppercase tracking-wider">
                                        {t.ui.yourAnswer}
                                      </div>
                                      <div
                                        className={`font-bold text-xs mt-0.5 ${
                                          match.status === 'win' ? 'text-success' : 'text-error'
                                        }`}
                                      >
                                        {userAnswerText}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-center mb-3">
                                    <span
                                      className={`text-xs font-bold ${
                                        match.ratingChange >= 0 ? 'text-success' : 'text-error'
                                      }`}
                                    >
                                      {match.ratingChange >= 0 ? '+' : ''}
                                      {Math.round(match.ratingChange)} Rate
                                    </span>
                                  </div>

                                  {cityA && cityB && <ResultMap cityA={cityA} cityB={cityB} />}

                                  <div className="grid grid-cols-2 gap-2 mt-3">
                                    {[
                                      {
                                        role: 'Target',
                                        name: nameA,
                                        country: countryA,
                                        city: cityA,
                                        wiki: wikiA,
                                        colorClass: 'text-primary',
                                      },
                                      {
                                        role: 'Origin',
                                        name: nameB,
                                        country: countryB,
                                        city: cityB,
                                        wiki: wikiB,
                                        colorClass: 'text-secondary',
                                      },
                                    ].map((info) => (
                                      <div key={info.role} className="text-center">
                                        <span
                                          className={`text-[10px] font-semibold ${info.colorClass}`}
                                        >
                                          {info.role}
                                        </span>
                                        <div className="text-xs font-bold text-text-primary">
                                          {info.name}
                                        </div>
                                        <div className="text-[10px] text-text-secondary">
                                          {info.country}
                                        </div>
                                        {info.city && (
                                          <div className="text-[10px] text-text-secondary mt-1">
                                            {formatCoord(info.city.lat, 'lat')} /{' '}
                                            {formatCoord(info.city.lon, 'lon')}
                                          </div>
                                        )}
                                        <a
                                          href={info.wiki}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[10px] text-primary hover:text-cyan-300 transition-colors underline mt-1 inline-block"
                                        >
                                          Wikipedia
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
