import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Header } from '../Header';

type RankingTab = 'rating' | 'survival_rated' | 'survival_unrated' | 'daily' | 'challenge_unrated';

interface RankingEntry {
  id: string;
  username: string;
  value: number;
  extra?: string;
}

export function Ranking() {
  const navigate = useNavigate();
  const { t } = useSettingsStore();
  const { profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<RankingTab>('rating');
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));

  const fetchRanking = useCallback(async () => {
    if (!supabase) {
      setEntries([]);
      return;
    }

    setLoading(true);
    try {
      let data: RankingEntry[] = [];

      switch (activeTab) {
        case 'rating': {
          const { data: results } = await supabase.rpc('get_rating_ranking');
          data =
            results?.map(
              (r: { id: string; username: string; rating: number; play_count: number }) => ({
                id: r.id,
                username: r.username || '???',
                value: Math.round(r.rating),
                extra: String(r.play_count),
              }),
            ) || [];
          break;
        }
        case 'survival_rated': {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, best_score_survival_rated')
            .order('best_score_survival_rated', { ascending: false })
            .gt('best_score_survival_rated', 0)
            .limit(100);
          data =
            profiles?.map((p) => ({
              id: p.id,
              username: p.username || '???',
              value: p.best_score_survival_rated,
            })) || [];
          break;
        }
        case 'survival_unrated': {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, best_score_survival_unrated')
            .order('best_score_survival_unrated', { ascending: false })
            .gt('best_score_survival_unrated', 0)
            .limit(100);
          data =
            profiles?.map((p) => ({
              id: p.id,
              username: p.username || '???',
              value: p.best_score_survival_unrated,
            })) || [];
          break;
        }
        case 'daily': {
          const { data: results } = await supabase
            .from('daily_challenge_results')
            .select('user_id, score, profiles!inner(username)')
            .eq('challenge_date', dailyDate)
            .eq('status', 'completed')
            .order('score', { ascending: false })
            .limit(100);
          data =
            results?.map((r) => ({
              id: r.user_id,
              username: (r.profiles as unknown as { username: string })?.username || '???',
              value: r.score,
            })) || [];
          break;
        }
        case 'challenge_unrated': {
          const { data: results } = await supabase.rpc('get_challenge_unrated_ranking');
          data =
            results?.map(
              (r: { id: string; username: string; avg_score: number; play_count: number }) => ({
                id: r.id,
                username: r.username || '???',
                value: Number(r.avg_score),
                extra: `${r.play_count} plays`,
              }),
            ) || [];
          break;
        }
      }

      setEntries(data);
    } catch (err) {
      console.error('Error fetching ranking:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, dailyDate]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  const tabs: { key: RankingTab; label: string }[] = [
    { key: 'rating', label: t.ui.rankingRating },
    { key: 'survival_rated', label: t.ui.rankingSurvivalRated },
    { key: 'survival_unrated', label: t.ui.rankingSurvivalUnrated },
    { key: 'daily', label: t.ui.rankingDailyChallenge },
    { key: 'challenge_unrated', label: t.ui.rankingChallengeUnrated },
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
      <div className="glass-card p-5 sm:p-8 animate-fade-in">
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
          <div className="text-center text-text-secondary py-12">
            {supabase ? t.ui.noResults : 'Supabase not configured'}
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-secondary border-b border-white/8 bg-surface-light/30 sticky top-0">
                  <th className="text-left py-2.5 px-3 font-semibold w-12">#</th>
                  <th className="text-left py-2.5 px-3 font-semibold">{t.ui.username}</th>
                  <th className="text-right py-2.5 px-3 font-semibold">
                    {activeTab === 'challenge_unrated'
                      ? t.ui.avgScore
                      : activeTab === 'rating'
                        ? t.ui.rating
                        : t.ui.score}
                  </th>
                  {activeTab === 'challenge_unrated' && (
                    <th className="text-right py-2.5 px-3 font-semibold">{t.ui.playCount}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const isMe = profile?.id === entry.id;
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
                        {activeTab === 'rating' && entry.extra && (
                          <span className="text-text-secondary font-normal text-xs ml-1">
                            ({entry.extra})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-text-primary">
                        {activeTab === 'challenge_unrated' ? entry.value.toFixed(2) : entry.value}
                      </td>
                      {activeTab === 'challenge_unrated' && (
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
