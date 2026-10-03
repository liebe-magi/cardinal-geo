import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { regionLabels } from '../../lib/regions';
import { getLeaderboard, type RankingTab, type RankingEntry } from '../../lib/statisticsApi';
import { useSettingsStore } from '../../stores/settingsStore';
import { Header } from '../Header';

export function Ranking() {
  const navigate = useNavigate();
  const { t, lang } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<RankingTab>('rating');
  const [ratingMode, setRatingMode] = useState<string>('global');
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));

  const fetchRanking = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLeaderboard(activeTab, ratingMode, dailyDate);
      setEntries(data);
    } catch (err) {
      console.error('Error fetching ranking:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, ratingMode, dailyDate, lang]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  const tabs: { key: RankingTab; label: string }[] = [
    { key: 'rating', label: t.ui.rankingRating },
    { key: 'survival_rated', label: t.ui.rankingSurvivalRated || '連続正解数' },
    { key: 'daily', label: t.ui.rankingDailyChallenge || 'デイリーチャレンジ' },
    { key: 'daily_avg', label: t.ui.rankingDailyAvg || 'デイリー平均' },
  ];

  const ratingModes = [
    { key: 'global', label: 'Global' },
    { key: 'starter_rated', label: t.modes.starter },
    { key: 'asia_rated', label: regionLabels.asia[lang] },
    { key: 'europe_rated', label: regionLabels.europe[lang] },
    { key: 'africa_rated', label: regionLabels.africa[lang] },
    { key: 'americas_rated', label: regionLabels.americas[lang] },
    { key: 'oceania_rated', label: regionLabels.oceania[lang] },
  ];

  const changeDay = (delta: number) => {
    const d = new Date(dailyDate);
    d.setDate(d.getDate() + delta);
    const now = new Date();
    if (d > now) return;
    setDailyDate(d.toISOString().slice(0, 10));
  };

  return (
    <>
      <Header />
      <div className="glass-card mb-8 p-5 sm:p-8 animate-fade-in">
        <h2 className="text-xl font-bold text-center mb-5 text-text-primary">👑 {t.ui.ranking}</h2>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border ${
                activeTab === tab.key
                  ? 'bg-primary/15 text-primary border-primary/25'
                  : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Rating Mode Selector */}
        {activeTab === 'rating' && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {ratingModes.map((mode) => (
              <button
                key={mode.key}
                onClick={() => setRatingMode(mode.key)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer transition-all duration-200 border ${
                  ratingMode === mode.key
                    ? 'bg-accent/15 text-accent border-accent/25'
                    : 'bg-surface-light/20 text-text-secondary border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}

        {/* Daily date picker */}
        {activeTab === 'daily' && (
          <div className="flex items-center justify-center gap-3 mb-5">
            <button
              onClick={() => changeDay(-1)}
              className="px-3 py-1.5 rounded-lg bg-surface-light/40 text-text-primary cursor-pointer hover:bg-surface-hover transition-all duration-200 border border-white/5 text-sm"
            >
              ← {t.ui.prevDay}
            </button>
            <input
              type="date"
              value={dailyDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDailyDate(e.target.value)}
              className="bg-surface-light/60 text-text-primary border border-white/8 rounded-lg px-3 py-1.5 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all duration-200"
            />
            <button
              onClick={() => changeDay(1)}
              className="px-3 py-1.5 rounded-lg bg-surface-light/40 text-text-primary cursor-pointer hover:bg-surface-hover transition-all duration-200 border border-white/5 text-sm"
            >
              {t.ui.nextDay} →
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center text-text-secondary py-12">
            <div className="animate-pulse">{t.ui.loading}</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-text-secondary py-12">{t.ui.noResults}</div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-secondary border-b border-white/8 bg-surface/95 backdrop-blur-sm sticky top-0 z-10">
                  <th className="text-left py-2.5 px-3 font-semibold w-12">#</th>
                  <th className="text-left py-2.5 px-3 font-semibold">{t.ui.username}</th>
                  <th className="text-right py-2.5 px-3 font-semibold">
                    {activeTab === 'rating' || activeTab === 'survival_rated'
                      ? t.ui.score || t.ui.rating
                      : activeTab === 'daily_avg'
                        ? t.ui.avgScore || '平均スコア'
                        : t.ui.score}
                  </th>
                  {(activeTab === 'rating' || activeTab === 'daily_avg') && (
                    <th className="text-right py-2.5 px-3 font-semibold">{t.ui.playCount}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const isMe = entry.is_self;
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-white/5 transition-colors ${isMe ? 'bg-primary/8' : 'hover:bg-surface-light/20'}`}
                    >
                      <td className="py-2 px-3 text-text-secondary font-bold">{i + 1}</td>
                      <td
                        className={`py-2 px-3 ${isMe ? 'text-primary font-bold' : 'text-text-primary'}`}
                      >
                        {entry.username}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-text-primary">
                        {entry.value}
                      </td>
                      {(activeTab === 'rating' || activeTab === 'daily_avg') && (
                        <td className="py-2 px-3 text-right text-text-secondary text-xs">
                          {entry.extra}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          className="w-full mt-5 py-2.5 rounded-xl bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200 text-sm font-medium"
        >
          {t.ui.backToTop}
        </button>
      </div>
    </>
  );
}
