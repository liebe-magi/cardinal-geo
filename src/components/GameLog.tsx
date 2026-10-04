import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameModes } from '../lib/gameModes';
import { listGameSessions } from '../lib/gameResults';
import type { GameMode } from '../types/game';
import type { GameSession } from '../types/result';
import { useSettingsStore } from '../stores/settingsStore';
import { Header } from './Header';
import { LegacyGameLog } from './LegacyGameLog';

export function GameLog() {
  const { lang } = useSettingsStore();
  const [mode, setMode] = useState<GameMode>('survival');
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [legacy, setLegacy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setHasMore(false);
    setLoadingMore(false);
    setMoreError(false);
    let active = true;
    setLoading(true);
    setError(false);
    setSessions([]);
    listGameSessions(mode)
      .then((rows) => {
        if (active) {
          setSessions(rows);
          setHasMore(rows.length === 30);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, retry]);
  const loadMore = async () => {
    if (loadingMore || !sessions.length) return;
    const current = generation.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const rows = await listGameSessions(mode, sessions[sessions.length - 1]);
      if (current === generation.current) {
        setSessions((previous) => [...previous, ...rows]);
        setHasMore(rows.length === 30);
      }
    } catch {
      if (current === generation.current) setMoreError(true);
    } finally {
      if (current === generation.current) setLoadingMore(false);
    }
  };
  return (
    <>
      <Header />
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{lang === 'ja' ? 'ゲームログ' : 'Game log'}</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(gameModes) as GameMode[]).map((key) => (
            <button
              className="px-3 py-2 rounded border border-white/20"
              aria-pressed={mode === key}
              key={key}
              onClick={() => setMode(key)}
            >
              {gameModes[key].label[lang]}
            </button>
          ))}
        </div>
        {loading && <p role="status">{lang === 'ja' ? '読み込み中…' : 'Loading…'}</p>}
        {error && (
          <button role="alert" onClick={() => setRetry((n) => n + 1)}>
            {lang === 'ja' ? '取得できませんでした。再試行' : 'Could not load. Retry'}
          </button>
        )}
        {!loading && !error && !sessions.length && (
          <p>{lang === 'ja' ? 'ゲームがありません。' : 'No games yet.'}</p>
        )}
        {sessions.map((s) => (
          <Link className="glass-card block p-4" to={`/result/final/${s.id}`} key={s.id}>
            <p>
              {s.score} {lang === 'ja' ? '点' : 'points'} / {s.answered_count}{' '}
              {lang === 'ja' ? '回答' : 'answered'}
            </p>
            <p>
              {s.status === 'completed'
                ? lang === 'ja'
                  ? '完了'
                  : 'Completed'
                : s.status === 'abandoned'
                  ? lang === 'ja'
                    ? '中断'
                    : 'Abandoned'
                  : lang === 'ja'
                    ? 'プレイ中'
                    : 'In progress'}
            </p>
            <time>{new Date(s.completed_at ?? s.started_at).toLocaleString(lang)}</time>
          </Link>
        ))}
        {moreError && (
          <p role="alert">
            {lang === 'ja' ? '追加の履歴を取得できませんでした。' : 'Could not load more games.'}
          </p>
        )}
        {hasMore && (
          <button disabled={loadingMore} onClick={loadMore}>
            {loadingMore
              ? lang === 'ja'
                ? '読み込み中…'
                : 'Loading…'
              : lang === 'ja'
                ? 'さらに読み込む'
                : 'Load more'}
          </button>
        )}
        <button onClick={() => setLegacy((v) => !v)}>
          {lang === 'ja' ? '旧形式の履歴を表示' : 'Show legacy history'}
        </button>
        {legacy && (
          <>
            <p>
              {lang === 'ja'
                ? '旧履歴は回答単位の記録です。終了状態を確認できないため、確定結果として共有できません。'
                : 'Legacy history contains individual answers without a confirmed completion state and cannot be shared.'}
            </p>
            <LegacyGameLog />
          </>
        )}
      </div>
    </>
  );
}
