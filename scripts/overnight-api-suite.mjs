#!/usr/bin/env node
/**
 * overnight-api-suite.mjs — Tiered, non-destructive API observation suite.
 *
 * Tiers:
 *   A  Read-only GET probes (no auth, public routes)
 *   B  Authenticated read-only checks (INTERNAL_API_SECRET)
 *   C  Sandbox canary POST /api/agent/chat — 1 minimal prompt (opt-in by default)
 *   D  D1 state observation — SELECT from routing/memory/terminal tables (read-only)
 *
 * NOT a deploy gate. Canonical pre-promote gate remains ./scripts/benchmark-full.sh.
 * Does NOT call promote-to-prod.sh, wrangler deploy (prod), or wrangler secret put.
 *
 * Env vars:
 *   DRY_RUN=1                     Print what would be sent; no network calls.
 *   SANDBOX_ONLY=1                (default=1) Route all requests to sandbox URL.
 *   OVERNIGHT_INCLUDE_PROD=1      Also probe prod for tier A only (opt-in).
 *   SKIP_TIER_C=1                 Skip chat canary entirely.
 *   SKIP_TIER_D=1                 Skip D1 state observation.
 *   OVERNIGHT_TIER_C_PROD=1       POST Tier C to production instead of sandbox.
 *                                 Use with SESSION_COOKIE from the same origin.
 *   WRITE_OVERNIGHT_TO_D1=1       After run, upsert project_memory key OVERNIGHT_API_SUITE_LAST.
 *   OVERNIGHT_CAP_USD_PER_PROVIDER  Independent USD ceiling **per provider** per run (default: 5).
 *                                 Not a single $5 total: anthropic, openai, google, workers_ai each get their own cap.
 *                                 Hard stop for **that** bucket only when its estimated spend >= cap.
 *   INTERNAL_API_SECRET=…         Required for tier B; loaded from .env.cloudflare if absent.
 *   SESSION_COOKIE=…              Tier B/C: `session=<uuid>` or raw uuid. Not ?session= URL param.
 *
 * Exit codes:
 *   0   Tiers A+B all passed
 *   1   One or more tier A/B checks failed (JSON summary to stdout + reports/)
 *   2   Script error (env, bad args)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Env loading ──────────────────────────────────────────────────────────────

function loadEnv() {
  const envFile = path.join(REPO_ROOT, '.env.cloudflare');
  if (existsSync(envFile)) {
    const lines = readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnv();

// ── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN        = process.env.DRY_RUN === '1';
const SANDBOX_ONLY   = process.env.SANDBOX_ONLY !== '0'; // default ON
const INCLUDE_PROD   = process.env.OVERNIGHT_INCLUDE_PROD === '1' && !SANDBOX_ONLY;
const SKIP_TIER_C    = process.env.SKIP_TIER_C === '1';
const SKIP_TIER_D    = process.env.SKIP_TIER_D === '1';
const TIER_C_PROD    = process.env.OVERNIGHT_TIER_C_PROD === '1';
const WRITE_OVERNIGHT_TO_D1 = process.env.WRITE_OVERNIGHT_TO_D1 === '1';
/** Max estimated USD **per provider bucket** (not combined across providers). */
const CAP_PER_PROVIDER = Math.max(0.01, Number(process.env.OVERNIGHT_CAP_USD_PER_PROVIDER ?? 5));
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || '';
const SESSION_COOKIE  = process.env.SESSION_COOKIE || '';

/** For Tier C: worker expects `Cookie: session=<id>`. Env may be raw uuid or full `session=...`. */
function sessionCookieHeaders() {
  const raw = String(SESSION_COOKIE).trim();
  if (!raw) return {};
  const cookie = raw.includes('=') ? raw : `session=${raw}`;
  return { Cookie: cookie };
}

const SANDBOX_BASE = 'https://inneranimal-dashboard.meauxbility.workers.dev';
const PROD_BASE    = 'https://inneranimalmedia.com';

const RUN_ID = `overnight-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}Z`;

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

// ── Budget tracker ────────────────────────────────────────────────────────────
// Per-provider spend (each bucket has its own $ cap — OVERNIGHT_CAP_USD_PER_PROVIDER).
// Keys: anthropic | openai | google | workers_ai. Accrued from parsed cost_usd in responses.

const spend = { anthropic: 0, openai: 0, google: 0, workers_ai: 0 };

/** Map model_id to provider bucket. Extend as new models are added. */
function modelToBucket(modelId = '') {
  if (/claude/i.test(modelId))                        return 'anthropic';
  if (/gpt|o[0-9]|openai/i.test(modelId))             return 'openai';
  if (/gemini|vertex|google/i.test(modelId))           return 'google';
  if (/^@cf\//i.test(modelId) || /llama|mistral/i.test(modelId)) return 'workers_ai';
  return 'anthropic'; // default — most canary calls are Anthropic
}

/** Accrue spend to a bucket. Returns true if still under cap after accrual. */
function accrueSpend(bucket, usd) {
  spend[bucket] = (spend[bucket] || 0) + (Number(usd) || 0);
  return spend[bucket] < CAP_PER_PROVIDER;
}

/**
 * Check if a bucket has headroom before making a paid call.
 * Returns true = OK to proceed, false = cap already reached.
 */
function hasBudget(bucket) {
  return (spend[bucket] || 0) < CAP_PER_PROVIDER;
}

/** Extract cost_usd from worker SSE response text. Returns 0 if not found. */
function extractCostUsd(text = '') {
  const m = text.match(/"cost_usd"\s*:\s*([\d.e+\-]+)/);
  return m ? Number(m[1]) : 0;
}

// ── Results accumulator ──────────────────────────────────────────────────────

const results = [];
let abFails = 0;

/** Populated in Tier D: live D1 truth for last-24h agent spend (not parsed from chat body). */
let d1Telemetry24h = null;

function rowStatus(r) {
  return String(r.check_status ?? r.status ?? '').toUpperCase();
}

function record(tier, name, pass, detail = '') {
  /** `check_status` avoids confusion with HTTP status codes in logs/JSON. */
  const check_status = pass ? 'PASS' : 'FAIL';
  results.push({ run_id: RUN_ID, tier, name, check_status, detail, ts: new Date().toISOString() });
  const icon = pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  console.log(`  ${icon} [${tier}] ${name}${detail ? ` ${DIM}— ${detail}${RESET}` : ''}`);
  if (!pass && (tier === 'A' || tier === 'B')) abFails++;
}

/** Record a budget-exceeded event (logged but does not increment abFails). */
function recordBudgetStop(tier, name, bucket) {
  const detail = `budget_exceeded bucket=${bucket} spent=$${spend[bucket].toFixed(6)} cap=$${CAP_PER_PROVIDER}`;
  results.push({ run_id: RUN_ID, tier, name, check_status: 'BUDGET_STOP', detail, ts: new Date().toISOString() });
  console.log(`  ${YELLOW}⊘${RESET} [${tier}] ${name} ${DIM}— ${detail}${RESET}`);
}

// ── HTTP probe helper ─────────────────────────────────────────────────────────

async function probe({ method = 'GET', url, headers = {}, body, maxTimeMs = 15000, expectStatus = 200, expectField }) {
  if (DRY_RUN) {
    const curlHeaders = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
    const curlBody = body ? `-d '${JSON.stringify(body)}'` : '';
    console.log(`  ${DIM}[dry-run] curl -s -X ${method} "${url}" ${curlHeaders} ${curlBody} --max-time ${maxTimeMs / 1000}${RESET}`);
    return { ok: true, status: 200, json: {}, text: '', elapsed: 0 };
  }
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), maxTimeMs);
  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const elapsed = Date.now() - start;
    clearTimeout(timeout);
    const text = await resp.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    const ok = resp.status === expectStatus;
    const fieldOk = expectField ? (json && json[expectField] !== undefined) : true;
    return { ok: ok && fieldOk, status: resp.status, json, elapsed, text };
  } catch (e) {
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    return { ok: false, status: 0, json: null, text: '', elapsed, error: e.message };
  }
}

// ── Tier A — Read-only GET probes (no auth) ───────────────────────────────────

async function runTierA(base, label) {
  console.log(`\n${CYAN}▶ Tier A — GET probes (${label})${RESET}`);

  // A1: /api/health
  {
    const r = await probe({ url: `${base}/api/health` });
    record('A', `${label} /api/health`, r.ok && r.status === 200,
      r.elapsed ? `${r.elapsed}ms status=${r.status}` : r.error || '');
  }

  // A2: root HTML loads (not 5xx)
  {
    const r = await probe({ url: `${base}/`, expectStatus: 200 });
    record('A', `${label} / root`, r.ok, r.elapsed ? `${r.elapsed}ms` : r.error || '');
  }
}

// ── Tier B — Authenticated read-only checks ───────────────────────────────────

async function runTierB(base, label) {
  console.log(`\n${CYAN}▶ Tier B — Authenticated read-only (${label})${RESET}`);

  if (!INTERNAL_SECRET) {
    console.log(`  ${YELLOW}⚠ INTERNAL_API_SECRET not set — tier B skipped${RESET}`);
    record('B', `${label} auth-check`, true, 'skipped — no INTERNAL_API_SECRET');
    return;
  }

  const authHeaders = { 'Authorization': `Bearer ${INTERNAL_SECRET}` };
  const cookieHdr = sessionCookieHeaders();
  if (cookieHdr.Cookie) authHeaders['Cookie'] = cookieHdr.Cookie;

  // B1: internal post-deploy ping — checks auth gate, passes dry_run so no side effects
  {
    const r = await probe({
      method: 'POST',
      url: `${base}/api/internal/post-deploy`,
      headers: authHeaders,
      body: { dry_run: true },
      maxTimeMs: 20000,
    });
    // Accept 200 or 204 — just not 401/403/5xx
    const pass = r.status > 0 && r.status < 500 && r.status !== 401 && r.status !== 403;
    record('B', `${label} /api/internal/post-deploy (auth)`, pass,
      `${r.elapsed}ms status=${r.status}`);
  }
}

// ── Tier C — Canary chat (1 minimal prompt) ───────────────────────────────────

async function runTierC() {
  const tierCBase  = TIER_C_PROD ? PROD_BASE : SANDBOX_BASE;
  const tierCLabel = TIER_C_PROD ? 'prod' : 'sandbox';
  const modelId    = 'claude-haiku-4-5-20251001';
  const bucket     = modelToBucket(modelId); // 'anthropic'

  console.log(`\n${CYAN}▶ Tier C — Chat canary (${tierCLabel})${RESET}`);
  console.log(`  ${DIM}model=${modelId}  bucket=${bucket}  spent=$${spend[bucket].toFixed(6)}  cap=$${CAP_PER_PROVIDER}${RESET}`);

  if (!SESSION_COOKIE.trim()) {
    console.log(`  ${YELLOW}⚠ SESSION_COOKIE unset — likely 401. Set session=<uuid> in .env.cloudflare.${RESET}`);
  }

  // Hard stop: check budget before making any paid call
  if (!hasBudget(bucket)) {
    recordBudgetStop('C', `${tierCLabel} /api/agent/chat canary`, bucket);
    return;
  }

  const r = await probe({
    method: 'POST',
    url: `${tierCBase}/api/agent/chat`,
    headers: sessionCookieHeaders(),
    body: {
      messages: [{ role: 'user', content: 'Reply with one word: CANARY' }],
      model_id: modelId,
      stream: false,
    },
    maxTimeMs: 30000,
    expectStatus: 200,
  });

  // Parse cost from worker response and accrue to bucket
  const costUsd = extractCostUsd(r.text);
  const underCap = accrueSpend(bucket, costUsd);
  if (!underCap) {
    console.log(`  ${YELLOW}⚠ Budget cap reached after this call (bucket=${bucket} total=$${spend[bucket].toFixed(6)})${RESET}`);
  }

  const hasContent = r.json?.content || r.text?.includes('CANARY') || r.text?.includes('canary');
  const hasDone    = r.text?.includes('"type":"done"') || r.text?.includes('"done"');
  /** 200 + non-trivial body counts as success even if SSE lacks a done line (common for stream:false). */
  const bodyOk     = !DRY_RUN && r.ok && typeof r.text === 'string' && r.text.length > 40;
  const pass       = r.ok && (DRY_RUN || hasContent || hasDone || bodyOk);
  record('C', `${tierCLabel} /api/agent/chat canary`, pass,
    `${r.elapsed}ms status=${r.status} cost=$${costUsd.toFixed(6)}${r.error ? ' err=' + r.error : ''}`);
}

// ── Tier D — D1 state observation (read-only SELECT via wrangler) ─────────────

async function runTierD() {
  console.log(`\n${CYAN}▶ Tier D — D1 state observation (read-only)${RESET}`);

  const queries = [
    {
      name: 'model_routing_rules: perf fields populated',
      sql: `SELECT COUNT(*) as total, COUNT(avg_latency_ms) as with_latency, COUNT(success_rate) as with_success FROM model_routing_rules WHERE is_active=1`,
    },
    {
      name: 'routing_decisions: completed rows with latency',
      sql: `SELECT COUNT(*) as total, SUM(completed) as completed, COUNT(latency_ms) as with_latency FROM routing_decisions`,
    },
    {
      name: 'agent_memory_index: access telemetry',
      sql: `SELECT COUNT(*) as total, SUM(access_count) as total_accesses, COUNT(last_accessed_at) as with_last_access FROM agent_memory_index`,
    },
    {
      name: 'terminal_sessions: status breakdown',
      sql: `SELECT status, COUNT(*) as cnt FROM terminal_sessions GROUP BY status`,
    },
    {
      name: 'agent_telemetry: last 24h calls + cost',
      sql: `SELECT COUNT(*) AS calls_24h, ROUND(COALESCE(SUM(computed_cost_usd), 0), 4) AS cost_usd_24h FROM agent_telemetry WHERE created_at >= (unixepoch('now') - 86400)`,
    },
  ];

  for (const q of queries) {
    if (DRY_RUN) {
      console.log(`  ${DIM}[dry-run] wrangler d1 execute inneranimalmedia-business --command="${q.sql}" --remote${RESET}`);
      record('D', q.name, true, 'dry-run');
      continue;
    }
    try {
      const out = execSync(
        `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --command="${q.sql.replace(/"/g, '\\"')}" --remote -c wrangler.production.toml --json`,
        { cwd: REPO_ROOT, stdio: 'pipe', timeout: 20000 }
      ).toString();
      const parsed = JSON.parse(out);
      const rows = parsed?.[0]?.results ?? parsed?.results ?? parsed;
      if (q.name.includes('agent_telemetry')) {
        const row0 = Array.isArray(rows) && rows[0] ? rows[0] : rows;
        d1Telemetry24h = {
          calls_24h: row0?.calls_24h,
          cost_usd_24h: row0?.cost_usd_24h,
        };
      }
      record('D', q.name, true, JSON.stringify(rows).slice(0, 120));
    } catch (e) {
      record('D', q.name, false, e.message?.slice(0, 120) || 'wrangler error');
    }
  }
}

// ── Summary write ─────────────────────────────────────────────────────────────

function writeSummary(extra = {}) {
  const dir = path.join(REPO_ROOT, 'reports');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${RUN_ID}.json`);
  writeFileSync(
    file,
    JSON.stringify({ run_id: RUN_ID, results, ab_fails: abFails, spend, d1_telemetry_24h: d1Telemetry24h, ...extra }, null, 2)
  );
  return file;
}

/** Upsert OVERNIGHT_API_SUITE_LAST into remote D1 for morning email. */
function writeOvernightProjectMemory(summaryFile) {
  if (DRY_RUN) {
    console.log(`  ${DIM}[dry-run] skip WRITE_OVERNIGHT_TO_D1${RESET}`);
    return;
  }
  const payload = {
    run_id: RUN_ID,
    tier_c_target: TIER_C_PROD ? 'prod' : 'sandbox',
    summary_file: summaryFile,
    results,
    ab_fails: abFails,
    spend,
    finished_at: new Date().toISOString(),
  };
  const jsonStr = JSON.stringify(payload);
  const escaped = jsonStr.replace(/'/g, "''");
  const sql = `INSERT OR REPLACE INTO project_memory (
  id, project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by, created_at, updated_at
) VALUES (
  'pmem_overnight_api_suite_last',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'constraint',
  'OVERNIGHT_API_SUITE_LAST',
  '${escaped}',
  0.95,
  1.0,
  'overnight_api_suite',
  unixepoch(),
  unixepoch()
);`;
  const sqlPath = path.join(REPO_ROOT, 'reports', `${RUN_ID}-overnight-memory.sql`);
  writeFileSync(sqlPath, sql, 'utf8');
  const relSql = path.relative(REPO_ROOT, sqlPath);
  try {
    execSync(
      `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=${relSql}`,
      { cwd: REPO_ROOT, stdio: 'inherit', timeout: 60000 }
    );
    console.log(`${GREEN}project_memory OVERNIGHT_API_SUITE_LAST updated (remote)${RESET}`);
  } catch (e) {
    console.error(`${RED}WRITE_OVERNIGHT_TO_D1 failed:${RESET}`, e.message);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${CYAN}overnight-api-suite${RESET} run_id=${RUN_ID}`);
  console.log(`  sandbox_only=${SANDBOX_ONLY}  dry_run=${DRY_RUN}  include_prod=${INCLUDE_PROD}  tier_c_prod=${TIER_C_PROD}`);
  console.log(`  cap_usd_per_provider=$${CAP_PER_PROVIDER} (each bucket; not one total)  buckets: ${Object.keys(spend).join(' | ')}`);

  // Tier A — always runs (no LLM spend)
  await runTierA(SANDBOX_BASE, 'sandbox');
  if (INCLUDE_PROD) await runTierA(PROD_BASE, 'prod');

  // Tier B — always runs (no LLM spend; may skip internally if no secret)
  await runTierB(SANDBOX_BASE, 'sandbox');

  // Tier D before C — read-only D1, establishes baseline before any spend
  if (!SKIP_TIER_D) await runTierD();
  else console.log(`\n${DIM}▷ Tier D skipped (SKIP_TIER_D=1)${RESET}`);

  // Tier C — single paid canary; runs after D so D baseline is already captured
  if (!SKIP_TIER_C) await runTierC();
  else console.log(`\n${DIM}▷ Tier C skipped (SKIP_TIER_C=1)${RESET}`);

  const totalPass = results.filter(r => rowStatus(r) === 'PASS').length;
  const totalFail = results.filter(r => rowStatus(r) === 'FAIL').length;
  const budgetStops = results.filter(r => rowStatus(r) === 'BUDGET_STOP').length;
  const byTierPass = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of results) {
    if (r.tier && byTierPass[r.tier] !== undefined && rowStatus(r) === 'PASS') byTierPass[r.tier] += 1;
  }
  const summaryBlock = {
    checks_total: results.length,
    checks_pass: totalPass,
    checks_fail: totalFail,
    budget_stops: budgetStops,
    by_tier_pass: byTierPass,
    d1_agent_telemetry_24h: d1Telemetry24h,
  };

  const summaryFile = writeSummary({ summary: summaryBlock });
  if (WRITE_OVERNIGHT_TO_D1) writeOvernightProjectMemory(summaryFile);

  const spendLine = Object.entries(spend)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}=$${v.toFixed(6)}`).join('  ') || 'no spend';

  const d1Line = d1Telemetry24h
    ? `D1 24h: calls=${d1Telemetry24h.calls_24h} cost_usd=${d1Telemetry24h.cost_usd_24h}`
    : (DRY_RUN ? 'D1 24h: (not queried in DRY_RUN)' : 'D1 24h: (tier D skipped or query failed)');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${RUN_ID}  pass=${totalPass}  fail=${totalFail}  ab_fails=${abFails}  checks=${results.length}`);
  console.log(d1Line);
  console.log(`spend (parsed from chat body): ${spendLine}`);
  console.log(`Summary written → ${summaryFile}`);
  console.log(`OVERNIGHT_SUMMARY_JSON=${JSON.stringify({ run_id: RUN_ID, ...summaryBlock, spend })}`);

  if (results.length > 0 && totalPass === 0 && totalFail === 0) {
    console.log(`${YELLOW}WARN: no PASS/FAIL rows — raw statuses:${RESET}`, results.map((r) => rowStatus(r) || '?').join(','));
  }

  if (abFails > 0) {
    const failedAB = results.filter(r => rowStatus(r) === 'FAIL' && (r.tier === 'A' || r.tier === 'B'));
    console.log(`\n${RED}Tier A/B failures:${RESET}`);
    failedAB.forEach(r => console.log(`  ${RED}✗${RESET} [${r.tier}] ${r.name} — ${r.detail}`));
    process.stdout.write('\n' + JSON.stringify({ run_id: RUN_ID, ab_fails: abFails, failures: failedAB, spend }) + '\n');
    process.exit(1);
  }

  process.exit(0);
}

main().catch(e => {
  console.error(`${RED}overnight-api-suite fatal:${RESET}`, e.message);
  process.exit(2);
});
