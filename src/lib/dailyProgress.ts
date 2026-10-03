import { cities } from '../cities';
import type { QuadDirection, QuestionRecord } from '../types/game';
import type { DbDailyChallengeResult } from './supabaseApi';
import { calculateDirection, checkAnswer } from './quiz';

function direction(value: unknown): QuadDirection {
  if (
    !value ||
    typeof value !== 'object' ||
    !('ns' in value) ||
    !('ew' in value) ||
    (value.ns !== 'N' && value.ns !== 'S') ||
    (value.ew !== 'E' && value.ew !== 'W')
  ) {
    throw new Error('Missing answer direction');
  }
  return { ns: value.ns, ew: value.ew };
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid rating');
  return value;
}

/** Both resume and review use the same validated saved answers. No inferred backfill. */
export function restoreDailyProgress(progress: DbDailyChallengeResult) {
  if (
    !Array.isArray(progress.answers) ||
    progress.answers.length !== progress.current_question ||
    !Number.isInteger(progress.current_question) ||
    progress.current_question < 0 ||
    progress.current_question > 10 ||
    (progress.status === 'completed') !== (progress.current_question === 10)
  ) {
    throw new Error('Daily answer count mismatch');
  }
  const questionHistory: QuestionRecord[] = progress.answers.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('Missing daily answer');
    const answer = value as Record<string, unknown>;
    const cityA = cities.find((c) => c.countryCode === answer.cityACode);
    const cityB = cities.find((c) => c.countryCode === answer.cityBCode);
    if (!cityA || !cityB) throw new Error('Missing daily city');
    const correctDirection = direction(answer.correctDirection);
    const userAnswer = direction(answer.userAnswer);
    const expected = calculateDirection(cityA, cityB);
    const checked = checkAnswer(userAnswer, correctDirection);
    if (
      correctDirection.ns !== expected.ns ||
      correctDirection.ew !== expected.ew ||
      answer.isCorrect !== checked.isCorrect ||
      (answer.isPartialCorrect != null && answer.isPartialCorrect !== checked.isPartialCorrect)
    ) {
      throw new Error('Daily score mismatch');
    }
    return {
      cityA,
      cityB,
      correctDirection,
      userAnswer,
      ...checked,
      ratingChange: optionalNumber(answer.ratingChange),
      ratingBefore: optionalNumber(answer.ratingBefore),
      ratingAfter: optionalNumber(answer.ratingAfter),
    };
  });
  const history = questionHistory.map((answer) => answer.isCorrect);
  if (history.filter(Boolean).length !== progress.score) throw new Error('Daily score mismatch');
  if (
    questionHistory.every((answer) => answer.ratingChange !== undefined) &&
    Math.abs(
      questionHistory.reduce((sum, answer) => sum + answer.ratingChange!, 0) -
        progress.total_rating_change,
    ) > 0.00001
  ) {
    throw new Error('Daily rating mismatch');
  }
  return {
    score: progress.score,
    questionCount: progress.current_question,
    history,
    questionHistory,
    totalRatingChange: progress.total_rating_change,
    ratingBefore: questionHistory[0]?.ratingBefore,
    ratingAfter: questionHistory[questionHistory.length - 1]?.ratingAfter,
  };
}
