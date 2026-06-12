/**
 * MovieMode render container — HTTP API (v1: health + render stub; Remotion/ffmpeg in image v2).
 */
import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: true,
        service: 'moviemode-render',
        version: process.env.IAM_RENDER_IMAGE_TAG || 'v1-stub',
        remotion: false,
      }),
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/render') {
    let body = {};
    try {
      body = await readJson(req);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
      return;
    }
    res.writeHead(501);
    res.end(
      JSON.stringify({
        ok: false,
        error: 'render_not_implemented',
        fallback: true,
        message: 'Container lane live; Remotion+ffmpeg image pending (v2)',
        jobId: body.jobId || null,
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[moviemode-render] listening on ${PORT}`);
});
