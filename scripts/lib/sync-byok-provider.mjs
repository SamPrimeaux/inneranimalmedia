/**
 * Upsert one provider row in Settings → Keys (user_api_keys + user_secrets vault).
 */
import { spawnSync } from 'node:child_process';
export async function upsertProviderByok(opts) {
  const {
    baseUrl,
    cookie,
    workspaceId,
    provider,
    apiKey,
    label,
    validate = false,
    extraPayload = {},
  } = opts;
  const BASE = baseUrl.replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'X-IAM-Workspace-Id': workspaceId,
  };

  const listRes = await fetch(`${BASE}/api/settings/keys?category=provider`, { headers });
  const listJson = await listRes.json().catch(() => ({}));
  if (!listRes.ok) {
    throw new Error(listJson.message || listJson.error || `list keys ${listRes.status}`);
  }
  const items = Array.isArray(listJson.items) ? listJson.items : [];
  const match = items.find(
    (i) =>
      String(i.provider || '').toLowerCase() === String(provider).toLowerCase() &&
      String(i.status || '').toLowerCase() === 'active',
  );

  const payload = {
    category: 'provider',
    provider,
    label,
    api_key: apiKey,
    scope: 'workspace',
    validate,
    ...extraPayload,
  };

  const path = match?.id
    ? `${BASE}/api/settings/keys/${encodeURIComponent(match.id)}/rotate`
    : `${BASE}/api/settings/keys`;
  const r = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `BYOK ${provider} ${r.status}`);
  return { id: match?.id || j.id, rotated: Boolean(match?.id) };
}

/**
 * Push value to Worker via wrangler secret put (stdin).
 */
export function wranglerSecretPut(name, value, wranglerConfig = 'wrangler.production.toml') {
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', name, '-c', wranglerConfig], {
    input: value,
    encoding: 'utf8',
    cwd: process.cwd(),
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `wrangler secret put ${name} failed`);
  }
}
