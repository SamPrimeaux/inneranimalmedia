#!/usr/bin/env node
/**
 * Finalize deploy ledger: PATCH build_deploy_events + workflow, INSERT eval + tool_call_events.
 *
 * Consumes .deploy-run-context.json, .deploy-worker-stats.json, .deploy-eval-results.json, .deploy-tool-events.jsonl.
 * Env/column mapping: docs/DEPLOY_ENV_SUPABASE_MAPPING.md
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { resolveDeployScope, requireSupabaseRest } from './lib/supabase-deploy-context.mjs';
import { sbRequest } from './lib/supabase-rest.mjs';
import {
  repoRoot,
  DEPLOY_CONTEXT_FILE,
  DEPLOY_WORKER_STATS_FILE,
  DEPLOY_EVAL_RESULTS_FILE,
  DEPLOY_TOOL_EVENTS_FILE,
} from './lib/supabase-deploy-paths.mjs';

function readJson(path, fallback = {}) {
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

async function main() {
  const root = repoRoot();
  let ctx;
  try {
    ctx = requireSupabaseRest(resolveDeployScope({ repoRoot: root, strict: false }));
  } catch (e) {
    console.warn('[deploy-complete]', e.message || e);
    process.exit(0);
  }

  if (!ctx.supabaseUrl || !ctx.serviceKey) {
    console.warn('[deploy-complete] Skipping (no Supabase creds)');
    process.exit(0);
  }

  const deployCtx = readJson(resolve(root, DEPLOY_CONTEXT_FILE), null);
  if (!deployCtx?.build_deploy_event_id) {
    console.warn('[deploy-complete] No .deploy-run-context.json — skipping');
    process.exit(0);
  }

  const worker = readJson(resolve(root, DEPLOY_WORKER_STATS_FILE), {});
  const evalRes = readJson(resolve(root, DEPLOY_EVAL_RESULTS_FILE), {});

  const completedAt = new Date().toISOString();
  const started = deployCtx.started_at ? Date.parse(deployCtx.started_at) : Date.now();
  const durationMs = Math.max(0, Math.floor(Date.now() - started));

  const workerVersionId = worker.worker_version_id || null;
  const gitSha = worker.git_commit_sha || deployCtx.git_commit_sha || null;
  const branch = worker.git_branch || deployCtx.git_branch || null;

  const summaryParts = [
    workerVersionId ? `worker_version=${workerVersionId}` : null,
    worker.wrangler_duration_ms != null ? `wrangler_ms=${worker.wrangler_duration_ms}` : null,
    evalRes.health_ok != null ? `health=${evalRes.health_ok}` : null,
    evalRes.semantic_smoke_ok != null ? `rag_smoke=${evalRes.semantic_smoke_ok}` : null,
  ].filter(Boolean);

  const metaOut = {
    run_group_id: deployCtx.run_group_id,
    worker_stats: worker,
    eval: evalRes,
    deploy_id_r2: process.env.DEPLOY_ID || null,
  };

  const bdePatch = {
    event_type: 'deploy_passed',
    status: 'passed',
    completed_at: completedAt,
    duration_ms: durationMs,
    exit_code: 0,
    output_summary: summaryParts.join('; ') || 'deploy_passed',
    error_message: null,
    git_commit_sha: gitSha,
    git_branch: branch,
    worker_version_id: workerVersionId,
    metadata_jsonb: metaOut,
  };

  const base = ctx.supabaseUrl.replace(/\/$/, '');
  const key = ctx.serviceKey;

  await sbRequest(
    'PATCH',
    `${base}/rest/v1/build_deploy_events?id=eq.${enc(deployCtx.build_deploy_event_id)}`,
    key,
    bdePatch,
    { Prefer: 'return=minimal' },
  );

  await sbRequest(
    'PATCH',
    `${base}/rest/v1/agentsam_workflow_runs?id=eq.${enc(deployCtx.workflow_run_id)}`,
    key,
    {
      status: 'completed',
      completed_at: completedAt,
      duration_ms: durationMs,
      output_json: metaOut,
      steps_completed: evalRes.steps_completed ?? 1,
      steps_total: evalRes.steps_total ?? 1,
    },
    { Prefer: 'return=minimal' },
  );

  const evalRow = {
    run_group_id: deployCtx.run_group_id,
    tenant_id: deployCtx.tenant_id,
    workspace_id: deployCtx.workspace_id,
    d1_auth_user_id: deployCtx.d1_auth_user_id || null,
    user_email: deployCtx.user_email || null,
    run_source: 'deploy',
    agent_tool: 'deploy_validation',
    repo_path: 'inneranimalmedia',
    branch_name: branch,
    commit_before: null,
    commit_after: gitSha,
    status: 'completed',
    success: evalRes.overall_success !== false,
    failure_reason: evalRes.failure_reason || null,
    duration_ms: evalRes.duration_ms ?? durationMs,
    build_passed: evalRes.build_passed ?? true,
    tests_passed: evalRes.tests_passed ?? null,
    lint_passed: evalRes.lint_passed ?? null,
    deploy_passed: evalRes.deploy_passed ?? true,
    artifacts_json: evalRes.artifacts_json || {},
    metrics_json: evalRes.metrics_json || {
      health_ok: evalRes.health_ok,
      health_latency_ms: evalRes.health_latency_ms,
      semantic_smoke_ok: evalRes.semantic_smoke_ok,
    },
    metadata: { run_group_id: deployCtx.run_group_id, worker },
    completed_at: completedAt,
  };

  const evalReturned = await sbRequest(
    'POST',
    `${base}/rest/v1/agentsam_eval_runs`,
    key,
    evalRow,
    { Prefer: 'return=representation' },
  );

  let evalRunId = null;
  if (Array.isArray(evalReturned) && evalReturned[0]?.id) {
    evalRunId = evalReturned[0].id;
  } else if (evalReturned?.id) {
    evalRunId = evalReturned.id;
  }

  const toolPath = resolve(root, DEPLOY_TOOL_EVENTS_FILE);
  if (evalRunId && existsSync(toolPath)) {
    const lines = readFileSync(toolPath, 'utf8').trim().split('\n').filter(Boolean);
    let idx = 0;
    for (const line of lines) {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      idx += 1;
      const row = {
        eval_run_id: evalRunId,
        tenant_id: ev.tenant_id || deployCtx.tenant_id,
        workspace_id: ev.workspace_id || deployCtx.workspace_id,
        run_group_id: ev.run_group_id || deployCtx.run_group_id,
        d1_auth_user_id: ev.d1_auth_user_id || deployCtx.d1_auth_user_id || null,
        user_email: ev.user_email || deployCtx.user_email || null,
        agent_tool: ev.agent_tool || 'deploy_automation',
        tool_name: ev.tool_name || 'unknown',
        tool_category: ev.tool_category || null,
        tool_source: ev.tool_source || 'script',
        call_index: idx,
        duration_ms: ev.duration_ms ?? 0,
        success: ev.success !== false,
        error_message: ev.error_message || null,
        input_preview: ev.input_preview || null,
        output_preview: ev.output_preview || null,
        input_json: ev.input_json || {},
        output_json: ev.output_json || {},
        metadata: { ...(ev.metadata || {}), run_group_id: deployCtx.run_group_id },
      };
      await sbRequest('POST', `${base}/rest/v1/agentsam_tool_call_events`, key, row, {
        Prefer: 'return=minimal',
      });
    }
  }

  console.log('[deploy-complete] Ledger finalized', deployCtx.run_group_id);
}

main().catch((e) => {
  console.error('[deploy-complete]', e?.message || e);
  process.exit(0);
});
