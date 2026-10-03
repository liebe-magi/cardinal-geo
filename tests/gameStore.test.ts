import { beforeEach, expect, mock, test } from 'bun:test';
import { INITIAL_RATING } from '../src/lib/glicko2';
import { DEFAULT_CITY_RATING } from '../src/lib/compositeRating';
import { normalizePair } from '../src/lib/quiz';

let savedMatch = { status: 'pending' };
const createPendingMatch = mock(async () => {
  savedMatch = { status: 'pending' };
  return 1;
});
const persistAnswer = async (_id, correct, answer, rating, _pair, change) => {
  savedMatch = {
    status: correct ? 'win' : 'lose',
    user_answer_ns: answer.ns,
    user_answer_ew: answer.ew,
    user_rating_after: rating.rating,
    user_rd_after: rating.rd,
    user_vol_after: rating.vol,
    rating_change: change,
  };
  return true;
};
const submitRatedAnswer = mock(persistAnswer);
const saveDailyProgress = mock(async () => ({}));
const getMatchForRecovery = mock(async () => savedMatch);
mock.module('../src/lib/supabase', () => ({ supabase: null }));
mock.module('../src/lib/supabaseApi', () => ({
  createPendingMatch,
  submitRatedAnswer,
  getMatchForRecovery,
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
  saveDailyProgress,
  updateBestSurvivalRatedScore: async () => true,
  updateWeaknessScoreDb: async () => null,
  migrateLocalDataToDb: async () => false,
}));
const { useGameStore } = await import('../src/stores/gameStore');
const { useAuthStore } = await import('../src/stores/authStore');

beforeEach(() => {
  createPendingMatch.mockClear();
  submitRatedAnswer.mockReset();
  submitRatedAnswer.mockImplementation(persistAnswer);
  createPendingMatch.mockImplementation(async () => {
    savedMatch = { status: 'pending' };
    return 1;
  });
  saveDailyProgress.mockReset();
  saveDailyProgress.mockImplementation(async () => ({}));
  getMatchForRecovery.mockReset();
  getMatchForRecovery.mockImplementation(async () => savedMatch);
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

test('registration failure clears the previous commitment and supports retry', async () => {
  await useGameStore.getState().startGame('survival', 'rated');
  useGameStore.getState().setUserGuess(useGameStore.getState().currentQuestion.correctDirection);
  await useGameStore.getState().submitAnswer();
  createPendingMatch.mockImplementationOnce(async () => null);
  await useGameStore.getState().nextQuestion();
  expect(useGameStore.getState().gameState.currentMatchHistoryId).toBeUndefined();
  expect(useGameStore.getState().error).toBe('question');
  expect(useGameStore.getState().isProcessing).toBe(false);
  await useGameStore.getState().nextQuestion();
  expect(useGameStore.getState().error).toBeNull();
});

test('failed RPC cannot award points, and retry confirms storage before resending', async () => {
  await useGameStore.getState().startGame('survival', 'rated');
  useGameStore.getState().setUserGuess(useGameStore.getState().currentQuestion.correctDirection);
  submitRatedAnswer.mockImplementationOnce(async () => false);
  await useGameStore.getState().submitAnswer();
  expect(useGameStore.getState().gameState.score).toBe(0);
  expect(useGameStore.getState().isShowingResult).toBe(false);
  expect(useGameStore.getState().isProcessing).toBe(false);
  await useGameStore.getState().submitAnswer();
  expect(useGameStore.getState().gameState.score).toBe(1);
  expect(useGameStore.getState().error).toBeNull();
});

test('lost response after database commit is recovered without a second write', async () => {
  await useGameStore.getState().startGame('survival', 'rated');
  useGameStore.getState().setUserGuess(useGameStore.getState().currentQuestion.correctDirection);
  submitRatedAnswer.mockImplementationOnce(async (...args) => {
    await persistAnswer(...args);
    throw new Error('lost response');
  });
  await useGameStore.getState().submitAnswer();
  await useGameStore.getState().submitAnswer();
  expect(submitRatedAnswer).toHaveBeenCalledTimes(1);
  expect(useGameStore.getState().gameState.score).toBe(1);
});

test('daily save failure keeps results unconfirmed and retries only the daily save', async () => {
  await useGameStore.getState().startGame('challenge', 'rated');
  useGameStore.getState().setUserGuess(useGameStore.getState().currentQuestion.correctDirection);
  saveDailyProgress.mockImplementationOnce(async () => null);
  await useGameStore.getState().submitAnswer();
  expect(useGameStore.getState().error).toBe('daily');
  expect(useGameStore.getState().isShowingResult).toBe(false);
  expect(useGameStore.getState().gameState.score).toBe(0);
  await useGameStore.getState().submitAnswer();
  expect(submitRatedAnswer).toHaveBeenCalledTimes(1);
  expect(saveDailyProgress).toHaveBeenCalledTimes(2);
  expect(useGameStore.getState().gameState.score).toBe(1);
});

test('duplicate submit while a read is pending is ignored and read failure permits retry', async () => {
  await useGameStore.getState().startGame('survival', 'rated');
  useGameStore.getState().setUserGuess(useGameStore.getState().currentQuestion.correctDirection);
  let rejectRead;
  getMatchForRecovery.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectRead = reject;
      }),
  );
  const pending = useGameStore.getState().submitAnswer();
  await useGameStore.getState().submitAnswer();
  expect(getMatchForRecovery).toHaveBeenCalledTimes(1);
  rejectRead(new Error('offline'));
  await pending;
  expect(useGameStore.getState().isProcessing).toBe(false);
  expect(submitRatedAnswer).toHaveBeenCalledTimes(0);
  await useGameStore.getState().submitAnswer();
  expect(useGameStore.getState().gameState.score).toBe(1);
});
