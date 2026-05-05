/**
 * Minimal Supabase PostgREST helpers for health routes (service role, no PII in logs).
 */

/** @param {any} env */
export function supabaseRestBase(env) {
  const raw = env?.SUPABASE_URL;
  if (!raw || !String(raw).trim()) return '';
  return String(raw).replace(/\/$/, '');
}

/** @param {any} env */
export function supabaseServiceKey(env) {
  const k = env?.SUPABASE_SERVICE_ROLE_KEY;
  return k && String(k).trim() ? String(k).trim() : '';
}

/**
 * @param {any} env
 * @param {'public' | 'agentsam'} schema
 */
export function supabaseHeaders(env, schema = 'public') {
  const key = supabaseServiceKey(env);
  const h = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };
  if (schema === 'agentsam') {
    h['Accept-Profile'] = 'agentsam';
    h['Content-Profile'] = 'agentsam';
  }
  return h;
}

/**
 * @param {any} env
 * @param {string} pathWithQuery e.g. "/rest/v1/foo?limit=1"
 * @param {'public' | 'agentsam'} schema
 */
export async function supabaseGetJson(env, pathWithQuery, schema = 'public') {
  const base = supabaseRestBase(env);
  const key = supabaseServiceKey(env);
  if (!base || !key) return { ok: false, status: 0, data: null };
  const url = `${base}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`;
  try {
    const res = await fetch(url, { headers: supabaseHeaders(env, schema) });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/**
 * @param {any} env
 * @param {string} pathWithQuery
 * @param {unknown} body
 * @param {'public' | 'agentsam'} schema
 */
export async function supabasePostJson(env, pathWithQuery, body, schema = 'agentsam') {
  const base = supabaseRestBase(env);
  const key = supabaseServiceKey(env);
  if (!base || !key) return { ok: false, status: 0, data: null };
  const url = `${base}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(env, schema),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
