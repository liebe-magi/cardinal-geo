import { describe, expect, test } from 'bun:test';
import { cities } from '../src/cities';
import { calculateDirection, checkAnswer, normalizePair } from '../src/lib/quiz';
import { generateDailyChallengeQuestions } from '../src/lib/dailyChallenge';
import { getUTCDateString } from '../src/lib/seededRandom';
import { calculateNewRatings, INITIAL_RATING } from '../src/lib/glicko2';
import {
  calculateAlpha,
  calculateCityBaseRate,
  calculateCityRatingUpdate,
  calculateCompositeOpponent,
  DEFAULT_CITY_RATING,
} from '../src/lib/compositeRating';

const city = (lat: number, lon: number) => ({ ...cities[0], lat, lon });

describe('current geography rules', () => {
  test('longitude uses numeric comparison even across the date line', () => {
    expect(calculateDirection(city(1, 170), city(0, -170))).toEqual({ ns: 'N', ew: 'E' });
    expect(calculateDirection(city(-1, -170), city(0, 170))).toEqual({ ns: 'S', ew: 'W' });
    expect(calculateDirection(city(0, 0), city(0, 0))).toEqual({ ns: 'N', ew: 'E' });
  });
  test('only both matching axes score a point', () => {
    const correct = { ns: 'N', ew: 'E' } as const;
    for (const [answer, full, partial] of [
      [{ ns: 'N', ew: 'E' }, true, false],
      [{ ns: 'N', ew: 'W' }, false, true],
      [{ ns: 'S', ew: 'E' }, false, true],
      [{ ns: 'S', ew: 'W' }, false, false],
    ] as const) {
      expect(checkAnswer(answer, correct)).toEqual({ isCorrect: full, isPartialCorrect: partial });
      expect(Number(checkAnswer(answer, correct).isCorrect)).toBe(full ? 1 : 0);
    }
  });
  test('normalization is order independent and recalculates equal-axis directions', () => {
    const a = { ...city(0, 10), countryCode: 'AA' };
    const b = { ...city(0, 20), countryCode: 'BB' };
    expect(normalizePair(a, b)).toEqual(normalizePair(b, a));
    expect(normalizePair(b, a).correctDirection).toEqual({ ns: 'N', ew: 'W' });
  });
});

describe('daily challenge', () => {
  test('switches at UTC midnight, not local midnight', () => {
    expect(getUTCDateString(new Date('2026-10-04T08:59:59+09:00'))).toBe('2026-10-03');
    expect(getUTCDateString(new Date('2026-10-04T09:00:00+09:00'))).toBe('2026-10-04');
  });
  test('a date fixes ten distinct ordered pairs and their directions', () => {
    const questions = generateDailyChallengeQuestions('2026-10-03');
    expect(questions).toEqual(generateDailyChallengeQuestions('2026-10-03'));
    expect(questions).not.toEqual(generateDailyChallengeQuestions('2026-10-04'));
    expect(questions).toHaveLength(10);
    expect(questions.map((q) => `${q.cityA.countryCode}/${q.cityB.countryCode}`)).toEqual([
      'MU/PT',
      'SV/KW',
      'GH/CK',
      'TT/MU',
      'BN/BR',
      'CI/ID',
      'GM/ES',
      'GB/AF',
      'KM/CV',
      'BG/IR',
    ]);
    expect(
      new Set(questions.map((q) => `${q.cityA.countryCode}/${q.cityB.countryCode}`)).size,
    ).toBe(10);
    for (const q of questions) {
      expect(q.cityA.countryCode).not.toBe(q.cityB.countryCode);
      expect(q.correctDirection).toEqual(calculateDirection(q.cityA, q.cityB));
    }
  });
});

describe('rating rules', () => {
  test('symmetric initial ratings produce opposite changes without mutating inputs', () => {
    const initial = { ...INITIAL_RATING };
    const result = calculateNewRatings(initial, initial, 1);
    expect(result.player.rating).toBeCloseTo(1662.3108939062977, 6);
    expect(result.question.rating).toBeCloseTo(1337.6891060937023, 6);
    expect(result.player.rd).toBeCloseTo(290.31896371798047, 6);
    expect(initial).toEqual(INITIAL_RATING);
  });
  test('all rating components carry forward over wins and a loss', () => {
    let current = { ...INITIAL_RATING };
    let sum = 0;
    for (const score of [1, 1, 0] as const) {
      const result = calculateNewRatings(current, INITIAL_RATING, score);
      sum += result.ratingChange;
      expect(result.player.rd).toBeLessThan(current.rd);
      expect(result.player.vol).not.toBe(current.vol);
      current = result.player;
    }
    expect(current.rating).toBeCloseTo(INITIAL_RATING.rating + sum, 8);
    expect(current.rating).toBeGreaterThan(INITIAL_RATING.rating);
    expect(current.rating).toBeCloseTo(1596.9345111458595, 6);
    expect(current.rd).toBeCloseTo(234.68738502282204, 6);
    expect(current.vol).toBeCloseTo(0.06000026066005744, 12);
  });
  test('city inverse-variance weights and pair confidence endpoints', () => {
    const a = { ...DEFAULT_CITY_RATING, countryCode: 'AA', rating: 1000, rd: 100 };
    const b = { ...DEFAULT_CITY_RATING, countryCode: 'BB', rating: 2000, rd: 200 };
    expect(calculateCityBaseRate(a, b)).toBeCloseTo(1200, 8);
    expect(calculateAlpha(400)).toBe(0);
    expect(calculateAlpha(0)).toBe(1);
    const fresh = calculateCompositeOpponent(a, b, INITIAL_RATING);
    expect(fresh.opponent.rating).toBeCloseTo(1200, 8);
    expect(fresh.opponent.rd).toBeCloseTo(Math.sqrt(8000), 8);
    const mature = calculateCompositeOpponent(a, b, { ...INITIAL_RATING, rd: 50 });
    expect(mature.opponent).toEqual({ ...INITIAL_RATING, rd: 50 });
    expect(calculateCityRatingUpdate(a, 1500, 350, 0, 1)).toBeNull();
    const full = calculateCityRatingUpdate(a, 1500, 350, 0, 0)!;
    const half = calculateCityRatingUpdate(a, 1500, 350, 0, 0.5)!;
    for (const key of ['rating', 'rd', 'vol'] as const) {
      expect(half[key]).toBeCloseTo((a[key] + full[key]) / 2, 8);
    }
  });
});
