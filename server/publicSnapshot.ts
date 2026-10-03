import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ShareSnapshot } from '../src/lib/sharing';
export const publicOrigin = () =>
  new URL(process.env.PUBLIC_SITE_URL ?? 'https://cardinalgeo.com').origin;
export async function loadPublicSnapshot(id: string): Promise<ShareSnapshot | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const base = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Share backend unavailable');
  const response = await fetch(`${base}/rest/v1/rpc/get_share_snapshot`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_public_id: id }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Share lookup failed');
  return response.json();
}
export function requestId(req: IncomingMessage) {
  return new URL(req.url ?? '/', 'http://local').searchParams.get('id') ?? '';
}
export function responseHeaders(res: ServerResponse) {
  // Check revocation on every request; no persistent CDN/browser image cache.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
}
