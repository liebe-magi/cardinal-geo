import type { QuestionRecord } from '../types/game';
import type { Lang } from '../lib/i18n';
import { formatDirection } from '../lib/quiz';
import { ResultMap } from './ResultMap';

export function AnswerReview({ answers, lang }: { answers: QuestionRecord[]; lang: Lang }) {
  return (
    <div className="space-y-3">
      {answers.map((answer, index) => (
        <details key={index} className="glass-card p-4">
          <summary className="cursor-pointer">
            Q{index + 1} {answer.isCorrect ? '○' : '×'} ·{' '}
            {lang === 'ja' ? answer.cityB.capitalJp : answer.cityB.capitalEn} →{' '}
            {lang === 'ja' ? answer.cityA.capitalJp : answer.cityA.capitalEn}
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              {lang === 'ja' ? '正解' : 'Correct'}: {formatDirection(answer.correctDirection, lang)}{' '}
              · {lang === 'ja' ? '回答' : 'Answer'}:{' '}
              {answer.userAnswer ? formatDirection(answer.userAnswer, lang) : '—'}
            </p>
            <ResultMap cityA={answer.cityA} cityB={answer.cityB} />
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Origin', answer.cityB],
                ['Target', answer.cityA],
              ].map(([role, city]) => {
                if (typeof city === 'string') return null;
                const name = lang === 'ja' ? city.capitalJp : city.capitalEn;
                return (
                  <div key={String(role)}>
                    <p>
                      {String(role)} · {name}
                    </p>
                    <p>
                      {city.lat} / {city.lon}
                    </p>
                    <a
                      className="text-primary"
                      href={`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(name)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wikipedia
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
