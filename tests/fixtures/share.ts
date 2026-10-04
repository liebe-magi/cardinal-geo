import type { ShareSnapshot } from '../../src/lib/sharing';
export const shareFixture: ShareSnapshot = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  version: 1,
  payload: {
    kind: 'game',
    username: '長い表示名のテスト用ユーザー日本語とEnglish',
    lang: 'ja',
    sharedAt: '2026-10-04T00:00:00Z',
    mode: 'challenge',
    score: 10,
    answeredCount: 10,
    ratingScope: 'global',
    ratingBefore: 1500,
    ratingAfter: 1630.5,
    ratingChange: 130.5,
    challengeDate: '2026-10-03',
    completedAt: '2026-10-03T23:59:00Z',
    outcomes: Array(10).fill(true),
  },
};
