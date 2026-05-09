#!/usr/bin/env node
/**
 * Fire POST /api/agent/workflow/start N times (real graph execution via executeWorkflowGraph).
 * Requires a logged-in dashboard session cookie (same browser session the dashboard uses).
 *
 * Usage:
 *   WORKER_API_ORIGIN=https://www.inneranimalmedia.com \
 *   SESSION_COOKIE='session=...' \
 *   WORKFLOW_KEY=i-am-builder-monaco \
 *   ./scripts/with-cloudflare-env.sh node scripts/run-workflow-start-batch.mjs
 *
 * Env:
 *   WORKER_API_ORIGIN   default https://www.inneranimalmedia.com
 *   SESSION_COOKIE      required (Cookie header value)
 *   WORKFLOW_KEY        required unless DISCOVER=1 (uses first active graph workflow from D1)
 *   COUNT               default 10
 *   DISCOVER            set to 1 to run wrangler and pick workflow_key from agentsam_workflows
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ORIGIN = (process.env.WORKER_API_ORIGIN || 'https://www.inneranimalmedia.com').replace(/\/$/, '');
const COOKIE = String(process.env.SESSION_COOKIE || '').trim();
const COUNT = Math.max(1, Math.min(50, Number(process.env.COUNT) || 10));
let workflowKey = String(process.env.WORKFLOW_KEY || '').trim();

const DB = process.env.D1_DATABASE || 'inneranimalmedia-business';
const WRANGLER_CFG = process.env.WRANGLER_CONFIG || 'wrangler.production.toml';

function discoverWorkflowKey() {
  const sql =
    "SELECT w.workflow_key FROM agentsam_workflows w INNER JOIN agentsam_workflow_nodes n ON n.workflow_id = w.id WHERE COALESCE(w.is_active,1)=1 LIMIT 1";
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, '--remote', '-c', WRANGLER_CFG, '--json', '--command', sql],
    { cwd: REPO_ROOT, encoding: 'utf8', env: process.env, maxBuffer: 500_000 },
  );
  const start = out.indexOf('[');
  const parsed = JSON.parse(out.slice(start));
  const row = parsed[0]?.results?.[0];
  return row?.workflow_key ? String(row.workflow_key).trim() : '';
}

async function main() {
  if (!COOKIE) {
    console.error('Set SESSION_COOKIE to your dashboard session cookie string (e.g. session=...).');
    process.exit(2);
  }

  if (!workflowKey || process.env.DISCOVER === '1') {
    workflowKey = discoverWorkflowKey();
  }
  if (!workflowKey) {
    console.error('Set WORKFLOW_KEY or DISCOVER=1 with wrangler credentials.');
    process.exit(2);
  }

  const url = `${ORIGIN}/api/agent/workflow/start`;
  const results = [];

  for (let i = 0; i < COUNT; i++) {
    const body = {
      workflow_key: workflowKey,
      input: { message: `batch_smoke_${Date.now()}_${i}`, seed_index: i },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: COOKIE,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { parse_error: true, text: text.slice(0, 500) };
    }
    results.push({ i, http: res.status, json });
    console.log(`[${i + 1}/${COUNT}]`, res.status, json?.run_id || json?.error || json);
  }

  const okN = results.filter((r) => r.http === 200 && r.json?.ok !== false).length;
  console.log(
    JSON.stringify(
      {
        url,
        workflow_key: workflowKey,
        attempted: COUNT,
        http_200: results.filter((r) => r.http === 200).length,
        graph_ok: okN,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
