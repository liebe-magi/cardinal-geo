import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getGameResult } from '../lib/gameResults';
import { resultGameState } from '../lib/resultModel';
import { useGameStore } from '../stores/gameStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { GameResult } from '../types/result';
import { Header } from './Header';
import { ResultSummary } from './ResultSummary';
import { ShareActions } from './ShareActions';
import { AnswerReview } from './AnswerReview';

export function FinalResult() {
  const { sessionId } = useParams();
  const { lang } = useSettingsStore();
  const store = useGameStore();
  const [result, setResult] = useState<GameResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const id = sessionId ?? store.savedResult?.session.id;
  useEffect(() => {
    if (!id) {
      setStatus('missing');
      return;
    }
    let active = true;
    setStatus('loading');
    getGameResult(id)
      .then((value) => {
        if (active) {
          setResult(value);
          setStatus(value ? 'ready' : 'missing');
        }
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  const legacy = !id && store.phase === 'completed' ? store.gameState : null;
  return (
    <>
      <Header />
      <div className="space-y-5">
        {status === 'loading' && (
          <p role="status">{lang === 'ja' ? '結果を読み込み中…' : 'Loading result…'}</p>
        )}
        {status === 'error' && (
          <div role="alert">
            <p>{lang === 'ja' ? '結果を取得できませんでした。' : 'Could not load result.'}</p>
            <button onClick={() => setRetry((n) => n + 1)}>
              {lang === 'ja' ? '再試行' : 'Retry'}
            </button>
          </div>
        )}
        {status === 'missing' && !legacy && (
          <p>{lang === 'ja' ? '結果が見つかりません。' : 'Result not found.'}</p>
        )}
        {status === 'ready' && result && (
          <>
            <ResultSummary result={result} lang={lang} />
            {result.session.status === 'completed' && result.session.rating_scope && (
              <ShareActions sessionId={result.session.id} />
            )}
            <AnswerReview answers={resultGameState(result).questionHistory} lang={lang} />
          </>
        )}
        {legacy && (
          <>
            <p>
              {lang === 'ja' ? '以前の形式の結果' : 'Legacy result'} · {legacy.score} /{' '}
              {legacy.questionCount}
            </p>
            <p>
              {lang === 'ja'
                ? '保存されていないレートは表示できません。この結果は共有対象外です。'
                : 'Missing ratings are unavailable. This legacy result cannot be shared.'}
            </p>
            <AnswerReview answers={legacy.questionHistory} lang={lang} />
          </>
        )}
        <Link className="btn-glow inline-block p-3" to="/play">
          {lang === 'ja' ? 'モード選択へ' : 'Choose a mode'}
        </Link>
      </div>
    </>
  );
}
