import { useEffect, useState } from 'react';
import { listMyShares, revokeShare } from '../lib/shareApi';
import { shareUrl } from '../lib/sharing';
import { useSettingsStore } from '../stores/settingsStore';
export function ShareHistory() {
  const { lang } = useSettingsStore(),
    ja = lang === 'ja';
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMyShares>>>([]);
  const [error, setError] = useState(false);
  const load = () =>
    listMyShares()
      .then(setRows)
      .catch(() => setError(true));
  useEffect(() => {
    void load();
  }, []);
  const revoke = async (id: string) => {
    try {
      await revokeShare(id);
      setRows((current) => current.filter((r) => r.id !== id));
    } catch {
      setError(true);
    }
  };
  return (
    <details className="glass-card p-4">
      <summary>{ja ? '公開中の共有リンクを管理' : 'Manage public share links'}</summary>
      <button
        onClick={() => {
          setError(false);
          void load();
        }}
      >
        {ja ? '一覧を更新' : 'Refresh list'}
      </button>
      {error && (
        <p role="alert">
          {ja
            ? '取得・変更に失敗しました。再試行してください。'
            : 'Could not load or update. Please retry.'}
        </p>
      )}
      <p className="text-sm">
        {ja
          ? '公開を停止しても、SNSが取得済みの画像は残る場合があります。'
          : 'Stopping sharing may not remove images already cached by social networks.'}
      </p>
      {rows.map((row) => (
        <p className="my-3" key={row.id}>
          <a className="text-primary" href={shareUrl(row.id)} target="_blank" rel="noreferrer">
            {row.createdAt.slice(0, 10)} ·{' '}
            {row.kind === 'game'
              ? ja
                ? 'プレイ結果'
                : 'Game result'
              : ja
                ? 'プロフィール'
                : 'Profile'}
          </a>{' '}
          <button onClick={() => revoke(row.id)}>{ja ? '公開停止' : 'Stop sharing'}</button>
        </p>
      ))}
    </details>
  );
}
