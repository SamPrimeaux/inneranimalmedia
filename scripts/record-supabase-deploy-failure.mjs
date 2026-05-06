#!/usr/bin/env node
/**
 * Record deploy failure: PATCH ledger rows, INSERT agentsam_error_events, eval run failed.
 * Args: --reason "..." --exit-code N
 *
 * See docs/DEPLOY_ENV_SUPABASE_MAPPING.md (run_group_id, error metadata).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { resolveDeployScope, requireSupabaseRest } from './lib/supabase-deploy-context.mjs';
import { sbRequest } from './lib/supabase-rest.mjs';
import {
  repoRoot,
  DEPLOY_CONTEXT_FILE,
  DEPLOY_WORKER_STATS_FILE,
} from './lib/supabase-deploy-paths.mjs';

function readJson(path, fallback = null) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function enc(s) {
  return encodeURIComponent(String(s));
}

function arg(name, def = '') {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

async function main() {
  const root = repoRoot();
  let ctx;
  try {
    ctx = requireSupabaseRest(resolveDeployScope({ repoRoot: root, strict: false }));
  } catch {
    process.exit(0);
  }

  if (!ctx.supabaseUrl || !ctx.serviceKey) process.exit(0);

  const deployCtx = readJson(resolve(root, DEPLOY_CONTEXT_FILE), null);
  if (!deployCtx?.build_deploy_event_id) {
    process.exit(0);
  }

  const reason = arg('--reason', 'deploy_failed');
  const exitCode = Number(arg('--exit-code', '1')) || 1;
  const worker = readJson(resolve(root, DEPLOY_WORKER_STATS_FILE), {});

  const completedAt = new Date().toISOString();
  const started = deployCtx.started_at ? Date.parse(deployCtx.started_at) : Date.now();
  const durationMs = Math.max(0, Math.floor(Date.now() - started));

  const base = ctx.supabaseUrl.replace(/\/$/, '');
  const key = ctx.serviceKey;

  const metaOut = {
    run_group_id: deployCtx.run_group_id,
    failure_stage: reason,
    worker_stats: worker,
  };

  await sbRequest(
    'PATCH',
    `${base}/rest/v1/build_deploy_events?id=eq.${enc(deployCtx.build_deploy_event_id)}`,
    key,
    {
      event_type: 'deploy_failed',
      status: 'failed',
      completed_at: completedAt,
      duration_ms: durationMs,
      exit_code: exitCode,
      output_summary: null,
      error_message: reason,
      worker_version_id: worker.worker_version_id || null,
      metadata_jsonb: metaOut,
    },
    { Prefer: 'return=minimal' },
  );

  await sbRequest(
    'PATCH',
    `${base}/rest/v1/agentsam_workflow_runs?id=eq.${enc(deployCtx.workflow_run_id)}`,
    key,
    {
      status: 'failed',
      completed_at: completedAt,
      duration_ms: durationMs,
      error_message: reason,
      output_json: metaOut,
    },
    { Prefer: 'return=minimal' },
  );

  await sbRequest('POST', `${base}/rest/v1/agentsam_error_events`, key, {
    tenant_id: deployCtx.tenant_id,
    workspace_id: deployCtx.workspace_id,
    d1_auth_user_id: deployCtx.d1_auth_user_id || null,
    user_email: deployCtx.user_email || null,
    run_group_id: deployCtx.run_group_id,
    source: 'deploy',
    severity: 'error',
    error_type: 'deploy_pipeline',
    error_code: String(exitCode),
    error_message: reason,
    stack_preview: null,
    retryable: false,
    metadata: metaOut,
  });

  await sbRequest('POST', `${base}/rest/v1/agentsam_eval_runs`, key, {
    run_group_id: deployCtx.run_group_id,
    tenant_id: deployCtx.tenant_id,
    workspace_id: deployCtx.workspace_id,
    d1_auth_user_id: deployCtx.d1_auth_user_id || null,
    user_email: deployCtx.user_email || null,
    run_source: 'deploy',
    agent_tool: 'deploy_validation',
    branch_name: deployCtx.git_branch || null,
    commit_after: deployCtx.git_commit_sha || null,
    status: 'failed',
    success: false,
    failure_reason: reason,
    deploy_passed: false,
    duration_ms: durationMs,
    completed_at: completedAt,
    artifacts_json: {},
    metrics_json: { exit_code: exitCode },
    metadata: metaOut,
  });

  console.error('[deploy-failure] Recorded', reason);
}

main().catch(() => process.exit(0));
