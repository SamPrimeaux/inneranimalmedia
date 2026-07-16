#!/usr/bin/env node
/**
 * Sync provider keys from gitignored .env.cloudflare into dashboard BYOK (user_api_keys).
 * Scoped to canonical OPERATOR_USER_ID — Cloudflare keys are account-wide (scope=user).
 * Other providers may still attach to ws_inneranimalmedia for org defaults.
 *
 * Usage (repo root):
 *   npm run sync:operator-keys
 *   npm run sync:operator-keys:dry-run
 *
 * SSOT: .env.cloudflare (see scripts/lib/operator-env-manifest.mjs)
 * Operator au_*: OPERATOR_USER_ID in .env.cloudflare (not person_uuid / not placeholder)
 */
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie } from './lib/mint-agent-session.mjs';
import { resolveOperatorUserIdOrThrow } from './lib/resolve-operator-user-id.mjs';
import { PROVIDER_ENV_MAP, PERSONAL_ENV_MAP } from './lib/operator-env-manifest.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const USER_ID = resolveOperatorUserIdOrThrow();
const dryRun = process.argv.includes('--dry-run');

const PROVIDER_ROWS = PROVIDER_ENV_MAP.map((row) => ({
  provider: row.provider,
  keys: row.envKeys,
  accountIdEnv: row.requires?.includes('CLOUDFLARE_ACCOUNT_ID') ? 'CLOUDFLARE_ACCOUNT_ID' : undefined,
  label: `${row.provider} (synced from .env.cloudflare)`,
}));

const PERSONAL_ROWS = PERSONAL_ENV_MAP.map((row) => ({
  secret_name: row.secret_name,
  keys: row.envKeys,
  label: row.secret_name.replace(/_/g, ' '),
}));

function firstEnv(keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

async function mintSession() {
  const { cookie } = await mintAgentSessionCookie({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    ttlSeconds: Number(process.env.AGENT_SESSION_TTL_SECONDS || 900),
    baseUrl: BASE_URL,
  });
  return cookie;
}

function apiHeaders(cookie) {
  return {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'X-IAM-Workspace-Id': WORKSPACE_ID,
  };
}

async function listKeys(cookie) {
  const r = await fetch(`${BASE_URL}/api/settings/keys?category=provider`, {
    headers: apiHeaders(cookie),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `list keys ${r.status}`);
  return Array.isArray(j.items) ? j.items : [];
}

async function listPersonal(cookie) {
  const r = await fetch(`${BASE_URL}/api/settings/keys?category=personal`, {
    headers: apiHeaders(cookie),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `list personal ${r.status}`);
  return Array.isArray(j.items) ? j.items : [];
}

async function upsertProvider(cookie, row, apiKey, existing) {
  const accountId = row.accountIdEnv ? firstEnv([row.accountIdEnv]) : '';
  // Cloudflare is account-wide — never jail the operator key to one workspace.
  const isCloudflare = row.provider === 'cloudflare';
  const payload = {
    category: 'provider',
    provider: row.provider,
    label: row.label,
    api_key: apiKey,
    scope: isCloudflare ? 'user' : 'workspace',
    validate: true,
  };
  if (isCloudflare && accountId) {
    payload.cloudflare_account_id = accountId;
  }

  const match = existing.find((i) => {
    if (String(i.provider || '').toLowerCase() !== row.provider) return false;
    const st = String(i.status || (Number(i.is_active) === 0 ? 'inactive' : 'active')).toLowerCase();
    return st === 'active';
  });

  if (dryRun) {
    console.log(`[dry-run] ${match ? 'rotate' : 'create'} ${row.provider}`);
    return;
  }

  if (match?.id) {
    const r = await fetch(`${BASE_URL}/api/settings/keys/${encodeURIComponent(match.id)}/rotate`, {
      method: 'POST',
      headers: apiHeaders(cookie),
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || `rotate ${row.provider} ${r.status}`);
    console.log(`[ok] rotated ${row.provider} (${match.id})`);
    return;
  }

  const r = await fetch(`${BASE_URL}/api/settings/keys`, {
    method: 'POST',
    headers: apiHeaders(cookie),
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `create ${row.provider} ${r.status}`);
  console.log(`[ok] created ${row.provider}`);
}

async function upsertPersonal(cookie, row, secretValue, existing) {
  const payload = {
    category: 'personal',
    provider: 'other',
    secret_name: row.secret_name,
    label: row.label,
    api_key: secretValue,
    scope: 'workspace',
  };
  const wantSn = row.secret_name.toLowerCase();
  const wantLabel = row.label.toLowerCase();
  const match = existing.find((i) => {
    const sn = String(i.secret_name || '').toLowerCase();
    const label = String(i.label || '').toLowerCase();
    return sn === wantSn || label === wantLabel;
  });

  if (dryRun) {
    console.log(`[dry-run] ${match ? 'rotate' : 'create'} personal:${row.secret_name}`);
    return;
  }

  if (match?.id) {
    const r = await fetch(`${BASE_URL}/api/settings/keys/${encodeURIComponent(match.id)}/rotate`, {
      method: 'POST',
      headers: apiHeaders(cookie),
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || `rotate personal ${row.secret_name} ${r.status}`);
    console.log(`[ok] rotated personal ${row.secret_name}`);
    return;
  }

  const r = await fetch(`${BASE_URL}/api/settings/keys`, {
    method: 'POST',
    headers: apiHeaders(cookie),
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `create personal ${row.secret_name} ${r.status}`);
  console.log(`[ok] created personal ${row.secret_name}`);
}

async function selectD1IfConfigured(cookie) {
  const dbId = firstEnv(['D1_DATABASE_ID']);
  if (!dbId) return;
  if (dryRun) {
    console.log(`[dry-run] select D1 ${dbId}`);
    return;
  }
  const r = await fetch(`${BASE_URL}/api/settings/keys/cloudflare/d1/select`, {
    method: 'POST',
    headers: apiHeaders(cookie),
    body: JSON.stringify({ database_id: dbId, display_name: dbId }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.warn(`[warn] D1 select skipped: ${j.message || j.error || r.status}`);
    return;
  }
  console.log(`[ok] D1 default set ${dbId}`);
}

async function zonesFromEnvToken() {
  const token = firstEnv(['CLOUDFLARE_API_TOKEN']);
  const accountId = firstEnv(['CLOUDFLARE_ACCOUNT_ID']);
  if (!token || !accountId) return [];
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/zones?account.id=${encodeURIComponent(accountId)}&per_page=50`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) return [];
  return Array.isArray(j.result)
    ? j.result.map((z) => ({
        id: String(z.id),
        name: z.name != null ? String(z.name) : '',
        status: z.status != null ? String(z.status) : '',
      }))
    : [];
}

async function savePtyDefaults(cookie) {
  const zoneId = firstEnv(['CLOUDFLARE_ZONE_ID']);
  const hostname =
    firstEnv(['PTY_PUBLIC_HOSTNAME', 'TERMINAL_PUBLIC_HOSTNAME']) ||
    (firstEnv(['TERMINAL_WS_URL'])
      ? String(process.env.TERMINAL_WS_URL)
          .trim()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
      : '');
  const tunnelName = firstEnv(['PTY_TUNNEL_NAME']) || 'inneranimalmedia-pty';

  const envZones = dryRun ? [] : await zonesFromEnvToken();
  let resolvedZone = zoneId;
  if (!resolvedZone && envZones.length) {
    const prefer =
      envZones.find((z) => /inneranimalmedia\.com$/i.test(z.name)) ||
      envZones.find((z) => z.status === 'active') ||
      envZones[0];
    if (prefer?.id) resolvedZone = prefer.id;
  }

  let resolvedHostname = hostname;
  if (!resolvedHostname && envZones.length) {
    const prefer = envZones.find((z) => /inneranimalmedia\.com$/i.test(z.name)) || envZones[0];
    if (prefer?.name) resolvedHostname = `terminal.${prefer.name}`;
  }

  const pty_defaults = {
    zone_id: resolvedZone || null,
    hostname: resolvedHostname || null,
    tunnel_name: tunnelName,
    cloudflare_account_id: firstEnv(['CLOUDFLARE_ACCOUNT_ID']) || null,
    synced_from: '.env.cloudflare',
    synced_at: new Date().toISOString(),
  };
  if (!pty_defaults.zone_id && !pty_defaults.hostname) {
    console.log('[skip] no PTY defaults to save (add CLOUDFLARE_ZONE_ID or sync Cloudflare key first)');
    return;
  }

  if (dryRun) {
    console.log('[dry-run] save pty_defaults', pty_defaults);
    return;
  }

  const r = await fetch(`${BASE_URL}/api/settings/keys/pty-defaults`, {
    method: 'PUT',
    headers: apiHeaders(cookie),
    body: JSON.stringify({ pty_defaults }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok) {
    console.log('[ok] saved PTY form defaults for workspace');
    return;
  }
  console.warn(`[warn] pty-defaults API ${r.status} — deploy latest worker, then re-run sync`);
}

async function main() {
  console.log(`→ sync operator keys → ${BASE_URL} workspace=${WORKSPACE_ID} user=${USER_ID}`);
  const cookie = await mintSession();
  const providerItems = await listKeys(cookie);
  const personalItems = await listPersonal(cookie);

  for (const row of PROVIDER_ROWS) {
    const val = firstEnv(row.keys);
    if (!val) {
      console.log(`[skip] ${row.provider} (no env value)`);
      continue;
    }
    if (row.provider === 'cloudflare' && !firstEnv([row.accountIdEnv])) {
      console.warn('[skip] cloudflare (CLOUDFLARE_ACCOUNT_ID missing)');
      continue;
    }
    try {
      await upsertProvider(cookie, row, val, providerItems);
    } catch (e) {
      console.warn(`[warn] ${row.provider}: ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const row of PERSONAL_ROWS) {
    const val = firstEnv(row.keys);
    if (!val) {
      console.log(`[skip] personal:${row.secret_name}`);
      continue;
    }
    try {
      await upsertPersonal(cookie, row, val, personalItems);
    } catch (e) {
      console.warn(`[warn] personal:${row.secret_name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (firstEnv(['R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'])) {
    console.log('[hint] R2 S3 BYOK: npm run sync:r2-byok (user_storage_access_keys)');
  } else {
    console.log('[skip] R2 BYOK (set R2_ACCESS_KEY_ID in .env.cloudflare)');
  }

  await selectD1IfConfigured(cookie);
  await savePtyDefaults(cookie);
  console.log('→ Done. Open https://inneranimalmedia.com/dashboard/settings/keys');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
