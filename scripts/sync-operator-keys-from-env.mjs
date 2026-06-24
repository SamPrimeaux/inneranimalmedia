#!/usr/bin/env node
/**
 * Sync provider keys from gitignored .env.cloudflare into dashboard BYOK (user_api_keys).
 * Scoped to one operator user + workspace — does not touch other users' secrets.
 *
 * Usage (repo root):
 *   npm run sync:operator-keys
 *   node scripts/sync-operator-keys-from-env.mjs --dry-run
 *
 * Requires in .env.cloudflare:
 *   AGENT_SESSION_MINT_SECRET, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 * Provider keys (synced when present):
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY|GEMINI_API_KEY, MESHYAI_API_KEY,
 *   GITHUB_TOKEN, RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY
 * R2 BYOK (optional): R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY — S3 API for all account buckets
 * Optional: AGENT_SESSION_USER_ID | AGENT_SESSION_DEFAULT_USER_ID | AGENT_SESSION_USER_EMAIL
 *           WORKSPACE_ID (default ws_inneranimalmedia)
 */
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie } from './lib/mint-agent-session.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
function resolveOperatorUserId() {
  for (const raw of [
    process.env.AGENT_SESSION_USER_ID,
    process.env.AGENT_SESSION_DEFAULT_USER_ID,
    'au_871d920d1233cbd1',
  ]) {
    const s = String(raw || '').trim();
    if (s.startsWith('au_')) return s;
  }
  return '';
}

const USER_ID = resolveOperatorUserId();
const USER_EMAIL = (process.env.AGENT_SESSION_USER_EMAIL || 'sam@inneranimalmedia.com').trim();
const dryRun = process.argv.includes('--dry-run');

const PROVIDER_ROWS = [
  {
    provider: 'openai',
    keys: ['OPENAI_API_KEY'],
    label: 'OpenAI (synced from .env.cloudflare)',
  },
  {
    provider: 'anthropic',
    keys: ['ANTHROPIC_API_KEY'],
    label: 'Anthropic (synced from .env.cloudflare)',
  },
  {
    provider: 'google',
    keys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    label: 'Google AI (synced from .env.cloudflare)',
  },
  {
    provider: 'meshy',
    keys: ['MESHYAI_API_KEY', 'MESHY_API_KEY'],
    label: 'Meshy (synced from .env.cloudflare)',
  },
  {
    provider: 'cloudflare',
    keys: ['CLOUDFLARE_API_TOKEN'],
    accountIdEnv: 'CLOUDFLARE_ACCOUNT_ID',
    label: 'Cloudflare (synced from .env.cloudflare)',
  },
  {
    provider: 'github',
    keys: ['GITHUB_TOKEN'],
    label: 'GitHub (synced from .env.cloudflare)',
  },
  {
    provider: 'resend',
    keys: ['RESEND_API_KEY'],
    label: 'Resend (synced from .env.cloudflare)',
  },
  {
    provider: 'supabase',
    keys: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
    label: 'Supabase (synced from .env.cloudflare)',
  },
];

const R2_ROW = {
  provider: 'cloudflare_r2',
  accessKeyEnv: ['R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'],
  secretKeyEnv: ['R2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'],
  accountIdEnv: 'CLOUDFLARE_ACCOUNT_ID',
  label: 'Cloudflare R2 S3 (account-wide BYOK)',
};

const PERSONAL_ROWS = [
  { secret_name: 'tavily_api_key', keys: ['TAVILY_API_KEY'], label: 'Tavily API key' },
  { secret_name: 'realtimekit_api_token', keys: ['REALTIMEKIT_API_TOKEN'], label: 'RealtimeKit API token' },
];

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
  const payload = {
    category: 'provider',
    provider: row.provider,
    label: row.label,
    api_key: apiKey,
    scope: 'workspace',
    validate: true,
  };
  if (row.provider === 'cloudflare' && accountId) {
    payload.cloudflare_account_id = accountId;
  }

  const match = existing.find(
    (i) =>
      String(i.provider || '').toLowerCase() === row.provider &&
      String(i.status || '').toLowerCase() === 'active',
  );

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
  const match = existing.find(
    (i) =>
      String(i.secret_name || '').toLowerCase() === row.secret_name &&
      String(i.status || '').toLowerCase() === 'active',
  );

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
    const prefer =
      envZones.find((z) => /inneranimalmedia\.com$/i.test(z.name)) || envZones[0];
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

async function upsertR2(cookie, existing) {
  const accessKeyId = firstEnv(R2_ROW.accessKeyEnv);
  const secretAccessKey = firstEnv(R2_ROW.secretKeyEnv);
  const accountId = firstEnv([R2_ROW.accountIdEnv]);
  if (!accessKeyId || !secretAccessKey) {
    console.log('[skip] cloudflare_r2 (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY missing)');
    return;
  }
  if (!accountId) {
    console.warn('[skip] cloudflare_r2 (CLOUDFLARE_ACCOUNT_ID missing)');
    return;
  }
  const payload = {
    category: 'provider',
    provider: 'cloudflare_r2',
    label: R2_ROW.label,
    cloudflare_account_id: accountId,
    r2_access_key_id: accessKeyId,
    r2_secret_access_key: secretAccessKey,
    scope: 'workspace',
    validate: true,
  };
  const match = existing.find(
    (i) =>
      String(i.provider || '').toLowerCase() === 'cloudflare_r2' &&
      String(i.status || '').toLowerCase() === 'active',
  );
  if (dryRun) {
    console.log(`[dry-run] ${match ? 'rotate' : 'create'} cloudflare_r2 (S3 credentials only)`);
    return;
  }
  if (match?.id) {
    const r = await fetch(`${BASE_URL}/api/settings/keys/${encodeURIComponent(match.id)}/rotate`, {
      method: 'POST',
      headers: apiHeaders(cookie),
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || `rotate cloudflare_r2 ${r.status}`);
    console.log(`[ok] rotated cloudflare_r2 (${match.id})`);
    return;
  }
  const r = await fetch(`${BASE_URL}/api/settings/keys`, {
    method: 'POST',
    headers: apiHeaders(cookie),
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `create cloudflare_r2 ${r.status}`);
  console.log('[ok] created cloudflare_r2');
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

  try {
    await upsertR2(cookie, providerItems);
  } catch (e) {
    console.warn(`[warn] cloudflare_r2: ${e instanceof Error ? e.message : e}`);
  }

  await selectD1IfConfigured(cookie);
  await savePtyDefaults(cookie);
  console.log('→ Done. Open https://inneranimalmedia.com/dashboard/settings/keys');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
