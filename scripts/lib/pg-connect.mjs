/**
 * Shared Postgres connect helper — session pooler only (see docs/DEPLOY_ENV_SUPABASE_MAPPING.md).
 */
import pg from 'pg';

const POOLER_HOST = 'aws-1-us-east-2.pooler.supabase.com';

export function normalizeSupabaseDbUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return '';
  if (url.includes('db.dpmuvynqixblxsilnlut.supabase.co')) {
    console.warn(
      '[pg-connect] SUPABASE_DB_URL uses direct db.* host (IPv6-only). Use session pooler:',
      `postgresql://postgres.dpmuvynqixblxsilnlut:***@${POOLER_HOST}:5432/postgres`,
    );
  }
  return url;
}

export function pgClientOptions(connectionString) {
  const dbUrl = normalizeSupabaseDbUrl(connectionString);
  const useSsl =
    /\.supabase\.co\b/.test(dbUrl) ||
    /\.pooler\.supabase\.com\b/.test(dbUrl) ||
    /supabase\.com/.test(dbUrl);
  return {
    connectionString: dbUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

/**
 * @returns {Promise<{ client: import('pg').Client, skipped?: false } | { skipped: true, reason: string }>}
 */
export async function connectPgOrSkip(connectionString, { label = 'pg' } = {}) {
  const dbUrl = normalizeSupabaseDbUrl(connectionString);
  if (!dbUrl) {
    return { skipped: true, reason: 'SUPABASE_DB_URL unset' };
  }
  const client = new pg.Client(pgClientOptions(dbUrl));
  try {
    await client.connect();
    return { client };
  } catch (e) {
    const code = e?.code || '';
    const msg = String(e?.message || e);
    if (code === '28P01') {
      console.error(
        `[${label}] Postgres authentication failed (28P01). Update SUPABASE_DB_URL in .env.cloudflare — use the session pooler user postgres.dpmuvynqixblxsilnlut and the current database password from Supabase Dashboard → Settings → Database.`,
      );
      return { skipped: true, reason: `auth_failed_28P01: ${msg}` };
    }
    if (code === 'ENOTFOUND' || code === 'ETIMEDOUT') {
      console.error(`[${label}] Postgres network error (${code}): ${msg}`);
      return { skipped: true, reason: `network_${code}` };
    }
    throw e;
  }
}
