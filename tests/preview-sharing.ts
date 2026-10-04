// Isolated visual QA using synthetic fixtures; not part of the production build.
import { renderCardPng, renderShareHtml } from '../server/shareRendering';
import { shareFixture } from './fixtures/share';
const origin = 'http://127.0.0.1:4174';
const samples = [
  shareFixture,
  {
    ...shareFixture,
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    payload: {
      ...shareFixture.payload,
      lang: 'en',
      username: 'Long English Display Name Example 0123456789',
      score: 0,
      ratingAfter: 1480,
      ratingChange: -20,
    },
  },
  {
    ...shareFixture,
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    payload: {
      kind: 'profile',
      username: 'プロフィール表示テスト',
      lang: 'ja',
      sharedAt: '2026-10-04T00:00:00Z',
      bestScore: 100000000,
      ratings: {
        global: 1500,
        starter_rated: 1700,
        asia_rated: 1600,
        europe_rated: 1400,
        africa_rated: 1300,
        americas_rated: 1800,
        oceania_rated: 1500,
      },
    },
  },
];
Bun.serve({
  hostname: '127.0.0.1',
  port: 4174,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/')
      return new Response(
        `<h1>Local synthetic fixtures</h1>${samples.map((s) => `<p><a href="/s/${s.id}">${s.payload.username}</a></p>`).join('')}`,
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
      );
    const sample = samples.find((s) => url.pathname.includes(s.id));
    if (!sample) return new Response('Missing', { status: 404 });
    return url.pathname.endsWith('/image')
      ? new Response(renderCardPng(sample), {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
        })
      : new Response(renderShareHtml(sample, origin), {
          headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' },
        });
  },
});
console.log('Synthetic share fixtures: ' + origin);
