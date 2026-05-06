#!/usr/bin/env node
/**
 * Start deploy ledger rows in Supabase (explicit tenant/workspace/project — no DB defaults).
 * Writes .deploy-run-context.json for complete/failure scripts.
 *
 * Env vars → DB columns: docs/DEPLOY_ENV_SUPABASE_MAPPING.md
 *
 * Env used here: RUN_GROUP_ID, TRIGGER_SOURCE, DEPLOY_SCRIPT_NAME, TENANT_ID, WORKSPACE_ID,
 * DOCUMENTS_PROJECT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEPLOY_ENV,
 * DEPLOYED_BY / DEPLOY_DEPLOYED_BY, TRIGGERED_BY / DEPLOY_TRIGGERED_BY,
 * D1_AUTH_USER_ID, DEPLOY_USER_EMAIL / USER_EMAIL.
 *
 * If Supabase creds are unset, exits 0 (skip). If creds set but scope incomplete, exits 1.
 */
import { writeFileSync, existsSync } from 'fs';
import { resolveDeployScope, requireSupabaseRest } from './lib/supabase-deploy-context.mjs';
import { sbRequest } from './lib/supabase-rest.mjs';
import {
  repoRoot,
  DEPLOY_CONTEXT_FILE,
} from './lib/supabase-deploy-paths.mjs';
import { execFileSync } from 'child_process';

function git(cmd, root) {
  try {
    return execFileSync('git', cmd.split(' '), { encoding: 'utf8', cwd: root }).trim();
  } catch {
    return '';
  }
}

function safeIdPart(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

async function main() {
  const root = repoRoot();
  let ctx;
  try {
    ctx = requireSupabaseRest(resolveDeployScope({ repoRoot: root, strict: false }));
  } catch (e) {
    console.warn('[deploy-start]', e.message || e);
    process.exit(1);
  }

  if (!ctx.supabaseUrl || !ctx.serviceKey) {
    console.warn('[deploy-start] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset — skipping ledger start');
    process.exit(0);
  }

  if (!ctx.tenantId || !ctx.workspaceId || !ctx.projectId) {
    console.error(
      '[deploy-start] With Supabase configured, TENANT_ID, WORKSPACE_ID, and DOCUMENTS_PROJECT_ID are required.',
    );
    process.exit(1);
  }

  const commitSha = git('rev-parse HEAD', root);
  const branch = git('rev-parse --abbrev-ref HEAD', root) || 'main';
  const shortSha = git('rev-parse --short HEAD', root) || 'local';
  const runGroupRaw =
    process.env.RUN_GROUP_ID?.trim() || `rg_${Date.now()}_${safeIdPart(shortSha)}`;
  const runGroupId = safeIdPart(runGroupRaw);
  const buildEventId = `bde_${runGroupId}`;
  const workflowRunId = `wf_${runGroupId}`;

  const triggerSource = String(
    process.env.TRIGGER_SOURCE || (process.env.CI ? 'github' : 'manual'),
  ).trim();
  const scriptName = String(process.env.DEPLOY_SCRIPT_NAME || 'deploy:full').trim();
  const environment = String(process.env.DEPLOY_ENV || 'production').trim();
  const deployedBy = ctx.deployedBy || ctx.d1AuthUserId || ctx.userEmail || 'deploy_script';
  const triggeredBy = ctx.triggeredBy || deployedBy;
  const startedAt = new Date().toISOString();

  const meta = {
    run_group_id: runGroupId,
    script_name: scriptName,
    git_commit_sha: commitSha || null,
    git_branch: branch,
    commit_short: shortSha || null,
  };

  const bdeRow = {
    id: buildEventId,
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    environment,
    event_type: 'deploy_started',
    trigger_source: triggerSource,
    triggered_by: triggeredBy,
    deployed_by: deployedBy,
    script_name: scriptName,
    git_commit_sha: commitSha || null,
    git_branch: branch,
    git_message: git('log -1 --pretty=%s', root) || null,
    status: 'running',
    duration_ms: null,
    exit_code: null,
    output_summary: null,
    error_message: null,
    started_at: startedAt,
    completed_at: null,
    metadata_jsonb: meta,
    worker_version_id: null,
  };

  const wfRow = {
    id: workflowRunId,
    d1_run_id: runGroupId,
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    workflow_key: 'full_deploy',
    display_name: 'Full deploy (inneranimalmedia)',
    trigger_type: triggerSource === 'github' ? 'github' : 'manual',
    status: 'running',
    input_json: {
      run_group_id: runGroupId,
      script: scriptName,
      commit_sha: commitSha,
      branch,
      environment,
      documents_project_id: ctx.projectId,
    },
    step_results_json: [],
    steps_completed: 0,
    steps_total: 0,
    environment,
    started_at: startedAt,
    completed_at: null,
    error_message: null,
  };

  const base = ctx.supabaseUrl.replace(/\/$/, '');
  const key = ctx.serviceKey;

  await sbRequest('POST', `${base}/rest/v1/build_deploy_events`, key, bdeRow, {
    Prefer: 'return=minimal',
  });

  await sbRequest('POST', `${base}/rest/v1/agentsam_workflow_runs`, key, wfRow, {
    Prefer: 'return=minimal',
  });

  const outPath = resolve(root, DEPLOY_CONTEXT_FILE);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        version: 1,
        run_group_id: runGroupId,
        build_deploy_event_id: buildEventId,
        workflow_run_id: workflowRunId,
        started_at: startedAt,
        tenant_id: ctx.tenantId,
        workspace_id: ctx.workspaceId,
        project_id: ctx.projectId,
        d1_auth_user_id: ctx.d1AuthUserId,
        user_email: ctx.userEmail,
        environment,
        trigger_source: triggerSource,
        script_name: scriptName,
        git_commit_sha: commitSha,
        git_branch: branch,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`[deploy-start] Ledger started ${runGroupId} → ${outPath}`);
}

main().catch((e) => {
  console.error('[deploy-start]', e);
  process.exit(1);
});
