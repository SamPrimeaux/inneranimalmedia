/**
 * IAM sandbox container — GET /health, POST /exec (Sam smoke / v2 lane).
 */
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8080);
const MAX_OUTPUT = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

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

function runCommand(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      cwd: cwd || '/tmp',
      env: { ...process.env, HOME: '/tmp' },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT);
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !killed,
        exit_code: killed ? 124 : code ?? 1,
        stdout,
        stderr,
        timed_out: killed,
      });
    });
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
        service: 'iam-sandbox',
        version: process.env.IAM_IMAGE_TAG || 'sandbox-v2',
        exec: true,
      }),
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/exec') {
    let body = {};
    try {
      body = await readJson(req);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
      return;
    }

    const command = String(body.command || '').trim();
    if (!command) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'command_required' }));
      return;
    }

    const cwd = body.cwd ? String(body.cwd) : '/tmp';
    const timeoutMs = Math.min(Number(body.timeout_ms) || DEFAULT_TIMEOUT_MS, 120_000);

    const result = await runCommand(command, cwd, timeoutMs);
    res.writeHead(result.ok ? 200 : 500);
    res.end(JSON.stringify({ ok: result.ok, ...result }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[iam-sandbox] listening on ${PORT}`);
});
