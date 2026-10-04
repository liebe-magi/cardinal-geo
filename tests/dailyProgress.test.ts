import { expect, test } from 'bun:test';
import { restoreDailyProgress } from '../src/lib/dailyProgress';
import { generateDailyChallengeQuestions } from '../src/lib/dailyChallenge';

const answers = generateDailyChallengeQuestions('2026-10-03').map((q) => ({
  cityACode: q.cityA.countryCode,
  cityBCode: q.cityB.countryCode,
  userAnswer: q.correctDirection,
  correctDirection: q.correctDirection,
  isCorrect: true,
  isPartialCorrect: false,
  ratingChange: 1,
}));
const progress = {
  answers,
  score: 10,
  current_question: 10,
  status: 'completed',
  total_rating_change: 10,
};

test('legacy ratings remain missing, never substituted from current profile', () => {
  const restored = restoreDailyProgress(progress);
  expect(restored.ratingBefore).toBeUndefined();
  expect(restored.ratingAfter).toBeUndefined();
  expect(restored.questionHistory).toHaveLength(10);
});

test('inconsistent saved counts, score, ratings and directions fail without truncating history', () => {
  for (const broken of [
    { ...progress, current_question: 5 },
    { ...progress, score: 9 },
    { ...progress, total_rating_change: 5 },
    { ...progress, answers: answers.map((a) => ({ ...a, userAnswer: null })) },
  ])
    expect(() => restoreDailyProgress(broken)).toThrow();
});
