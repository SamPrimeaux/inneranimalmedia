/**
 * Agent Sam artifact store — dedicated `artifacts` R2 bucket via env.ARTIFACTS.
 * Legacy rows may still reference inneranimalmedia-autorag / inneranimalmedia (migration 593 backfill).
 *
 * New key schema (artifacts bucket):
 *   artifacts/{scope}/{workspace_id}/{kind}/{artifact_id}.{ext}
 */

import {
  getAgentsamWorkspace,
  resolveWorkspaceByokR2Bucket,
  resolveWorkspaceCloudflareAccountId,
} from './agentsam-workspace.js';
import { pragmaTableInfo } from './retention.js';
import { authUserIsSuperadmin } from './auth.js';
import {
  loadUserCloudflareR2Credentials,
  mergeR2S3EnvFromUserStorage,
} from './user-storage-r2-credentials.js';
import { r2PutViaBindingOrS3 } from './r2.js';
import {
  ARTIFACT_EXT,
  buildArtifactR2Key,
  buildWorkspaceAutoragArtifactKey,
  defaultArtifactBucket,
  inferLegacyArtifactBucket,
  normalizeArtifactFormat,
  resolveArtifactR2Binding,
} from './artifact-key.js';

export { ARTIFACT_EXT };

export const ARTIFACT_WRITE_USER_ERROR =
  'Artifact could not be saved — reply to retry.';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** @param {string} text */
function contentToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {Record<string, unknown>|null|undefined} authUser
 */
async function resolveArtifactAuthUser(env, userId, authUser) {
  if (authUser && typeof authUser === 'object' && authUser.id) return authUser;
  if (!env?.DB || !userId) return null;
  return env.DB.prepare(
    `SELECT id, role, COALESCE(is_superadmin, 0) AS is_superadmin
     FROM auth_users WHERE id = ? LIMIT 1`,
  )
    .bind(userId)
    .first()
    .catch(() => null);
}

const CONTENT_TYPE = {
  html: 'text/html;charset=UTF-8',
  css: 'text/css;charset=UTF-8',
  js: 'text/javascript;charset=UTF-8',
  tsx: 'text/plain;charset=UTF-8',
  ts: 'text/plain;charset=UTF-8',
  sql: 'text/plain;charset=UTF-8',
  markdown: 'text/markdown;charset=UTF-8',
  md: 'text/markdown;charset=UTF-8',
  json: 'application/json',
  txt: 'text/plain;charset=UTF-8',
  excalidraw: 'application/json',
  report: 'text/markdown;charset=UTF-8',
  other: 'text/plain;charset=UTF-8',
};

export function newArtifactId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return `art_${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * @param {{ userId: string, workspaceId: string, artifactType: string, artifactId: string }} p
 */
export function buildWorkspaceArtifactR2Key(p) {
  return buildWorkspaceAutoragArtifactKey({
    userId: p.userId,
    workspaceId: p.workspaceId,
    format: p.artifactType,
    artifactId: p.artifactId,
  });
}

/**
 * @param {string} artifactId
 * @param {string} [origin]
 */
export function artifactPublicUrl(artifactId, origin) {
  const path = `/api/artifacts/${encodeURIComponent(String(artifactId))}/content`;
  const o = origin != null ? String(origin).trim().replace(/\/$/, '') : '';
  return o ? `${o}${path}` : path;
}

export function artifactContentType(artifactType) {
  const t = String(artifactType || 'other').toLowerCase();
  return CONTENT_TYPE[t] || CONTENT_TYPE.other;
}

/**
 * @param {string} text
 */
export function extractFencedArtifactContent(text) {
  const m = String(text || '').match(/```[\w+#.-]*\n([\s\S]*?)```/);
  return m?.[1] ? m[1].trim() : null;
}

/**
 * @param {any} env
 * @param {string} r2Key
 * @param {string} [r2Bucket] agentsam_artifacts.r2_bucket when known
 */
export async function readWorkspaceArtifact(env, r2Key, r2Bucket) {
  const key = String(r2Key || '').trim();
  if (!key) return null;
  const bucketName = r2Bucket ? String(r2Bucket).trim() : inferLegacyArtifactBucket(key);
  const binding = resolveArtifactR2Binding(env, bucketName);
  if (!binding?.get) return null;
  try {
    return await binding.get(key);
  } catch (e) {
    console.warn('[artifact-r2-store] read failed', bucketName, key, e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   workspaceId: string,
 *   tenantId: string,
 *   artifactId: string,
 *   errorMessage: string,
 *   sessionId?: string|null,
 * }} o
 */
async function logArtifactR2WriteFailure(env, ctx, o) {
  const payload = {
    workspaceId: o.workspaceId,
    tenantId: o.tenantId,
    sessionId: o.sessionId ?? null,
    errorType: 'artifact_r2_write_failure',
    errorMessage: o.errorMessage,
    source: 'artifact_write_path',
    sourceId: o.artifactId,
  };
  if (ctx?.waitUntil) {
    const { scheduleAgentsamErrorLog } = await import('./agentsam-error-log.js');
    scheduleAgentsamErrorLog(env, ctx, payload);
    return;
  }
  try {
    const cols = await pragmaTableInfo(env.DB, 'agentsam_error_log');
    if (!cols.size) return;
    const parts = ['id', 'workspace_id', 'tenant_id', 'error_type', 'error_message', 'source', 'source_id'];
    const binds = [
      `aerr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      payload.workspaceId,
      payload.tenantId,
      payload.errorType,
      String(payload.errorMessage).slice(0, 8000),
      payload.source,
      payload.sourceId,
    ];
    if (cols.has('session_id')) {
      parts.push('session_id');
      binds.push(payload.sessionId);
    }
    if (cols.has('resolved')) {
      parts.push('resolved');
      binds.push(0);
    }
    if (cols.has('created_at')) {
      parts.push('created_at');
      binds.push(Math.floor(Date.now() / 1000));
    }
    await env.DB.prepare(
      `INSERT INTO agentsam_error_log (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
    )
      .bind(...binds)
      .run();
  } catch (e) {
    console.warn('[artifact-r2-store] error_log insert', e?.message ?? e);
  }
}

/**
 * Platform ARTIFACTS bucket (superadmin) or tenant BYOK S3; D1 insert after confirmed put.
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   userId: string,
 *   workspaceId: string,
 *   tenantId: string,
 *   content: string,
 *   artifactType: string,
 *   name?: string,
 *   description?: string,
 *   artifactId?: string,
 *   source?: string,
 *   sourceRunId?: string|null,
 *   sourceSessionId?: string|null,
 *   sourceWorkflowId?: string|null,
 *   tags?: string[]|string,
 *   metadata?: Record<string, unknown>,
 *   isPublic?: boolean,
 *   origin?: string|null,
 *   authUser?: Record<string, unknown>|null,
 *   kind?: string,
 *   scope?: string,
 *   tenantR2Bucket?: string,
 * }} opts
 */
export async function writeWorkspaceArtifact(env, ctx, opts) {
  const userId = String(opts.userId || '').trim();
  const workspaceId = String(opts.workspaceId || '').trim();
  const tenantId = String(opts.tenantId || '').trim();
  if (!userId || !workspaceId || !tenantId) {
    return { ok: false, error: 'identity_required', user_message: ARTIFACT_WRITE_USER_ERROR };
  }
  if (!env?.DB) {
    return { ok: false, error: 'no_db', user_message: ARTIFACT_WRITE_USER_ERROR };
  }

  const content = opts.content != null ? String(opts.content) : '';
  if (!content) {
    return { ok: false, error: 'empty_content', user_message: ARTIFACT_WRITE_USER_ERROR };
  }

  const authUser = await resolveArtifactAuthUser(env, userId, opts.authUser);
  const isSuper = authUserIsSuperadmin(authUser);
  const wsRow = await getAgentsamWorkspace(env, workspaceId);
  const wsCfAccountId = resolveWorkspaceCloudflareAccountId(wsRow);
  const wsByokBucket = resolveWorkspaceByokR2Bucket(wsRow);
  const byokCreds = !isSuper ? await loadUserCloudflareR2Credentials(env, userId) : null;

  if (!isSuper && !byokCreds) {
    return {
      ok: true,
      skipped_r2: true,
      reason: 'tenant_r2_byok_required',
      content_base64: contentToBase64(content),
      artifact_type: normalizeArtifactFormat(String(opts.artifactType || 'other')),
      user_message:
        'Connect Cloudflare R2 in Settings → Storage to persist artifacts. Content returned inline as base64.',
    };
  }

  const artifactId = String(opts.artifactId || newArtifactId()).trim();
  const artifactType = String(opts.artifactType || 'other').toLowerCase().slice(0, 64);
  const source = String(opts.source || 'agent_response').slice(0, 120);
  let artifactKind = opts.kind != null ? String(opts.kind) : 'generated';
  let artifactScope = opts.scope != null ? String(opts.scope) : 'user';
  if (source === 'agentsam_plan') {
    artifactKind = 'plan';
    artifactScope = 'workspace';
  }
  const r2Key =
    opts.r2Key != null
      ? String(opts.r2Key).trim()
      : buildArtifactR2Key({
          scope: artifactScope,
          workspaceId,
          kind: artifactKind,
          artifactId,
          format: artifactType,
        });
  if (!r2Key) {
    return { ok: false, error: 'invalid_r2_key', user_message: ARTIFACT_WRITE_USER_ERROR };
  }

  let r2BucketName =
    opts.r2Bucket != null ? String(opts.r2Bucket).trim() : defaultArtifactBucket();
  const contentType = artifactContentType(artifactType);
  let putOk = false;

  if (isSuper) {
    const bucket = resolveArtifactR2Binding(env, r2BucketName);
    if (!bucket?.put) {
      await logArtifactR2WriteFailure(env, ctx, {
        workspaceId,
        tenantId,
        artifactId,
        sessionId: opts.sourceSessionId ?? null,
        errorMessage: 'ARTIFACTS binding missing',
      });
      return { ok: false, error: 'no_artifacts_bucket', user_message: ARTIFACT_WRITE_USER_ERROR };
    }
    try {
      await bucket.put(r2Key, content, { httpMetadata: { contentType } });
      putOk = true;
    } catch (e) {
      const errMsg = String(e?.message || e).slice(0, 8000);
      console.error('[artifact-r2-store] platform put failed', r2Key, errMsg);
      await logArtifactR2WriteFailure(env, ctx, {
        workspaceId,
        tenantId,
        artifactId,
        sessionId: opts.sourceSessionId ?? null,
        errorMessage: errMsg,
      });
      return { ok: false, error: 'r2_put_failed', user_message: ARTIFACT_WRITE_USER_ERROR };
    }
  } else {
    let userEnv = await mergeR2S3EnvFromUserStorage(env, authUser || { id: userId });
    // key row cf_account_id → workspace column → platform env (do not trust merge fallback alone)
    const keyCfAccountId = trim(byokCreds?.cfAccountId);
    const resolvedAccountId =
      keyCfAccountId || wsCfAccountId || trim(env.CLOUDFLARE_ACCOUNT_ID) || null;
    if (resolvedAccountId) {
      userEnv = { ...userEnv, CLOUDFLARE_ACCOUNT_ID: resolvedAccountId };
    }
    r2BucketName = String(
      opts.tenantR2Bucket || opts.r2Bucket || wsByokBucket || defaultArtifactBucket(),
    ).trim();
    putOk = await r2PutViaBindingOrS3(userEnv, null, r2BucketName, r2Key, content, contentType);
    if (!putOk) {
      await logArtifactR2WriteFailure(env, ctx, {
        workspaceId,
        tenantId,
        artifactId,
        sessionId: opts.sourceSessionId ?? null,
        errorMessage: 'tenant BYOK R2 put failed',
      });
      return { ok: false, error: 'tenant_r2_put_failed', user_message: ARTIFACT_WRITE_USER_ERROR };
    }
  }

  const origin =
    opts.origin != null
      ? String(opts.origin).trim()
      : env?.IAM_ORIGIN != null
        ? String(env.IAM_ORIGIN).trim()
        : '';
  const publicUrl = artifactPublicUrl(artifactId, origin || null);
  const bytes = new TextEncoder().encode(content).byteLength;

  const cols = await pragmaTableInfo(env.DB, 'agentsam_artifacts');
  if (!cols.size) {
    return { ok: false, error: 'artifacts_table_missing', user_message: ARTIFACT_WRITE_USER_ERROR };
  }

  const row = {
    id: artifactId,
    user_id: userId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    name: String(opts.name || artifactType).slice(0, 500),
    description: opts.description != null ? String(opts.description).slice(0, 2000) : null,
    artifact_type: normalizeArtifactFormat(artifactType),
    artifact_status: 'draft',
    r2_key: r2Key,
    public_url: publicUrl,
    source,
    file_size_bytes: bytes,
    is_public: opts.isPublic ? 1 : 0,
  };
  if (cols.has('r2_bucket')) {
    row.r2_bucket = r2BucketName.slice(0, 120);
  }
  if (cols.has('scope')) {
    row.scope = artifactScope.slice(0, 32);
  }
  if (opts.expiresAt != null && cols.has('expires_at')) {
    row.expires_at = Number(opts.expiresAt) || null;
  }
  if (opts.sourceRunId && cols.has('source_run_id')) {
    row.source_run_id = String(opts.sourceRunId).slice(0, 120);
  }
  if (opts.sourceSessionId && cols.has('source_session_id')) {
    row.source_session_id = String(opts.sourceSessionId).slice(0, 200);
  }
  if (opts.sourceWorkflowId && cols.has('source_workflow_id')) {
    row.source_workflow_id = String(opts.sourceWorkflowId).slice(0, 200);
  }
  if (opts.tags != null && cols.has('tags')) {
    row.tags = Array.isArray(opts.tags) ? JSON.stringify(opts.tags) : String(opts.tags);
  }
  if (opts.metadata && cols.has('metadata_json')) {
    row.metadata_json = JSON.stringify(opts.metadata);
  }

  const names = [];
  const ph = [];
  const binds = [];
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (!cols.has(k.toLowerCase())) continue;
    names.push(k);
    ph.push('?');
    binds.push(v);
  }
  if (!names.length) {
    return { ok: false, error: 'no_insertable_columns', user_message: ARTIFACT_WRITE_USER_ERROR };
  }

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_artifacts (${names.join(', ')}) VALUES (${ph.join(', ')})`,
    )
      .bind(...binds)
      .run();
  } catch (e) {
    console.error('[artifact-r2-store] d1 insert failed', artifactId, e?.message ?? e);
    return { ok: false, error: 'd1_insert_failed', user_message: ARTIFACT_WRITE_USER_ERROR };
  }

  return {
    ok: true,
    artifact_id: artifactId,
    r2_key: r2Key,
    public_url: publicUrl,
    open_url: publicUrl,
    file_size_bytes: bytes,
  };
}
