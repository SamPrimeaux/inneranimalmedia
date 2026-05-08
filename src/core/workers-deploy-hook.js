/**
 * Cloudflare Workers Builds — Deploy Hooks (POST URL acts as credential).
 * @see https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/
 */

/**
 * @param {object} env Worker env; expects secret `AGENT_SAM_DEPLOY_HOOK_URL` (full POST URL).
 * @returns {Promise<{ ok: boolean, status: number, json?: object, raw?: string, error?: string }>}
 */
export async function postAgentSamDeployHook(env) {
  const raw =
    typeof env?.AGENT_SAM_DEPLOY_HOOK_URL === 'string' ? env.AGENT_SAM_DEPLOY_HOOK_URL.trim() : '';
  if (!raw) {
    return { ok: false, status: 0, error: 'AGENT_SAM_DEPLOY_HOOK_URL not configured' };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, status: 0, error: 'invalid AGENT_SAM_DEPLOY_HOOK_URL' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, status: 0, error: 'deploy hook URL must use https' };
  }
  if (!url.pathname.includes('/workers/builds/deploy_hooks/')) {
    return {
      ok: false,
      status: 0,
      error: 'deploy hook URL must contain /workers/builds/deploy_hooks/',
    };
  }

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    let cfOk = res.ok;
    if (json && typeof json === 'object' && 'success' in json) {
      cfOk = Boolean(json.success) && (!Array.isArray(json.errors) || json.errors.length === 0);
    }
    return {
      ok: cfOk,
      status: res.status,
      json,
      raw: text.slice(0, 800),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e?.message || String(e),
    };
  }
}
