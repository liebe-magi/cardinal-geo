import { cities } from '../cities';
import type { City } from '../types/city';
import type { QuadDirection, Question } from '../types/game';
import type { Lang } from './i18n';

export function getRandomCity(): City {
  return cities[Math.floor(Math.random() * cities.length)];
}

export function generateQuestion(): Question {
  const cityA = getRandomCity();
  let cityB = getRandomCity();

  while (cityA.countryCode === cityB.countryCode && cityA.nameEn === cityB.nameEn) {
    cityB = getRandomCity();
  }

  return {
    cityA,
    cityB,
    correctDirection: calculateDirection(cityA, cityB),
  };
}

export function calculateDirection(target: City, origin: City): QuadDirection {
  const dLat = target.lat - origin.lat;
  const dLon = target.lon - origin.lon;
  const ns = dLat >= 0 ? 'N' : 'S';
  const ew = dLon >= 0 ? 'E' : 'W';
  return { ns, ew };
}

export function checkAnswer(
  userGuess: QuadDirection,
  correct: QuadDirection,
): { isCorrect: boolean; isPartialCorrect: boolean } {
  const isCorrect = userGuess.ns === correct.ns && userGuess.ew === correct.ew;
  const isPartialCorrect =
    !isCorrect && (userGuess.ns === correct.ns || userGuess.ew === correct.ew);
  return { isCorrect, isPartialCorrect };
}

export function formatDirection(dir: QuadDirection, lang: Lang): string {
  if (lang === 'ja') {
    return (dir.ns === 'N' ? '北' : '南') + (dir.ew === 'E' ? '東' : '西');
  } else {
    return (dir.ns === 'N' ? 'North' : 'South') + '-' + (dir.ew === 'E' ? 'East' : 'West');
  }
}

export function formatCoord(value: number, type: 'lat' | 'lon'): string {
  const abs = Math.abs(value).toFixed(2);
  if (type === 'lat') return `${abs}°${value >= 0 ? 'N' : 'S'}`;
  return `${abs}°${value >= 0 ? 'E' : 'W'}`;
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
