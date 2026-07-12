#!/usr/bin/env node
/**
 * One-shot heal: user_oauth_tokens.provider=cloudflare rows whose
 * account_identifier is the app display name ("Cloudflare") or empty.
 *
 * For each row: GET /client/v4/accounts with the stored access_token,
 * then UPDATE account_identifier (32-char hex) + account_display (name)
 * + metadata_json.cloudflare_account_id. Also patches integration_registry
 * account_display for cloudflare_oauth on that user's tenant.
 *
 * Usage:
 *   node scripts/heal-cloudflare-oauth-account-ids.mjs
 *   node scripts/heal-cloudflare-oauth-account-ids.mjs --dry-run
 *
 * Requires: wrangler auth + remote D1 (inneranimalmedia-business).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DB = 'inneranimalmedia-business';
const CF_API = 'https://api.cloudflare.com/client/v4';
const dryRun = process.argv.includes('--dry-run');

function looksLikeCfAccountId(v) {
  return /^[a-f0-9]{32}$/i.test(String(v || '').trim());
}

function d1Json(sql) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, '--remote', '--command', sql, '--json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `d1 execute failed (exit ${r.status})`);
  }
  const raw = String(r.stdout || '').trim();
  const start = raw.indexOf('[');
  if (start < 0) throw new Error(`no JSON array in wrangler output: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(raw.slice(start));
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  if (block?.error) throw new Error(JSON.stringify(block.error));
  return block?.results || [];
}

function sqlQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function resolveAccount(accessToken) {
  const res = await fetch(`${CF_API}/accounts`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.success) {
    return {
      ok: false,
      status: res.status,
      error: body?.errors?.[0]?.message || body?.error || `http_${res.status}`,
    };
  }
  const accounts = Array.isArray(body.result) ? body.result : [];
  const first = accounts.find((a) => looksLikeCfAccountId(a?.id)) || accounts[0];
  if (!first?.id || !looksLikeCfAccountId(first.id)) {
    return { ok: false, error: 'no_valid_account_id', accounts: accounts.length };
  }
  return {
    ok: true,
    id: String(first.id).trim(),
    name: first.name != null ? String(first.name).trim() : null,
  };
}

async function main() {
  const rows = d1Json(`
    SELECT user_id, tenant_id, account_identifier, account_display, access_token, expires_at,
           CASE WHEN refresh_token IS NOT NULL AND length(refresh_token) > 0 THEN 1 ELSE 0 END AS has_refresh
    FROM user_oauth_tokens
    WHERE lower(provider) = 'cloudflare'
      AND (
        account_identifier IS NULL
        OR trim(account_identifier) = ''
        OR lower(trim(account_identifier)) = 'cloudflare'
        OR account_identifier LIKE 'cf_oauth_%'
      )
  `);

  console.log(`[heal-cf-oauth] candidates=${rows.length} dry_run=${dryRun}`);
  if (!rows.length) {
    console.log('[heal-cf-oauth] nothing to patch');
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  let patched = 0;
  let skipped = 0;

  for (const row of rows) {
    const userId = String(row.user_id || '').trim();
    const before = String(row.account_identifier || '').trim() || '(null)';
    const token = String(row.access_token || '').trim();
    const exp = row.expires_at != null ? Number(row.expires_at) : null;

    if (!userId) {
      console.warn('[heal-cf-oauth] skip: missing user_id');
      skipped += 1;
      continue;
    }
    if (!token) {
      console.warn(`[heal-cf-oauth] skip ${userId}: no access_token — reconnect required`);
      skipped += 1;
      continue;
    }
    if (Number.isFinite(exp) && exp > 0 && exp < now) {
      console.warn(
        `[heal-cf-oauth] ${userId}: expires_at=${exp} is past (now=${now}); trying access_token anyway`,
      );
    }

    const resolved = await resolveAccount(token);
    if (!resolved.ok) {
      console.warn(
        `[heal-cf-oauth] skip ${userId}: /v4/accounts failed (${resolved.error || resolved.status}) — reconnect required`,
      );
      skipped += 1;
      continue;
    }

    const meta = JSON.stringify({ cloudflare_account_id: resolved.id });
    const display = resolved.name || 'Cloudflare account';
    console.log(
      `Patched account_identifier for ${userId}: ${before} → ${resolved.id}` +
        (resolved.name ? ` (${resolved.name})` : ''),
    );

    if (dryRun) {
      patched += 1;
      continue;
    }

    d1Json(`
      UPDATE user_oauth_tokens
         SET account_identifier = ${sqlQuote(resolved.id)},
             account_display = ${sqlQuote(display)},
             metadata_json = ${sqlQuote(meta)},
             updated_at = ${now}
       WHERE user_id = ${sqlQuote(userId)}
         AND lower(provider) = 'cloudflare'
    `);

    // Best-effort registry display (tenant-scoped UI label).
    const tenantId = String(row.tenant_id || '').trim();
    if (tenantId) {
      try {
        d1Json(`
          UPDATE integration_registry
             SET account_display = ${sqlQuote(display)},
                 updated_at = datetime('now')
           WHERE tenant_id = ${sqlQuote(tenantId)}
             AND lower(provider_key) = 'cloudflare_oauth'
        `);
      } catch (e) {
        console.warn(`[heal-cf-oauth] registry patch failed for ${tenantId}:`, e?.message || e);
      }
    }

    // Mirror into user_settings.cf_account_id when settings row exists.
    try {
      const settings = d1Json(`
        SELECT settings_json FROM user_settings WHERE user_id = ${sqlQuote(userId)} LIMIT 1
      `);
      if (settings[0]?.settings_json != null) {
        let obj = {};
        try {
          obj = JSON.parse(String(settings[0].settings_json));
        } catch {
          obj = {};
        }
        if (typeof obj !== 'object' || obj == null) obj = {};
        obj.cf_account_id = resolved.id;
        if (obj.cf_stack && typeof obj.cf_stack === 'object') {
          obj.cf_stack.cf_account_id = resolved.id;
        }
        d1Json(`
          UPDATE user_settings
             SET settings_json = ${sqlQuote(JSON.stringify(obj))},
                 updated_at = datetime('now')
           WHERE user_id = ${sqlQuote(userId)}
        `);
      }
    } catch (e) {
      console.warn(`[heal-cf-oauth] user_settings patch failed for ${userId}:`, e?.message || e);
    }

    patched += 1;
  }

  console.log(`[heal-cf-oauth] done patched=${patched} skipped=${skipped}`);
}

main().catch((e) => {
  console.error('[heal-cf-oauth] fatal', e?.message || e);
  process.exit(1);
});
