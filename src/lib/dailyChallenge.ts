import { cities } from '../cities';
import type { Question } from '../types/game';
import { calculateDirection } from './quiz';
import { createSeededRng, getDateSeed } from './seededRandom';

/**
 * Generate 10 deterministic questions for a given date string.
 * All users get the same questions for the same date.
 */
export function generateDailyChallengeQuestions(dateStr: string): Question[] {
  const seed = getDateSeed(dateStr);
  const rng = createSeededRng(seed);
  const questions: Question[] = [];
  const usedPairs = new Set<string>();

  while (questions.length < 10) {
    const idxA = Math.floor(rng() * cities.length);
    const idxB = Math.floor(rng() * cities.length);

    // Ensure different cities
    if (
      cities[idxA].countryCode === cities[idxB].countryCode &&
      cities[idxA].nameEn === cities[idxB].nameEn
    ) {
      continue;
    }

    const pairKey = `${idxA}-${idxB}`;
    if (usedPairs.has(pairKey)) continue;
    usedPairs.add(pairKey);

    const cityA = cities[idxA];
    const cityB = cities[idxB];

    questions.push({
      cityA,
      cityB,
      correctDirection: calculateDirection(cityA, cityB),
    });
  }

  return questions;
}
