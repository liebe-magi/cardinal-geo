import type { GameResult } from '../types/result';
import { createInitialGameState, type GameState } from '../types/game';
import { checkAnswer } from './quiz';

export function resultGameState(result: GameResult): GameState {
  const { session, answers } = result;
  if (
    answers.length !== session.answered_count ||
    answers.filter((a) => a.status === 'win').length !== session.score
  ) {
    throw new Error('Incomplete game result');
  }
  const last = answers[answers.length - 1];
  return {
    ...createInitialGameState(session.mode, session.mode === 'learning' ? 'unrated' : 'rated'),
    sessionId: session.id,
    score: session.score,
    questionCount: session.answered_count,
    isGameOver: session.status === 'completed',
    totalRatingChange: session.total_rating_change,
    ratingBefore: session.rating_before ?? undefined,
    ratingAfter: session.rating_after ?? undefined,
    currentPlayerRating:
      last?.user_rating_after != null && last.user_rd_after != null && last.user_vol_after != null
        ? { rating: last.user_rating_after, rd: last.user_rd_after, vol: last.user_vol_after }
        : undefined,
    history: answers.map((a) => a.status === 'win'),
    questionHistory: answers.map((a) => {
      const userAnswer =
        a.user_answer_ns && a.user_answer_ew
          ? { ns: a.user_answer_ns, ew: a.user_answer_ew }
          : null;
      return {
        ...a.presented_question,
        userAnswer,
        isCorrect: a.status === 'win',
        isPartialCorrect: userAnswer
          ? checkAnswer(userAnswer, a.presented_question.correctDirection).isPartialCorrect
          : false,
        ratingBefore: session.rating_scope ? a.user_rating_before : undefined,
        ratingAfter: a.user_rating_after ?? undefined,
        ratingChange: session.rating_scope ? a.rating_change : undefined,
      };
    }),
  };
}

export function resultView(result: GameResult) {
  const state = resultGameState(result);
  return {
    state,
    accuracy: state.questionCount ? Math.round((state.score / state.questionCount) * 100) : 0,
    record:
      result.session.best_before === null
        ? null
        : state.score > result.session.best_before
          ? 'new'
          : state.score === result.session.best_before
            ? 'tie'
            : null,
  };
}
export function ratingText(value: number | null | undefined) {
  return value == null ? '—' : String(Math.round(value));
}
