import http from 'node:http';
import { handleLaunchDeskChat } from '../src/api/launch-desk.js';

const port = Number(process.env.PORT || 8787);

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function toHeaders(rawHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value != null) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  const method = (req.method || 'GET').toUpperCase();

  if (url.pathname === '/api/health') {
    const body = JSON.stringify({ ok: true, backend: 'launch-desk-dev-server' }, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(body);
    return;
  }

  if (url.pathname === '/api/launch-desk') {
    const body = ['GET', 'HEAD'].includes(method) ? undefined : await readRequestBody(req);
    const request = new Request(url, {
      method,
      headers: toHeaders(req.headers),
      body,
    });
    const ctx = {
      waitUntil(promise) {
        void promise.catch((err) => console.error('[launch-desk-dev-server] trace flush failed', err));
      },
    };
    const response = await handleLaunchDeskChat(request, {}, ctx);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    pump().catch((err) => {
      console.error('[launch-desk-dev-server] stream error', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(String(err));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }, null, 2));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[launch-desk-dev-server] listening on http://127.0.0.1:${port}`);
});
