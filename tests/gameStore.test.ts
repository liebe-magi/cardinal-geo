import { beforeEach, expect, mock, test } from 'bun:test';
import { generateDailyChallengeQuestions } from '../src/lib/dailyChallenge';
import { checkAnswer } from '../src/lib/quiz';

const questions = generateDailyChallengeQuestions('2026-10-03');
let stored;
let nextId = 1;
const begin = async (mode, id) => {
  stored = {
    session: {
      id,
      mode,
      status: 'in_progress',
      score: 0,
      answered_count: 0,
      rating_scope: mode === 'learning' ? null : 'global',
      rating_before: null,
      rating_after: null,
      total_rating_change: 0,
      question_set: mode === 'challenge' ? questions : [],
      challenge_date: mode === 'challenge' ? '2026-10-03' : null,
      best_before: 0,
    },
    answers: [],
  };
  return structuredClone(stored);
};
const startSavedGame = mock(begin);
const issueSavedQuestion = mock(async () => ({
  id: nextId++,
  question: questions[stored.session.answered_count % 10],
}));
const persist = async (_session, id, answer) => {
  if (!stored.answers.some((a) => a.id === id)) {
    const q = questions[stored.session.answered_count % 10];
    const correct = checkAnswer(answer, q.correctDirection).isCorrect;
    const before = stored.session.rating_after ?? 1500;
    const change = correct ? 10 : -10;
    stored.answers.push({
      id,
      question_ordinal: stored.session.answered_count,
      presented_question: q,
      status: correct ? 'win' : 'lose',
      user_answer_ns: answer.ns,
      user_answer_ew: answer.ew,
      user_rating_before: before,
      user_rating_after: before + change,
      user_rd_after: 300,
      user_vol_after: 0.06,
      rating_change: change,
    });
    Object.assign(stored.session, {
      score: stored.session.score + Number(correct),
      answered_count: stored.answers.length,
      rating_before: 1500,
      rating_after: before + change,
      total_rating_change: stored.session.total_rating_change + change,
      status:
        stored.session.mode === 'challenge'
          ? stored.answers.length === 10
            ? 'completed'
            : 'in_progress'
          : correct
            ? 'in_progress'
            : 'completed',
    });
  }
  return structuredClone(stored);
};
const answerSavedQuestion = mock(persist);
const getGameResult = mock(async () => structuredClone(stored));
mock.module('../src/lib/supabase', () => ({ supabase: null }));
mock.module('../src/lib/gameResults', () => ({
  startSavedGame,
  issueSavedQuestion,
  answerSavedQuestion,
  getGameResult,
  getTodaysGame: async () => structuredClone(stored),
}));
const { useGameStore } = await import('../src/stores/gameStore');
const { useAuthStore } = await import('../src/stores/authStore');

beforeEach(() => {
  useGameStore.getState().reset();
  useAuthStore.setState({
    user: { id: 'user' },
    isAuthenticated: true,
    fetchProfile: async () => {},
  });
  startSavedGame.mockReset();
  startSavedGame.mockImplementation(begin);
  issueSavedQuestion.mockClear();
  answerSavedQuestion.mockReset();
  answerSavedQuestion.mockImplementation(persist);
  getGameResult.mockReset();
  getGameResult.mockImplementation(async () => structuredClone(stored));
});
const start = async (mode = 'survival') => useGameStore.getState().startGame(mode, 'rated');
const guess = () =>
  useGameStore.getState().setUserGuess(useGameStore.getState().currentQuestion.correctDirection);

test('only server-confirmed results advance the score, with read-before-retry after failed response', async () => {
  await start();
  guess();
  answerSavedQuestion.mockImplementationOnce(async () => {
    throw new Error('offline');
  });
  await useGameStore.getState().submitAnswer();
  expect(useGameStore.getState().gameState.score).toBe(0);
  expect(useGameStore.getState().phase).toBe('failed');
  const key = answerSavedQuestion.mock.calls[0][3];
  await useGameStore.getState().submitAnswer();
  expect(answerSavedQuestion.mock.calls[1][3]).toBe(key);
  expect(useGameStore.getState().gameState.score).toBe(1);
});
test('lost response after commit recovers without resending and duplicate submit is ignored', async () => {
  await start();
  guess();
  answerSavedQuestion.mockImplementationOnce(async (...args) => {
    await persist(...args);
    throw new Error('lost');
  });
  await useGameStore.getState().submitAnswer();
  await useGameStore.getState().submitAnswer();
  expect(answerSavedQuestion).toHaveBeenCalledTimes(1);
  expect(useGameStore.getState().gameState.score).toBe(1);
});
test('question failure has no stale match ID and can be retried', async () => {
  issueSavedQuestion.mockImplementationOnce(async () => {
    throw new Error('offline');
  });
  await start();
  expect(useGameStore.getState().gameState.currentMatchHistoryId).toBeUndefined();
  expect(useGameStore.getState().phase).toBe('failed');
  await useGameStore.getState().nextQuestion();
  expect(useGameStore.getState().phase).toBe('answering');
});
test('double starts and late responses cannot overwrite a reset demo', async () => {
  let release;
  startSavedGame.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const old = start();
  await start();
  expect(startSavedGame).toHaveBeenCalledTimes(1);
  useGameStore.getState().reset();
  useAuthStore.setState({ isAuthenticated: false });
  await useGameStore.getState().startGame('starter', 'unrated');
  release(await begin('survival', 'old'));
  await old;
  expect(useGameStore.getState().gameState.mode).toBe('starter');
  expect(useGameStore.getState().gameState.sessionId).toBeUndefined();
  expect(useGameStore.getState().phase).toBe('answering');
});
test('ten daily answers use one session and saved completion is preserved for review', async () => {
  await start('challenge');
  const id = useGameStore.getState().gameState.sessionId;
  for (let i = 0; i < 10; i++) {
    guess();
    await useGameStore.getState().submitAnswer();
    await useGameStore.getState().nextQuestion();
  }
  expect(useGameStore.getState().phase).toBe('completed');
  expect(useGameStore.getState().gameState.sessionId).toBe(id);
  expect(useGameStore.getState().gameState.questionHistory).toHaveLength(10);
  const completed = useGameStore.getState().gameState;
  await useGameStore.getState().reviewDailyResult();
  expect(useGameStore.getState().gameState.questionHistory).toEqual(completed.questionHistory);
  expect(useGameStore.getState().gameState.ratingAfter).toBe(completed.ratingAfter);
});
