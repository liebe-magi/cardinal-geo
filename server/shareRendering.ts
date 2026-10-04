import { Resvg } from '@resvg/resvg-js';
import { join } from 'node:path';
import {
  escapeMarkup as esc,
  shareImageUrl,
  shareText,
  shareUrl,
  scopeLabel,
  type ShareSnapshot,
} from '../src/lib/sharing';
import { gameModes, ratingLabel } from '../src/lib/gameModes';
import { ratingText } from '../src/lib/resultModel';

const shorten = (value: string, length: number) =>
  Array.from(value).length > length
    ? Array.from(value)
        .slice(0, length - 1)
        .join('') + '…'
    : value;
export function renderCardSvg(snapshot: ShareSnapshot): string {
  const p = snapshot.payload,
    ja = p.lang === 'ja';
  const text = (x: number, y: number, size: number, value: unknown, color = '#edf6ff') =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${esc(value)}</text>`;
  let content =
    text(64, 82, 30, 'CARDINAL GEO', '#62e4e6') + text(64, 150, 34, shorten(p.username, 30));
  if (p.kind === 'game') {
    content += text(64, 207, 28, gameModes[p.mode].label[p.lang], '#afc2d5');
    content += text(64, 357, Math.min(124, 540 / Math.max(String(p.score).length, 1)), p.score);
    content += text(
      64,
      408,
      25,
      `${ja ? 'スコア' : 'SCORE'} · ${p.answeredCount} ${ja ? '回答' : 'answered'}`,
      '#afc2d5',
    );
    content += text(
      630,
      265,
      28,
      `${ratingLabel(p.mode, p.lang)} ${ja ? 'レート' : 'rating'}`,
      '#62e4e6',
    );
    content += text(630, 332, 43, `${ratingText(p.ratingBefore)} → ${ratingText(p.ratingAfter)}`);
    content += text(
      630,
      393,
      32,
      `${p.ratingChange >= 0 ? '+' : ''}${ratingText(p.ratingChange)}`,
      p.ratingChange >= 0 ? '#7cdda6' : '#ffaaa7',
    );
    content += text(
      64,
      483,
      28,
      p.challengeDate
        ? `${p.challengeDate} (UTC) · ${p.outcomes.map((v) => (v ? '○' : '×')).join(' ')}`
        : `${ja ? '結果日時' : 'Completed'}: ${p.completedAt.slice(0, 10)} (UTC)`,
    );
  } else {
    content += text(64, 212, 26, ja ? '共有時の戦績' : 'Stats at sharing time', '#afc2d5');
    Object.entries(p.ratings)
      .slice(0, 8)
      .forEach(([scope, value], index) => {
        const x = 64 + (index % 2) * 560,
          y = 278 + Math.floor(index / 2) * 57;
        content += text(x, y, 25, `${scopeLabel(scope, p.lang)}: ${ratingText(value)}`);
      });
    content += text(
      64,
      516,
      26,
      `${ja ? 'サバイバル最高' : 'Survival best'}: ${p.bestScore}`,
      '#62e4e6',
    );
  }
  content +=
    text(
      64,
      580,
      22,
      `${ja ? '共有日時' : 'Shared'}: ${p.sharedAt.slice(0, 10)} (UTC)`,
      '#afc2d5',
    ) + text(914, 580, 22, 'cardinalgeo.com', '#afc2d5');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0b1525"/><rect x="24" y="24" width="1152" height="582" rx="24" fill="#14243a" stroke="#28556d"/><g font-family="Noto Sans JP">${content}</g></svg>`;
}
export function renderCardPng(snapshot: ShareSnapshot): Buffer {
  const font = join(process.cwd(), 'public/fonts/NotoSansJP.ttf');
  return new Resvg(renderCardSvg(snapshot), {
    font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: 'Noto Sans JP' },
  })
    .render()
    .asPng();
}
export function renderShareHtml(snapshot: ShareSnapshot, origin: string): string {
  const description = shareText(snapshot),
    url = shareUrl(snapshot.id, origin),
    image = shareImageUrl(snapshot, origin);
  const ja = snapshot.payload.lang === 'ja';
  return `<!doctype html><html lang="${snapshot.payload.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(snapshot.payload.username)} · Cardinal Geo</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="${esc(url)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(snapshot.payload.username)} · Cardinal Geo"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(description)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(snapshot.payload.username)} · Cardinal Geo"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"><meta name="twitter:image:alt" content="${esc(description)}"><style>body{max-width:900px;margin:40px auto;padding:20px;background:#0b1525;color:#edf6ff;font:18px system-ui;line-height:1.7}img{width:100%;height:auto;border-radius:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#62e4e6}</style></head><body><h1>Cardinal Geo</h1><img src="${esc(image)}" width="1200" height="630" alt="${esc(description)}"><pre>${esc(description)}</pre><p>${ja ? 'この成績は共有時点の記録です。' : 'These stats are a snapshot from the time of sharing.'}</p><p><a href="${esc(image)}">${ja ? '画像を開く・再読み込み' : 'Open / reload image'}</a> · <a href="${esc(origin)}">${ja ? 'プレイする' : 'Play Cardinal Geo'}</a></p></body></html>`;
}
