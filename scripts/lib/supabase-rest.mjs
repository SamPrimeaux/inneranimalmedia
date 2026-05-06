/**
 * Minimal Supabase PostgREST helpers (service role).
 */

/** @param {string} url @param {string} key @param {string} path @param {string} [query] */
export async function sbRest(url, key, path, query = '') {
  const u = `${url}/rest/v1/${path}${query ? `?${query}` : ''}`;
  return u;
}

/**
 * @param {string} method
 * @param {string} fullUrl
 * @param {string} key
 * @param {unknown} [body]
 * @param {Record<string, string>} [extraHeaders]
 */
export async function sbRequest(method, fullUrl, key, body, extraHeaders = {}) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  const r = await fetch(fullUrl, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!r.ok) {
    const err = new Error(`Supabase ${method} ${fullUrl} → ${r.status}: ${text.slice(0, 500)}`);
    err.status = r.status;
    err.body = json;
    throw err;
  }
  return json;
}
