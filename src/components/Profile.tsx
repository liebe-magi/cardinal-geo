import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllModeStats, fetchRatingRank, type ModeStats } from '../lib/supabaseApi';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';
import { RatingChart } from './RatingChart';

export function Profile() {
  const navigate = useNavigate();
  const { t } = useSettingsStore();
  const { profile, signOut, updateProfile, isAuthenticated } = useAuthStore();

  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState(profile?.username || '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [stats, setStats] = useState<{
    survivalRated: ModeStats;
    survivalUnrated: ModeStats;
    challengeDaily: ModeStats;
    challengeUnrated: ModeStats;
  } | null>(null);

  if (!isAuthenticated || !profile) {
    navigate('/login', { replace: true });
    return null;
  }

  useEffect(() => {
    if (profile?.id) {
      fetchRatingRank(profile.id).then(setRank);
      fetchAllModeStats(profile.id).then(setStats);
    }
  }, [profile?.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ username: newUsername });
      setEditing(false);
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const buildShareText = useCallback(() => {
    const lines: string[] = ['🧭 Cardinal Geo', ''];
    lines.push(`⭐ Rating: ${Math.round(profile.rating)}`);
    if (rank) {
      const medal = rank.rank <= 3 ? ['🥇', '🥈', '🥉'][rank.rank - 1] : '📊';
      lines.push(`${medal} ${t.ui.ratingRank}: ${rank.rank} / ${rank.total}`);
    }
    if (stats) {
      lines.push('');
      lines.push(`⚔️ ${t.ui.statsSurvivalRated}: ${t.ui.statsBest} ${stats.survivalRated.best}`);
      lines.push(
        `⚔️ ${t.ui.statsSurvivalUnrated}: ${t.ui.statsBest} ${stats.survivalUnrated.best}`,
      );
      lines.push(
        `🎯 ${t.ui.statsChallengeDaily}: ${t.ui.statsBest} ${stats.challengeDaily.best}/10 (${t.ui.statsAvg} ${stats.challengeDaily.avg})`,
      );
      lines.push(
        `🎯 ${t.ui.statsChallengeUnrated}: ${t.ui.statsBest} ${stats.challengeUnrated.best}/10 (${t.ui.statsAvg} ${stats.challengeUnrated.avg})`,
      );
    }
    lines.push('');
    lines.push(`${window.location.origin}`);
    return lines.join('\n');
  }, [profile.rating, rank, stats, t]);

  const handleShare = useCallback(async () => {
    const text = buildShareText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildShareText]);

  return (
    <>
      <Header />
      <div className="glass-card p-5 sm:p-8 animate-fade-in max-w-lg lg:max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-center mb-6 text-text-primary">{t.ui.profile}</h2>

        {/* Rating */}
        <div className="mb-6 p-6 sm:p-8 bg-surface-light/40 border border-white/5 rounded-2xl text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
          <div className="relative">
            <div className="text-text-secondary text-sm mb-2 uppercase tracking-wider font-medium">
              {t.ui.rating}
            </div>
            <div className="text-5xl font-extrabold bg-gradient-to-r from-primary via-cyan-300 to-primary bg-clip-text text-transparent mb-2">
              {Math.round(profile.rating)}
            </div>
            <div className="text-xs text-text-secondary font-mono">
              RD: {Math.round(profile.rd)} / Vol: {profile.vol.toFixed(4)}
            </div>
            {rank && (
              <div className="text-sm text-text-secondary mt-2 font-semibold">
                {rank.rank <= 3 ? ['🥇', '🥈', '🥉'][rank.rank - 1] : '📊'} {t.ui.ratingRank}:{' '}
                {rank.rank} / {rank.total}
              </div>
            )}
          </div>
        </div>

        {/* Rating History Chart */}
        <div className="mb-6 p-4 sm:p-5 bg-surface-light/40 border border-white/5 rounded-2xl">
          <div className="text-text-secondary text-xs mb-3 uppercase tracking-wider font-medium text-center">
            {t.ui.ratingHistory}
          </div>
          <RatingChart userId={profile.id} currentRating={profile.rating} />
        </div>

        {/* Username */}
        <div className="mb-5">
          <label className="text-text-secondary text-xs mb-1.5 block uppercase tracking-wider font-medium">
            {t.ui.username}
          </label>
          {editing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface-light/60 border border-white/8 text-text-primary focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all duration-200"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-glow px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {saving ? '...' : t.ui.confirm}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-surface-light/40 border border-white/5 rounded-xl px-4 py-2.5">
              <span className="text-text-primary font-semibold">
                {profile.username || '(no name)'}
              </span>
              <button
                onClick={() => {
                  setNewUsername(profile.username || '');
                  setEditing(true);
                }}
                className="text-primary text-xs cursor-pointer bg-transparent border-none hover:text-cyan-300 transition-colors font-medium"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Mode Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {/* Survival Rated */}
            <div className="bg-surface-light/40 border border-white/5 rounded-xl p-4 text-center">
              <div className="text-xs text-text-secondary mb-2 font-medium">
                ⚔️ {t.ui.statsSurvivalRated}
              </div>
              <div className="text-2xl font-bold text-text-primary mb-1">
                {stats.survivalRated.best}
              </div>
              <div className="text-[10px] text-text-secondary">{t.ui.statsBest}</div>
            </div>
            {/* Survival Unrated */}
            <div className="bg-surface-light/40 border border-white/5 rounded-xl p-4 text-center">
              <div className="text-xs text-text-secondary mb-2 font-medium">
                ⚔️ {t.ui.statsSurvivalUnrated}
              </div>
              <div className="text-2xl font-bold text-text-primary mb-1">
                {stats.survivalUnrated.best}
              </div>
              <div className="text-[10px] text-text-secondary">{t.ui.statsBest}</div>
            </div>
            {/* Challenge Daily */}
            <div className="bg-surface-light/40 border border-white/5 rounded-xl p-4 text-center">
              <div className="text-xs text-text-secondary mb-2 font-medium">
                🎯 {t.ui.statsChallengeDaily}
              </div>
              <div className="text-2xl font-bold text-text-primary mb-1">
                {stats.challengeDaily.best}
                <span className="text-sm font-normal text-text-secondary">/10</span>
              </div>
              <div className="text-[10px] text-text-secondary">
                {t.ui.statsAvg}: {stats.challengeDaily.avg} · {t.ui.statsPlays}:{' '}
                {stats.challengeDaily.count}
              </div>
            </div>
            {/* Challenge Unrated */}
            <div className="bg-surface-light/40 border border-white/5 rounded-xl p-4 text-center">
              <div className="text-xs text-text-secondary mb-2 font-medium">
                🎯 {t.ui.statsChallengeUnrated}
              </div>
              <div className="text-2xl font-bold text-text-primary mb-1">
                {stats.challengeUnrated.best}
                <span className="text-sm font-normal text-text-secondary">/10</span>
              </div>
              <div className="text-[10px] text-text-secondary">
                {t.ui.statsAvg}: {stats.challengeUnrated.avg} · {t.ui.statsPlays}:{' '}
                {stats.challengeUnrated.count}
              </div>
            </div>
          </div>
        )}

        {/* Share */}
        <button
          onClick={handleShare}
          className="w-full py-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 cursor-pointer transition-all duration-200 font-semibold mb-2"
        >
          {copied ? `✅ ${t.ui.copied}` : `📤 ${t.ui.shareProfile}`}
        </button>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full py-2.5 rounded-xl bg-error/10 text-error border border-error/20 hover:bg-error/20 cursor-pointer transition-all duration-200 font-semibold mb-2"
        >
          {t.ui.signOut}
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
