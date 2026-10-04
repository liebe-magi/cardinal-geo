import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  loadPublicSnapshot,
  publicOrigin,
  requestId,
  responseHeaders,
} from '../server/publicSnapshot';
import { renderShareHtml } from '../server/shareRendering';
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  responseHeaders(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end();
    return;
  }
  try {
    const snapshot = await loadPublicSnapshot(requestId(req));
    if (!snapshot) {
      res.statusCode = 404;
      res.end('Shared result unavailable');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(req.method === 'HEAD' ? undefined : renderShareHtml(snapshot, publicOrigin()));
  } catch {
    res.statusCode = 503;
    res.end('Could not load shared result. Please retry.');
  }
}
