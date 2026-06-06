#!/usr/bin/env node
/**
 * Finalize D1 deployment row (success), deployment_tracking, deployment_notifications,
 * agentsam_deployment_health (eval), optional agentsam_error_log warnings.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadDotEnvCloudflare } from './lib/supabase-deploy-context.mjs';
import {
  repoRoot,
  DEPLOY_CONTEXT_FILE,
  DEPLOY_WORKER_STATS_FILE,
  DEPLOY_EVAL_RESULTS_FILE,
} from './lib/supabase-deploy-paths.mjs';
import {
  buildDeployMetrics,
  buildOutputSummaryLine,
  loadAuxiliaryDeployStats,
} from './lib/deploy-ledger-summary.mjs';
import {
  deriveWorkerName,
  gitFull,
  hasCloudflareToken,
  notifyRecipient,
  notificationRowId,
  pickFirstExisting,
  pragmaTableInfo,
  runD1Exec,
  sqlJson,
  sqlString,
  sqlInt,
  trackingRowId,
} from './lib/d1-deploy-record.mjs';
import { recordDeployEvalHealth } from './record-d1-deployment-health.mjs';

function readJson(path, fb = null) {
  try {
    if (!existsSync(path)) return fb;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fb;
  }
}

async function insertErrorLogRow(root, cols, row) {
  const parts = [];
  const vals = [];
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined || !cols.has(k)) continue;
    parts.push(k);
    if (v === null) vals.push('NULL');
    else if (typeof v === 'object' && v !== null && !Array.isArray(v)) vals.push(sqlJson(v));
    else vals.push(sqlString(v));
  }
  const cid = pickFirstExisting(cols, ['created_at']);
  if (cid && !parts.includes(cid)) {
    parts.push(cid);
    vals.push('unixepoch()');
  }
  if (parts.length < 2) return;
  await runD1Exec(
    root,
    `INSERT INTO agentsam_error_log (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
  );
}

async function maybeInsertErrorLogs(root, ctx, opts) {
  const cols = pragmaTableInfo(root, 'agentsam_error_log');
  if (!cols.size) return;

  const baseCtx = {
    commit: opts.gitSha || null,
    branch: opts.branch || null,
    environment: opts.environment || 'production',
    run_group_id: ctx.run_group_id,
    check_type: 'deploy_complete',
  };

  const idPref = pickFirstExisting(cols, ['id']);
  const mkId = (suffix) =>
    idPref ? `aerr_${String(ctx.run_group_id).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)}_${suffix}` : null;

  if (opts.notifyFailed && cols.has('workspace_id') && cols.has('tenant_id')) {
    const wid = mkId('notify');
    if (wid)
      await insertErrorLogRow(root, cols, {
        ...(idPref ? { [idPref]: wid } : {}),
        workspace_id: opts.workspaceId,
        tenant_id: opts.tenantId,
        error_type: 'notification_failed',
        error_message: String(opts.notifyErr || 'notification_failed').slice(0, 8000),
        source: String(process.env.DEPLOY_SCRIPT_NAME || 'deploy-frontend.sh').slice(0, 200),
        source_id: ctx.run_group_id,
        context_json: JSON.stringify({ ...baseCtx, phase: 'resend' }),
      }).catch(() => {});
  }

  if (opts.evalDegraded && cols.has('workspace_id') && cols.has('tenant_id')) {
    const wid = mkId('degraded');
    if (wid)
      await insertErrorLogRow(root, cols, {
        ...(idPref ? { [idPref]: wid } : {}),
        workspace_id: opts.workspaceId,
        tenant_id: opts.tenantId,
        error_type: 'deploy_eval_degraded',
        error_message: 'Semantic smoke advisory degraded deploy eval status',
        source: 'run-deploy-eval.mjs',
        source_id: ctx.run_group_id,
        context_json: JSON.stringify({
          ...baseCtx,
          health: opts.healthOk,
          rag_smoke: opts.ragOk,
        }),
      }).catch(() => {});
  }

  if (opts.codebaseFailed && cols.has('workspace_id') && cols.has('tenant_id')) {
    const wid = mkId('cbidx');
    if (wid)
      await insertErrorLogRow(root, cols, {
        ...(idPref ? { [idPref]: wid } : {}),
        workspace_id: opts.workspaceId,
        tenant_id: opts.tenantId,
        error_type: 'codebase_index_failed',
        error_message: String(opts.codebaseReason || 'codebase_index_failed').slice(0, 8000),
        source: 'agentsam_codebase_reindex.mjs',
        source_id: ctx.run_group_id,
        context_json: JSON.stringify(baseCtx),
      }).catch(() => {});
  }
}

async function upsertDeploymentNotification(root, ctx, worker, tenantId) {
  const cols = pragmaTableInfo(root, 'deployment_notifications');
  if (!cols.size) return;

  const recipient = notifyRecipient();
  const raw = String(worker.notify_status ?? '').toLowerCase();
  let status = 'skipped';
  let errMsg = null;
  if (raw === 'sent') status = 'sent';
  else if (raw === 'failed') {
    status = 'failed';
    errMsg = 'Deploy notification HTTP/email failure (see Worker logs / Resend)';
  }

  const parts = [];
  const vals = [];

  const nid = pickFirstExisting(cols, ['id']);
  if (nid) {
    parts.push(nid);
    vals.push(sqlString(notificationRowId(ctx.run_group_id)));
  }

  const depCol = pickFirstExisting(cols, ['deployment_id', 'run_group_id', 'deploy_id']);
  if (depCol) {
    parts.push(depCol);
    vals.push(sqlString(ctx.run_group_id));
  }

  const rc = pickFirstExisting(cols, ['recipient', 'recipient_email', 'notify_email', 'to_email']);
  if (rc) {
    parts.push(rc);
    vals.push(sqlString(recipient || 'unknown'));
  }

  if (cols.has('tenant_id')) {
    parts.push('tenant_id');
    vals.push(sqlString(tenantId));
  }

  if (cols.has('status')) {
    parts.push('status');
    vals.push(sqlString(status));
  }

  const em = pickFirstExisting(cols, ['error_message', 'failure_message', 'last_error']);
  if (em && errMsg) {
    parts.push(em);
    vals.push(sqlString(errMsg));
  }

  const mj = pickFirstExisting(cols, ['metadata_json', 'payload_json']);
  if (mj) {
    parts.push(mj);
    vals.push(sqlJson({ notify_status_raw: worker.notify_status ?? null }));
  }

  const cat = pickFirstExisting(cols, ['created_at', 'sent_at']);
  if (cat && !parts.includes(cat)) {
    parts.push(cat);
    const inf = cols.get(cat);
    const t = (inf?.type || '').toLowerCase();
    vals.push(t.includes('int') ? 'unixepoch()' : sqlString(new Date().toISOString()));
  }

  if (parts.length < 2) return;

  const insertSql = `INSERT INTO deployment_notifications (${parts.join(', ')}) VALUES (${vals.join(', ')})`;
  try {
    await runD1Exec(root, insertSql);
  } catch {
    const depWhere = pickFirstExisting(cols, ['deployment_id', 'run_group_id', 'deploy_id', 'id']);
    if (!depWhere) return;
    const u = [];
    if (cols.has('status')) u.push(`status=${sqlString(status)}`);
    const emc = pickFirstExisting(cols, ['error_message', 'failure_message', 'last_error']);
    if (emc && errMsg) u.push(`${emc}=${sqlString(errMsg)}`);
    if (u.length)
      await runD1Exec(
        root,
        `UPDATE deployment_notifications SET ${u.join(', ')} WHERE ${depWhere}=${sqlString(ctx.run_group_id)}`,
      ).catch(() => {});
  }
}

async function main() {
  const root = repoRoot();

  if (!hasCloudflareToken()) {
    console.warn('[d1-deploy-complete] CLOUDFLARE_API_TOKEN unset — skip');
    process.exit(0);
  }

  loadDotEnvCloudflare(root);

  const deployCtx = readJson(resolve(root, DEPLOY_CONTEXT_FILE), null);
  if (!deployCtx?.run_group_id) {
    console.warn('[d1-deploy-complete] No deploy context — skip');
    process.exit(0);
  }

  const tenantId = String(process.env.TENANT_ID ?? deployCtx.tenant_id ?? '').trim();
  const workspaceId = String(process.env.WORKSPACE_ID ?? deployCtx.workspace_id ?? '').trim();
  if (!tenantId || !workspaceId) {
    console.warn('[d1-deploy-complete] TENANT_ID / WORKSPACE_ID missing — skip');
    process.exit(0);
  }

  const worker = readJson(resolve(root, DEPLOY_WORKER_STATS_FILE), {});
  const evalRes = readJson(resolve(root, DEPLOY_EVAL_RESULTS_FILE), {});
  const { pipeline, routeStats, codebaseStats } = loadAuxiliaryDeployStats(root);

  const completedAt = new Date().toISOString();
  const started = deployCtx.started_at ? Date.parse(deployCtx.started_at) : Date.now();
  const durationMs = Math.max(0, Math.floor(Date.now() - started));
  const durationSec = Math.max(0, Math.round(durationMs / 1000));

  const workerName = deriveWorkerName(root);
  const gitSha = worker.git_commit_sha || deployCtx.git_commit_sha || gitFull(root);
  const branch = worker.git_branch || deployCtx.git_branch || '';

  const deployMetrics = buildDeployMetrics({
    durationMs,
    deployCtx,
    worker,
    evalRes,
    pipeline,
    routeStats,
    codebaseStats,
  });

  const outputSummary = buildOutputSummaryLine({
    status: 'passed',
    deployCtx,
    worker,
    evalRes,
    pipeline,
    routeStats,
    codebaseStats,
    durationMs,
  });

  const envLabel = String(process.env.DEPLOY_ENV ?? deployCtx.environment ?? 'production').trim() || 'production';

  const depCols = pragmaTableInfo(root, 'deployments');
  if (depCols.size) {
    const sets = [];
    if (depCols.has('status')) sets.push(`status=${sqlString('success')}`);
    if (depCols.has('notes')) sets.push(`notes=${sqlString(outputSummary.slice(0, 8000))}`);
    if (depCols.has('duration_seconds')) sets.push(`duration_seconds=${sqlInt(durationSec)}`);
    if (depCols.has('deploy_time_seconds')) sets.push(`deploy_time_seconds=${sqlInt(durationSec)}`);
    if (depCols.has('deploy_duration_ms')) sets.push(`deploy_duration_ms=${sqlInt(durationMs)}`);
    if (depCols.has('git_hash') && gitSha) sets.push(`git_hash=${sqlString(gitSha)}`);
    if (depCols.has('worker_name')) sets.push(`worker_name=${sqlString(workerName)}`);
    if (depCols.has('timestamp')) sets.push(`timestamp=datetime('now')`);

    const mj = pickFirstExisting(depCols, ['metadata_json', 'metadata_jsonb', 'deploy_metadata_json']);
    if (mj) {
      sets.push(
        `${mj}=${sqlJson({
          deploy_metrics: deployMetrics,
          completed_at: completedAt,
          worker_stats: worker,
          eval: evalRes,
        })}`,
      );
    }

    if (sets.length) {
      try {
        await runD1Exec(
          root,
          `UPDATE deployments SET ${sets.join(', ')} WHERE id=${sqlString(deployCtx.run_group_id)}`,
        );
      } catch (e) {
        console.warn('[d1-deploy-complete] deployments update failed:', e?.message || e);
      }
    }
  }

  const trackCols = pragmaTableInfo(root, 'deployment_tracking');
  if (trackCols.size) {
    const sets = [];
    if (trackCols.has('status')) sets.push(`status=${sqlString('completed')}`);
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
      try {
        await runD1Exec(
          root,
          `UPDATE deployment_tracking SET ${sets.join(', ')} WHERE id=${sqlString(tid)}`,
        );
      } catch (e) {
        console.warn('[d1-deploy-complete] deployment_tracking update failed:', e?.message || e);
      }
    }
  }

  await recordDeployEvalHealth(root, {
    runGroupId: deployCtx.run_group_id,
    tenantId,
    workspaceId,
    workerName,
    environment: envLabel,
    evalRes,
    smokeBaseUrl: (process.env.DEPLOY_SMOKE_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, ''),
    gitSha,
    gitBranch: branch,
  }).catch(() => {});

  await upsertDeploymentNotification(root, deployCtx, worker, tenantId).catch(() => {});

  const notifyRaw = String(worker.notify_status ?? '').toLowerCase();
  const semanticRequired =
    Boolean(String(process.env.SUPABASE_DB_URL ?? '').trim()) && Boolean(tenantId);
  const evalDegraded =
    evalRes.health_ok !== false &&
    !evalRes.semantic_smoke_ok &&
    semanticRequired &&
    !(evalRes.semantic_strict === true);

  const codebaseStatus = String(
    codebaseStats.codebase_index_status ?? pipeline.codebase_index_status ?? '',
  ).toLowerCase();
  const codebaseFailed = codebaseStatus === 'failed' || codebaseStatus === 'error';

  await maybeInsertErrorLogs(root, deployCtx, {
    tenantId,
    workspaceId,
    gitSha,
    branch,
    environment: envLabel,
    notifyFailed: notifyRaw === 'failed',
    notifyErr: null,
    evalDegraded,
    healthOk: evalRes.health_ok,
    ragOk: evalRes.semantic_smoke_ok,
    codebaseFailed,
    codebaseReason: codebaseStats.error || pipeline.codebase_error || null,
  }).catch(() => {});

  console.log('[d1-deploy-complete] Updated D1 deployment', deployCtx.run_group_id);
}

main().catch((e) => {
  console.warn('[d1-deploy-complete]', e?.message || e);
  process.exit(0);
});
