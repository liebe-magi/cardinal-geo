import { useEffect, useRef, useState } from 'react';
import { createShare, revokeShare } from '../lib/shareApi';
import { shareWithDevice } from '../lib/shareActions';
import { shareImageUrl, shareText, shareUrl, type ShareSnapshot } from '../lib/sharing';
import { useSettingsStore } from '../stores/settingsStore';

export function ShareActions({
  sessionId = null,
  disabled = false,
}: {
  sessionId?: string | null;
  disabled?: boolean;
}) {
  const { lang } = useSettingsStore(),
    ja = lang === 'ja';
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef<string | null>(null);
  const target = useRef(sessionId);
  target.current = sessionId;
  useEffect(() => {
    request.current = null;
    setSnapshot(null);
    setFile(null);
    setMessage('');
  }, [sessionId]);
  const prepareImage = async (value: ShareSnapshot) => {
    // Fetch our same-origin endpoint, while the share text always uses the canonical public URL.
    const response = await fetch(shareImageUrl(value, window.location.origin), {
      cache: 'no-store',
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png'))
      throw new Error('Image unavailable');
    const blob = await response.blob();
    if (target.current === sessionId)
      setFile(new File([blob], `cardinal-geo-${value.id}.png`, { type: 'image/png' }));
  };
  const prepare = async () => {
    setBusy(true);
    setMessage('');
    try {
      request.current ??= crypto.randomUUID();
      const value = snapshot ?? (await createShare(request.current, sessionId, lang));
      if (target.current !== sessionId) return;
      setSnapshot(value);
      try {
        await prepareImage(value);
      } catch {
        setMessage(
          ja
            ? 'リンクは作成済みですが、画像を取得できませんでした。画像の準備を再試行できます。'
            : 'The link is ready, but the image could not be loaded. Retry image preparation.',
        );
      }
    } catch {
      setMessage(
        ja
          ? '共有の準備に失敗しました。再試行してください。'
          : 'Could not prepare sharing. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  };
  const device = async (image: boolean) => {
    if (!snapshot) return;
    const data = {
      title: 'Cardinal Geo',
      text: shareText(snapshot),
      url: shareUrl(snapshot.id),
      ...(image && file ? { files: [file] } : {}),
    };
    // No network await before navigator.share: this click retains user activation.
    const outcome = await shareWithDevice(data);
    if (outcome === 'cancelled') {
      setMessage('');
      return;
    }
    setMessage(
      outcome === 'shared'
        ? ja
          ? '共有しました。'
          : 'Shared.'
        : outcome === 'unsupported'
          ? ja
            ? 'この端末では対応していません。URLコピーや画像保存をご利用ください。'
            : 'Sharing is unavailable here. Use URL copy or image download.'
          : ja
            ? '共有できませんでした。再試行するか、URLコピーや画像保存をご利用ください。'
            : 'Sharing failed. Retry, copy the URL, or download the image.',
    );
  };
  const copy = async () => {
    if (!snapshot) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(`${shareText(snapshot)}\n${shareUrl(snapshot.id)}`);
      setMessage(ja ? 'コピーしました。' : 'Copied.');
    } catch {
      setMessage(
        ja
          ? 'コピーできませんでした。下の文章とURLを選択してコピーできます。'
          : 'Could not copy. Select the text and URL below to copy them.',
      );
    }
  };
  const save = () => {
    if (!file) return;
    try {
      const url = URL.createObjectURL(file),
        a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(ja ? '画像の保存を開始しました。' : 'Image download started.');
    } catch {
      setMessage(
        ja
          ? '画像を保存できませんでした。下の画像リンクから開けます。'
          : 'Could not save the image. Open the image link below.',
      );
    }
  };
  const revoke = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      await revokeShare(snapshot.id);
      setSnapshot(null);
      setFile(null);
      request.current = null;
      setMessage(
        ja
          ? '公開を停止しました。SNSが取得済みのプレビューは残る場合があります。'
          : 'Sharing stopped. Previews already cached by social networks may remain.',
      );
    } catch {
      setMessage(
        ja
          ? '公開停止に失敗しました。再試行してください。'
          : 'Could not stop sharing. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="glass-card p-4 space-y-3">
      <h3 className="font-bold">{ja ? '成績を共有' : 'Share your stats'}</h3>
      <p className="text-sm text-text-secondary">
        {ja
          ? '表示名と、この時点の成績を公開します。デイリーの都市名・正解は公開しません。リンクはSNSのプレビュー用、画像共有は画像そのものの添付です。'
          : 'Your display name and stats at this time become public. Daily cities and answers stay private. Links provide social previews; image sharing attaches the image itself.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!snapshot && (
          <button className="submit-btn" disabled={disabled || busy} onClick={prepare}>
            {busy
              ? ja
                ? '準備中…'
                : 'Preparing…'
              : ja
                ? '公開リンクと画像を作成'
                : 'Create public link and image'}
          </button>
        )}
        {snapshot && (
          <>
            <button className="submit-btn" disabled={busy} onClick={() => device(false)}>
              {ja ? '共有' : 'Share'}
            </button>
            <button className="submit-btn" onClick={copy}>
              {ja ? '文章・URLをコピー' : 'Copy text and URL'}
            </button>
            {file ? (
              <>
                <button className="submit-btn" onClick={save}>
                  {ja ? '画像を保存' : 'Save image'}
                </button>
                <button className="submit-btn" onClick={() => device(true)}>
                  {ja ? '画像を添付して共有' : 'Share image'}
                </button>
              </>
            ) : (
              <button className="submit-btn" disabled={busy} onClick={prepare}>
                {busy
                  ? ja
                    ? '画像を準備中…'
                    : 'Preparing image…'
                  : ja
                    ? '画像の準備を再試行'
                    : 'Retry image preparation'}
              </button>
            )}
            <button className="submit-btn" disabled={busy} onClick={revoke}>
              {ja ? '公開を停止' : 'Stop sharing'}
            </button>
          </>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {snapshot && (
        <>
          <textarea
            className="w-full text-sm p-2 bg-surface"
            readOnly
            aria-label={ja ? '共有文とURL' : 'Share text and URL'}
            value={`${shareText(snapshot)}\n${shareUrl(snapshot.id)}`}
            rows={5}
          />
          <a
            href={shareImageUrl(snapshot)}
            target="_blank"
            rel="noreferrer"
            className="text-primary"
          >
            {ja ? '公開画像を開く' : 'Open public image'}
          </a>
        </>
      )}
    </section>
  );
}
