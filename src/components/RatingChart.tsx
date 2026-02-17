import { useEffect, useRef, useState } from 'react';
import type { Translations } from '../lib/i18n';
import { fetchRatingHistory, type RatingHistoryPoint } from '../lib/supabaseApi';
import { useSettingsStore } from '../stores/settingsStore';

type Period = 'day' | 'week' | 'month';
type ChartType = 'candlestick' | 'line';

interface Candle {
  label: string;
  open: number;
  close: number;
  high: number;
  low: number;
  count: number;
}

function getPeriodKey(timestamp: string, period: Period): string {
  const d = new Date(timestamp);
  if (period === 'day') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (period === 'week') {
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodLabel(key: string, period: Period): string {
  if (period === 'month') {
    const [y, m] = key.split('-');
    return `${y}/${m}`;
  }
  const parts = key.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function aggregateCandles(history: RatingHistoryPoint[], period: Period): Candle[] {
  const map = new Map<string, { ratings: number[]; openRating: number; last: number }>();

  for (const point of history) {
    const key = getPeriodKey(point.timestamp, period);
    const entry = map.get(key);
    if (entry) {
      entry.ratings.push(point.rating);
      entry.last = point.rating;
    } else {
      map.set(key, {
        ratings: [point.rating],
        openRating: point.ratingBefore,
        last: point.rating,
      });
    }
  }

  const candles: Candle[] = [];
  for (const [key, entry] of map) {
    const allValues = [entry.openRating, ...entry.ratings];
    candles.push({
      label: getPeriodLabel(key, period),
      open: entry.openRating,
      close: entry.last,
      high: Math.max(...allValues),
      low: Math.min(...allValues),
      count: entry.ratings.length,
    });
  }

  return candles;
}

interface RatingChartProps {
  userId: string;
  currentRating: number;
}

export function RatingChart({ userId, currentRating }: RatingChartProps) {
  const { t } = useSettingsStore();
  const [history, setHistory] = useState<RatingHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [period, setPeriod] = useState<Period>('day');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await fetchRatingHistory(userId, 500);
      setHistory(data);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="text-center py-8 text-text-secondary text-sm animate-pulse">
        {t.ui.loading}
      </div>
    );
  }

  if (history.length < 2) {
    return <div className="text-center py-8 text-text-secondary text-sm">{t.ui.noData}</div>;
  }

  const chartTypeButtons: { key: ChartType; label: string }[] = [
    { key: 'candlestick', label: t.ui.chartCandlestick },
    { key: 'line', label: t.ui.chartLine },
  ];

  return (
    <div>
      {/* Chart type switcher */}
      <div className="flex justify-center gap-1 mb-3">
        {chartTypeButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setChartType(btn.key)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border ${
              chartType === btn.key
                ? 'bg-primary/15 text-primary border-primary/25'
                : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {chartType === 'candlestick' ? (
        <CandlestickChart history={history} period={period} setPeriod={setPeriod} t={t} />
      ) : (
        <LineChart history={history} currentRating={currentRating} t={t} />
      )}
    </div>
  );
}

// ─── Candlestick Chart ──────────────────────────────────────

interface CandlestickChartProps {
  history: RatingHistoryPoint[];
  period: Period;
  setPeriod: (p: Period) => void;
  t: Translations;
}

function CandlestickChart({ history, period, setPeriod, t }: CandlestickChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    candle: Candle;
  } | null>(null);

  const candles = aggregateCandles(history, period);

  if (candles.length === 0) {
    return <div className="text-center py-8 text-text-secondary text-sm">{t.ui.noData}</div>;
  }

  const width = 600;
  const height = 240;
  const padding = { top: 20, right: 16, bottom: 34, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allHighs = candles.map((c) => c.high);
  const allLows = candles.map((c) => c.low);
  const rawMin = Math.min(...allLows);
  const rawMax = Math.max(...allHighs);
  const ratingRange = rawMax - rawMin || 100;
  const yMin = Math.floor((rawMin - ratingRange * 0.1) / 10) * 10;
  const yMax = Math.ceil((rawMax + ratingRange * 0.1) / 10) * 10;
  const yRange = yMax - yMin || 100;

  const scaleY = (rating: number) => padding.top + chartH - ((rating - yMin) / yRange) * chartH;

  const candleSpacing = chartW / candles.length;
  const candleWidth = Math.max(4, Math.min(24, candleSpacing * 0.6));
  const scaleX = (i: number) => padding.left + candleSpacing * (i + 0.5);

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    Math.round(yMin + (yRange * i) / yTickCount),
  );

  const maxLabels = Math.min(8, candles.length);
  const labelStep = Math.max(1, Math.ceil(candles.length / maxLabels));

  const findCandleAtX = (clientX: number): number => {
    if (!svgRef.current) return -1;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((clientX - rect.left) / rect.width) * width;
    const idx = Math.round((mouseX - padding.left) / candleSpacing - 0.5);
    return Math.max(0, Math.min(candles.length - 1, idx));
  };

  const handlePointer = (clientX: number) => {
    const idx = findCandleAtX(clientX);
    if (idx < 0) return;
    const candle = candles[idx];
    const x = scaleX(idx);
    const y = scaleY((candle.high + candle.low) / 2);
    setTooltip({ x, y, candle });
  };

  const periodButtons: { key: Period; label: string }[] = [
    { key: 'day', label: t.ui.periodDay },
    { key: 'week', label: t.ui.periodWeek },
    { key: 'month', label: t.ui.periodMonth },
  ];

  return (
    <div className="relative">
      {/* Period switcher */}
      <div className="flex justify-center gap-1 mb-3">
        {periodButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => {
              setPeriod(btn.key);
              setTooltip(null);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border ${
              period === btn.key
                ? 'bg-accent/15 text-accent border-accent/25'
                : 'bg-surface-light/40 text-text-secondary border-white/5 hover:border-text-secondary/30'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={() => setTooltip(null)}
        onTouchMove={(e) => handlePointer(e.touches[0].clientX)}
        onTouchEnd={() => setTooltip(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={scaleY(tick)}
              x2={width - padding.right}
              y2={scaleY(tick)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={scaleY(tick) + 4}
              textAnchor="end"
              fill="rgba(255,255,255,0.4)"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick}
            </text>
          </g>
        ))}

        {candles.map((candle, i) =>
          i % labelStep === 0 || i === candles.length - 1 ? (
            <text
              key={i}
              x={scaleX(i)}
              y={height - 6}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize="9"
            >
              {candle.label}
            </text>
          ) : null,
        )}

        {candles.map((candle, i) => {
          const x = scaleX(i);
          const isUp = candle.close >= candle.open;
          const color = isUp ? '#34d399' : '#f87171';
          const bodyTop = scaleY(Math.max(candle.open, candle.close));
          const bodyBottom = scaleY(Math.min(candle.open, candle.close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);

          return (
            <g key={i}>
              <line
                x1={x}
                y1={scaleY(candle.high)}
                x2={x}
                y2={scaleY(candle.low)}
                stroke={color}
                strokeWidth="1.5"
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                fillOpacity={0.8}
                stroke={color}
                strokeWidth="1"
                rx="1"
              />
            </g>
          );
        })}

        {tooltip && (
          <line
            x1={tooltip.x}
            y1={padding.top}
            x2={tooltip.x}
            y2={padding.top + chartH}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        )}
      </svg>

      {tooltip && (
        <div
          className="absolute pointer-events-none bg-surface/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-lg backdrop-blur-sm z-10"
          style={{
            left: `${(tooltip.x / width) * 100}%`,
            top: `${((tooltip.y - 10) / height) * 100}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-bold text-text-primary text-center mb-1">{tooltip.candle.label}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-text-secondary">{t.ui.chartOpen}:</span>
            <span className="text-text-primary font-mono text-right">
              {Math.round(tooltip.candle.open)}
            </span>
            <span className="text-text-secondary">{t.ui.chartClose}:</span>
            <span
              className={`font-mono text-right font-bold ${
                tooltip.candle.close >= tooltip.candle.open ? 'text-success' : 'text-error'
              }`}
            >
              {Math.round(tooltip.candle.close)}
            </span>
            <span className="text-text-secondary">{t.ui.chartHigh}:</span>
            <span className="text-text-primary font-mono text-right">
              {Math.round(tooltip.candle.high)}
            </span>
            <span className="text-text-secondary">{t.ui.chartLow}:</span>
            <span className="text-text-primary font-mono text-right">
              {Math.round(tooltip.candle.low)}
            </span>
            <span className="text-text-secondary">{t.ui.chartMatches}:</span>
            <span className="text-text-primary font-mono text-right">{tooltip.candle.count}</span>
          </div>
        </div>
      )}

      <div className="text-center text-xs text-text-secondary mt-1">
        {t.ui.matchCount}: {history.length}
      </div>
    </div>
  );
}

// ─── Line Chart ─────────────────────────────────────────────

interface LineChartProps {
  history: RatingHistoryPoint[];
  currentRating: number;
  t: Translations;
}

function LineChart({ history, currentRating, t }: LineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    rating: number;
    index: number;
  } | null>(null);

  const width = 600;
  const height = 240;
  const padding = { top: 20, right: 16, bottom: 34, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const ratings = history.map((p) => p.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const ratingRange = maxRating - minRating || 100;
  const yMin = Math.floor((minRating - ratingRange * 0.1) / 10) * 10;
  const yMax = Math.ceil((maxRating + ratingRange * 0.1) / 10) * 10;
  const yRange = yMax - yMin || 100;

  const scaleX = (i: number) => padding.left + (i / (history.length - 1)) * chartW;
  const scaleY = (rating: number) => padding.top + chartH - ((rating - yMin) / yRange) * chartH;

  const pathD = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i)},${scaleY(p.rating)}`)
    .join(' ');

  const areaD = `${pathD} L${scaleX(history.length - 1)},${padding.top + chartH} L${scaleX(0)},${padding.top + chartH} Z`;

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    Math.round(yMin + (yRange * i) / yTickCount),
  );

  // X axis: match number labels
  const maxLabels = Math.min(8, history.length);
  const labelStep = Math.max(1, Math.ceil(history.length / maxLabels));

  const netChange = currentRating - (history[0]?.rating ?? currentRating);
  const lineColor = netChange >= 0 ? '#34d399' : '#f87171';
  const gradientId = 'rating-line-gradient';

  const handlePointer = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((clientX - rect.left) / rect.width) * width;
    const idx = Math.round(((mouseX - padding.left) / chartW) * (history.length - 1));
    const clampedIdx = Math.max(0, Math.min(history.length - 1, idx));
    const point = history[clampedIdx];
    setTooltip({
      x: scaleX(clampedIdx),
      y: scaleY(point.rating),
      rating: Math.round(point.rating),
      index: clampedIdx + 1,
    });
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={() => setTooltip(null)}
        onTouchMove={(e) => handlePointer(e.touches[0].clientX)}
        onTouchEnd={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={scaleY(tick)}
              x2={width - padding.right}
              y2={scaleY(tick)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={scaleY(tick) + 4}
              textAnchor="end"
              fill="rgba(255,255,255,0.4)"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* X axis: match number */}
        {history.map((_, i) =>
          i % labelStep === 0 || i === history.length - 1 ? (
            <text
              key={i}
              x={scaleX(i)}
              y={height - 6}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize="9"
            >
              {i + 1}
            </text>
          ) : null,
        )}

        <path d={areaD} fill={`url(#${gradientId})`} />

        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {tooltip && (
          <>
            <line
              x1={tooltip.x}
              y1={padding.top}
              x2={tooltip.x}
              y2={padding.top + chartH}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            <circle
              cx={tooltip.x}
              cy={tooltip.y}
              r="4"
              fill={lineColor}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth="1.5"
            />
          </>
        )}
      </svg>

      {tooltip && (
        <div
          className="absolute pointer-events-none bg-surface/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-lg backdrop-blur-sm z-10"
          style={{
            left: `${(tooltip.x / width) * 100}%`,
            top: `${((tooltip.y - 10) / height) * 100}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-bold text-text-primary">{tooltip.rating}</div>
          <div className="text-text-secondary text-[10px]">#{tooltip.index}</div>
        </div>
      )}

      <div className="text-center text-xs text-text-secondary mt-1">
        {t.ui.matchCount}: {history.length}
      </div>
    </div>
  );
}
