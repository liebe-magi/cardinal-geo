import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cities } from '../cities';
import { regionLabels, type Region } from '../lib/regions';
import { fetchAllModeStats, fetchRatingRank, type ModeStats } from '../lib/supabaseApi';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';
import { RatingChart } from './RatingChart';

function getScoreColor(score: number): string {
  const clamped = Math.max(-10, Math.min(10, score));
  let hue: number;
  if (clamped <= 0) {
    const t = (clamped + 10) / 10;
    hue = 120 - t * 60;
  } else {
    const t = clamped / 10;
    hue = 60 - t * 60;
  }
  const norm = (clamped + 10) / 20;
  const saturation = 70 + norm * 15;
  const lightness = 45 + norm * 5;
  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
}

function getMarkerRadius(score: number): number {
  return Math.max(4, Math.min(18, 4 + Math.abs(score) * 1.5));
}

export function Profile() {
  const navigate = useNavigate();
  const { lang, t } = useSettingsStore();
  const formUrl = import.meta.env.VITE_CONTACT_FORM_URL;
  const { profile, signOut, updateProfile } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'stats' | 'weakness'>('stats');
  const [weaknessView, setWeaknessView] = useState<'map' | 'list'>('map');
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState(profile?.username || '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [stats, setStats] = useState<{
    survivalRated: ModeStats;
    survivalUnrated: ModeStats;
    challengeDaily: ModeStats;
    challengeUnrated: ModeStats;
    highestRating: number;
    totalRatedMatches: number;
  } | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  // Weakness data
  const scores = profile?.weakness_scores || {};
  const cityScores = cities
    .map((city) => ({
      city,
      score: scores[city.countryCode] || 0,
    }))
    .sort((a, b) => b.score - a.score);

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

  const handleCopyId = useCallback(async () => {
    if (!profile?.id) return;
    await navigator.clipboard.writeText(profile.id);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  }, [profile?.id]);

  const buildShareText = useCallback(() => {
    if (!profile) return '';
    const lines: string[] = ['🧭 Cardinal Geo', ''];
    lines.push(`⭐ Rating: ${Math.round(profile.modeRatings?.global?.rating ?? 1500)}`);
    if (rank) {
      const medal = rank.rank <= 3 ? ['🥇', '🥈', '🥉'][rank.rank - 1] : '📊';
      lines.push(`${medal} ${t.ui.ratingRank}: ${rank.rank} / ${rank.total}`);
    }
    if (stats) {
      lines.push('');
      lines.push(`⚔️ ${t.ui.statsSurvivalRated}: ${t.ui.statsBest} ${stats.survivalRated.best}`);
      lines.push(
        `🎯 ${t.ui.statsChallengeDaily}: ${t.ui.statsBest} ${stats.challengeDaily.best}/10 (${t.ui.statsAvg} ${stats.challengeDaily.avg})`,
      );
    }
    lines.push('');
    lines.push(`${window.location.origin}`);
    return lines.join('\n');
  }, [profile, rank, stats, t]);

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

  const initMap = useCallback(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      worldCopyJump: false,
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      maxBoundsViscosity: 1.0,
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      noWrap: true,
    }).addTo(map);

    for (const cs of cityScores) {
      const color = getScoreColor(cs.score);
      const radius = getMarkerRadius(cs.score);
      const name = lang === 'ja' ? cs.city.nameJp : cs.city.nameEn;
      const capital = lang === 'ja' ? cs.city.capitalJp : cs.city.capitalEn;

      L.circleMarker([cs.city.lat, cs.city.lon], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.6,
        weight: 1,
      })
        .addTo(map)
        .bindPopup(`<strong>${capital}</strong><br>${name}<br>${t.ui.weaknessScore}: ${cs.score}`);
    }

    mapInstance.current = map;
  }, [cityScores, lang, t.ui.weaknessScore]);

  useEffect(() => {
    let timeoutId: number;
    if (activeTab === 'weakness' && weaknessView === 'map') {
      // Need to wait for the DOM 'hidden' class to be removed
      timeoutId = window.setTimeout(() => {
        if (!mapInstance.current) {
          initMap();
        } else {
          mapInstance.current.invalidateSize();
        }
      }, 150);
    }
    return () => {
      clearTimeout(timeoutId);
      // Let's not completely destroy the map on unmount of the view unless component unmounts
      // but if we do, we need to handle it. Actually, unmounting the map on every tab switch
      // is causing the _leaflet_pos error if anims are running. Let's just invalidate size on show.
    };
  }, [activeTab, weaknessView, initMap]);

  // Clean up map only on full unmount
  useEffect(() => {
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  if (!profile) return null;

  const legendItems = [
    { color: 'hsl(120,70%,45%)', label: '≤-10' },
    { color: 'hsl(90,74%,46%)', label: '-5' },
    { color: 'hsl(60,78%,48%)', label: '0' },
    { color: 'hsl(42,80%,49%)', label: '3' },
    { color: 'hsl(24,83%,49%)', label: '6' },
    { color: 'hsl(0,85%,50%)', label: '≥10' },
  ];

  const globalRatingLabel = lang === 'ja' ? 'グローバルレーティング' : 'Global Rating';
  const modeRatingsLabel = lang === 'ja' ? 'モード別レーティング' : 'Mode Ratings';
  const performanceStatsLabel = lang === 'ja' ? 'パフォーマンス統計' : 'Performance Stats';

  const getModeDisplayLabel = (mode: string): string => {
    if (mode === 'starter_rated') return t.modes.starter;
    if (mode.endsWith('_rated')) {
      const region = mode.replace('_rated', '') as Region;
      if (region in regionLabels) {
        return regionLabels[region][lang];
      }
    }
    return mode;
  };

  return (
    <>
      <Header />
      <div className="glass-card mb-8 p-6 sm:p-8 animate-fade-in max-w-lg lg:max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-center mb-6 text-text-primary">
          📊 {t.ui.profile} & {t.ui.profileStats || 'Stats'}
        </h2>

        {/* Username Edit (Moved to top) */}
        <div className="mb-6">
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
              <span className="text-text-primary text-lg font-bold">
                {profile.username || '(no name)'}
              </span>
              <button
                onClick={() => {
                  setNewUsername(profile.username || '');
                  setEditing(true);
                }}
                className="text-primary text-xs cursor-pointer bg-transparent border-none hover:text-cyan-300 transition-colors font-medium px-2 py-1"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        {/* User ID Display */}
        <div className="mb-6">
          <label className="text-text-secondary text-xs mb-1.5 block uppercase tracking-wider font-medium">
            {(t.ui as any).userId || 'User ID'}
          </label>
          <div className="flex items-center justify-between bg-surface-light/40 border border-white/5 rounded-xl px-4 py-2.5">
            <span className="text-text-primary text-sm font-mono opacity-80 select-all truncate mr-3">
              {profile.id}
            </span>
            <button
              onClick={handleCopyId}
              disabled={idCopied}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 text-xs font-medium ${
                idCopied
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-surface-light/60 text-text-primary border-white/8 hover:bg-surface-hover hover:border-primary/30 cursor-pointer'
              }`}
            >
              {idCopied ? `✅ ${t.ui.copied}` : `📋 ${(t.ui as any).copyId || 'Copy'}`}
            </button>
          </div>
        </div>

        {/* Custom Dashboard Tabs */}
        <div className="flex bg-surface-light/40 p-1 rounded-xl mb-6">
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              activeTab === 'stats'
                ? 'bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.3)] text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.ui.profileStats || 'Stats'}
          </button>
          <button
            onClick={() => {
              setActiveTab('weakness');
              if (weaknessView === 'map' && mapInstance.current) {
                setTimeout(() => mapInstance.current?.invalidateSize(), 50);
              }
            }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              activeTab === 'weakness'
                ? 'bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.3)] text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.ui.weaknessCheck || 'Weakness'}
          </button>
        </div>

        {/* Tab 1: Stats */}
        <div className={activeTab === 'stats' ? 'block animate-fade-in' : 'hidden'}>
          {/* 1. Main Rating Block */}
          <div className="mb-6 p-6 sm:p-8 bg-surface-light/40 border border-primary/20 rounded-2xl text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-cyan-300/5 pointer-events-none" />
            <div className="absolute -top-10 -right-6 text-8xl opacity-10 pointer-events-none">
              🌐
            </div>
            <div className="relative flex flex-col items-center">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary uppercase tracking-[0.18em] border border-primary/25 mb-3">
                {globalRatingLabel}
              </span>
              <div className="text-5xl font-extrabold bg-gradient-to-r from-primary via-cyan-300 to-primary bg-clip-text text-transparent leading-none mb-2">
                {Math.round(profile.modeRatings?.['global']?.rating ?? 1500)}
              </div>
              <div className="text-xs text-text-secondary font-mono">
                RD: {Math.round(profile.modeRatings?.['global']?.rd ?? 350)} / Vol:{' '}
                {(profile.modeRatings?.['global']?.vol ?? 0.06).toFixed(4)}
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

          {/* Mode Ratings List */}
          {profile.modeRatings && Object.keys(profile.modeRatings).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-text-primary mb-3 uppercase tracking-wider">
                🎮 {modeRatingsLabel}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(profile.modeRatings)
                  .filter(([mode]) => mode !== 'global')
                  .map(([mode, ratingData]) => {
                    const displayMode = getModeDisplayLabel(mode);

                    return (
                      <div
                        key={mode}
                        className="bg-surface-light/40 border border-white/5 rounded-xl p-3 text-center"
                      >
                        <div className="text-xs text-text-secondary mb-1 font-medium capitalize">
                          {displayMode}
                        </div>
                        <div className="text-xl font-bold text-text-primary">
                          {Math.round(ratingData.rating)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Mode Stats */}
          {stats && (
            <div className="mb-6 space-y-3">
              <h3 className="text-sm font-bold text-text-primary mb-3 uppercase tracking-wider">
                📈 {performanceStatsLabel}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Highest Rating Box */}
                <div className="bg-surface-light/40 border border-white/5 rounded-xl p-4 text-center">
                  <div className="text-xs text-text-secondary mb-2 font-medium">
                    📈 {t.ui.highestRating || 'Highest Rating'}
                  </div>
                  <div className="text-2xl font-bold text-text-primary mb-1">
                    {Math.round(stats.highestRating)}
                  </div>
                  <div className="text-[10px] text-text-secondary uppercase tracking-wide">
                    {t.ui.rating}
                  </div>
                </div>

                {/* Survival Rated Box */}
                <div className="bg-surface-light/40 border border-white/5 rounded-xl p-4 text-center">
                  <div className="text-xs text-text-secondary mb-2 font-medium">
                    ⚔️ {t.ui.rankingSurvivalRated || 'Survival (Rated)'}
                  </div>
                  <div className="text-2xl font-bold text-text-primary mb-1">
                    {stats.survivalRated.best}
                  </div>
                  <div className="text-[10px] text-text-secondary uppercase tracking-wide">
                    {t.ui.statsBest}
                  </div>
                </div>

                {/* Total Rating Matches Box */}
                <div className="bg-surface-light/40 border border-white/5 rounded-xl p-4 text-center">
                  <div className="text-xs text-text-secondary mb-2 font-medium">
                    🎮 {t.ui.profilePlayCount || 'Rating Matches'}
                  </div>
                  <div className="text-2xl font-bold text-text-primary mb-1">
                    {stats.totalRatedMatches}
                  </div>
                  <div className="text-[10px] text-text-secondary uppercase tracking-wide">
                    {t.ui.statsPlays}
                  </div>
                </div>
              </div>

              <div className="bg-surface-light/40 border border-white/5 rounded-xl p-4">
                <div className="text-xs text-text-secondary font-medium w-full text-center mb-3">
                  🎯 {t.ui.rankingDailyChallenge || 'Daily Challenge'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-lg font-bold text-text-primary mb-0.5">
                      {stats.challengeDaily.best}
                    </div>
                    <div className="text-[10px] text-text-secondary uppercase">
                      {t.ui.statsBest}
                    </div>
                  </div>
                  <div className="text-center border-l border-r border-white/10">
                    <div className="text-lg font-bold text-text-primary mb-0.5">
                      {stats.challengeDaily.avg}
                    </div>
                    <div className="text-[10px] text-text-secondary uppercase">
                      {t.ui.rankingDailyAvg || 'Average'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-text-primary mb-0.5">
                      {stats.challengeDaily.count}
                    </div>
                    <div className="text-[10px] text-text-secondary uppercase">
                      {t.ui.statsPlays}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Rating History Chart */}
          <div className="mb-6 p-4 sm:p-5 bg-surface-light/40 border border-white/5 rounded-2xl">
            <div className="text-text-secondary text-xs mb-3 uppercase tracking-wider font-medium text-center">
              {t.ui.ratingHistory}
            </div>
            <RatingChart
              userId={profile.id}
              currentRating={profile.modeRatings?.global?.rating ?? 1500}
            />
          </div>
        </div>

        {/* Tab 2: Weakness */}
        <div className={activeTab === 'weakness' ? 'block animate-fade-in' : 'hidden'}>
          {/* Weakness Sub-tabs */}
          <div className="flex justify-center gap-2 mb-4">
            <button
              onClick={() => {
                setWeaknessView('map');
                if (mapInstance.current) {
                  setTimeout(() => mapInstance.current?.invalidateSize(), 50);
                }
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border ${
                weaknessView === 'map'
                  ? 'bg-primary/15 text-primary border-primary/25'
                  : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30'
              }`}
            >
              {t.ui.weaknessMap || 'Map'}
            </button>
            <button
              onClick={() => setWeaknessView('list')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border ${
                weaknessView === 'list'
                  ? 'bg-primary/15 text-primary border-primary/25'
                  : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30'
              }`}
            >
              {t.ui.weaknessList || 'List'}
            </button>
          </div>

          {/* Weakness Map View */}
          <div className={weaknessView === 'map' ? 'block animate-fade-in' : 'hidden'}>
            <div
              ref={mapRef}
              className="w-full h-64 md:h-[400px] rounded-xl overflow-hidden mb-4 border border-white/5"
            />
            <div className="flex flex-wrap gap-2.5 justify-center mb-6">
              {legendItems.map((item) => (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5 text-xs text-text-secondary"
                >
                  <span
                    className="w-3 h-3 rounded-full inline-block ring-1 ring-white/10"
                    style={{ background: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          {/* Weakness List View */}
          {weaknessView === 'list' && (
            <div className="animate-fade-in mb-6">
              <div className="max-h-[24rem] overflow-y-auto rounded-xl border border-white/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-text-secondary border-b border-white/8 bg-surface/95 backdrop-blur-sm sticky top-0 z-10">
                      <th className="text-left py-2.5 px-3 font-semibold">{t.ui.country}</th>
                      <th className="text-left py-2.5 px-3 font-semibold">{t.ui.capital}</th>
                      <th className="text-right py-2.5 px-3 font-semibold">{t.ui.weaknessScore}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cityScores.map((cs) => {
                      const name = lang === 'ja' ? cs.city.nameJp : cs.city.nameEn;
                      const capital = lang === 'ja' ? cs.city.capitalJp : cs.city.capitalEn;
                      const color = getScoreColor(cs.score);
                      return (
                        <tr
                          key={cs.city.countryCode}
                          className="border-b border-white/5 hover:bg-surface-light/20 transition-colors"
                        >
                          <td className="py-2 px-3 text-text-primary">{name}</td>
                          <td className="py-2 px-3 text-text-primary">{capital}</td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className="px-2.5 py-0.5 rounded-full text-xs font-bold border"
                              style={{ color, borderColor: color }}
                            >
                              {cs.score}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* General Footer Actions */}
        <div className="space-y-3 mt-6">
          <button
            onClick={handleShare}
            className="w-full py-3 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 cursor-pointer transition-all duration-200 font-semibold"
          >
            {copied ? `✅ ${t.ui.copied}` : `📤 ${t.ui.shareProfile}`}
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-xl bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200 font-medium"
          >
            {t.ui.backToTop}
          </button>

          <div className="pt-4 flex flex-col items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-text-secondary/60">
              <Link to="/about" className="hover:text-text-primary transition-colors">
                {t.ui.about}
              </Link>
              <span>|</span>
              <Link to="/privacy" className="hover:text-text-primary transition-colors">
                {t.ui.privacyPolicy}
              </Link>
              {formUrl && (
                <>
                  <span>|</span>
                  <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-text-primary transition-colors"
                  >
                    {t.ui.contact}
                  </a>
                </>
              )}
            </div>

            <button
              onClick={handleSignOut}
              className="px-4 py-2 rounded-lg text-text-secondary/60 hover:text-error hover:bg-error/10 cursor-pointer transition-all duration-200 text-xs font-medium"
            >
              {t.ui.signOut}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
