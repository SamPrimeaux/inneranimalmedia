#!/usr/bin/env node
/**
 * Mark D1 deployment + tracking failed; agentsam_deployment_health failed smoke row;
 * agentsam_error_log deploy_failed.
 *
 * Args: --reason "..." --exit-code N [--failed-step phase] [--error-key short_key]
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadDotEnvCloudflare } from './lib/supabase-deploy-context.mjs';
import {
  repoRoot,
  DEPLOY_CONTEXT_FILE,
} from './lib/supabase-deploy-paths.mjs';
import {
  deriveWorkerName,
  gitFull,
  hasCloudflareToken,
  pickFirstExisting,
  pragmaTableInfo,
  runD1Exec,
  sqlJson,
  sqlString,
  sqlInt,
  trackingRowId,
} from './lib/d1-deploy-record.mjs';
import { deployEnvironmentLabel } from './lib/deploy-environment.mjs';
import { recordPipelineFailureHealth } from './record-d1-deployment-health.mjs';

function readJson(path, fb = null) {
  try {
    if (!existsSync(path)) return fb;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fb;
  }
}

function arg(name, def = '') {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

async function insertDeployFailedError(root, ctx, o) {
  const cols = pragmaTableInfo(root, 'agentsam_error_log');
  if (!cols.size) return;

  const idPref = pickFirstExisting(cols, ['id']);
  const eid =
    idPref &&
    `aerr_${String(ctx.run_group_id).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 36)}_dfail`;

  const row = {};
  if (idPref && eid) row[idPref] = eid;
  if (cols.has('workspace_id')) row.workspace_id = o.workspaceId;
  if (cols.has('tenant_id')) row.tenant_id = o.tenantId;
  if (cols.has('error_type')) row.error_type = 'deploy_failed';
  if (cols.has('error_message')) row.error_message = String(o.reason || 'deploy_failed').slice(0, 8000);
  if (cols.has('source')) row.source = String(process.env.DEPLOY_SCRIPT_NAME || 'deploy-full.sh').slice(0, 200);
  if (cols.has('source_id')) row.source_id = ctx.run_group_id;
  if (cols.has('error_code')) row.error_code = String(o.exitCode ?? 1);
  const ctxCol = pickFirstExisting(cols, ['context_json', 'metadata_json']);
  if (ctxCol)
    row[ctxCol] = JSON.stringify({
      commit: o.gitSha,
      branch: o.branch,
      environment: o.environment,
      failed_step: o.failedStep,
      exit_code: o.exitCode,
      status: 'failed',
    });

  const parts = [];
  const vals = [];
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined || !cols.has(k)) continue;
    parts.push(k);
    if (v === null) vals.push('NULL');
    else vals.push(sqlString(v));
  }
  const cid = pickFirstExisting(cols, ['created_at']);
  if (cid && !parts.includes(cid)) {
    parts.push(cid);
    vals.push('unixepoch()');
  }
  if (parts.length < 3) return;

  await runD1Exec(
    root,
    `INSERT INTO agentsam_error_log (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
  ).catch(() => {});
}

async function main() {
  const root = repoRoot();
  loadDotEnvCloudflare(root);

  if (!hasCloudflareToken()) {
    process.exit(0);
  }

  const deployCtx = readJson(resolve(root, DEPLOY_CONTEXT_FILE), null);
  if (!deployCtx?.run_group_id) {
    process.exit(0);
  }

  const reason = arg('--reason', 'deploy_failed');
  const exitCode = Number(arg('--exit-code', '1')) || 1;
  const failedStep = arg('--failed-step', '') || null;

  const tenantId = String(process.env.TENANT_ID ?? deployCtx.tenant_id ?? '').trim();
  const workspaceId = String(process.env.WORKSPACE_ID ?? deployCtx.workspace_id ?? '').trim();
  if (!tenantId || !workspaceId) {
    process.exit(0);
  }

  const completedAt = new Date().toISOString();
  const started = deployCtx.started_at ? Date.parse(deployCtx.started_at) : Date.now();
  const durationMs = Math.max(0, Math.floor(Date.now() - started));
  const durationSec = Math.max(0, Math.round(durationMs / 1000));

  const workerName = deriveWorkerName(root);
  const gitSha = deployCtx.git_commit_sha || gitFull(root);
  const branch = deployCtx.git_branch || '';
  const envLabel = deployEnvironmentLabel(deployCtx.environment ?? 'production');

  const summary = [
    `status=failed`,
    `reason=${reason}`,
    exitCode != null ? `exit_code=${exitCode}` : '',
    failedStep ? `failed_step=${failedStep}` : '',
    `duration_ms=${durationMs}`,
  ]
    .filter(Boolean)
    .join('; ')
    .slice(0, 8000);

  const depCols = pragmaTableInfo(root, 'deployments');
  if (depCols.size) {
    const sets = [];
    if (depCols.has('status')) sets.push(`status=${sqlString('failed')}`);
    if (depCols.has('notes')) sets.push(`notes=${sqlString(summary)}`);
    if (depCols.has('duration_seconds')) sets.push(`duration_seconds=${sqlInt(durationSec)}`);
    if (depCols.has('deploy_time_seconds')) sets.push(`deploy_time_seconds=${sqlInt(durationSec)}`);
    if (depCols.has('deploy_duration_ms')) sets.push(`deploy_duration_ms=${sqlInt(durationMs)}`);
    if (depCols.has('git_hash') && gitSha) sets.push(`git_hash=${sqlString(gitSha)}`);
    if (depCols.has('worker_name')) sets.push(`worker_name=${sqlString(workerName)}`);
    const mj = pickFirstExisting(depCols, ['metadata_json', 'metadata_jsonb', 'deploy_metadata_json']);
    if (mj)
      sets.push(
        `${mj}=${sqlJson({
          failure_reason: reason,
          exit_code: exitCode,
          failed_step: failedStep,
          duration_ms: durationMs,
        })}`,
      );
    if (sets.length) {
      await runD1Exec(
        root,
        `UPDATE deployments SET ${sets.join(', ')} WHERE id=${sqlString(deployCtx.run_group_id)}`,
      ).catch(() => {});
    }
  }

  const trackCols = pragmaTableInfo(root, 'deployment_tracking');
  if (trackCols.size) {
    const sets = [];
    if (trackCols.has('status')) sets.push(`status=${sqlString('failed')}`);
    const durCol = pickFirstExisting(trackCols, ['duration_ms', 'total_duration_ms', 'wall_ms']);
    if (durCol) sets.push(`${durCol}=${sqlInt(durationMs)}`);
    const endCol = pickFirstExisting(trackCols, ['completed_at', 'finished_at', 'ended_at']);
    if (endCol) {
      const inf = trackCols.get(endCol);
      const t = (inf?.type || '').toLowerCase();
      sets.push(`${endCol}=${t.includes('int') ? 'unixepoch()' : sqlString(completedAt)}`);
    }
    const tid = trackingRowId(deployCtx.run_group_id);
    if (sets.length) {
      await runD1Exec(
        root,
        `UPDATE deployment_tracking SET ${sets.join(', ')} WHERE id=${sqlString(tid)}`,
      ).catch(() => {});
    }
  }

  await recordPipelineFailureHealth(root, {
    runGroupId: deployCtx.run_group_id,
    tenantId,
    workspaceId,
    workerName,
    environment: envLabel,
    reason,
    exitCode,
    failedStep,
  }).catch(() => {});

  await insertDeployFailedError(root, deployCtx, {
    tenantId,
    workspaceId,
    reason,
    exitCode,
    failedStep,
    gitSha,
    branch,
    environment: envLabel,
  }).catch(() => {});

  console.error('[d1-deploy-failure] Recorded', reason);
}

main().catch(() => process.exit(0));
