import { expect, test } from 'bun:test';
import { shareWithDevice } from '../src/lib/shareActions';
import { shareText, shareImageUrl } from '../src/lib/sharing';
import { renderCardPng, renderCardSvg, renderShareHtml } from '../server/shareRendering';

import { shareFixture } from './fixtures/share';

test('cancel does not invoke a clipboard fallback; failures and unsupported devices are distinct', async () => {
  expect(
    await shareWithDevice(
      { text: 'x' },
      {
        share: async () => {
          throw new DOMException('cancel', 'AbortError');
        },
      },
    ),
  ).toBe('cancelled');
  expect(
    await shareWithDevice(
      { text: 'x' },
      {
        share: async () => {
          throw new Error('denied');
        },
      },
    ),
  ).toBe('failed');
  expect(await shareWithDevice({ text: 'x' }, {})).toBe('unsupported');
  let calls = 0;
  expect(
    await shareWithDevice(
      { files: [new File(['x'], 'x.png')] },
      {
        canShare: () => false,
        share: async () => {
          calls++;
        },
      },
    ),
  ).toBe('unsupported');
  expect(calls).toBe(0);
  expect(await shareWithDevice({ text: 'x' }, { share: async () => {} })).toBe('shared');
});
test('initial HTML has result-specific metadata, canonical links, no injected markup', () => {
  const malicious = {
    ...shareFixture,
    payload: { ...shareFixture.payload, username: '<script>alert("x")</script>' },
  };
  const html = renderShareHtml(malicious, 'https://cardinalgeo.com');
  expect(html).toContain('property="og:image"');
  expect(html).toContain(shareImageUrl(shareFixture));
  expect(html).toContain('1500 → 1631');
  expect(html).toContain('10 点 / 10 回答');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(shareText(shareFixture)).toContain('2026-10-03 (UTC)');
});
test('Japanese and English cards render as distinct 1200x630 PNGs for edge cases', () => {
  const first = renderCardPng(shareFixture);
  expect(first.subarray(1, 4).toString()).toBe('PNG');
  expect(first.readUInt32BE(16)).toBe(1200);
  expect(first.readUInt32BE(20)).toBe(630);
  for (const lang of ['ja', 'en'] as const)
    for (const score of [0, 10, 100000000])
      for (const change of [-20, 0, 20]) {
        const value = {
          ...shareFixture,
          payload: {
            ...shareFixture.payload,
            lang,
            score,
            ratingChange: change,
            ratingAfter: 1500 + change,
          },
        };
        expect(renderCardPng(value).byteLength).toBeGreaterThan(10000);
        expect(renderCardSvg(value)).toContain(String(score));
      }
  const second = renderCardPng({ ...shareFixture, payload: { ...shareFixture.payload, score: 0 } });
  expect(first.equals(second)).toBe(false);
});
