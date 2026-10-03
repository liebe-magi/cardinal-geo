import { create } from 'zustand';
import {
  modeCities,
  normalizeSelection,
  shouldComplete,
  isBusy,
  type GamePhase,
} from '../lib/gameModes';
import {
  answerSavedQuestion,
  getGameResult,
  getTodaysGame,
  issueSavedQuestion,
  startSavedGame,
} from '../lib/gameResults';
import { resultGameState } from '../lib/resultModel';
import { restoreDailyProgress } from '../lib/dailyProgress';
import { getDailyProgress } from '../lib/legacyResults';
import { checkAnswer, generateQuestion } from '../lib/quiz';
import { getUTCDateString } from '../lib/seededRandom';
import type { GameMode, GameState, GameSubMode, QuadDirection, Question } from '../types/game';
import { createInitialGameState } from '../types/game';
import type { GameResult } from '../types/result';
import { useAuthStore } from './authStore';

interface GameStore {
  phase: GamePhase;
  generation: number;
  gameState: GameState;
  savedResult: GameResult | null;
  currentQuestion: Question | null;
  userGuess: QuadDirection | null;
  isShowingResult: boolean;
  isProcessing: boolean;
  lastAnswerResult: { isCorrect: boolean; isPartialCorrect: boolean; ratingChange?: number } | null;
  pendingSettledCount: number;
  error: 'question' | 'answer' | 'daily' | null;
  startRequest: { id: string; mode: GameMode } | null;
  answerAttempt: { id: string; answer: QuadDirection } | null;
  startGame: (mode: GameMode, subMode: GameSubMode) => Promise<void>;
  nextQuestion: () => Promise<void>;
  setUserGuess: (guess: QuadDirection) => void;
  submitAnswer: () => Promise<void>;
  endGame: () => Promise<void>;
  reviewDailyResult: () => Promise<boolean>;
  reset: () => void;
  isRatedMode: () => boolean;
  getHighScoreCategory: () => 'survival_rated' | null;
}

const empty = () => ({
  phase: 'idle' as GamePhase,
  gameState: createInitialGameState('survival', 'rated'),
  savedResult: null,
  currentQuestion: null,
  userGuess: null,
  isShowingResult: false,
  isProcessing: false,
  lastAnswerResult: null,
  pendingSettledCount: 0,
  error: null,
  startRequest: null,
  answerAttempt: null,
});

export const useGameStore = create<GameStore>((setStore, get) => {
  const set: typeof setStore = (patch) =>
    setStore((state) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      const phase = next.phase ?? state.phase;
      return {
        ...next,
        phase,
        isProcessing: isBusy(phase),
        isShowingResult: phase === 'reviewing',
        gameState: { ...(next.gameState ?? state.gameState), isGameOver: phase === 'completed' },
      };
    });
  const scopedSet =
    (generation: number): typeof set =>
    (patch) => {
      if (get().generation === generation) set(patch);
    };
  return {
    ...empty(),
    generation: 0,
    isRatedMode: () => get().gameState.subMode === 'rated',
    getHighScoreCategory: () => (get().gameState.mode === 'survival' ? 'survival_rated' : null),
    startGame: async (mode, subMode) => {
      if (isBusy(get().phase)) return;
      const generation = get().generation + 1;
      const previousRequest = get().startRequest;
      const request =
        previousRequest?.mode === mode && get().phase === 'failed'
          ? previousRequest
          : { id: crypto.randomUUID(), mode };
      set({ ...empty(), generation, phase: 'starting', startRequest: request });
      const update = scopedSet(generation);
      try {
        // The landing-page demo is the only anonymous game, and never writes ratings.
        if (!useAuthStore.getState().isAuthenticated) {
          if (mode !== 'starter' || subMode !== 'unrated')
            throw new Error('Authentication required');
          update({ gameState: createInitialGameState('starter', 'unrated'), phase: 'idle' });
        } else {
          const selection = normalizeSelection(mode, subMode);
          const result = await startSavedGame(selection.mode, request.id);
          update({
            savedResult: result,
            gameState: resultGameState(result),
            phase: result.session.status === 'completed' ? 'completed' : 'idle',
            startRequest: null,
          });
        }
        if (get().generation !== generation || get().phase === 'completed') return;
        await get().nextQuestion();
      } catch (error) {
        update({ phase: 'failed', error: 'question' });
        throw error;
      }
    },
    nextQuestion: async () => {
      const state = get();
      if (
        !['idle', 'reviewing', 'failed'].includes(state.phase) ||
        state.error === 'answer' ||
        state.error === 'daily'
      )
        return;
      if (state.phase === 'reviewing' && shouldComplete(state.gameState)) {
        await get().endGame();
        return;
      }
      if (!state.gameState.sessionId && useAuthStore.getState().isAuthenticated) {
        await get().startGame(
          state.startRequest?.mode ?? state.gameState.mode,
          state.gameState.subMode,
        );
        return;
      }
      const generation = state.generation;
      const update = scopedSet(generation);
      update({
        phase: 'starting',
        error: null,
        userGuess: null,
        lastAnswerResult: null,
        gameState: { ...state.gameState, currentMatchHistoryId: undefined },
      });
      try {
        if (state.gameState.sessionId) {
          const issued = await issueSavedQuestion(state.gameState.sessionId);
          update({
            currentQuestion: issued.question,
            phase: 'answering',
            gameState: { ...state.gameState, currentMatchHistoryId: issued.id },
          });
        } else {
          update({
            currentQuestion: generateQuestion(modeCities('starter') ?? undefined),
            phase: 'answering',
          });
        }
      } catch {
        update({ phase: 'failed', error: 'question' });
      }
    },
    setUserGuess: (guess) => {
      if (get().phase === 'answering' && !get().answerAttempt) set({ userGuess: guess });
    },
    submitAnswer: async () => {
      const state = get();
      if (
        !['answering', 'failed'].includes(state.phase) ||
        state.error === 'question' ||
        !state.currentQuestion ||
        !state.userGuess
      )
        return;
      const generation = state.generation;
      const update = scopedSet(generation);
      const attempt = state.answerAttempt ?? {
        id: crypto.randomUUID(),
        answer: { ...state.userGuess },
      };
      update({ phase: 'submitting', error: null, answerAttempt: attempt });
      try {
        if (state.gameState.sessionId) {
          const id = state.gameState.currentMatchHistoryId;
          if (id === undefined) throw new Error('Missing commitment');
          let result: GameResult | null;
          try {
            result = await answerSavedQuestion(
              state.gameState.sessionId,
              id,
              attempt.answer,
              attempt.id,
            );
          } catch {
            // A response can be lost after commit. Recovery is read-only; a retry uses the same ID.
            result = await getGameResult(state.gameState.sessionId);
            if (!result?.answers.some((a) => a.id === id)) throw new Error('Save not confirmed');
          }
          if (get().generation !== generation) return;
          const gameState = resultGameState(result);
          const saved = result.answers.find((a) => a.id === id);
          if (!saved) throw new Error('Save not confirmed');
          const userAnswer =
            saved.user_answer_ns && saved.user_answer_ew
              ? { ns: saved.user_answer_ns, ew: saved.user_answer_ew }
              : null;
          const checked = userAnswer
            ? checkAnswer(userAnswer, saved.presented_question.correctDirection)
            : { isCorrect: false, isPartialCorrect: false };
          update({
            savedResult: result,
            gameState: { ...gameState, currentMatchHistoryId: id },
            currentQuestion: saved.presented_question,
            userGuess: userAnswer,
            phase: 'reviewing',
            answerAttempt: null,
            lastAnswerResult: {
              ...checked,
              ratingChange: result.session.rating_scope ? saved.rating_change : undefined,
            },
          });
          void useAuthStore.getState().fetchProfile();
        } else {
          const checked = checkAnswer(attempt.answer, state.currentQuestion.correctDirection);
          const record = { ...state.currentQuestion, userAnswer: attempt.answer, ...checked };
          update({
            phase: 'reviewing',
            answerAttempt: null,
            lastAnswerResult: checked,
            gameState: {
              ...state.gameState,
              questionCount: state.gameState.questionCount + 1,
              score: state.gameState.score + Number(checked.isCorrect),
              history: [...state.gameState.history, checked.isCorrect],
              questionHistory: [...state.gameState.questionHistory, record],
            },
          });
        }
      } catch {
        update({ phase: 'failed', error: 'answer' });
      }
    },
    endGame: async () => {
      const state = get();
      if (state.phase !== 'reviewing' || !shouldComplete(state.gameState)) return;
      if (state.savedResult && state.savedResult.session.status !== 'completed') {
        set({ phase: 'failed', error: 'answer' });
        return;
      }
      set({ phase: 'completed' });
    },
    reviewDailyResult: async () => {
      if (isBusy(get().phase) || !useAuthStore.getState().isAuthenticated) return false;
      const generation = get().generation + 1;
      set({ generation, phase: 'starting', error: null });
      const update = scopedSet(generation);
      try {
        const result = await getTodaysGame();
        if (result?.session.status === 'completed') {
          update({
            ...empty(),
            gameState: resultGameState(result),
            savedResult: result,
            phase: 'completed',
          });
        } else {
          // Historical completed Daily data remains reviewable, but is never promoted to a shareable session.
          const progress = await getDailyProgress(getUTCDateString(), true);
          if (!progress || progress.status !== 'completed')
            throw new Error('No completed daily result');
          update({
            ...empty(),
            gameState: {
              ...createInitialGameState('challenge', 'rated'),
              ...restoreDailyProgress(progress),
            },
            phase: 'completed',
          });
        }
        return get().generation === generation;
      } catch {
        update({ phase: 'failed', error: 'daily' });
        return false;
      }
    },
    reset: () => set({ ...empty(), generation: get().generation + 1 }),
  };
});
