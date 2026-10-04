import { expect, test } from 'bun:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import htmlHandler from '../api/share';
import imageHandler from '../api/share-image';
import { shareFixture } from './fixtures/share';

test('public endpoints use the stored snapshot, fail closed, and never cache revoked results', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://backend.example.invalid';
  process.env.SUPABASE_ANON_KEY = 'synthetic-test-key';
  let payload: unknown = shareFixture;
  let backendError = false;
  let calls = 0;
  globalThis.fetch = (async (_url, options) => {
    calls++;
    expect(JSON.parse(String(options?.body))).toEqual({ p_public_id: shareFixture.id });
    return new Response(JSON.stringify(payload), { status: backendError ? 500 : 200 });
  }) as typeof fetch;
  const request = async (handler: typeof htmlHandler, method = 'GET', id = shareFixture.id) => {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, unknown>,
      body: undefined as unknown,
      setHeader(key: string, value: unknown) {
        this.headers[key] = value;
      },
      end(body: unknown) {
        this.body = body;
      },
    };
    await handler(
      { method, url: `/api/share?id=${id}&score=99999` } as IncomingMessage,
      res as unknown as ServerResponse,
    );
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['Vercel-CDN-Cache-Control']).toBe('no-store');
    return res;
  };
  try {
    const page = await request(htmlHandler);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('10 点 / 10 回答');
    expect(page.body).not.toContain('99999');
    const png = await request(imageHandler);
    expect(png.headers['Content-Type']).toBe('image/png');
    expect((png.body as Buffer).readUInt32BE(16)).toBe(1200);
    expect((await request(imageHandler, 'HEAD')).body).toBeUndefined();
    const before = calls;
    expect((await request(htmlHandler, 'GET', 'invalid')).statusCode).toBe(404);
    expect((await request(htmlHandler, 'POST')).statusCode).toBe(405);
    expect(calls).toBe(before);
    payload = null;
    expect((await request(htmlHandler)).statusCode).toBe(404);
    expect((await request(imageHandler)).statusCode).toBe(404);
    backendError = true;
    expect((await request(htmlHandler)).statusCode).toBe(503);
    expect((await request(imageHandler)).statusCode).toBe(503);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = originalKey;
  }
});
