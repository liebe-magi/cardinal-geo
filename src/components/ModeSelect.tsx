import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { regionLabels, type Region } from '../lib/regions';
import { getUTCDateString } from '../lib/seededRandom';
import { fetchAllModeStats, fetchRatingRank, getDailyProgress } from '../lib/supabaseApi';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { GameMode, GameSubMode } from '../types/game';
import { Header } from './Header';

export function ModeSelect() {
  const { t, lang } = useSettingsStore();
  const { isAuthenticated, profile, user } = useAuthStore();
  const startGame = useGameStore((s) => s.startGame);
  const pendingSettledCount = useGameStore((s) => s.pendingSettledCount);
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [dailyStatus, setDailyStatus] = useState<'available' | 'in_progress' | 'completed'>(
    'available',
  );
  const [dailyScore, setDailyScore] = useState<number | null>(null);
  const [dailyAvg, setDailyAvg] = useState<number | null>(null);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [countdown, setCountdown] = useState('');

  // Redirect new users to username setup
  useEffect(() => {
    if (!isAuthenticated || !profile) return;
    const setupDone = localStorage.getItem(`setupDone_${profile.id}`);
    if (setupDone) return;
    // Detect auto-generated username: "Player_" prefix (email) or matching Google display name
    const isAutoName =
      profile.username.startsWith('Player_') ||
      (user?.user_metadata?.full_name && profile.username === user.user_metadata.full_name) ||
      (user?.user_metadata?.name && profile.username === user.user_metadata.name);
    if (isAutoName) {
      navigate('/setup', { replace: true });
    }
  }, [isAuthenticated, profile, user, navigate]);

  // Check daily challenge status & fetch rank
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    (async () => {
      const [progress, rankData, stats] = await Promise.all([
        getDailyProgress(getUTCDateString()),
        fetchRatingRank(user.id),
        fetchAllModeStats(user.id),
      ]);
      if (progress) {
        setDailyStatus(progress.status === 'completed' ? 'completed' : 'in_progress');
        if (progress.status === 'completed') {
          setDailyScore(progress.score);
        }
      } else {
        setDailyStatus('available');
      }
      setRank(rankData);
      if (stats) setDailyAvg(stats.challengeDaily.avg);
    })();
  }, [isAuthenticated, user]);

  // Compute local reset time and timezone abbreviation (UTC 0:00 in user's timezone)
  const { localTime, tzAbbr } = useMemo(() => {
    const utcMidnight = new Date();
    utcMidnight.setUTCHours(0, 0, 0, 0);
    if (utcMidnight.getTime() <= Date.now()) {
      utcMidnight.setUTCDate(utcMidnight.getUTCDate() + 1);
    }
    const localTime = utcMidnight.toLocaleTimeString(lang, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    // Extract timezone abbreviation (e.g. "JST", "EST")
    const tzAbbr =
      new Intl.DateTimeFormat(lang, { timeZoneName: 'short' })
        .formatToParts(utcMidnight)
        .find((p) => p.type === 'timeZoneName')?.value ?? 'local';
    return { localTime, tzAbbr };
  }, [lang]);

  // Format remaining milliseconds as HH:MM:SS
  const formatCountdown = useCallback((ms: number): string => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, []);

  // Live countdown to next UTC midnight
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setUTCHours(24, 0, 0, 0);
      setCountdown(formatCountdown(nextMidnight.getTime() - now.getTime()));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [formatCountdown]);

  const handleStart = async (mode: GameMode, subMode: GameSubMode) => {
    if (subMode === 'rated' && !isAuthenticated) {
      navigate('/login');
      return;
    }
    if (mode === 'challenge' && subMode === 'rated' && dailyStatus === 'completed') {
      return; // Already played today
    }
    setIsStarting(true);
    await startGame(mode, subMode);
    setIsStarting(false);
    navigate('/quiz');
  };

  const getModeRating = (modeKey: 'global' | 'starter_rated' | `${Region}_rated`): number => {
    if (!profile) return 1500;
    if (modeKey === 'global') {
      return Math.round(profile.modeRatings?.global?.rating ?? profile.rating ?? 1500);
    }
    return Math.round(profile.modeRatings?.[modeKey]?.rating ?? 1500);
  };

  return (
    <>
      <Header />
      <div className="animate-fade-in space-y-5">
        {/* Hero rating card */}
        {isAuthenticated && profile && (
          <div className="glass-card mb-8 p-6 sm:p-8 relative overflow-hidden border border-primary/20">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-cyan-300/5 pointer-events-none" />
            <div className="absolute -top-10 -right-6 text-8xl opacity-10 pointer-events-none">
              🌐
            </div>
            <div className="relative flex flex-col items-center text-center">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary uppercase tracking-[0.18em] border border-primary/25 mb-3">
                Global Rating
              </span>
              <div className="text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-primary via-cyan-300 to-primary bg-clip-text text-transparent leading-none">
                {Math.round(profile.modeRatings?.global?.rating ?? profile.rating)}
              </div>
              {rank && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-light/60 border border-white/10 text-xs sm:text-sm text-text-secondary font-semibold">
                  <span>{rank.rank <= 3 ? ['🥇', '🥈', '🥉'][rank.rank - 1] : '📊'}</span>
                  <span>
                    {t.ui.ratingRank}: {rank.rank} / {rank.total}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pending settlement notice */}
        {pendingSettledCount > 0 && (
          <div className="p-3 bg-warning/10 border border-warning/20 text-warning rounded-xl text-sm flex items-center gap-2">
            <span className="text-lg">⚠</span>
            <span>
              {t.ui.pendingSettlement}: {pendingSettledCount} {t.ui.pendingLosses}
            </span>
          </div>
        )}

        {/* Loading overlay */}
        {isStarting && (
          <div className="fixed inset-0 bg-bg/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass-card p-8 text-center">
              <div className="animate-pulse text-primary text-lg font-medium">{t.ui.loading}</div>
            </div>
          </div>
        )}

        {/* Game Modes Stack */}
        <div className="space-y-4">
          {/* Survival Mode Card */}
          <button
            onClick={() => handleStart('survival', 'rated')}
            className={`w-full text-left relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all duration-300 group ${
              isAuthenticated
                ? 'bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/30 hover:border-primary/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.2)] hover:-translate-y-1 cursor-pointer'
                : 'bg-surface-light/30 border border-white/5 cursor-not-allowed opacity-70'
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
              <span className="text-8xl">⚔️</span>
            </div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">⚔️</span>
                <h3 className="text-text-primary text-xl font-bold">{t.modes.survival}</h3>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary uppercase tracking-widest border border-primary/30">
                  Rated
                </span>
              </div>
              <p className="text-text-secondary text-sm mb-4 leading-relaxed max-w-[85%]">
                {t.modeDesc.survival}
              </p>

              <div className="mt-auto flex items-center gap-4">
                {isAuthenticated && profile ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/20 border border-white/10 text-sm">
                    <span className="text-accent">🏆</span>
                    <span className="text-text-secondary">{t.ui.highScore}:</span>
                    <span className="font-bold text-text-primary">
                      {profile.best_score_survival_rated ?? 0}
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error/10 border border-error/20 text-error text-sm font-medium">
                    🔒 {t.ui.loginRequired}
                  </div>
                )}
              </div>
            </div>
          </button>

          {/* Daily Challenge Card */}
          <button
            onClick={async () => {
              if (dailyStatus === 'completed') {
                const success = await useGameStore.getState().reviewDailyResult();
                if (success) {
                  navigate('/result/final', { replace: true });
                }
              } else {
                handleStart('challenge', 'rated');
              }
            }}
            disabled={!isAuthenticated && dailyStatus === 'completed'} // Only disabled if not authenticated
            className={`w-full text-left relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all duration-300 group ${
              dailyStatus === 'completed'
                ? 'bg-surface-light/30 border border-white/10 hover:border-white/20 hover:bg-surface-light/40 hover:-translate-y-1 cursor-pointer'
                : isAuthenticated
                  ? 'bg-gradient-to-br from-secondary/20 via-secondary/5 to-transparent border border-secondary/30 hover:border-secondary/50 hover:shadow-[0_0_25px_rgba(236,72,153,0.2)] hover:-translate-y-1 cursor-pointer'
                  : 'bg-surface-light/30 border border-white/5 cursor-not-allowed opacity-70'
            }`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
              <span className="text-8xl">🎯</span>
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🎯</span>
                <h3 className="text-text-primary text-xl font-bold">{t.modes.challenge}</h3>
                <div className="ml-auto flex items-center gap-2">
                  {isAuthenticated && dailyStatus === 'completed' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/20 text-success uppercase tracking-widest border border-success/30 flex items-center gap-1">
                      <span className="text-[10px]">✅</span>
                      Played
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary/20 text-secondary uppercase tracking-widest border border-secondary/30">
                    Rated
                  </span>
                </div>
              </div>
              <p className="text-text-secondary text-sm mb-4 leading-relaxed max-w-[85%]">
                {t.modeDesc.challenge}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                {isAuthenticated ? (
                  <div className="flex items-center gap-3">
                    {dailyStatus === 'completed' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/20 border border-white/10 text-sm">
                          <span className="text-secondary">🏆</span>
                          <span className="text-text-secondary">{t.ui.score}:</span>
                          <span className="font-bold text-text-primary text-base">
                            {dailyScore}/10
                          </span>
                        </div>
                        {dailyAvg !== null && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/20 border border-white/10 text-xs shadow-inner">
                            <span className="text-text-secondary">
                              {t.ui.avgScore || 'Average'}:
                            </span>
                            <span className="font-bold text-text-primary">
                              {dailyAvg.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${
                          dailyStatus === 'in_progress'
                            ? 'bg-warning/10 border-warning/20 text-warning'
                            : 'bg-black/20 border-white/10 text-text-primary'
                        }`}
                      >
                        {dailyStatus === 'in_progress'
                          ? `▶ ${t.ui.resumeChallenge}`
                          : '▶ 今日の課題に挑戦'}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error/10 border border-error/20 text-error text-sm font-medium">
                    🔒 {t.ui.loginRequired}
                  </div>
                )}

                {/* Timer directly in the button footer */}
                <div className="text-right text-xs text-text-secondary opacity-80">
                  <div>
                    {t.ui.dailyResetTime.replace('{tz}', tzAbbr).replace('{time}', localTime)}
                  </div>
                  <div className="font-mono mt-0.5 font-semibold text-secondary/90">
                    🔄 {countdown}
                  </div>
                </div>
              </div>
            </div>
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Starter Mode */}
            <button
              onClick={() => handleStart('starter', 'rated')}
              className={`w-full text-left relative overflow-hidden rounded-2xl p-5 transition-all duration-300 group ${
                isAuthenticated
                  ? 'bg-gradient-to-br from-accent/15 via-accent/5 to-transparent border border-accent/20 hover:border-accent/40 hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] hover:-translate-y-1 cursor-pointer'
                  : 'bg-surface-light/30 border border-white/5 cursor-not-allowed opacity-70'
              }`}
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none">
                <span className="text-[6rem] leading-none">🌟</span>
              </div>
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🌟</span>
                  <span className="text-text-primary text-lg font-bold text-accent">
                    {t.modes.starter}
                  </span>
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent/20 text-accent uppercase tracking-widest border border-accent/30">
                    Rated
                  </span>
                </div>
                <p className="text-text-secondary text-sm leading-relaxed mb-3">
                  {t.modeDesc.starter}
                </p>
                {isAuthenticated && profile && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/20 border border-white/10 text-sm mt-auto w-fit">
                    <span className="text-accent">🏅</span>
                    <span className="text-text-secondary">{t.modes.starter}:</span>
                    <span className="font-bold text-text-primary">
                      {getModeRating('starter_rated')}
                    </span>
                  </div>
                )}
                {!isAuthenticated && (
                  <div className="text-xs text-error font-medium mt-auto">
                    🔒 {t.ui.loginRequired}
                  </div>
                )}
              </div>
            </button>

            {/* Learning Mode */}
            <button
              onClick={() => isAuthenticated && handleStart('learning', 'unrated')}
              className={`w-full text-left relative overflow-hidden rounded-2xl p-5 transition-all duration-300 group ${
                isAuthenticated
                  ? 'bg-surface-light/40 border border-white/10 hover:border-white/20 hover:bg-surface-light/60 hover:-translate-y-1 cursor-pointer'
                  : 'bg-surface-light/20 border border-white/5 cursor-not-allowed opacity-70'
              }`}
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none">
                <span className="text-[6rem] leading-none">📚</span>
              </div>
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📚</span>
                  <span className="text-text-primary text-lg font-bold">{t.modes.learning}</span>
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-surface-light/80 text-text-secondary uppercase tracking-widest border border-white/10">
                    Practice
                  </span>
                </div>
                <p className="text-text-secondary text-sm leading-relaxed mb-3">
                  {t.modeDesc.learning}
                </p>
                {!isAuthenticated && (
                  <div className="text-xs text-error font-medium mt-auto">
                    🔒 {t.ui.loginRequired}
                  </div>
                )}
              </div>
            </button>
          </div>

          {/* Region Mode */}
          <div className="glass-card p-5 border border-white/10 rounded-2xl relative overflow-hidden group">
            <div className="absolute -top-4 -right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none">
              <span className="text-[8rem] leading-none">🌍</span>
            </div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">🌍</span>
                <h3 className="text-text-primary text-lg font-bold">{t.modes.region}</h3>
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary uppercase tracking-widest border border-primary/30">
                  Rated
                </span>
              </div>
              <p className="text-text-secondary text-sm mb-4 leading-relaxed">
                {t.modeDesc.region}
              </p>

              {!isAuthenticated ? (
                <div className="p-4 rounded-xl bg-error/5 border border-error/10 text-error text-sm font-medium text-center">
                  🔒 {t.ui.loginRequired}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(regionLabels) as Region[]).map((region) => (
                    <button
                      key={region}
                      onClick={() => handleStart(region as GameMode, 'rated')}
                      className="p-3 rounded-xl font-semibold text-xs sm:text-sm bg-black/20 text-text-primary border border-white/10 hover:border-primary/40 hover:bg-primary/5 hover:text-primary cursor-pointer transition-all duration-200 text-center"
                    >
                      <div>{regionLabels[region][lang]}</div>
                      <div className="text-[10px] mt-1 opacity-80">
                        🏅 {getModeRating(`${region}_rated`)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex flex-col gap-4 pt-1 mt-4">
          {/* Main Ranking Button */}
          <button
            onClick={() => navigate('/ranking')}
            className="group relative w-full flex items-center justify-between px-5 sm:px-6 py-4 rounded-2xl bg-gradient-to-br from-accent/20 via-surface-light/40 to-surface-light/10 border border-accent/30 hover:border-accent/60 cursor-pointer transition-all duration-300 overflow-hidden hover:shadow-[0_0_30px_rgba(251,191,36,0.15)] hover:-translate-y-0.5"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/5 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="flex items-center gap-4 relative z-10 w-full">
              <div className="w-12 h-12 shrink-0 rounded-full bg-accent/20 flex items-center justify-center text-2xl border border-accent/30 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                👑
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="text-accent-light font-bold text-base sm:text-lg tracking-wide group-hover:text-accent transition-colors truncate">
                  {t.ui.ranking || 'ランキング'}
                </div>
                <div className="text-accent/70 text-[10px] sm:text-xs font-semibold mt-0.5 uppercase tracking-wider truncate">
                  Global Leaderboard
                </div>
              </div>
            </div>
            <div className="text-accent/50 group-hover:text-accent group-hover:translate-x-1 transition-all duration-300 relative z-10 ml-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          </button>

          {/* Stats & Profile Row */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* Global Stats Button */}
            <button
              onClick={() => navigate('/stats')}
              className="group relative flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-br from-blue-500/10 to-surface-light/20 border border-blue-500/20 hover:border-blue-400/50 cursor-pointer transition-all duration-300 overflow-hidden hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] hover:-translate-y-0.5"
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-blue-500/20 flex items-center justify-center text-xl border border-blue-500/30 group-hover:scale-110 transition-transform duration-300">
                🌍
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="text-blue-100 font-bold text-sm sm:text-base group-hover:text-blue-300 transition-colors truncate">
                  {t.ui.globalStats || '全体統計'}
                </div>
                <div className="text-blue-400/60 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold mt-0.5 truncate">
                  Analytics
                </div>
              </div>
            </button>

            {/* Profile Button */}
            <button
              onClick={() => (isAuthenticated ? navigate('/profile') : navigate('/login'))}
              className={`group relative flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-300 overflow-hidden ${
                isAuthenticated
                  ? 'bg-gradient-to-br from-emerald-500/10 to-surface-light/20 border-emerald-500/20 hover:border-emerald-400/50 cursor-pointer hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:-translate-y-0.5'
                  : 'bg-surface-light/20 border-white/5 opacity-70 cursor-not-allowed hover:bg-surface-light/30'
              }`}
            >
              <div
                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xl border transition-transform duration-300 ${
                  isAuthenticated
                    ? 'bg-emerald-500/20 border-emerald-500/30 group-hover:scale-110'
                    : 'bg-white/5 border-white/10 grayscale'
                }`}
              >
                {isAuthenticated ? '👤' : '🔒'}
              </div>
              <div className="text-left flex-1 min-w-0">
                <div
                  className={`font-bold text-sm sm:text-base transition-colors truncate ${
                    isAuthenticated
                      ? 'text-emerald-100 group-hover:text-emerald-300'
                      : 'text-text-secondary'
                  }`}
                >
                  {t.ui.profile || 'マイデータ'}
                </div>
                <div
                  className={`text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold mt-0.5 truncate ${
                    isAuthenticated ? 'text-emerald-400/60' : 'text-white/20'
                  }`}
                >
                  My Profile
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
