#!/usr/bin/env node
/**
 * Upsert D1 deployments (pending) + deployment_tracking (running) at deploy start.
 * Env: RUN_GROUP_ID, TENANT_ID, WORKSPACE_ID, DOCUMENTS_PROJECT_ID or DEPLOY_PROJECT_ID,
 * TRIGGER_SOURCE, DEPLOY_SCRIPT_NAME, ENVIRONMENT (legacy shell: DEPLOY_ENV), D1_AUTH_USER_ID / DEPLOY_USER_EMAIL,
 * CLOUDFLARE_API_TOKEN (via with-cloudflare-env / .env.cloudflare).
 */
import { repoRoot } from './lib/supabase-deploy-paths.mjs';
import { deployEnvironmentLabel } from './lib/deploy-environment.mjs';
import { resolveDeployScope } from './lib/supabase-deploy-context.mjs';
import {
  deriveWorkerName,
  deployedByActor,
  gitFull,
  gitShort,
  hasCloudflareToken,
  notifyRecipient,
  pkgVersion,
  pickFirstExisting,
  pragmaTableInfo,
  runD1Exec,
  sqlJson,
  sqlString,
  trackingRowId,
} from './lib/d1-deploy-record.mjs';

function sqlCreatedAtExpr(colName, cols) {
  const inf = cols.get(colName);
  const t = (inf?.type || '').toLowerCase();
  if (t.includes('int')) return 'unixepoch()';
  return sqlString(new Date().toISOString());
}

function metadataPayload(scope, root, workerName, version, gitHash) {
  return {
    script_name: String(process.env.DEPLOY_SCRIPT_NAME || 'deploy:full').trim(),
    trigger_source: String(process.env.TRIGGER_SOURCE || 'manual').trim(),
    worker_name: workerName,
    version,
    git_hash: gitHash,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    project_id: scope.projectId,
    notify_recipient_hint: notifyRecipient() || null,
  };
}

async function main() {
  const root = repoRoot();

  if (!hasCloudflareToken()) {
    console.warn('[d1-deploy-start] CLOUDFLARE_API_TOKEN unset — skipping D1 deploy ledger');
    process.exit(0);
  }

  let scope;
  try {
    scope = resolveDeployScope({ repoRoot: root, strict: true });
  } catch (e) {
    console.error('[d1-deploy-start]', e.message || e);
    process.exit(1);
  }

  const runGroupId = String(process.env.RUN_GROUP_ID ?? '').trim();
  if (!runGroupId) {
    console.error('[d1-deploy-start] RUN_GROUP_ID is required');
    process.exit(1);
  }

  const workerName = deriveWorkerName(root);
  const gitHash = gitFull(root);
  const shortSha = gitShort(root);
  const pkgV = pkgVersion(root);
  const version = shortSha !== 'unknown' ? shortSha : pkgV || 'unknown';
  const envLabel = deployEnvironmentLabel();
  const triggeredBy = String(process.env.TRIGGER_SOURCE ?? 'manual').trim();
  const deployedBy = deployedByActor();
  const meta = metadataPayload(scope, root, workerName, version, gitHash);

  const depCols = pragmaTableInfo(root, 'deployments');
  if (!depCols.size) {
    console.warn('[d1-deploy-start] deployments table missing — skipping');
    process.exit(0);
  }

  const insertParts = [];
  const insertVals = [];
  const excludedUpdates = [];

  const addField = (col, sqlExpr, updateOnConflict = true) => {
    if (!depCols.has(col)) return;
    insertParts.push(col);
    insertVals.push(sqlExpr);
    if (updateOnConflict) excludedUpdates.push(`${col}=excluded.${col}`);
  };

  addField('id', sqlString(runGroupId));
  addField('timestamp', `datetime('now')`);
  addField('version', sqlString(version));
  addField('git_hash', gitHash ? sqlString(gitHash) : 'NULL');
  addField('description', 'NULL', false);
  addField('status', sqlString('pending'));
  addField('deployed_by', sqlString(deployedBy));
  addField('environment', sqlString(envLabel));
  addField('duration_seconds', 'NULL');

  const tn = pickFirstExisting(depCols, ['tenant_id']);
  if (tn) addField(tn, sqlString(scope.tenantId));
  const wn = pickFirstExisting(depCols, ['workspace_id']);
  if (wn) addField(wn, sqlString(scope.workspaceId));
  const pn = pickFirstExisting(depCols, ['project_id', 'documents_project_id']);
  if (pn) addField(pn, sqlString(scope.projectId));

  const rgn = pickFirstExisting(depCols, ['run_group_id']);
  if (rgn) addField(rgn, sqlString(runGroupId));

  const mj = pickFirstExisting(depCols, ['metadata_json', 'metadata_jsonb', 'deploy_metadata_json']);
  if (mj) addField(mj, sqlJson(meta));

  if (depCols.has('worker_name')) {
    addField('worker_name', sqlString(workerName));
  }
  if (depCols.has('triggered_by')) {
    addField('triggered_by', sqlString(triggeredBy));
  }
  if (depCols.has('created_at')) {
    addField('created_at', 'unixepoch()', false);
  }
  if (depCols.has('notes')) {
    addField('notes', 'NULL', false);
  }

  const conflictTarget = depCols.has('id') ? 'id' : null;
  if (!conflictTarget || insertParts.length < 2) {
    console.warn('[d1-deploy-start] deployments schema incompatible — skipping');
    process.exit(0);
  }

  const insertSql = `INSERT INTO deployments (${insertParts.join(', ')}) VALUES (${insertVals.join(', ')})`;
  const upsertSql =
    excludedUpdates.length > 0
      ? `${insertSql} ON CONFLICT(${conflictTarget}) DO UPDATE SET ${excludedUpdates.join(', ')}`
      : `${insertSql} ON CONFLICT(${conflictTarget}) DO NOTHING`;

  try {
    await runD1Exec(root, upsertSql);
  } catch (e) {
    console.warn('[d1-deploy-start] deployments upsert failed:', e?.message || e);
    process.exit(0);
  }

  const trackCols = pragmaTableInfo(root, 'deployment_tracking');
  if (!trackCols.size) {
    console.log('[d1-deploy-start] deployment_tracking absent — deployments row only');
    process.exit(0);
  }

  const tid = trackingRowId(runGroupId);
  const depRefCol = pickFirstExisting(trackCols, [
    'deployment_id',
    'deploy_id',
    'deployment_record_id',
    'deploy_record_id',
  ]);

  const trParts = [];
  const trVals = [];

  const addTr = (col, val) => {
    if (!trackCols.has(col)) return;
    trParts.push(col);
    trVals.push(val);
  };

  addTr('id', sqlString(tid));
  if (depRefCol) addTr(depRefCol, sqlString(runGroupId));
  addTr('status', sqlString('running'));
  if (trackCols.has('worker_name')) addTr('worker_name', sqlString(workerName));
  if (trackCols.has('environment')) addTr('environment', sqlString(envLabel));
  if (trackCols.has('version')) addTr('version', sqlString(version));
  if (trackCols.has('triggered_by')) addTr('triggered_by', sqlString(triggeredBy));

  const tt = pickFirstExisting(trackCols, ['tenant_id']);
  if (tt) addTr(tt, sqlString(scope.tenantId));
  const tw = pickFirstExisting(trackCols, ['workspace_id']);
  if (tw) addTr(tw, sqlString(scope.workspaceId));

  const cr = pickFirstExisting(trackCols, ['created_at', 'started_at']);
  if (cr) addTr(cr, sqlCreatedAtExpr(cr, trackCols));

  const trUpd = [];
  if (trackCols.has('status')) trUpd.push(`status=excluded.status`);
  if (trackCols.has('worker_name')) trUpd.push(`worker_name=excluded.worker_name`);
  if (trackCols.has('environment')) trUpd.push(`environment=excluded.environment`);
  if (trackCols.has('version')) trUpd.push(`version=excluded.version`);

  if (trParts.length && trVals.length) {
  const trSql =
    trackCols.has('id') && trUpd.length > 0
      ? `INSERT INTO deployment_tracking (${trParts.join(', ')}) VALUES (${trVals.join(', ')}) ON CONFLICT(id) DO UPDATE SET ${trUpd.join(', ')}`
      : `INSERT INTO deployment_tracking (${trParts.join(', ')}) VALUES (${trVals.join(', ')})`;
    try {
      await runD1Exec(root, trSql);
    } catch (e) {
      console.warn('[d1-deploy-start] deployment_tracking insert failed:', e?.message || e);
    }
  }

  console.log('[d1-deploy-start] Recorded pending deployment', runGroupId, workerName);
}

main().catch((e) => {
  console.warn('[d1-deploy-start]', e?.message || e);
  process.exit(0);
});
