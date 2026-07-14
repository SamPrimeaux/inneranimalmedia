#!/usr/bin/env node
/**
 * Notify when runtime CODE reindex completes (or summarize mid-run / failure).
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/notify-reindex-runtime.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/notify-reindex-runtime.mjs --status=completed
 *   ./scripts/with-cloudflare-env.sh node scripts/notify-reindex-runtime.mjs --status=failed --exit-code=1
 *   ./scripts/with-cloudflare-env.sh node scripts/notify-reindex-runtime.mjs --dry-run
 *
 * Env:
 *   RESEND_API_KEY (required to send)
 *   RESEND_FROM / REINDEX_NOTIFY_FROM (default: notifications@inneranimalmedia.com)
 *   RESEND_TO / REINDEX_NOTIFY_TO / DEPLOY_NOTIFY_EMAIL (default: info@inneranimals.com)
 *   SKIP_REINDEX_NOTIFY=1 — no-op success
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const CHECKPOINT = resolve(REPO, '.scratch/code-reindex-checkpoint-reindex_runtime_code.json');
const RECEIPT_DIR = resolve(REPO, '.scratch');

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(f) {
  return process.argv.includes(f);
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT)) return null;
  try {
    return JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
  } catch {
    return null;
  }
}

function prefixCounts(done) {
  /** @type {Record<string, { files: number, chunks: number }>} */
  const out = {};
  for (const [path, meta] of Object.entries(done || {})) {
    let key = path.split('/')[0] || 'other';
    if (path.startsWith('src/')) {
      const parts = path.split('/');
      key = parts.length >= 2 ? `src/${parts[1]}` : 'src';
    }
    if (!out[key]) out[key] = { files: 0, chunks: 0 };
    out[key].files += 1;
    out[key].chunks += Number(meta?.chunks) || 0;
  }
  return out;
}

function buildNextSteps(status, counts) {
  const srcCore = counts['src/core']?.files || 0;
  const srcApi = counts['src/api']?.files || 0;
  const steps = [];

  if (status === 'completed') {
    steps.push(
      'Ask Agent Sam: “Where is dispatchProductionDomainRoutes and what does it dispatch?” — expect src/core citations, not only dashboard/.',
    );
    steps.push(
      'Ask: “How does d1-postgres-table-guard / POSTGRES_ONLY_TABLES work?” and “What do agentsam-run-stop-hooks enqueue?”',
    );
    steps.push(
      'Record dual-pass on tkt_closed_loop_code_rag_2026_07_14 once retrieval looks right (npm run record:ticket-e2e-pass).',
    );
    steps.push(
      'Schema RAG still open: psql … -f scripts/sql/dedupe_database_schema_rag.sql then ingest_schema_rag.py.',
    );
    if (srcCore < 50) {
      steps.unshift(
        `Checkpoint shows only ${srcCore} src/core files — confirm D1 job progress_percent=100 and Supabase src/% file count before celebrating.`,
      );
    }
  } else if (status === 'failed') {
    steps.push('Check DNS/network to aws-1-us-east-2.pooler.supabase.com and Cloudflare (D1 wrangler fetch).');
    steps.push('Leave run:reindex_runtime:safe running — checkpoint skips finished files on resume.');
    steps.push(`Progress saved: src/api≈${srcApi}, src/core≈${srcCore}. No --fresh unless you intend a full rewrite.`);
  } else {
    steps.push('Reindex still running or interrupted — re-check checkpoint done_files vs fileCount.');
    steps.push('When complete, this notify re-fires automatically from run-reindex-runtime-safe.sh.');
  }

  steps.push('Do not trust Daily Memory “Moon Glass / scores / DesignStudio SSE” blockers without live D1 confirm — refresh ctx_inneranimalmedia.current_blockers.');
  return steps.slice(0, 6);
}

function buildHtml({ status, cp, counts, nextSteps, exitCode, gitSha }) {
  const done = Object.keys(cp?.done || {}).length;
  const total = Number(cp?.fileCount) || 911;
  const chunks = Object.values(cp?.done || {}).reduce((s, v) => s + (Number(v?.chunks) || 0), 0);
  const pct = total ? Math.round((100 * done) / total) : 0;
  const color = status === 'completed' ? '#22c55e' : status === 'failed' ? '#ef4444' : '#f59e0b';
  const prefixRows = Object.entries(counts)
    .sort((a, b) => b[1].files - a[1].files)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#94a3b8">${k}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#e2e8f0">${v.files}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#e2e8f0">${v.chunks}</td></tr>`,
    )
    .join('');
  const stepsHtml = nextSteps.map((s) => `<li style="margin:0 0 8px;color:#e2e8f0">${s}</li>`).join('');

  return `<!DOCTYPE html><html><body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:ui-sans-serif,system-ui,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:28px">
  <p style="margin:0 0 4px;color:#64748b;font-size:12px;letter-spacing:.06em;text-transform:uppercase">CODE RAG · runtime reindex</p>
  <h1 style="margin:0 0 8px;font-size:22px;color:${color}">Runtime reindex ${status}</h1>
  <p style="margin:0 0 20px;color:#94a3b8;font-size:13px">${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' })} CT</p>

  <div style="background:#1e293b;border-radius:10px;padding:16px;margin:0 0 16px">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#94a3b8">Progress</td><td style="padding:6px 0;color:#f1f5f9;font-weight:600">${done} / ${total} files (${pct}%) · ${chunks} chunks</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Job</td><td style="padding:6px 0;color:#f1f5f9">cidx_src_reindex_v1 · agentsam-codebase-oai3large-1536</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Git</td><td style="padding:6px 0;font-family:ui-monospace,monospace;color:#5eead4">${gitSha || cp?.gitCommitSha || '—'}</td></tr>
      ${exitCode != null ? `<tr><td style="padding:6px 0;color:#94a3b8">Exit</td><td style="padding:6px 0;color:#f1f5f9">${exitCode}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#94a3b8">Prune</td><td style="padding:6px 0;color:#f1f5f9">disabled (dashboard chunks kept)</td></tr>
    </table>
  </div>

  <h2 style="font-size:14px;color:#94a3b8;margin:0 0 8px">By prefix</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 20px">
    <tr><th align="left" style="padding:6px 8px;color:#64748b">Prefix</th><th align="left" style="padding:6px 8px;color:#64748b">Files</th><th align="left" style="padding:6px 8px;color:#64748b">Chunks</th></tr>
    ${prefixRows || '<tr><td colspan="3" style="padding:8px;color:#64748b">No checkpoint yet</td></tr>'}
  </table>

  <h2 style="font-size:14px;color:#94a3b8;margin:0 0 8px">Smart next steps</h2>
  <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.45">${stepsHtml}</ol>

  <p style="margin:24px 0 0;font-size:11px;color:#475569">Hook: scripts/notify-reindex-runtime.mjs · ticket tkt_closed_loop_code_rag_2026_07_14</p>
</div></body></html>`;
}

function writeReceipt(payload) {
  mkdirSync(RECEIPT_DIR, { recursive: true });
  const path = resolve(RECEIPT_DIR, `reindex-runtime-notify-${payload.status}-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

async function sendResend({ subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('[notify-reindex] RESEND_API_KEY missing — wrote receipt only');
    return { ok: false, reason: 'no_resend_key' };
  }
  const from =
    process.env.REINDEX_NOTIFY_FROM ||
    process.env.RESEND_FROM ||
    'notifications@inneranimalmedia.com';
  const toRaw =
    process.env.REINDEX_NOTIFY_TO ||
    process.env.RESEND_TO ||
    process.env.DEPLOY_NOTIFY_EMAIL ||
    'info@inneranimals.com';
  const to = String(toRaw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('[notify-reindex] Resend error', res.status, text);
    return { ok: false, reason: 'resend_http', status: res.status, body: text };
  }
  console.log('[notify-reindex] sent', text);
  return { ok: true, body: text, to, from };
}

async function main() {
  if (process.env.SKIP_REINDEX_NOTIFY === '1') {
    console.log('[notify-reindex] SKIP_REINDEX_NOTIFY=1');
    return;
  }

  const statusArg = argVal('--status');
  const exitCodeRaw = argVal('--exit-code');
  const exitCode = exitCodeRaw != null ? Number(exitCodeRaw) : null;
  const dryRun = hasFlag('--dry-run');

  const cp = loadCheckpoint();
  let status = statusArg || 'status';
  if (!statusArg && cp?.status === 'completed') status = 'completed';
  else if (!statusArg && cp) status = cp.status || 'running';

  const counts = prefixCounts(cp?.done);
  let gitSha = cp?.gitCommitSha || '';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    /* keep checkpoint sha */
  }

  const nextSteps = buildNextSteps(status, counts);
  const html = buildHtml({ status, cp, counts, nextSteps, exitCode, gitSha });
  const done = Object.keys(cp?.done || {}).length;
  const total = Number(cp?.fileCount) || 911;
  const subject = `[IAM] CODE reindex ${status} — ${done}/${total} files`;

  const receipt = {
    at: new Date().toISOString(),
    status,
    exitCode,
    done,
    total,
    counts,
    nextSteps,
    gitSha,
    checkpointStatus: cp?.status ?? null,
  };
  const receiptPath = writeReceipt(receipt);
  console.log('[notify-reindex]', status, `${done}/${total}`, 'receipt', receiptPath);
  for (const s of nextSteps) console.log('  →', s);

  if (dryRun) {
    console.log('[notify-reindex] --dry-run (no email)');
    return;
  }

  await sendResend({ subject, html });
}

main().catch((e) => {
  console.error('[notify-reindex]', e?.message || e);
  process.exit(1);
});
