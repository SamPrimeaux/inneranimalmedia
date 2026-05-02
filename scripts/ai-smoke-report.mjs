#!/usr/bin/env node
/**
 * ai-smoke-report.mjs — Short provider/matrix runs through POST /api/agent/chat (streaming).
 *
 * Why this exists: one JSON/JSONL folder per run so you can diff success rate, latency,
 * and token usage over time without parsing terminal scrollback.
 *
 * Usage:
 *   SESSION_COOKIE='session=<uuid>' node scripts/ai-smoke-report.mjs
 *   BASE_URL=https://inneranimalmedia.com SESSION_COOKIE='session=...' node scripts/ai-smoke-report.mjs
 *
 * Env:
 *   SESSION_COOKIE   Required (or raw uuid — script adds session= prefix).
 *   BASE_URL         Default https://inneranimal-dashboard.meauxbility.workers.dev
 *   SMOKE_MODELS     Comma-separated model keys (default: small built-in set)
 *   SMOKE_MODES      Comma-separated modes (default: ask)
 *   PER_REQUEST_MS   Abort per request (default 120000)
 *   DRY_RUN          1 = no HTTP, print plan only
 *
 * Artifacts (gitignored reports/ is fine; commit summaries if you want history):
 *   reports/ai-smoke/<runId>/summary.json
 *   reports/ai-smoke/<runId>/results.jsonl
 *   reports/ai-smoke/<runId>/INDEX.txt
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function loadEnvCloudflare() {
  const p = path.join(REPO_ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnvCloudflare();

const BASE_URL = (process.env.BASE_URL || 'https://inneranimal-dashboard.meauxbility.workers.dev').replace(/\/$/, '');
const SESSION_RAW = String(process.env.SESSION_COOKIE || '').trim();
const COOKIE = SESSION_RAW.includes('=') ? SESSION_RAW : SESSION_RAW ? `session=${SESSION_RAW}` : '';
const DRY = process.env.DRY_RUN === '1';
const PER_MS = Math.max(5000, Number(process.env.PER_REQUEST_MS) || 120000);

const DEFAULT_MODELS = [
  'claude-haiku-4-5-20251001',
  'gpt-4o-mini',
  'gemini-2.0-flash',
  'google_gemini_3_1_flash_lite',
];
const MODELS = (process.env.SMOKE_MODELS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const RUN_MODELS = MODELS.length ? MODELS : DEFAULT_MODELS;

const MODES = (process.env.SMOKE_MODES || 'ask')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'ai-smoke', RUN_ID);

const PROMPT =
  process.env.SMOKE_PROMPT ||
  'Reply with exactly one line: SMOKE_OK followed by nothing else. No markdown.';

function gitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function cookieHeaders() {
  if (!COOKIE) return {};
  return { Cookie: COOKIE };
}

/**
 * Parse SSE body: first text chunk time, final done payload.
 */
async function runOneChat({ model, mode, conversationId }) {
  const t0 = Date.now();
  let firstTextMs = null;
  let donePayload = null;
  let errorPayload = null;
  let textChars = 0;
  let httpStatus = 0;

  if (DRY) {
    return {
      ok: true,
      dry_run: true,
      wall_ms: 0,
      first_text_ms: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      model_used: model,
      text_chars: 0,
      http_status: 0,
    };
  }

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), PER_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cookieHeaders() },
      signal: ac.signal,
      body: JSON.stringify({
        message: PROMPT,
        model,
        mode,
        stream: true,
        conversationId,
      }),
    });
    httpStatus = res.status;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      clearTimeout(to);
      return {
        ok: false,
        wall_ms: Date.now() - t0,
        first_text_ms: null,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        model_used: model,
        text_chars: 0,
        http_status: httpStatus,
        error: errText.slice(0, 500),
      };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      clearTimeout(to);
      return {
        ok: false,
        wall_ms: Date.now() - t0,
        error: 'no_body',
        http_status: httpStatus,
        model_used: model,
      };
    }
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const block of parts) {
        for (const rawLine of block.split('\n')) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          let j;
          try {
            j = JSON.parse(payload);
          } catch {
            continue;
          }
          if (j.type === 'text' && typeof j.text === 'string' && j.text.length && firstTextMs == null) {
            firstTextMs = Date.now() - t0;
          }
          if (j.type === 'text' && typeof j.text === 'string') textChars += j.text.length;
          if (j.type === 'done') donePayload = j;
          if (j.type === 'error') errorPayload = j;
        }
      }
    }
    clearTimeout(to);
    const wall = Date.now() - t0;
    const ok = !errorPayload && httpStatus === 200 && (donePayload != null || textChars > 0);
    return {
      ok,
      wall_ms: wall,
      first_text_ms: firstTextMs,
      input_tokens: Number(donePayload?.input_tokens ?? 0) || 0,
      output_tokens: Number(donePayload?.output_tokens ?? 0) || 0,
      cost_usd: Number(donePayload?.cost_usd ?? 0) || 0,
      model_used: String(donePayload?.model_used || model),
      text_chars: textChars,
      http_status: httpStatus,
      error: errorPayload?.error ? String(errorPayload.error).slice(0, 400) : undefined,
    };
  } catch (e) {
    clearTimeout(to);
    return {
      ok: false,
      wall_ms: Date.now() - t0,
      error: e.name === 'AbortError' ? 'timeout' : String(e.message || e).slice(0, 400),
      http_status: httpStatus,
      model_used: model,
    };
  }
}

async function main() {
  if (!COOKIE && !DRY) {
    console.error('Set SESSION_COOKIE (session=uuid or uuid). Loaded .env.cloudflare if present.');
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonlPath = path.join(OUT_DIR, 'results.jsonl');

  const rows = [];
  for (const mode of MODES) {
    for (const model of RUN_MODELS) {
      const conversationId = `smoke_${RUN_ID.replace(/[^a-zA-Z0-9_-]/g, '')}_${model.slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      process.stdout.write(`  ${model} (${mode}) ... `);
      const r = await runOneChat({ model, mode, conversationId });
      const record = {
        run_id: RUN_ID,
        ts: new Date().toISOString(),
        base_url: BASE_URL,
        model_requested: model,
        mode,
        conversation_id: conversationId,
        artifact_dir: `reports/ai-smoke/${RUN_ID}`,
        ...r,
      };
      rows.push(record);
      console.log(r.ok ? `${r.wall_ms}ms in=${r.input_tokens} out=${r.output_tokens} $${r.cost_usd}` : `FAIL ${r.error || r.http_status}`);
    }
  }
  writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  const passed = rows.filter((r) => r.ok).length;
  const summary = {
    run_id: RUN_ID,
    created_at: new Date().toISOString(),
    base_url: BASE_URL,
    git_short: gitHash(),
    prompt_preview: PROMPT.slice(0, 120),
    total: rows.length,
    passed,
    failed: rows.length - passed,
    success_rate: rows.length ? passed / rows.length : 0,
    by_provider: {},
  };

  for (const r of rows) {
    const key = r.model_requested.split(/[-_]/)[0] || 'unknown';
    if (!summary.by_provider[key]) summary.by_provider[key] = { n: 0, passed: 0, wall_ms_sum: 0 };
    summary.by_provider[key].n++;
    if (r.ok) summary.by_provider[key].passed++;
    summary.by_provider[key].wall_ms_sum += r.wall_ms || 0;
  }
  for (const k of Object.keys(summary.by_provider)) {
    const b = summary.by_provider[k];
    b.success_rate = b.n ? b.passed / b.n : 0;
    b.avg_wall_ms = b.n ? Math.round(b.wall_ms_sum / b.n) : 0;
    delete b.wall_ms_sum;
  }

  const summaryPath = path.join(OUT_DIR, 'summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  const indexTxt = [
    `AI smoke run ${RUN_ID}`,
    `Base: ${BASE_URL}`,
    '',
    `summary.json  — aggregates (success rate, by_provider)`,
    `results.jsonl — one JSON per line (wall_ms, tokens, cost, errors)`,
    '',
    `Compare runs: jq '.success_rate' reports/ai-smoke/*/summary.json`,
    `Failures:      grep '"ok":false' reports/ai-smoke/${RUN_ID}/results.jsonl`,
    '',
  ].join('\n');
  writeFileSync(path.join(OUT_DIR, 'INDEX.txt'), indexTxt, 'utf8');

  console.log(`\nWrote ${summaryPath}`);
  console.log(`     ${jsonlPath}`);
  process.exit(passed === rows.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
