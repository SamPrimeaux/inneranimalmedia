#!/usr/bin/env node
/**
 * Sync R2 S3 BYOK credentials only (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).
 *
 * Platform buckets = Worker [[r2_buckets]] bindings (ASSETS, AUTORAG_BUCKET, ARTIFACTS).
 * Runtime discovers those via listWorkerR2BindingCatalog(env) — no env bucket vars.
 * BYOK S3 credentials = account-wide ListBuckets / CRUD on any bucket your token allows.
 *
 * Usage: npm run sync:r2-byok
 */
import { spawnSync } from 'node:child_process';
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie, resolveOperatorUserId } from './lib/mint-agent-session.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const USER_ID = resolveOperatorUserId();
const dryRun = process.argv.includes('--dry-run');

function firstEnv(keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function wranglerSecretPut(name, value) {
  if (dryRun) {
    console.log(`[dry-run] wrangler secret put ${name}`);
    return true;
  }
  const r = spawnSync(
    'npx',
    ['wrangler', 'secret', 'put', name, '-c', 'wrangler.production.toml'],
    { input: value, encoding: 'utf8', cwd: process.cwd(), env: process.env },
  );
  if (r.status !== 0) {
    console.warn(`[warn] wrangler secret put ${name}: ${r.stderr || r.stdout}`);
    return false;
  }
  console.log(`[ok] Worker secret ${name} updated`);
  return true;
}

function apiHeaders(cookie) {
  return {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'X-IAM-Workspace-Id': WORKSPACE_ID,
  };
}

async function upsertR2Credentials(cookie) {
  const accessKeyId = firstEnv(['R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID']);
  const secretAccessKey = firstEnv(['R2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY']);
  const accountId = firstEnv(['CLOUDFLARE_ACCOUNT_ID']);

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY required in .env.cloudflare');
  }
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID required');

  const testRes = await fetch(`${BASE_URL}/api/storage/byok/test`, {
    method: 'POST',
    headers: apiHeaders(cookie),
    body: JSON.stringify({
      cloudflare_account_id: accountId,
      r2_access_key_id: accessKeyId,
      r2_secret_access_key: secretAccessKey,
    }),
  });
  const testJson = await testRes.json().catch(() => ({}));
  if (!testRes.ok || !testJson.ok) {
    throw new Error(testJson.message || testJson.error || `R2 validate HTTP ${testRes.status}`);
  }
  console.log(
    `[ok] S3 credentials validated — ${testJson.s3_bucket_count ?? testJson.buckets?.length ?? '?'} bucket(s) via ListBuckets`,
  );

  const payload = {
    category: 'provider',
    provider: 'cloudflare_r2',
    label: 'Cloudflare R2 S3 (account-wide BYOK)',
    cloudflare_account_id: accountId,
    r2_access_key_id: accessKeyId,
    r2_secret_access_key: secretAccessKey,
    scope: 'workspace',
    validate: false,
  };

  if (dryRun) {
    console.log('[dry-run] upsert cloudflare_r2 credentials');
    return;
  }

  const r = await fetch(`${BASE_URL}/api/settings/keys`, {
    method: 'POST',
    headers: apiHeaders(cookie),
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `R2 BYOK upsert ${r.status}`);
  console.log('[ok] R2 BYOK credentials stored');
}

async function main() {
  console.log(
    `→ R2 S3 BYOK sync workspace=${WORKSPACE_ID} user=${USER_ID}${dryRun ? ' (dry-run)' : ''}`,
  );

  const accessKeyId = firstEnv(['R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID']);
  const secretKey = firstEnv(['R2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY']);
  if (accessKeyId) wranglerSecretPut('R2_ACCESS_KEY_ID', accessKeyId);
  if (secretKey) wranglerSecretPut('R2_SECRET_ACCESS_KEY', secretKey);

  const { cookie } = await mintAgentSessionCookie({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    baseUrl: BASE_URL,
  });

  await upsertR2Credentials(cookie);

  const statusRes = await fetch(`${BASE_URL}/api/storage/byok/status`, {
    headers: apiHeaders(cookie),
  });
  const statusJson = await statusRes.json().catch(() => ({}));
  console.log(`→ BYOK connected=${statusJson.connected}`);
  if (Array.isArray(statusJson.worker_bindings)) {
    console.log('→ Worker bindings (from runtime env, not env vars):');
    for (const b of statusJson.worker_bindings) {
      console.log(`  ${b.binding} → ${b.bucket_name}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
