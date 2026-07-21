/**
 * Structured deploy facts for agentsam_memory — no LLM, no vector embed required.
 * One row per deploy + a last_successful_deploy pointer for hot-path loadD1Memory().
 *
 * Identity: caller must supply tenant/workspace/user via deploy env or POST body.
 * When user_id is present, tenant/workspace may be resolved from D1 auth rows — never hardcoded.
 */

const SOURCE = 'post_deploy_hook';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function isD1WorkspaceId(v) {
  return /^ws_[a-z0-9_]+$/i.test(trim(v));
}

function isD1AuthUserId(v) {
  return /^au_[a-f0-9]+$/i.test(trim(v));
}

function readEnvScope(env) {
  return {
    tenantId: trim(env?.TENANT_ID ?? env?.DEPLOY_TENANT_ID ?? env?.DEFAULT_TENANT_ID),
    workspaceId: trim(env?.WORKSPACE_ID ?? env?.DEPLOY_WORKSPACE_ID),
    userId: trim(env?.D1_AUTH_USER_ID ?? env?.IAM_D1_AUTH_USER_ID ?? env?.OPERATOR_USER_ID),
  };
}

function readBodyScope(body) {
  const workspaceId = trim(
    body?.d1_workspace_id ?? body?.workspace_d1_id ?? body?.workspace_id,
  );
  return {
    tenantId: trim(body?.tenant_id ?? body?.tenantId),
    workspaceId: isD1WorkspaceId(workspaceId) ? workspaceId : '',
    userId: trim(body?.user_id ?? body?.d1_auth_user_id),
  };
}

function readFieldsScope(fields) {
  const workspaceId = trim(fields?.workspaceId);
  return {
    tenantId: trim(fields?.tenantId),
    workspaceId: isD1WorkspaceId(workspaceId) ? workspaceId : '',
    userId: trim(fields?.userId),
  };
}

/**
 * Resolve memory scope from explicit deploy inputs, then D1 auth rows. No platform-id fallbacks.
 * @param {import('@cloudflare/workers-types').D1Database|null|undefined} db
 * @param {Record<string, unknown>|null|undefined} env
 * @param {Record<string, unknown>} fields
 * @param {Record<string, unknown>} body
 */
export async function resolveDeployMemoryScope(db, env, fields = {}, body = {}) {
  const fromFields = readFieldsScope(fields);
  const fromBody = readBodyScope(body);
  const fromEnv = readEnvScope(env);

  let tenantId = fromFields.tenantId || fromBody.tenantId || fromEnv.tenantId;
  let workspaceId = fromFields.workspaceId || fromBody.workspaceId || fromEnv.workspaceId;
  let userId = fromFields.userId || fromBody.userId || fromEnv.userId;

  if (!isD1AuthUserId(userId)) userId = '';
  if (!isD1WorkspaceId(workspaceId)) workspaceId = '';

  if (db && userId && (!tenantId || !workspaceId)) {
    const row = await db
      .prepare(
        `SELECT COALESCE(NULLIF(trim(active_tenant_id), ''), NULLIF(trim(tenant_id), '')) AS tenant_id,
                COALESCE(NULLIF(trim(active_workspace_id), ''), '') AS workspace_id
         FROM auth_users WHERE id = ? LIMIT 1`,
      )
      .bind(userId)
      .first()
      .catch(() => null);

    if (!tenantId && row?.tenant_id) tenantId = trim(row.tenant_id);
    const activeWs = trim(row?.workspace_id);
    if (!workspaceId && isD1WorkspaceId(activeWs)) workspaceId = activeWs;
  }

  if (db && userId && !workspaceId) {
    const mem = await db
      .prepare(
        `SELECT workspace_id FROM memberships WHERE account_id = ? ORDER BY joined_at ASC LIMIT 1`,
      )
      .bind(userId)
      .first()
      .catch(() => null);
    const ws = trim(mem?.workspace_id);
    if (isD1WorkspaceId(ws)) workspaceId = ws;
  }

  return { tenantId, workspaceId, userId };
}

/**
 * @param {Record<string, unknown>} fields
 */
export function buildDeployFactPayload(fields) {
  // Always derive from full_sha first so the key is identical across both
  // deploy-hook calls (pre-R2-sync and post-R2-sync) for the same deploy.
  // Previously this trusted fields.shortSha when present, which only one of
  // the two calls supplied — producing two different keys (and two rows)
  // for a single deploy instead of one upserted row.
  const shortSha = trim(fields.gitHash ?? fields.shortSha ?? fields.version).slice(0, 12);
  const environment = trim(fields.environment) || 'production';
  const deployedAt = trim(fields.deployedAt) || new Date().toISOString();

  return {
    environment,
    deploy_sha: shortSha || null,
    full_sha: trim(fields.gitHash) || null,
    branch: trim(fields.branchName) || 'main',
    latest_commit_message:
      trim(fields.description ?? fields.gitMessage) || null,
    deployed_at: deployedAt,
    worker_version_id: trim(fields.workerVersionId) || null,
    deploy_duration_ms:
      typeof fields.deployDurationMs === 'number' && Number.isFinite(fields.deployDurationMs)
        ? Math.max(0, Math.floor(fields.deployDurationMs))
        : null,
    r2_sync_status: trim(fields.r2SyncStatus) || null,
    r2_sync_ms:
      typeof fields.r2SyncMs === 'number' && Number.isFinite(fields.r2SyncMs)
        ? Math.max(0, Math.floor(fields.r2SyncMs))
        : null,
    r2_reconcile_status: trim(fields.r2ReconcileStatus) || null,
    file_count:
      typeof fields.fileCount === 'number' && Number.isFinite(fields.fileCount)
        ? Math.floor(fields.fileCount)
        : null,
    total_kb:
      typeof fields.totalKb === 'number' && Number.isFinite(fields.totalKb)
        ? Math.floor(fields.totalKb)
        : null,
    notify_status: trim(fields.notifyStatus) || null,
    deployed_by: trim(fields.deployedBy) || 'deploy:full',
    source: SOURCE,
    verified: true,
  };
}

/**
 * @param {{ tenantId: string, workspaceId: string, userId: string }} scope
 * @param {Record<string, unknown>} fields
 */
export function buildDeployMemoryRows(scope, fields) {
  const fact = buildDeployFactPayload(fields);
  const shortSha = fact.deploy_sha || 'unknown';
  const envLabel = fact.environment || 'production';
  const valueJson = JSON.stringify(fact);
  const msg = fact.latest_commit_message || 'production deploy';
  const summary = `Deploy ${shortSha}: ${msg.slice(0, 120)}`;
  const title = `IAM ${envLabel} deploy ${shortSha}`;
  const tags = JSON.stringify(['deploy', 'ground_truth', 'verified', envLabel]);
  const syncKeyBase = `${scope.tenantId}:${scope.userId}:`;

  return {
    pointer: {
      id: `mem_last_deploy_${scope.workspaceId}`,
      tenantId: scope.tenantId,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      memoryType: 'fact',
      key: 'last_successful_deploy',
      value: valueJson,
      title,
      summary,
      source: SOURCE,
      tags,
      syncKey: `${syncKeyBase}last_successful_deploy`,
      importance: 9,
      isPinned: 1,
    },
    perDeploy: {
      id: `mem_deploy_${shortSha}`,
      tenantId: scope.tenantId,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      memoryType: 'fact',
      key: `deploy/${envLabel}/${shortSha}`,
      value: valueJson,
      title,
      summary,
      source: SOURCE,
      tags,
      syncKey: `${syncKeyBase}deploy/${envLabel}/${shortSha}`,
      importance: 8,
      isPinned: 0,
    },
  };
}

async function upsertDeployMemoryRow(db, row) {
  await db
    .prepare(
      `INSERT INTO agentsam_memory (
         id, tenant_id, user_id, workspace_id, memory_type, key, value,
         title, summary, source, tags, sync_key, importance, is_pinned,
         confidence, decay_score, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0, 1.0, unixepoch())
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
         updated_at = unixepoch()`,
    )
    .bind(
      row.id,
      row.tenantId,
      row.userId,
      row.workspaceId,
      row.memoryType,
      row.key,
      row.value,
      row.title,
      row.summary,
      row.source,
      row.tags,
      row.syncKey,
      row.importance,
      row.isPinned ? 1 : 0,
    )
    .run();
}

/**
 * Write last_successful_deploy + deploy/{env}/{sha} rows to D1.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, unknown>|null|undefined} env
 * @param {Record<string, unknown>} fields
 * @param {Record<string, unknown>} [body]
 */
export async function upsertDeployMemoryFacts(db, env, fields, body = {}) {
  if (!db) return { ok: false, error: 'no_d1' };

  const scope = await resolveDeployMemoryScope(db, env, fields, body);

  if (!scope.tenantId || !scope.workspaceId || !scope.userId) {
    console.warn(
      '[deploy-memory-fact] missing_scope — set TENANT_ID, WORKSPACE_ID, D1_AUTH_USER_ID in deploy env or POST body',
    );
    return { ok: false, error: 'missing_scope' };
  }

  const rows = buildDeployMemoryRows(scope, fields);

  try {
    await upsertDeployMemoryRow(db, rows.pointer);
    await upsertDeployMemoryRow(db, rows.perDeploy);
    return {
      ok: true,
      keys: [rows.pointer.key, rows.perDeploy.key],
      deploy_sha: rows.perDeploy.key.split('/').pop(),
    };
  } catch (e) {
    console.warn('[deploy-memory-fact] upsert failed', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}
