#!/usr/bin/env node
/**
 * Insert N completed agentsam_workflow_runs rows on remote D1 for analytics / UI smoke.
 * Copies workflow_id, workflow_key, tenant_id, workspace_id, user_id from an existing run
 * or from agentsam_workflows + env fallbacks.
 *
 * Usage (repo root):
 *   ./scripts/with-cloudflare-env.sh node scripts/seed-agentsam-workflow-runs.mjs
 *   COUNT=10 ./scripts/with-cloudflare-env.sh node scripts/seed-agentsam-workflow-runs.mjs
 *
 * Env:
 *   D1_DATABASE          default inneranimalmedia-business
 *   WRANGLER_CONFIG      default wrangler.production.toml
 *   COUNT                default 10
 *   SMOKE_TENANT_ID      optional if no template run/workflow tenant
 *   SMOKE_WORKSPACE_ID   optional
 *   SMOKE_USER_ID        optional (canonical au_*)
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const DB = process.env.D1_DATABASE || 'inneranimalmedia-business';
const WRANGLER_CFG = process.env.WRANGLER_CONFIG || 'wrangler.production.toml';
const COUNT = Math.max(1, Math.min(100, Number(process.env.COUNT) || 10));

function d1Json(sql) {
  const cmd = 'npx';
  const args = [
    'wrangler',
    'd1',
    'execute',
    DB,
    '--remote',
    '-c',
    WRANGLER_CFG,
    '--json',
    '--command',
    sql,
  ];
  const out = execFileSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 2_000_000,
  });
  const start = out.indexOf('[');
  if (start < 0) throw new Error(`unexpected wrangler output: ${out.slice(0, 500)}`);
  const parsed = JSON.parse(out.slice(start));
  const first = parsed[0];
  if (!first?.success) throw new Error(out.slice(0, 2000));
  return first.results || [];
}

function escapeSqlString(s) {
  return String(s).replace(/'/g, "''");
}

const templateSql = `
SELECT workflow_id, workflow_key, tenant_id, workspace_id, user_id
FROM agentsam_workflow_runs
WHERE trim(COALESCE(tenant_id,'')) != ''
  AND trim(COALESCE(workspace_id,'')) != ''
  AND trim(COALESCE(workflow_id,'')) != ''
ORDER BY datetime(created_at) DESC
LIMIT 1
`.replace(/\s+/g, ' ');

const wfFallbackSql = `
SELECT w.id AS workflow_id, w.workflow_key,
       trim(COALESCE(w.tenant_id,'')) AS tenant_id,
       trim(COALESCE(w.workspace_id,'')) AS workspace_id
FROM agentsam_workflows w
INNER JOIN agentsam_workflow_nodes n ON n.workflow_id = w.id
WHERE COALESCE(w.is_active, 1) = 1
LIMIT 1
`.replace(/\s+/g, ' ');

function main() {
  let rows = d1Json(templateSql);
  let workflow_id;
  let workflow_key;
  let tenant_id;
  let workspace_id;
  let user_id = process.env.SMOKE_USER_ID ? String(process.env.SMOKE_USER_ID).trim() : null;

  if (rows.length) {
    workflow_id = String(rows[0].workflow_id || '').trim();
    workflow_key = String(rows[0].workflow_key || '').trim();
    tenant_id = String(rows[0].tenant_id || '').trim();
    workspace_id = String(rows[0].workspace_id || '').trim();
    if (rows[0].user_id) user_id = String(rows[0].user_id).trim();
  } else {
    rows = d1Json(wfFallbackSql);
    if (!rows.length) {
      console.error('No agentsam_workflows with nodes found. Seed a workflow first.');
      process.exit(2);
    }
    workflow_id = String(rows[0].workflow_id || '').trim();
    workflow_key = String(rows[0].workflow_key || '').trim();
    tenant_id = String(rows[0].tenant_id || '').trim();
    workspace_id = String(rows[0].workspace_id || '').trim();
  }

  tenant_id = tenant_id || String(process.env.SMOKE_TENANT_ID || '').trim();
  workspace_id = workspace_id || String(process.env.SMOKE_WORKSPACE_ID || '').trim();

  if (!workflow_id || !workflow_key) {
    console.error('Could not resolve workflow_id / workflow_key.');
    process.exit(2);
  }
  if (!tenant_id || !workspace_id) {
    console.error(
      'Missing tenant_id/workspace_id. Set SMOKE_TENANT_ID and SMOKE_WORKSPACE_ID or insert a template agentsam_workflow_runs row first.',
    );
    process.exit(2);
  }

  const stamp = Date.now();
  const valueRows = [];
  for (let i = 0; i < COUNT; i++) {
    const id = `wrun_seed_${stamp}_${i}`;
    const label = escapeSqlString(`seed_batch_${stamp}_${i}`);
    const wk = escapeSqlString(workflow_key);
    const tid = escapeSqlString(tenant_id);
    const wid = escapeSqlString(workspace_id);
    const wfId = escapeSqlString(workflow_id);
    const uid = user_id ? `'${escapeSqlString(user_id)}'` : 'NULL';
    valueRows.push(`(
      '${escapeSqlString(id)}',
      '${wfId}',
      '${wk}',
      '${tid}',
      '${wid}',
      ${uid},
      NULL,
      'manual',
      'completed',
      '{}',
      '{}',
      '[]',
      1,
      1,
      0,
      0,
      0,
      0,
      'production',
      '{}',
      unixepoch(),
      unixepoch(),
      datetime('now'),
      datetime('now'),
      1,
      NULL,
      '${label}'
    )`);
  }

  const sql = `
INSERT INTO agentsam_workflow_runs (
  id,
  workflow_id,
  workflow_key,
  tenant_id,
  workspace_id,
  user_id,
  user_email,
  trigger_type,
  status,
  input_json,
  output_json,
  step_results_json,
  steps_total,
  steps_completed,
  input_tokens,
  output_tokens,
  cost_usd,
  retry_count,
  environment,
  metadata_json,
  started_at,
  completed_at,
  created_at,
  updated_at,
  graph_mode,
  current_node_key,
  display_name
) VALUES ${valueRows.join(',\n')}
`.trim();

  const tmp = path.join(REPO_ROOT, `.tmp_seed_workflow_runs_${stamp}.sql`);
  writeFileSync(tmp, sql, 'utf8');
  try {
    execFileSync(
      'npx',
      ['wrangler', 'd1', 'execute', DB, '--remote', '-c', WRANGLER_CFG, '--file', tmp],
      { cwd: REPO_ROOT, encoding: 'utf8', env: process.env, stdio: 'inherit' },
    );
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        inserted: COUNT,
        workflow_id,
        workflow_key,
        tenant_id,
        workspace_id,
        user_id,
      },
      null,
      2,
    ),
  );
}

main();
