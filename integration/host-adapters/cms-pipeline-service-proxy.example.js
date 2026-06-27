/**
 * Service binding proxy → iam-cms-pipeline (Python Worker).
 */

export const CMS_PIPELINE_ORIGIN = 'https://cms-pipeline.inneranimalmedia.com';

/**
 * @param {any} env
 * @returns {boolean}
 */
export function hasCmsPipelineBinding(env) {
  return Boolean(env?.CMS_PIPELINE?.fetch);
}

/**
 * @param {any} env
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function fetchCmsPipeline(env, path, init = {}) {
  const binding = env?.CMS_PIPELINE;
  if (!binding?.fetch) {
    return new Response(JSON.stringify({ error: 'CMS_PIPELINE binding not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const p = String(path || '/').startsWith('/') ? path : `/${path}`;
  const url = `${CMS_PIPELINE_ORIGIN}${p}`;
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (env.IAM_SERVICE_KEY) {
    headers.set('X-IAM-Service-Key', String(env.IAM_SERVICE_KEY));
  }
  return binding.fetch(
    new Request(url, {
      ...init,
      headers,
    }),
  );
}

/**
 * @param {any} env
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @param {RequestInit} [init]
 */
export async function fetchCmsPipelineJson(env, path, body = {}, init = {}) {
  const res = await fetchCmsPipeline(env, path, {
    method: 'POST',
    ...init,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    return { error: data?.error || res.statusText || 'cms_pipeline_error', status: res.status, body: data };
  }
  return data;
}
