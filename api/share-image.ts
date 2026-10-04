import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadPublicSnapshot, requestId, responseHeaders } from '../server/publicSnapshot';
import { renderCardPng } from '../server/shareRendering';
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
    const png = renderCardPng(snapshot);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', png.byteLength);
    res.end(req.method === 'HEAD' ? undefined : png);
  } catch {
    res.statusCode = 503;
    res.end('Could not generate image. Please retry.');
  }
}
