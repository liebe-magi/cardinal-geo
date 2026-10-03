import { beforeEach, expect, mock, test } from 'bun:test';
import { INITIAL_RATING } from '../src/lib/glicko2';
import { DEFAULT_CITY_RATING } from '../src/lib/compositeRating';
import { normalizePair } from '../src/lib/quiz';

const createPendingMatch = mock(async () => 1);
const submitRatedAnswer = mock(async () => true);
mock.module('../src/lib/supabase', () => ({ supabase: null }));
mock.module('../src/lib/supabaseApi', () => ({
  createPendingMatch,
  submitRatedAnswer,
  settlePendingMatches: async () => 0,
  getOrCreateQuestion: async (question) => {
    const { normalizedA, normalizedB, correctDirection } = normalizePair(
      question.cityA,
      question.cityB,
    );
    return {
      id: 'pair',
      city_a_code: normalizedA.countryCode,
      city_b_code: normalizedB.countryCode,
      correct_ns: correctDirection.ns,
      correct_ew: correctDirection.ew,
      ...INITIAL_RATING,
    };
  },
  fetchCityRatings: async () => ({
    cityA: { countryCode: 'AA', ...DEFAULT_CITY_RATING },
    cityB: { countryCode: 'BB', ...DEFAULT_CITY_RATING },
  }),
  getDailyProgress: async () => null,
  saveDailyProgress: async () => ({}),
  updateBestSurvivalRatedScore: async () => true,
  updateWeaknessScoreDb: async () => null,
  migrateLocalDataToDb: async () => false,
}));
const { useGameStore } = await import('../src/stores/gameStore');
const { useAuthStore } = await import('../src/stores/authStore');

beforeEach(() => {
  createPendingMatch.mockClear();
  submitRatedAnswer.mockClear();
  useGameStore.getState().reset();
  useAuthStore.setState({
    user: { id: 'user' },
    isAuthenticated: true,
    // Deliberately stale profile: fetchProfile must not break the local chain.
    profile: {
      id: 'user',
      username: 'test',
      modeRatings: { global: INITIAL_RATING },
      weakness_scores: {},
      best_score_survival_rated: 100,
    },
    fetchProfile: async () => {},
  });
});

test('store carries rating, rd and vol to each next question despite stale profile reads (#13)', async () => {
  await useGameStore.getState().startGame('survival', 'rated');
  let previous = INITIAL_RATING;
  for (const correct of [true, true, false]) {
    const state = useGameStore.getState();
    const before = createPendingMatch.mock.calls.at(-1);
    expect(before[4]).toBe(previous.rating);
    expect(before[6]).toBe(previous.rd);
    expect(before[7]).toBe(previous.vol);
    const answer = state.currentQuestion.correctDirection;
    state.setUserGuess(correct ? answer : { ns: answer.ns === 'N' ? 'S' : 'N', ew: answer.ew });
    await state.submitAnswer();
    previous = submitRatedAnswer.mock.calls.at(-1)[3];
    expect(useGameStore.getState().gameState.currentPlayerRating).toEqual(previous);
    if (correct) await useGameStore.getState().nextQuestion();
  }
  expect(useGameStore.getState().gameState.score).toBe(2);
  expect(useGameStore.getState().gameState.questionCount).toBe(3);
  expect(useGameStore.getState().gameState.totalRatingChange).toBeCloseTo(
    previous.rating - 1500,
    8,
  );
});
