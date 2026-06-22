/**
 * IAM CAD worker container — GET /health, POST /cad/run (async headless CAD jobs).
 */
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { runCadPipelineJob } from './run-pipeline.mjs';

const PORT = Number(process.env.PORT || 8080);
const IMAGE_TAG = process.env.IAM_IMAGE_TAG || 'cad-v1';

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

function commandVersion(cmd) {
  try {
    return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8' }).trim().split('\n')[0] || '';
  } catch {
    return '';
  }
}

function toolchainProbe() {
  const openscad = commandVersion('command -v openscad >/dev/null && openscad --version 2>&1 | head -1');
  const blender = commandVersion('command -v blender >/dev/null && blender --version 2>&1 | head -1');
  const freecad = commandVersion(
    'command -v FreeCADCmd >/dev/null && FreeCADCmd --version 2>&1 | head -1 || command -v freecadcmd >/dev/null && freecadcmd --version 2>&1 | head -1',
  );
  const toolchain_ok = Boolean(openscad && blender && freecad);
  return { openscad, blender, freecad, toolchain_ok };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET' && url.pathname === '/health') {
    const tools = toolchainProbe();
    res.writeHead(tools.toolchain_ok ? 200 : 503);
    res.end(
      JSON.stringify({
        ok: tools.toolchain_ok,
        service: 'iam-cad-worker',
        version: IMAGE_TAG,
        lane: 'cad-container',
        ...tools,
      }),
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/cad/run') {
    let body = {};
    try {
      body = await readJson(req);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
      return;
    }

    const jobId = String(body.job_id || '').trim();
    const engine = String(body.engine || '').toLowerCase();
    const script = String(body.script || '');
    const r2Key = String(body.r2_key || '').trim();
    const workerOrigin = String(body.worker_origin || process.env.IAM_WORKER_ORIGIN || '').trim();
    const internalSecret = String(
      req.headers['x-internal-secret'] || body.internal_secret || process.env.INTERNAL_API_SECRET || '',
    ).trim();

    if (!jobId || !engine || !script || !r2Key) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'job_id_engine_script_r2_key_required' }));
      return;
    }
    if (!workerOrigin || !internalSecret) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'worker_origin_and_internal_secret_required' }));
      return;
    }
    if (!['openscad', 'blender', 'freecad'].includes(engine)) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'unsupported_engine', engine }));
      return;
    }

    res.writeHead(202);
    res.end(JSON.stringify({ ok: true, accepted: true, job_id: jobId, engine, lane: 'cad-container' }));

    runCadPipelineJob({
      job_id: jobId,
      engine,
      script,
      r2_key: r2Key,
      worker_origin: workerOrigin,
      internal_secret: internalSecret,
    }).catch((e) => {
      console.error('[iam-cad-worker] pipeline failed', jobId, e?.message ?? e);
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[iam-cad-worker] listening on ${PORT} tag=${IMAGE_TAG}`);
});
