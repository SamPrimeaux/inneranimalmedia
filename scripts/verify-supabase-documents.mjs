#!/usr/bin/env node
/**
 * Print grouped counts for public.documents (Supabase Postgres via SUPABASE_DB_URL).
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/verify-supabase-documents.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(resolve(__dirname, '../.env.cloudflare'), 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  /* no .env.cloudflare */
}

import pg from 'pg';

const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL');
  process.exit(1);
}

function pgClientOptions() {
  const useSsl =
    /\.supabase\.co\b/.test(dbUrl) ||
    /\.pooler\.supabase\.com\b/.test(dbUrl) ||
    /supabase\.com/.test(dbUrl);
  return {
    connectionString: dbUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

const sql = `
SELECT
  source,
  tenant_id,
  workspace_id,
  project_id,
  embed_model,
  count(*) AS rows,
  count(embedding) AS embedded_rows,
  count(content_hash) AS hashed_rows,
  count(source_chunk_id) AS deterministic_rows,
  max(updated_at) AS newest_update
FROM public.documents
GROUP BY source, tenant_id, workspace_id, project_id, embed_model
ORDER BY rows DESC;
`;

const client = new pg.Client(pgClientOptions());
await client.connect();
try {
  const { rows } = await client.query(sql);
  console.log('public.documents summary\n');
  console.table(rows);
} catch (e) {
  const msg = String(e?.message || e);
  if (msg.includes('content_hash') || msg.includes('source_chunk_id') || msg.includes('embed_model')) {
    const { rows } = await client.query(
      `SELECT source, tenant_id, workspace_id, project_id, count(*)::int AS rows
       FROM public.documents
       GROUP BY source, tenant_id, workspace_id, project_id
       ORDER BY rows DESC`,
    );
    console.warn('[verify] Reduced summary (add columns content_hash, source_chunk_id, embed_model for full audit).\n');
    console.table(rows);
  } else {
    throw e;
  }
} finally {
  await client.end().catch(() => {});
}
