import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUTCDateString } from '../lib/seededRandom';
import { fetchRatingRank, getChallengeUnratedAvgScore, getDailyProgress } from '../lib/supabaseApi';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { GameMode, GameSubMode } from '../types/game';
import { Header } from './Header';

export function ModeSelect() {
  const { t } = useSettingsStore();
  const { isAuthenticated, profile, user } = useAuthStore();
  const startGame = useGameStore((s) => s.startGame);
  const pendingSettledCount = useGameStore((s) => s.pendingSettledCount);
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [dailyStatus, setDailyStatus] = useState<'available' | 'in_progress' | 'completed'>(
    'available',
  );
  const [challengeUnratedAvg, setChallengeUnratedAvg] = useState<string | null>(null);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);

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

  // Check daily challenge status & fetch challenge unrated avg & rank
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    (async () => {
      const [progress, avg, rankData] = await Promise.all([
        getDailyProgress(getUTCDateString()),
        getChallengeUnratedAvgScore(user.id),
        fetchRatingRank(user.id),
      ]);
      if (progress) {
        setDailyStatus(progress.status === 'completed' ? 'completed' : 'in_progress');
      } else {
        setDailyStatus('available');
      }
      setChallengeUnratedAvg(avg !== null ? avg.toFixed(1) : null);
      setRank(rankData);
    })();
  }, [isAuthenticated, user]);

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

  return (
    <>
      <Header />
      <div className="animate-fade-in space-y-5">
        {/* Hero rating card */}
        {isAuthenticated && profile && (
          <div className="glass-card p-6 sm:p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
            <div className="relative">
              <div className="text-text-secondary text-sm mb-2 tracking-wider uppercase font-medium">
                {t.ui.rating}
              </div>
              <div className="text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-primary via-cyan-300 to-primary bg-clip-text text-transparent">
                {Math.round(profile.rating)}
              </div>
              {rank && (
                <div className="text-sm text-text-secondary mt-2 font-semibold">
                  {rank.rank <= 3 ? ['🥇', '🥈', '🥉'][rank.rank - 1] : '📊'} {t.ui.ratingRank}:{' '}
                  {rank.rank} / {rank.total}
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

        {/* Game Modes Grid — responsive: stacked on mobile, side-by-side on PC */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Survival Mode Card */}
          <div className="glass-card p-5 hover-lift">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">⚔️</span>
              <h3 className="text-text-primary text-base font-bold">{t.modes.survival}</h3>
            </div>
            <p className="text-text-secondary text-xs mb-4 leading-relaxed">
              {t.modeDesc.survival}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleStart('survival', 'rated')}
                className={`group relative p-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  isAuthenticated
                    ? 'bg-gradient-to-br from-primary/15 to-primary/5 text-primary border border-primary/20 hover:border-primary/40 hover:shadow-[0_0_16px_rgba(34,211,238,0.1)] cursor-pointer'
                    : 'bg-surface-light/50 text-text-secondary border border-white/5 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="font-bold">{t.subModes.rated}</div>
                <div className="text-xs mt-1 opacity-50">{t.modeDesc.survival_rated}</div>
                {isAuthenticated && profile && (
                  <div className="text-xs mt-1.5 opacity-60">
                    🏆 {t.ui.highScore}: {profile.best_score_survival_rated ?? 0}
                  </div>
                )}
                {!isAuthenticated && (
                  <div className="text-xs mt-1.5 opacity-70">🔒 {t.ui.loginRequired}</div>
                )}
              </button>
              <button
                onClick={() => handleStart('survival', 'unrated')}
                className="group p-4 rounded-xl font-semibold text-sm bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200"
              >
                <div className="font-bold">{t.subModes.unrated}</div>
                <div className="text-xs mt-1 opacity-50">{t.modeDesc.survival_unrated}</div>
                {isAuthenticated && profile && (
                  <div className="text-xs mt-1.5 opacity-60">
                    🏆 {t.ui.highScore}: {profile.best_score_survival_unrated ?? 0}
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Challenge Mode Card */}
          <div className="glass-card p-5 hover-lift">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🎯</span>
              <h3 className="text-text-primary text-base font-bold">{t.modes.challenge}</h3>
            </div>
            <p className="text-text-secondary text-xs mb-4 leading-relaxed">
              {t.modeDesc.challenge}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleStart('challenge', 'rated')}
                disabled={dailyStatus === 'completed'}
                className={`group p-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  dailyStatus === 'completed'
                    ? 'bg-surface-light/30 text-text-secondary border border-white/5 cursor-not-allowed opacity-50'
                    : isAuthenticated
                      ? 'bg-gradient-to-br from-primary/15 to-primary/5 text-primary border border-primary/20 hover:border-primary/40 hover:shadow-[0_0_16px_rgba(34,211,238,0.1)] cursor-pointer'
                      : 'bg-surface-light/50 text-text-secondary border border-white/5 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="font-bold">{t.subModes.daily}</div>
                <div className="text-xs mt-1 opacity-50">{t.modeDesc.challenge_daily}</div>
                <div className="text-xs mt-1.5 opacity-70">
                  {dailyStatus === 'completed'
                    ? `✅ ${t.ui.alreadyPlayedToday}`
                    : dailyStatus === 'in_progress'
                      ? `▶ ${t.ui.resumeChallenge}`
                      : ''}
                </div>
                {!isAuthenticated && (
                  <div className="text-xs mt-1 opacity-70">🔒 {t.ui.loginRequired}</div>
                )}
              </button>
              <button
                onClick={() => handleStart('challenge', 'unrated')}
                className="group p-4 rounded-xl font-semibold text-sm bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200"
              >
                <div className="font-bold">{t.subModes.tenQs}</div>
                <div className="text-xs mt-1 opacity-50">{t.modeDesc.challenge_unrated}</div>
                {isAuthenticated && (
                  <div className="text-xs mt-1.5 opacity-60">
                    📈 {t.ui.avgScore}: {challengeUnratedAvg !== null ? challengeUnratedAvg : '-'}
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Learning Mode */}
        <button
          onClick={() => isAuthenticated && handleStart('learning', 'unrated')}
          className={`glass-card w-full p-5 text-left transition-all duration-200 group ${
            isAuthenticated ? 'hover-lift cursor-pointer' : 'cursor-not-allowed opacity-60'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📚</span>
            <span className="text-text-primary text-base font-bold">{t.modes.learning}</span>
          </div>
          <p className="text-text-secondary text-xs leading-relaxed m-0">{t.modeDesc.learning}</p>
          {!isAuthenticated && (
            <div className="text-xs mt-1.5 opacity-70">🔒 {t.ui.loginRequired}</div>
          )}
        </button>

        {/* Footer buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={() => navigate('/ranking')}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm bg-gradient-to-r from-accent/15 to-accent/5 text-accent border border-accent/20 hover:border-accent/40 hover:shadow-[0_0_16px_rgba(251,191,36,0.1)] cursor-pointer transition-all duration-200 font-semibold"
          >
            <span>👑</span>
            {t.ui.ranking}
          </button>
          <button
            onClick={() => (isAuthenticated ? navigate('/weakness') : navigate('/login'))}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm transition-all duration-200 font-medium ${
              isAuthenticated
                ? 'bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer'
                : 'bg-surface-light/30 text-text-secondary border border-white/5 cursor-not-allowed opacity-60'
            }`}
          >
            <span>{isAuthenticated ? '📊' : '🔒'}</span>
            {t.ui.weaknessCheck}
          </button>
        </div>
      </div>
    </>
  );
}
