import type { GameResult } from '../types/result';
import type { Lang } from '../lib/i18n';
import { gameModes, ratingLabel } from '../lib/gameModes';
import { ratingText, resultView } from '../lib/resultModel';

/** Pure result card: usable without auth, store, map or browser APIs. */
export function ResultSummary({ result, lang }: { result: GameResult; lang: Lang }) {
  const { state, accuracy, record } = resultView(result);
  const ja = lang === 'ja';
  return (
    <section className="glass-card p-5 sm:p-8 space-y-4 text-center">
      <h2 className="text-xl font-bold">{gameModes[state.mode].label[lang]}</h2>
      <p>
        {result.session.status === 'completed'
          ? ja
            ? '確定結果'
            : 'Final result'
          : result.session.status === 'abandoned'
            ? ja
              ? '中断したゲーム'
              : 'Abandoned game'
            : ja
              ? 'プレイ中'
              : 'In progress'}
      </p>
      {result.session.challenge_date && <p>{result.session.challenge_date} (UTC)</p>}
      <p className="text-5xl font-bold text-primary">
        {state.score}
        <span className="text-base ml-2">{ja ? '点' : 'points'}</span>
      </p>
      <p>
        {state.questionCount} {ja ? '回答' : 'answered'} · {accuracy}% {ja ? '正答率' : 'accuracy'}
      </p>
      {record && result.session.status === 'completed' && (
        <p>
          {record === 'new'
            ? ja
              ? '新記録'
              : 'New best'
            : ja
              ? '自己最高と同点'
              : 'Tied personal best'}
        </p>
      )}
      {result.session.rating_scope && (
        <div>
          <p>
            {ratingLabel(state.mode, lang)} {ja ? 'レート' : 'rating'}
          </p>
          <p className="text-2xl">
            {ratingText(state.ratingBefore)} → {ratingText(state.ratingAfter)}
          </p>
          <p>
            {state.totalRatingChange >= 0 ? '+' : ''}
            {ratingText(state.totalRatingChange)}
          </p>
        </div>
      )}
      <p aria-label={ja ? '回答の正誤' : 'Answer results'}>
        {state.history.map((correct) => (correct ? '○' : '×')).join(' ')}
      </p>
    </section>
  );
}
