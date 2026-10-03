import { cities } from '../cities';
import type { GameMode, GameState, GameSubMode } from '../types/game';
import type { Lang } from './i18n';
import { FAMOUS_CITY_CODES } from './famousCities';
import { countryRegionMap, regionLabels, type Region } from './regions';

export type GameSelection =
  | { mode: 'starter'; subMode: 'unrated' }
  | { mode: 'learning'; subMode: 'unrated' }
  | { mode: Exclude<GameMode, 'learning'>; subMode: 'rated' };
export type GamePhase =
  'idle' | 'starting' | 'answering' | 'submitting' | 'reviewing' | 'completed' | 'failed';
type ModeDefinition = {
  label: Record<Lang, string>;
  ratingScope: 'global' | 'starter_rated' | `${Region}_rated` | null;
  pool: 'world' | 'famous' | 'weakness' | Region;
  end: 'mistake' | 'fixed' | 'manual';
  questionCount: number | null;
};
const regional = (region: Region): ModeDefinition => ({
  label: regionLabels[region],
  ratingScope: `${region}_rated`,
  pool: region,
  end: 'mistake',
  questionCount: null,
});
export const gameModes: Record<GameMode, ModeDefinition> = {
  survival: {
    label: { ja: 'サバイバル', en: 'Survival' },
    ratingScope: 'global',
    pool: 'world',
    end: 'mistake',
    questionCount: null,
  },
  challenge: {
    label: { ja: 'デイリーチャレンジ', en: 'Daily Challenge' },
    ratingScope: 'global',
    pool: 'world',
    end: 'fixed',
    questionCount: 10,
  },
  learning: {
    label: { ja: '学習', en: 'Learning' },
    ratingScope: null,
    pool: 'weakness',
    end: 'manual',
    questionCount: null,
  },
  starter: {
    label: { ja: '有名首都', en: 'Starter' },
    ratingScope: 'starter_rated',
    pool: 'famous',
    end: 'mistake',
    questionCount: null,
  },
  asia: regional('asia'),
  europe: regional('europe'),
  africa: regional('africa'),
  americas: regional('americas'),
  oceania: regional('oceania'),
};

/** Legacy submode values remain readable; new games use the current valid combination. */
export function normalizeSelection(mode: GameMode, _subMode: GameSubMode): GameSelection {
  if (mode === 'starter' && _subMode === 'unrated') return { mode, subMode: 'unrated' };
  return mode === 'learning' ? { mode, subMode: 'unrated' } : { mode, subMode: 'rated' };
}
export function ratingLabel(mode: GameMode, lang: Lang): string {
  return gameModes[mode].ratingScope === 'global' ? 'Global' : gameModes[mode].label[lang];
}
export function modeCities(mode: GameMode) {
  const pool = gameModes[mode].pool;
  if (pool === 'famous') return cities.filter((c) => FAMOUS_CITY_CODES.includes(c.countryCode));
  if (pool === 'world' || pool === 'weakness') return null;
  return cities.filter((c) => countryRegionMap[c.countryCode] === pool);
}
export function shouldComplete(
  state: Pick<GameState, 'mode' | 'history' | 'questionCount'>,
): boolean {
  const rules = gameModes[state.mode];
  return rules.end === 'fixed'
    ? state.questionCount >= rules.questionCount!
    : rules.end === 'mistake' && state.history[state.history.length - 1] === false;
}
export function isBusy(phase: GamePhase) {
  return phase === 'starting' || phase === 'submitting';
}
