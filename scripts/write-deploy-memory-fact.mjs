#!/usr/bin/env node
/**
 * CLI: write structured deploy facts to D1 agentsam_memory after deploy:full.
 * Reads .deploy-worker-stats.json when present; env from .env.cloudflare via resolveDeployScope.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { repoRoot } from './lib/supabase-deploy-paths.mjs';
import { resolveDeployScope } from './lib/supabase-deploy-context.mjs';
import {
  buildDeployMemoryRows,
  buildDeployFactPayload,
} from '../src/core/deploy-memory-fact.js';
import {
  gitFull,
  gitShort,
  hasCloudflareToken,
  runD1Exec,
  sqlString,
} from './lib/d1-deploy-record.mjs';

function readJsonIfExists(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function sqlUpsertRow(row) {
  const tags =
    typeof row.tags === 'string' ? row.tags : JSON.stringify(row.tags ?? []);
  return `INSERT INTO agentsam_memory (
    id, tenant_id, user_id, workspace_id, memory_type, key, value,
    title, summary, source, tags, sync_key, importance, is_pinned,
    confidence, decay_score, updated_at
  ) VALUES (
    ${sqlString(row.id)},
    ${sqlString(row.tenantId)},
    ${sqlString(row.userId)},
    ${sqlString(row.workspaceId)},
    ${sqlString(row.memoryType)},
    ${sqlString(row.key)},
    ${sqlString(row.value)},
    ${sqlString(row.title)},
    ${sqlString(row.summary)},
    ${sqlString(row.source)},
    ${sqlString(tags)},
    ${sqlString(row.syncKey)},
    ${Number(row.importance ?? 5)},
    ${row.isPinned ? 1 : 0},
    1.0,
    1.0,
    unixepoch()
  )
  ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
    workspace_id = COALESCE(excluded.workspace_id, agentsam_memory.workspace_id),
    memory_type = excluded.memory_type,
    value = excluded.value,
    title = COALESCE(excluded.title, agentsam_memory.title),
    summary = COALESCE(excluded.summary, agentsam_memory.summary),
    source = excluded.source,
    tags = excluded.tags,
    sync_key = excluded.sync_key,
    importance = excluded.importance,
    is_pinned = excluded.is_pinned,
    confidence = excluded.confidence,
    decay_score = excluded.decay_score,
    updated_at = unixepoch();`;
}

function collectFields(root, workerStats) {
  const shortSha = gitShort(root);
  const fullSha = gitFull(root);
  let gitMessage = '';
  try {
    gitMessage = execFileSync('git', ['log', '-1', '--pretty=%s'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    /* ignore */
  }

  return {
    shortSha: workerStats?.git_commit_sha
      ? String(workerStats.git_commit_sha).slice(0, 12)
      : shortSha,
    gitHash: workerStats?.git_commit_sha || fullSha || shortSha,
    version: shortSha,
    environment: String(process.env.ENVIRONMENT || process.env.DEPLOY_ENV || 'production').trim(),
    branchName:
      workerStats?.git_branch ||
      String(process.env.BRANCH_NAME || 'main').trim(),
    description:
      workerStats?.git_message ||
      String(process.env.GIT_MSG_LINE || gitMessage).trim(),
    deployedAt:
      workerStats?.deploy_completed_at ||
      new Date().toISOString(),
    workerVersionId:
      workerStats?.worker_version_id ||
      String(process.env.WORKER_VERSION_ID || '').trim() ||
      null,
    deployDurationMs: Number(
      workerStats?.wrangler_duration_ms ?? process.env.DEPLOY_DURATION_MS ?? 0,
    ),
    r2SyncStatus:
      workerStats?.r2_sync_status ||
      String(process.env.R2_SYNC_STATUS || '').trim() ||
      null,
    r2SyncMs: Number(workerStats?.r2_sync_ms ?? process.env.R2_SYNC_MS ?? 0) || null,
    r2ReconcileStatus:
      workerStats?.r2_reconcile_status ||
      String(process.env.R2_RECONCILE_STATUS || '').trim() ||
      null,
    fileCount: Number(process.env.FILE_COUNT ?? 0) || null,
    totalKb: Number(process.env.TOTAL_KB ?? 0) || null,
    notifyStatus:
      workerStats?.notify_status ||
      String(process.env.NOTIFY_STATUS || '').trim() ||
      null,
    deployedBy: String(process.env.DEPLOYED_BY || 'deploy:full').trim(),
  };
}

async function main() {
  const root = repoRoot();

  if (!hasCloudflareToken()) {
    console.warn('[write-deploy-memory-fact] CLOUDFLARE_API_TOKEN unset — skipping D1 memory write');
    process.exit(0);
  }

  let scope;
  try {
    scope = resolveDeployScope({ repoRoot: root, strict: false });
  } catch (e) {
    console.warn('[write-deploy-memory-fact] scope resolve failed:', e?.message || e);
    process.exit(0);
  }

  const tenantId = scope.tenantId;
  const workspaceId = scope.workspaceId;
  const userId = scope.d1AuthUserId;

  if (!tenantId || !workspaceId || !userId) {
    console.warn(
      '[write-deploy-memory-fact] missing TENANT_ID, WORKSPACE_ID, or D1_AUTH_USER_ID — skipping',
    );
    process.exit(0);
  }

  const workerStats = readJsonIfExists(resolve(root, '.deploy-worker-stats.json'));
  const fields = collectFields(root, workerStats);
  const rows = buildDeployMemoryRows({ tenantId, workspaceId, userId }, fields);

  if (!fields.gitHash || fields.gitHash === 'unknown') {
    console.warn('[write-deploy-memory-fact] git hash unknown — skipping');
    process.exit(0);
  }

  const fact = buildDeployFactPayload(fields);
  console.log(
    `[write-deploy-memory-fact] sha=${fact.deploy_sha} workspace=${workspaceId} keys=${rows.pointer.key},${rows.perDeploy.key}`,
  );

  await runD1Exec(root, sqlUpsertRow(rows.pointer));
  await runD1Exec(root, sqlUpsertRow(rows.perDeploy));

  console.log('[write-deploy-memory-fact] D1 agentsam_memory updated');
}

main().catch((e) => {
  console.warn('[write-deploy-memory-fact]', e?.message || e);
  process.exit(0);
});
