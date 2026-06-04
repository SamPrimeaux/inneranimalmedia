#!/usr/bin/env node
/**
 * Verify SUPABASE_DB_URL: auth + agentsam RAG lane tables (not legacy public.documents).
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/verify-supabase-pg.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnvCloudflare() {
  const p = resolve(ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k) process.env[k] = v;
  }
}

loadEnvCloudflare();

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

const LANE_TABLES = [
  'agentsam.agentsam_memory_oai3large_1536',
  'agentsam.agentsam_deep_archive_oai3large_3072',
  'agentsam.agentsam_documents_oai3large_1536',
  'agentsam.agentsam_memory',
];

const client = new pg.Client(pgClientOptions());
await client.connect();
try {
  const ping = await client.query('SELECT current_user, current_database() AS db');
  console.log('Postgres auth: OK');
  console.log('  user:', ping.rows[0]?.current_user);
  console.log('  database:', ping.rows[0]?.db);

  const u = new URL(dbUrl);
  console.log('  host:', u.hostname, 'port:', u.port || '5432');

  const hasPublicDocuments = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'documents'
    ) AS exists
  `);
  if (hasPublicDocuments.rows[0]?.exists) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS rows FROM public.documents`,
    );
    console.log('\npublic.documents:', rows[0]?.rows ?? 0, 'rows');
  } else {
    console.log('\npublic.documents: (not provisioned — OK; RAG lives in agentsam.*)');
  }

  console.log('\nagentsam lane tables:');
  /** @type {Record<string, number|string>} */
  const summary = {};
  for (const fq of LANE_TABLES) {
    const [schema, table] = fq.split('.');
    const exists = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = $2
       ) AS exists`,
      [schema, table],
    );
    if (!exists.rows[0]?.exists) {
      summary[fq] = 'missing';
      continue;
    }
    const { rows } = await client.query(`SELECT count(*)::int AS c FROM ${fq}`);
    summary[fq] = rows[0]?.c ?? 0;
  }
  console.table(
    Object.entries(summary).map(([table, rows]) => ({ table, rows })),
  );
} finally {
  await client.end().catch(() => {});
}
