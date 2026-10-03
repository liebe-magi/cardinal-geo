import type { GameMode } from '../types/game';
import type { Lang } from './i18n';
import { gameModes, ratingLabel } from './gameModes';
import { ratingText } from './resultModel';

interface ShareBase {
  username: string;
  lang: Lang;
  sharedAt: string;
}
export type SharePayload = ShareBase &
  (
    | {
        kind: 'game';
        mode: GameMode;
        score: number;
        answeredCount: number;
        ratingScope: string;
        ratingBefore: number | null;
        ratingAfter: number | null;
        ratingChange: number;
        challengeDate: string | null;
        completedAt: string;
        outcomes: boolean[];
      }
    | { kind: 'profile'; bestScore: number; ratings: Record<string, number> }
  );
export interface ShareSnapshot {
  id: string;
  version: number;
  payload: SharePayload;
}
export const SHARE_TEMPLATE_VERSION = 1;
export const PUBLIC_SITE_URL = 'https://cardinalgeo.com';
export const shareUrl = (id: string, origin = PUBLIC_SITE_URL) => `${origin}/s/${id}`;
export const shareImageUrl = (snapshot: ShareSnapshot, origin = PUBLIC_SITE_URL) =>
  `${shareUrl(snapshot.id, origin)}/image?v=${snapshot.version}-${SHARE_TEMPLATE_VERSION}`;
export function scopeLabel(scope: string, lang: Lang): string {
  if (scope === 'global') return 'Global';
  const mode = scope.replace(/_rated$/, '') as GameMode;
  return gameModes[mode]?.label[lang] ?? scope;
}
export function shareText(snapshot: ShareSnapshot): string {
  const p = snapshot.payload,
    ja = p.lang === 'ja';
  const lines = ['Cardinal Geo', p.username];
  if (p.kind === 'game') {
    lines.push(
      `${gameModes[p.mode].label[p.lang]} · ${p.score} ${ja ? '点' : 'points'} / ${p.answeredCount} ${ja ? '回答' : 'answered'}`,
    );
    lines.push(
      `${ratingLabel(p.mode, p.lang)} ${ja ? 'レート' : 'rating'}: ${ratingText(p.ratingBefore)} → ${ratingText(p.ratingAfter)} (${p.ratingChange >= 0 ? '+' : ''}${ratingText(p.ratingChange)})`,
    );
    if (p.challengeDate)
      lines.push(`${p.challengeDate} (UTC) · ${p.outcomes.map((v) => (v ? '○' : '×')).join(' ')}`);
    else lines.push(`${ja ? '結果日時' : 'Completed'}: ${p.completedAt.slice(0, 10)} (UTC)`);
  } else {
    lines.push(ja ? '共有時の戦績' : 'Stats at sharing time');
    for (const [scope, value] of Object.entries(p.ratings))
      lines.push(`${scopeLabel(scope, p.lang)} ${ja ? 'レート' : 'rating'}: ${ratingText(value)}`);
    lines.push(`${ja ? 'サバイバル最高' : 'Survival best'}: ${p.bestScore}`);
  }
  lines.push(`${ja ? '共有日時' : 'Shared'}: ${p.sharedAt.slice(0, 10)} (UTC)`);
  return lines.join('\n');
}
export function escapeMarkup(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
