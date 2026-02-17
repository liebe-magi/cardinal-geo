import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cities } from '../cities';
import { resetWeaknessScoresDb } from '../lib/supabaseApi';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';

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

export function WeaknessCheck() {
  const navigate = useNavigate();
  const { lang, t } = useSettingsStore();
  const { isAuthenticated, profile, user, fetchProfile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [, setRefreshKey] = useState(0);

  // Read weakness scores from profile (DB)
  const scores = isAuthenticated && profile?.weakness_scores ? profile.weakness_scores : {};
  const cityScores = cities
    .map((city) => ({
      city,
      score: scores[city.countryCode] || 0,
    }))
    .sort((a, b) => b.score - a.score);

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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
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
    if (activeTab === 'map') {
      setTimeout(initMap, 100);
    }
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [activeTab, initMap]);

  const handleReset = async () => {
    if (!isAuthenticated || !user) return;
    if (confirm(t.ui.weaknessResetConfirm)) {
      await resetWeaknessScoresDb(user.id);
      // Refresh profile to get cleared weakness scores
      await fetchProfile();
      setRefreshKey((k) => k + 1);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      setTimeout(initMap, 100);
    }
  };

  const legendItems = [
    { color: 'hsl(120,70%,45%)', label: '≤-10' },
    { color: 'hsl(90,74%,46%)', label: '-5' },
    { color: 'hsl(60,78%,48%)', label: '0' },
    { color: 'hsl(42,80%,49%)', label: '3' },
    { color: 'hsl(24,83%,49%)', label: '6' },
    { color: 'hsl(0,85%,50%)', label: '≥10' },
  ];

  return (
    <>
      <Header />
      <div className="glass-card p-5 sm:p-8 animate-fade-in">
        <h2 className="text-lg sm:text-xl font-bold text-text-primary mb-5">
          📊 {t.ui.weaknessTitle}
        </h2>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-5">
          {(['map', 'list'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'map' && mapInstance.current) {
                  setTimeout(() => mapInstance.current?.invalidateSize(), 50);
                }
              }}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 border ${
                activeTab === tab
                  ? 'bg-primary/15 text-primary border-primary/25'
                  : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover'
              }`}
            >
              {tab === 'map' ? t.ui.weaknessMap : t.ui.weaknessList}
            </button>
          ))}
        </div>

        {/* Map tab */}
        <div className={activeTab === 'map' ? 'block' : 'hidden'}>
          <div
            ref={mapRef}
            className="w-full h-64 md:h-80 rounded-xl overflow-hidden mb-4 border border-white/5"
          />
          <div className="flex flex-wrap gap-2.5 justify-center">
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

        {/* List tab */}
        <div className={activeTab === 'list' ? 'block' : 'hidden'}>
          <div className="max-h-[24rem] overflow-y-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-secondary border-b border-white/8 bg-surface-light/30 sticky top-0">
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

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={handleReset}
            className="flex-1 py-2.5 rounded-xl bg-error/10 text-error border border-error/20 hover:bg-error/20 cursor-pointer transition-all duration-200 text-sm font-semibold"
          >
            {t.ui.weaknessReset}
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex-1 py-2.5 rounded-xl bg-surface-light/50 text-text-primary border border-white/5 hover:border-text-secondary/30 hover:bg-surface-hover cursor-pointer transition-all duration-200 text-sm font-medium"
          >
            {t.ui.backToTop}
          </button>
        </div>
      </div>
    </>
  );
}
