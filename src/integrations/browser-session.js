/**
 * Run-scoped Browser Rendering sessions (MYBROWSER acquire + connect).
 * Persists sessionId in KV so multiple tool calls in one agent/workflow run reuse Chromium state.
 */

const KV_PREFIX = 'agentsam_browser_sess:v1:';
/** Align with Browser Run keep_alive default (~60s); refresh on each tool call. */
const SESSION_TTL_SEC = 20 * 60;

/**
 * @param {Record<string, unknown>} params
 * @returns {string|null}
 */
export function resolveBrowserRunScopeId(params) {
  const candidates = [
    params.browser_session_key,
    params.agent_run_id,
    params.agentRunId,
    params.session?.agent_run_id,
    params.session?.agentRunId,
    params.workflow_run_id,
    params.workflowRunId,
    params.run_id,
    params.runId,
  ];
  for (const c of candidates) {
    const s = c != null ? String(c).trim() : '';
    if (s) return s;
  }
  return null;
}

/**
 * @param {any} env
 */
function sessionKv(env) {
  return env?.SESSION_CACHE || env?.KV || null;
}

/**
 * @param {any} env
 * @param {string} scopeId
 */
export async function getStoredBrowserSession(env, scopeId) {
  const kv = sessionKv(env);
  if (!kv || !scopeId) return null;
  try {
    const raw = await kv.get(`${KV_PREFIX}${scopeId}`, 'json');
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} scopeId
 * @param {Record<string, unknown>} meta
 */
export async function saveBrowserSession(env, scopeId, meta) {
  const kv = sessionKv(env);
  if (!kv || !scopeId) return;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...meta,
    scope_id: scopeId,
    updated_at: now,
  };
  await kv.put(`${KV_PREFIX}${scopeId}`, JSON.stringify(payload), {
    expirationTtl: SESSION_TTL_SEC,
  });
}

/**
 * End run-scoped session bookkeeping (CF session expires via keep_alive).
 * @param {any} env
 * @param {string} scopeId
 */
export async function closeBrowserRunSession(env, scopeId) {
  const id = String(scopeId || '').trim();
  if (!id) return { ok: false, error: 'scope_id required' };
  const kv = sessionKv(env);
  if (kv) {
    try {
      await kv.delete(`${KV_PREFIX}${id}`);
    } catch {
      /* non-fatal */
    }
  }
  return { ok: true, scope_id: id, closed: true };
}
