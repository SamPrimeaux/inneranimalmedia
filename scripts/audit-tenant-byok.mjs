#!/usr/bin/env node
/**
 * Audit tenant_sam_primeaux (or TENANT_ID env) — workspace bindings, BYOK coverage, gaps.
 *
 * Usage (repo root):
 *   npm run audit:tenant-byok
 *   TENANT_ID=tenant_sam_primeaux USER_ID=au_871d920d1233cbd1 npm run audit:tenant-byok
 *   node scripts/audit-tenant-byok.mjs --remote
 */
import { spawnSync } from 'node:child_process';
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';

loadEnvCloudflare();

const TENANT_ID = (process.env.TENANT_ID || 'tenant_sam_primeaux').trim();
function resolveOperatorUserId() {
  for (const raw of [
    process.env.USER_ID,
    process.env.AGENT_SESSION_USER_ID,
    process.env.AGENT_SESSION_DEFAULT_USER_ID,
    'au_871d920d1233cbd1',
  ]) {
    const s = String(raw || '').trim();
    if (s.startsWith('au_')) return s;
  }
  return 'au_871d920d1233cbd1';
}
const USER_ID = resolveOperatorUserId();
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const remote = process.argv.includes('--remote') || !process.argv.includes('--local');
const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');

const EXPECTED_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'cloudflare',
  'meshy',
  'github',
  'resend',
  'supabase',
];

const EXPECTED_LLM_PROVIDERS = ['openai', 'anthropic', 'google'];

function d1Query(sql) {
  const args = [
    'd1',
    'execute',
    'inneranimalmedia-business',
    remote ? '--remote' : '--local',
    '-c',
    'wrangler.production.toml',
    '--command',
    sql,
    '--json',
  ];
  const r = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    cwd: process.cwd(),
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'wrangler d1 failed');
  }
  try {
    const parsed = JSON.parse(r.stdout);
    const block = Array.isArray(parsed) ? parsed[0] : parsed;
    return block?.results ?? [];
  } catch {
    return [];
  }
}

function section(title) {
  console.log(`\n## ${title}`);
}

async function mintSessionCookie() {
  const secret = process.env.AGENT_SESSION_MINT_SECRET?.trim();
  if (!secret) return null;
  const body = { ttl_seconds: 900, user_id: USER_ID };
  const r = await fetch(`${BASE_URL}/api/auth/agent-session/mint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) return null;
  return j.cookie_header || (j.session_id ? `session=${j.session_id}` : null);
}

async function apiSmoke(cookie) {
  if (!cookie) {
    console.log('  (skip API smoke — set AGENT_SESSION_MINT_SECRET in .env.cloudflare)');
    return;
  }
  const headers = {
    Cookie: cookie,
    'X-IAM-Workspace-Id': WORKSPACE_ID,
  };
  const keysRes = await fetch(`${BASE_URL}/api/settings/keys?category=provider`, { headers });
  const keysJson = await keysRes.json().catch(() => ({}));
  const items = Array.isArray(keysJson.items) ? keysJson.items : [];
  console.log(`  Settings keys API: ${keysRes.status} — ${items.length} provider row(s)`);
  for (const p of EXPECTED_PROVIDERS) {
    const hit = items.find(
      (i) =>
        String(i.provider || '').toLowerCase() === p &&
        String(i.status || '').toLowerCase() === 'active',
    );
    console.log(`    ${p}: ${hit ? `active (${hit.key_preview || hit.last_four || 'masked'})` : 'MISSING'}`);
  }

  const meshyBal = await fetch(`${BASE_URL}/api/cad/meshy/balance`, { headers, credentials: 'include' });
  const meshyJson = await meshyBal.json().catch(() => ({}));
  if (meshyBal.ok) {
    console.log(
      `  Meshy balance API: balance=${meshyJson.balance ?? '?'} stub=${meshyJson.stub ?? false} key_source=${meshyJson.key_source ?? '?'}`,
    );
  } else {
    console.log(`  Meshy balance API: HTTP ${meshyBal.status}`);
  }

  const r2Res = await fetch(`${BASE_URL}/api/storage/byok/status`, { headers });
  const r2Json = await r2Res.json().catch(() => ({}));
  console.log(
    `  R2 BYOK status: connected=${r2Json.connected ?? false} bucket=${r2Json.byok_r2_bucket ?? '—'}`,
  );
}

function main() {
  console.log(`Tenant BYOK audit — tenant=${TENANT_ID} user=${USER_ID} workspace=${WORKSPACE_ID} (${remote ? 'remote' : 'local'})`);

  section('Tenant');
  const tenants = d1Query(
    `SELECT id, name, slug, is_active, domain FROM tenants WHERE id = '${TENANT_ID}' LIMIT 1`,
  );
  console.log(tenants[0] ? tenants[0] : 'MISSING tenant row');

  section('Workspaces');
  const workspaces = d1Query(
    `SELECT id, worker_name, d1_database_id, byok_r2_bucket, cloudflare_account_id
     FROM agentsam_workspace WHERE tenant_id = '${TENANT_ID}' ORDER BY id`,
  );
  for (const w of workspaces) console.log(`  ${w.id} worker=${w.worker_name} d1=${w.d1_database_id} r2=${w.byok_r2_bucket ?? '—'}`);

  section('Your BYOK provider keys (user_api_keys)');
  const keys = d1Query(
    `SELECT provider, key_name, key_preview, last_tested_at, test_status
     FROM user_api_keys
     WHERE tenant_id = '${TENANT_ID}' AND user_id = '${USER_ID}' AND COALESCE(is_active,1)=1
     ORDER BY provider`,
  );
  if (!keys.length) console.log('  No active user_api_keys rows for this user.');
  for (const k of keys) {
    console.log(
      `  ${k.provider}: ${k.key_name || '—'} preview=${k.key_preview || '—'} tested=${k.last_tested_at ?? 'never'} status=${k.test_status ?? '—'}`,
    );
  }
  for (const p of EXPECTED_PROVIDERS) {
    if (!keys.some((k) => String(k.provider).toLowerCase() === p)) {
      console.log(`  GAP: no active BYOK row for provider "${p}"`);
    }
  }

  section('Model picker BYOK (user_api_keys — canonical)');
  const llmKeys = keys.filter((k) =>
    EXPECTED_LLM_PROVIDERS.includes(String(k.provider).toLowerCase()),
  );
  if (!llmKeys.length) console.log('  No LLM BYOK rows in user_api_keys.');
  for (const k of llmKeys) {
    console.log(
      `  ${k.provider}: preview=${k.key_preview || '—'} tested=${k.last_tested_at ?? 'never'} status=${k.test_status ?? '—'}`,
    );
  }
  for (const p of EXPECTED_LLM_PROVIDERS) {
    if (!llmKeys.some((k) => String(k.provider).toLowerCase() === p)) {
      console.log(`  GAP: no user_api_keys row for "${p}" — model picker may show BYOK false`);
    }
  }

  section('Legacy LLM vault slots (iam_user_llm_keys — optional fallback)');
  const vault = d1Query(
    `SELECT secret_name, json_extract(metadata_json,'$.last4') AS last4
     FROM user_secrets
     WHERE tenant_id = '${TENANT_ID}' AND user_id = '${USER_ID}'
       AND project_label = 'iam_user_llm_keys' AND COALESCE(is_active,1)=1`,
  );
  if (!vault.length) console.log('  None (OK if user_api_keys has LLM providers).');
  for (const v of vault) console.log(`  ${v.secret_name}: ••••${v.last4 ?? '????'}`);

  section('R2 BYOK (user_storage_access_keys)');
  const r2 = d1Query(
    `SELECT cf_account_id, r2_access_key_id, status, validation_status, validated_at
     FROM user_storage_access_keys
     WHERE tenant_id = '${TENANT_ID}' AND user_id = '${USER_ID}' AND status = 'active'`,
  );
  if (!r2.length) console.log('  GAP: no active R2 BYOK credentials — artifact export / user R2 writes need Keys → R2');
  for (const row of r2) {
    console.log(
      `  account=${row.cf_account_id} key=${row.r2_access_key_id} status=${row.status} validation=${row.validation_status} validated=${row.validated_at ?? 'never'}`,
    );
  }

  section('Workspace membership');
  const mem = d1Query(
    `SELECT workspace_id, role, workspace_role, is_active
     FROM workspace_members
     WHERE tenant_id = '${TENANT_ID}' AND user_id = '${USER_ID}'`,
  );
  for (const m of mem) {
    console.log(
      `  ${m.workspace_id} role=${m.role} workspace_role=${m.workspace_role} active=${m.is_active}`,
    );
  }
  if (!mem.some((m) => m.workspace_id === WORKSPACE_ID)) {
    console.log(`  GAP: no workspace_members row for ${WORKSPACE_ID}`);
  }

  section('Live API smoke (optional)');
  return mintSessionCookie().then((cookie) => apiSmoke(cookie));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
