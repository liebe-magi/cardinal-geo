import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cities } from '../cities';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';

interface StatsEntry {
  id: string;
  username: string; // Used for city name + capital
  value: number; // Used for rating
  extra?: string; // Used for play count
}

export function GlobalStats() {
  const navigate = useNavigate();
  const { lang, t } = useSettingsStore();

  const [entries, setEntries] = useState<StatsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [citySortAsc, setCitySortAsc] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      // Fetch city ratings
      const { data: results } = await supabase
        .from('city_ratings')
        .select('country_code, rating, play_count')
        .order('rating', { ascending: citySortAsc })
        .limit(198);

      const data =
        results?.map((r: { country_code: string; rating: number; play_count: number }) => {
          const city = cities.find((c) => c.countryCode === r.country_code);
          return {
            id: r.country_code,
            username:
              lang === 'ja'
                ? `${city?.capitalJp || '?'} (${city?.nameJp || r.country_code})`
                : `${city?.capitalEn || '?'} (${city?.nameEn || r.country_code})`,
            value: Math.round(r.rating),
            extra: String(r.play_count),
          };
        }) || [];

      setEntries(data);
    } catch (err) {
      console.error('Error fetching global stats:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [citySortAsc, lang]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <>
      <Header />
      <div className="glass-card mb-8 p-5 sm:p-8 animate-fade-in">
        <h2 className="text-xl font-bold text-center mb-5 text-text-primary">
          🌍 {t.ui.globalStats || 'Global Stats'}
        </h2>

        {/* City difficulty sort toggle */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <button
            onClick={() => setCitySortAsc(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border ${
              !citySortAsc
                ? 'bg-primary/15 text-primary border-primary/25'
                : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover'
            }`}
          >
            {t.ui.cityDifficultyHard}
          </button>
          <button
            onClick={() => setCitySortAsc(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border ${
              citySortAsc
                ? 'bg-primary/15 text-primary border-primary/25'
                : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover'
            }`}
          >
            {t.ui.cityDifficultyEasy}
          </button>
        </div>

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
                  <th className="text-left py-2.5 px-3 font-semibold">{t.ui.capital}</th>
                  <th className="text-right py-2.5 px-3 font-semibold">{t.ui.rating}</th>
                  <th className="text-right py-2.5 px-3 font-semibold">{t.ui.playCount}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className="border-b border-white/5 transition-colors hover:bg-surface-light/20"
                  >
                    <td className="py-2 px-3 text-text-secondary font-bold">{i + 1}</td>
                    <td className="py-2 px-3 text-text-primary">{entry.username}</td>
                    <td className="py-2 px-3 text-right font-bold text-text-primary">
                      {entry.value}
                    </td>
                    <td className="py-2 px-3 text-right text-text-secondary text-xs">
                      {entry.extra}
                    </td>
                  </tr>
                ))}
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
