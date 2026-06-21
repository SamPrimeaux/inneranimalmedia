#!/usr/bin/env node
/**
 * Write agentsam_deployment_health rows from deploy eval or R2 reconcile skip.
 * Uses pragma_table_info; no new env vars.
 *
 * Phases:
 *   --phase eval (default) — reads .deploy-eval-results.json + git/env context
 *   --phase r2-skip — SKIP_R2_DEPLOY_RECONCILE=1 smoke_test skipped row
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadDotEnvCloudflare } from './lib/supabase-deploy-context.mjs';
import {
  repoRoot,
  DEPLOY_EVAL_RESULTS_FILE,
  DEPLOY_CONTEXT_FILE,
} from './lib/supabase-deploy-paths.mjs';
import {
  deriveWorkerName,
  gitFull,
  healthRowId,
  pickFirstExisting,
  pragmaTableInfo,
  runD1Exec,
  sqlJson,
  sqlString,
  hasCloudflareToken,
} from './lib/d1-deploy-record.mjs';

function arg(name, def = '') {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

function readJson(path, fb = null) {
  try {
    if (!existsSync(path)) return fb;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fb;
  }
}

function resolveWorkerName(root) {
  try {
    const wranglerPath = `${root}/wrangler.production.toml`;
    if (existsSync(wranglerPath)) {
      const toml = readFileSync(wranglerPath, 'utf8');
      const match = toml.match(/^name\s*=\s*["']([^"']+)["']/m);
      if (match?.[1]) return match[1];
    }
  } catch {}

  try {
    const pkg = readJson(`${root}/package.json`, {});
    if (pkg?.name) return String(pkg.name);
  } catch {}

  return 'inneranimalmedia';
}

export async function insertDeploymentHealth(root, row) {
  const cols = pragmaTableInfo(root, 'agentsam_deployment_health');
  if (!cols.size) return { skipped: true };

  const normalizedRow = {
    ...row,
    worker_name: row?.worker_name || resolveWorkerName(root),
    checked_by: row?.checked_by || process.env.DEPLOY_SCRIPT_NAME || 'deploy:full',
  };

  if (cols.has('worker_name') && !normalizedRow.worker_name) {
    throw new Error('[d1-health] missing required worker_name for agentsam_deployment_health');
  }

  const parts = [];
  const vals = [];

  for (const [k, v] of Object.entries(normalizedRow)) {
    if (v === undefined || !cols.has(k)) continue;
    parts.push(k);
    if (v === null) vals.push('NULL');
    else if (typeof v === 'object' && v !== null && !Array.isArray(v)) vals.push(sqlJson(v));
    else if (typeof v === 'number' && Number.isFinite(v)) vals.push(String(Math.floor(v)));
    else vals.push(sqlString(v));
  }

  const createdCol = pickFirstExisting(cols, ['created_at', 'checked_at', 'recorded_at']);
  if (createdCol && !parts.includes(createdCol)) {
    const inf = cols.get(createdCol);
    const t = (inf?.type || '').toLowerCase();
    parts.push(createdCol);
    vals.push(t.includes('int') ? 'unixepoch()' : sqlString(new Date().toISOString()));
  }

  if (!parts.length) return { skipped: true };

  await runD1Exec(
    root,
    `INSERT INTO agentsam_deployment_health (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
  );
  return { ok: true };
}

export async function recordDeployEvalHealth(root, opts) {
  const {
    runGroupId,
    tenantId,
    workspaceId,
    workerName,
    environment,
    evalRes,
    smokeBaseUrl,
    gitSha,
    gitBranch,
  } = opts;

  const dbUrl = String(process.env.SUPABASE_DB_URL ?? '').trim();
  const semanticRequired = Boolean(dbUrl && tenantId);

  let status = 'healthy';
  if (evalRes.health_ok === false) status = 'failed';
  else if (!evalRes.semantic_smoke_ok && semanticRequired) status = 'degraded';

  const semanticStrict =
    evalRes.semantic_strict !== undefined
      ? evalRes.semantic_strict
      : evalRes.metrics_json?.semantic_strict;

  const meta = {
    health: evalRes.health_ok,
    rag_smoke: evalRes.semantic_smoke_ok,
    semantic_strict: semanticStrict,
    semantic_required: semanticRequired,
    checked_url: `${String(smokeBaseUrl || '').replace(/\/$/, '')}/api/health`,
    timing_ms: evalRes.duration_ms ?? null,
    commit: gitSha || null,
    branch: gitBranch || null,
    environment,
    worker_name: workerName,
  };

  const row = {};
  const cols = pragmaTableInfo(root, 'agentsam_deployment_health');
  const idCol = pickFirstExisting(cols, ['id']);
  if (idCol) row[idCol] = healthRowId(runGroupId, 'smoke');

  const chk = pickFirstExisting(cols, ['check_type', 'health_check_type', 'gate']);
  if (chk) row[chk] = 'smoke_test';

  if (cols.has('status')) row.status = status;
  if (cols.has('environment')) row.environment = environment;
  if (cols.has('tenant_id')) row.tenant_id = tenantId;
  if (cols.has('workspace_id')) row.workspace_id = workspaceId;

  const depId = pickFirstExisting(cols, ['deployment_id', 'deploy_id', 'run_group_id']);
  if (depId) row[depId] = runGroupId;

  const mj = pickFirstExisting(cols, ['metadata_json', 'details_json', 'context_json', 'payload_json']);
  if (mj) row[mj] = meta;

  const lt = pickFirstExisting(cols, ['response_time_ms', 'latency_ms', 'response_ms', 'duration_ms']);
  if (lt && evalRes.health_latency_ms != null)
    row[lt] = Math.floor(Number(evalRes.health_latency_ms));

  const hc = pickFirstExisting(cols, ['http_status_code', 'http_status', 'response_code']);
  if (hc && evalRes.health_status != null) row[hc] = Math.floor(Number(evalRes.health_status));

  const cu = pickFirstExisting(cols, ['check_url', 'health_check_url']);
  if (cu && meta.checked_url) row[cu] = String(meta.checked_url).slice(0, 2000);

  const aiCost = pickFirstExisting(cols, ['ai_cost_usd']);
  if (aiCost) row[aiCost] = 0;

  return insertDeploymentHealth(root, row);
}

export async function recordPipelineFailureHealth(root, opts) {
  const { runGroupId, tenantId, workspaceId, workerName, environment, reason, exitCode, failedStep } =
    opts;
  const meta = {
    reason: String(reason || 'deploy_failed'),
    exit_code: exitCode ?? null,
    failed_step: failedStep ?? null,
    phase: 'deploy_pipeline',
    worker_name: workerName,
  };

  const cols = pragmaTableInfo(root, 'agentsam_deployment_health');
  const row = {};
  const idCol = pickFirstExisting(cols, ['id']);
  if (idCol) row[idCol] = healthRowId(runGroupId, 'fail');

  const chk = pickFirstExisting(cols, ['check_type', 'health_check_type', 'gate']);
  if (chk) row[chk] = 'smoke_test';

  if (cols.has('status')) row.status = 'failed';
  if (cols.has('environment')) row.environment = environment;
  if (cols.has('tenant_id')) row.tenant_id = tenantId;
  if (cols.has('workspace_id')) row.workspace_id = workspaceId;

  const depId = pickFirstExisting(cols, ['deployment_id', 'deploy_id', 'run_group_id']);
  if (depId) row[depId] = runGroupId;

  const mj = pickFirstExisting(cols, ['metadata_json', 'details_json', 'context_json', 'payload_json']);
  if (mj) row[mj] = meta;

  const aiCost = pickFirstExisting(cols, ['ai_cost_usd']);
  if (aiCost) row[aiCost] = 0;

  return insertDeploymentHealth(root, row);
}

export async function recordR2ReconcileSkipped(root, opts) {
  const { runGroupId, tenantId, workspaceId, workerName, environment } = opts;
  const meta = {
    reason: 'SKIP_R2_DEPLOY_RECONCILE=1',
    phase: 'r2_reconcile',
    worker_name: workerName,
  };

  const cols = pragmaTableInfo(root, 'agentsam_deployment_health');
  const row = {};
  const idCol = pickFirstExisting(cols, ['id']);
  if (idCol) row[idCol] = healthRowId(runGroupId, 'r2skip');

  const chk = pickFirstExisting(cols, ['check_type', 'health_check_type', 'gate']);
  if (chk) row[chk] = 'smoke_test';

  if (cols.has('status')) row.status = 'skipped';
  if (cols.has('environment')) row.environment = environment;
  if (cols.has('tenant_id')) row.tenant_id = tenantId;
  if (cols.has('workspace_id')) row.workspace_id = workspaceId;

  const depId = pickFirstExisting(cols, ['deployment_id', 'deploy_id', 'run_group_id']);
  if (depId) row[depId] = runGroupId;

  const mj = pickFirstExisting(cols, ['metadata_json', 'details_json', 'context_json', 'payload_json']);
  if (mj) row[mj] = meta;

  const aiCost = pickFirstExisting(cols, ['ai_cost_usd']);
  if (aiCost) row[aiCost] = 0;

  return insertDeploymentHealth(root, row);
}

async function phaseEval() {
  const root = repoRoot();
  loadDotEnvCloudflare(root);
  if (!hasCloudflareToken()) {
    console.warn('[d1-health] CLOUDFLARE_API_TOKEN unset — skip');
    process.exit(0);
  }

  const ctxPath = resolve(root, DEPLOY_CONTEXT_FILE);
  const ctx = readJson(ctxPath, {});
  const runGroupId = String(process.env.RUN_GROUP_ID ?? ctx.run_group_id ?? '').trim();
  if (!runGroupId) {
    console.warn('[d1-health] No RUN_GROUP_ID — skip');
    process.exit(0);
  }

  const evalRes = readJson(resolve(root, DEPLOY_EVAL_RESULTS_FILE), {});
  const tenantId = String(process.env.TENANT_ID ?? ctx.tenant_id ?? '').trim();
  const workspaceId = String(process.env.WORKSPACE_ID ?? ctx.workspace_id ?? '').trim();
  const workerName = deriveWorkerName(root);
  const envLabel = String(process.env.DEPLOY_ENV ?? ctx.environment ?? 'production').trim() || 'production';
  const baseUrl = (
    process.env.DEPLOY_SMOKE_BASE_URL || 'https://inneranimalmedia.com'
  ).replace(/\/$/, '');

  await recordDeployEvalHealth(root, {
    runGroupId,
    tenantId,
    workspaceId,
    workerName,
    environment: envLabel,
    evalRes,
    smokeBaseUrl: baseUrl,
    gitSha: gitFull(root),
    gitBranch: ctx.git_branch || '',
  });
  console.log('[d1-health] Recorded eval health row', runGroupId);
}

async function phaseR2Skip() {
  const root = repoRoot();
  loadDotEnvCloudflare(root);
  if (!hasCloudflareToken()) {
    process.exit(0);
  }

  const ctxPath = resolve(root, DEPLOY_CONTEXT_FILE);
  const ctx = readJson(ctxPath, {});
  const runGroupId = String(process.env.RUN_GROUP_ID ?? ctx.run_group_id ?? '').trim();
  if (!runGroupId) process.exit(0);

  const tenantId = String(process.env.TENANT_ID ?? ctx.tenant_id ?? '').trim();
  const workspaceId = String(process.env.WORKSPACE_ID ?? ctx.workspace_id ?? '').trim();

  await recordR2ReconcileSkipped(root, {
    runGroupId,
    tenantId,
    workspaceId,
    workerName: deriveWorkerName(root),
    environment: String(process.env.DEPLOY_ENV ?? ctx.environment ?? 'production').trim() || 'production',
  });
  console.log('[d1-health] Recorded R2 reconcile skipped', runGroupId);
}

async function main() {
  const phase = arg('--phase', 'eval');
  if (phase === 'r2-skip' || phase === 'r2_skip') {
    await phaseR2Skip();
    return;
  }
  await phaseEval();
}

main().catch((e) => {
  console.warn('[d1-health]', e?.message || e);
  process.exit(0);
});
