import { cities, City } from './cities';

export type Direction = 'N' | 'S' | 'E' | 'W';
export type QuadDirection = { ns: 'N' | 'S'; ew: 'E' | 'W' };

export interface Question {
  cityA: City;
  cityB: City;
  correctDirection: QuadDirection;
}

export function getRandomCity(): City {
  return cities[Math.floor(Math.random() * cities.length)];
}

export function generateQuestion(): Question {
  const cityA = getRandomCity();
  let cityB = getRandomCity();

  // Ensure strict different cities
  while (cityA.countryCode === cityB.countryCode && cityA.nameEn === cityB.nameEn) {
    cityB = getRandomCity();
  }

  return {
    cityA,
    cityB,
    correctDirection: calculateDirection(cityA, cityB),
  };
}

// Calculate direction of cityA relative to cityB
// "City A is [Direction] of City B"
// Simple numeric comparison of lat/lon values (does not cross the 180th meridian).
// e.g. New Zealand (lon=174) is considered EAST of Chile (lon=-70).
export function calculateDirection(target: City, origin: City): QuadDirection {
  const dLat = target.lat - origin.lat;
  const dLon = target.lon - origin.lon;

  const ns = dLat >= 0 ? 'N' : 'S';
  const ew = dLon >= 0 ? 'E' : 'W';

  return { ns, ew };
}

export function formatDirection(dir: QuadDirection, lang: 'ja' | 'en'): string {
  if (lang === 'ja') {
    return (dir.ns === 'N' ? '北' : '南') + (dir.ew === 'E' ? '東' : '西');
  } else {
    return (dir.ns === 'N' ? 'North' : 'South') + '-' + (dir.ew === 'E' ? 'East' : 'West');
  }
}

// --- Softmax-based weighted sampling for learning mode ---

export function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function weightedRandomIndex(probabilities: number[]): number {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (r <= cumulative) return i;
  }
  return probabilities.length - 1;
}

export function generateLearningQuestion(weaknessScores: Record<string, number>): Question {
  const scores = cities.map((c) => weaknessScores[c.countryCode] || 0);
  const probs = softmax(scores);

  const idxA = weightedRandomIndex(probs);
  const cityA = cities[idxA];

  // Select cityB (different from cityA), also weighted
  let idxB = weightedRandomIndex(probs);
  while (cities[idxB].countryCode === cityA.countryCode && cities[idxB].nameEn === cityA.nameEn) {
    idxB = weightedRandomIndex(probs);
  }
  const cityB = cities[idxB];

  return {
    cityA,
    cityB,
    correctDirection: calculateDirection(cityA, cityB),
  };
}
