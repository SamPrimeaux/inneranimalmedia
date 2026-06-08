/**
 * CAD job scope + R2 key helpers (Design Studio / agentsam_cad_jobs).
 */
import { fetchAuthUserTenantId, fallbackSystemTenantId, resolveRequestContext } from './auth.js';

const DEFAULT_R2_BUCKET = 'inneranimalmedia';

/** @param {string} stored */
export function decodeCadScriptPayload(stored) {
  const raw = String(stored || '').trim();
  if (!raw) return '';
  if (raw.startsWith('b64:')) {
    try {
      return decodeURIComponent(escape(atob(raw.slice(4))));
    } catch {
      return '';
    }
  }
  return raw;
}

/**
 * @param {string} tenantId
 * @param {string} workspaceId
 * @param {string} jobId
 * @param {string} ext
 */
export function buildCadExportR2Key(tenantId, workspaceId, jobId, ext = 'glb') {
  const t = String(tenantId || 'system').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const w = String(workspaceId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const j = String(jobId || 'job').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const e = String(ext || 'glb').replace(/^\./, '').slice(0, 8);
  return `cad/exports/${t}/${w}/${j}.${e}`;
}

/** @param {string} r2Key */
export function buildCadAssetPublicUrl(r2Key) {
  const key = String(r2Key || '').trim().replace(/^\/+/, '');
  if (!key) return '';
  return `/assets/${key}`;
}

/**
 * @param {any} env
 * @param {Request} request
 * @param {{ id?: string, tenant_id?: string }} authUser
 * @param {Record<string, unknown>} [body]
 */
export async function resolveCadJobScope(env, request, authUser, body = {}) {
  // Never trust body.workspace_id — derive from membership only
  const reqCtx = await resolveRequestContext(request, env);
  const workspaceId = reqCtx.error ? '' : (reqCtx.workspaceId || '');
  let tenantId =
    reqCtx.error || !reqCtx.tenantId
      ? authUser?.tenant_id != null
        ? String(authUser.tenant_id).trim()
        : ''
      : String(reqCtx.tenantId).trim();
  if (!tenantId && authUser?.id) tenantId = (await fetchAuthUserTenantId(env, authUser.id)) || '';
  if (!tenantId) tenantId = fallbackSystemTenantId(env) || '';
  return {
    workspaceId,
    tenantId,
    projectId:
      body.project_id != null && String(body.project_id).trim() !== ''
        ? String(body.project_id).trim()
        : null,
    sceneSnapshotId:
      body.scene_snapshot_id != null && String(body.scene_snapshot_id).trim() !== ''
        ? String(body.scene_snapshot_id).trim()
        : body.scene_id != null && String(body.scene_id).trim() !== ''
          ? String(body.scene_id).trim()
          : null,
    sessionId:
      body.session_id != null && String(body.session_id).trim() !== ''
        ? String(body.session_id).trim()
        : null,
  };
}

export function cadJobR2Bucket() {
  return DEFAULT_R2_BUCKET;
}
