/**
 * Workspace artifact store — inneranimalmedia-autorag via env.AUTORAG_BUCKET only.
 * Never write generated artifacts to env.R2, DASHBOARD, or ASSETS.
 *
 * Key schema:
 *   workspaces/{user_id}/{workspace_id}/artifacts/{artifact_type}/{artifact_id}.{ext}
 */

import { pragmaTableInfo } from './retention.js';

export const ARTIFACT_WRITE_USER_ERROR =
  'Artifact could not be saved — reply to retry.';

export const ARTIFACT_EXT = {
  html: 'html',
  css: 'css',
  js: 'js',
  tsx: 'tsx',
  ts: 'ts',
  sql: 'sql',
  markdown: 'md',
  md: 'md',
  json: 'json',
  txt: 'txt',
  excalidraw: 'excalidraw',
  report: 'md',
  other: 'txt',
};

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

function safePathSegment(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (s.includes('/') || s.includes('\\') || s.includes('..')) return null;
  return s;
}

export function newArtifactId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return `art_${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * @param {{ userId: string, workspaceId: string, artifactType: string, artifactId: string }} p
 */
export function buildWorkspaceArtifactR2Key(p) {
  const uid = safePathSegment(p.userId);
  const wid = safePathSegment(p.workspaceId);
  const id = safePathSegment(p.artifactId);
  if (!uid || !wid || !id) return null;
  const type = String(p.artifactType || 'other').toLowerCase().slice(0, 64);
  const ext = ARTIFACT_EXT[type] || ARTIFACT_EXT.other;
  return `workspaces/${uid}/${wid}/artifacts/${type}/${id}.${ext}`;
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
 */
export async function readWorkspaceArtifact(env, r2Key) {
  const key = String(r2Key || '').trim();
  if (!key || !env?.AUTORAG_BUCKET?.get) return null;
  try {
    return await env.AUTORAG_BUCKET.get(key);
  } catch (e) {
    console.warn('[artifact-r2-store] read failed', key, e?.message ?? e);
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
 * PUT to AUTORAG_BUCKET first; INSERT agentsam_artifacts only after confirmed put.
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

  const artifactId = String(opts.artifactId || newArtifactId()).trim();
  const artifactType = String(opts.artifactType || 'other').toLowerCase().slice(0, 64);
  const r2Key = buildWorkspaceArtifactR2Key({
    userId,
    workspaceId,
    artifactType,
    artifactId,
  });
  if (!r2Key) {
    return { ok: false, error: 'invalid_r2_key', user_message: ARTIFACT_WRITE_USER_ERROR };
  }

  const bucket = env.AUTORAG_BUCKET;
  if (!bucket?.put) {
    await logArtifactR2WriteFailure(env, ctx, {
      workspaceId,
      tenantId,
      artifactId,
      sessionId: opts.sourceSessionId ?? null,
      errorMessage: 'AUTORAG_BUCKET binding missing',
    });
    return { ok: false, error: 'no_autorag_bucket', user_message: ARTIFACT_WRITE_USER_ERROR };
  }

  const contentType = artifactContentType(artifactType);
  try {
    await bucket.put(r2Key, content, { httpMetadata: { contentType } });
  } catch (e) {
    const errMsg = String(e?.message || e).slice(0, 8000);
    console.error('[artifact-r2-store] put failed', r2Key, errMsg);
    await logArtifactR2WriteFailure(env, ctx, {
      workspaceId,
      tenantId,
      artifactId,
      sessionId: opts.sourceSessionId ?? null,
      errorMessage: errMsg,
    });
    return { ok: false, error: 'r2_put_failed', user_message: ARTIFACT_WRITE_USER_ERROR };
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
    artifact_type: artifactType,
    artifact_status: 'draft',
    r2_key: r2Key,
    public_url: publicUrl,
    source: String(opts.source || 'agent_response').slice(0, 120),
    file_size_bytes: bytes,
    is_public: opts.isPublic ? 1 : 0,
  };
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
