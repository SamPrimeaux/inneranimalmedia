#!/usr/bin/env node
/**
 * Backfill D1 agentsam_memory → private agentsam.agentsam_memory (idempotent).
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/backfill-agentsam-memory-private-pg.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/backfill-agentsam-memory-private-pg.mjs --dry-run
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { mapD1RowToPrivateMemory } from '../src/core/agentsam-private-memory.js';
import { shouldSkipD1RowForPrivateBackfill } from '../src/core/agentsam-private-memory-backfill.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const UPSERT_SQL = `
INSERT INTO agentsam.agentsam_memory (
  tenant_id, workspace_id, user_id, memory_type, memory_key,
  title, content, summary, value_json, source, external_ref, tags,
  confidence, importance, expires_at, is_pinned, is_archived,
  embedding, embedded_at, sync_key, d1_id, updated_at
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9::jsonb, $10, $11, $12::text[],
  $13, $14, $15::timestamptz, $16, false,
  NULL, NULL, $17, $18, now()
)
ON CONFLICT (tenant_id, user_id, memory_key) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  memory_type = EXCLUDED.memory_type,
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  summary = EXCLUDED.summary,
  value_json = EXCLUDED.value_json,
  source = EXCLUDED.source,
  tags = EXCLUDED.tags,
  confidence = EXCLUDED.confidence,
  importance = EXCLUDED.importance,
  sync_key = EXCLUDED.sync_key,
  d1_id = COALESCE(EXCLUDED.d1_id, agentsam.agentsam_memory.d1_id),
  updated_at = now()`;

function loadEnvCloudflare() {
  const p = resolve(ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    dryRun: args.includes('--dry-run'),
    tenantId: 'tenant_sam_primeaux',
    workspaceId: 'ws_inneranimalmedia',
    userId: 'au_871d920d1233cbd1',
    limit: 500,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tenant' && args[i + 1]) out.tenantId = args[++i];
    if (args[i] === '--workspace' && args[i + 1]) out.workspaceId = args[++i];
    if (args[i] === '--user' && args[i + 1]) out.userId = args[++i];
    if (args[i] === '--limit' && args[i + 1]) out.limit = Number(args[++i]);
  }
  return out;
}

function d1Json(sql) {
  const out = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--json',
      '--command',
      sql,
    ],
    { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024 },
  );
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0]?.results ?? [];
}

function pgOptions(dbUrl) {
  const useSsl =
    /\.supabase\.co\b/.test(dbUrl) ||
    /\.pooler\.supabase\.com\b/.test(dbUrl) ||
    /supabase\.com/.test(dbUrl);
  return {
    connectionString: dbUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

async function main() {
  loadEnvCloudflare();
  const opts = parseArgs();
  const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL');
    process.exit(1);
  }

  const esc = (s) => String(s).replace(/'/g, "''");
  const sql = `SELECT * FROM agentsam_memory
    WHERE tenant_id = '${esc(opts.tenantId)}'
      AND user_id = '${esc(opts.userId)}'
      AND (workspace_id = '${esc(opts.workspaceId)}' OR workspace_id IS NULL OR TRIM(COALESCE(workspace_id,'')) = '')
      AND value NOT LIKE '[STALE%'
      AND (expires_at IS NULL OR expires_at > unixepoch())
      AND COALESCE(is_archived, 0) = 0
    ORDER BY updated_at DESC
    LIMIT ${Math.min(opts.limit, 2000)}`;

  const rows = d1Json(sql);
  const report = {
    ok: true,
    dry_run: opts.dryRun,
    scanned: rows.length,
    upserted: 0,
    skipped: 0,
    errors: [],
    skip_reasons: {},
  };

  const client = new pg.Client(pgOptions(dbUrl));
  if (!opts.dryRun) await client.connect();

  try {
    for (const row of rows) {
      const skip = shouldSkipD1RowForPrivateBackfill(row);
      if (skip) {
        report.skipped += 1;
        report.skip_reasons[skip] = (report.skip_reasons[skip] || 0) + 1;
        continue;
      }
      const m = mapD1RowToPrivateMemory(row);
      if (!m.workspace_id) m.workspace_id = opts.workspaceId;

      if (opts.dryRun) {
        report.upserted += 1;
        continue;
      }

      try {
        await client.query(UPSERT_SQL, [
          m.tenant_id,
          m.workspace_id,
          m.user_id,
          m.memory_type,
          m.memory_key,
          m.title,
          m.content,
          m.summary,
          JSON.stringify(m.value_json),
          m.source,
          m.external_ref,
          m.tags,
          m.confidence,
          m.importance,
          m.expires_at,
          m.is_pinned,
          m.sync_key,
          m.d1_id,
        ]);
        report.upserted += 1;
      } catch (e) {
        report.errors.push({
          key: m.memory_key,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    if (!opts.dryRun) await client.end().catch(() => {});
  }

  if (report.errors.length) report.ok = false;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
