import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ResultSummary } from '../src/components/ResultSummary';
import { resultGameState, resultView } from '../src/lib/resultModel';
import { generateDailyChallengeQuestions } from '../src/lib/dailyChallenge';
import type { GameResult } from '../src/types/result';

const question = generateDailyChallengeQuestions('2026-10-03')[0];
const result: GameResult = {
  session: {
    id: 'saved-game',
    mode: 'survival',
    status: 'completed',
    end_reason: 'mistake',
    started_at: '2026-10-03T00:00:00Z',
    completed_at: '2026-10-03T00:10:00Z',
    challenge_date: null,
    rules_version: 1,
    question_set: [],
    score: 1,
    answered_count: 2,
    rating_scope: 'global',
    rating_before: 1500,
    rating_after: 1520,
    total_rating_change: 20,
    best_before: 0,
  },
  answers: [
    {
      id: 1,
      question_ordinal: 0,
      presented_question: question,
      status: 'win',
      user_answer_ns: question.correctDirection.ns,
      user_answer_ew: question.correctDirection.ew,
      user_rating_before: 1500,
      user_rating_after: 1540,
      user_rd_after: 300,
      user_vol_after: 0.06,
      rating_change: 40,
    },
    {
      id: 2,
      question_ordinal: 1,
      presented_question: question,
      status: 'lose',
      user_answer_ns: null,
      user_answer_ew: null,
      user_rating_before: 1540,
      user_rating_after: 1520,
      user_rd_after: 280,
      user_vol_after: 0.06,
      rating_change: -20,
    },
  ],
};

test('saved result is independent of current profile and renders new/tied records from best-before', () => {
  const original = structuredClone(result);
  const view = resultView(result);
  expect(view.record).toBe('new');
  expect(view.accuracy).toBe(50);
  expect(view.state.questionHistory[1].userAnswer).toBeNull();
  const tied = { ...result, session: { ...result.session, best_before: 1 } };
  expect(resultView(tied).record).toBe('tie');
  for (const lang of ['ja', 'en'] as const) {
    const html = renderToStaticMarkup(createElement(ResultSummary, { result, lang }));
    expect(html).toContain('1500');
    expect(html).toContain('1520');
    expect(html).toContain('50');
    expect(html).toContain(lang === 'ja' ? '新記録' : 'New best');
  }
  expect(result).toEqual(original);
});

test('missing or incomplete saved answers are never presented as a complete result', () => {
  expect(() => resultGameState({ ...result, answers: result.answers.slice(1) })).toThrow(
    'Incomplete game result',
  );
  expect(() => resultGameState({ ...result, session: { ...result.session, score: 2 } })).toThrow();
});
