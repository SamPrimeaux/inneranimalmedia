#!/usr/bin/env node
/**
 * Backfill D1 projects → agentsam.agentsam_projects (idempotent).
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/backfill-agentsam-projects-supabase.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/backfill-agentsam-projects-supabase.mjs --dry-run
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { mapD1ProjectToSupabaseRow } from '../src/core/agentsam-projects-supabase-sync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const UPSERT_SQL = `
INSERT INTO agentsam.agentsam_projects (
  id, workspace_id, tenant_id, parent_id,
  name, slug, description, status, project_type,
  client_name, client_contact, repo_url, live_url,
  stack, integrations, infra, design_meta,
  priority, phase, is_pinned,
  billing_type, monthly_value,
  updated_by, last_activity, activity_log, embedding_dirty,
  started_at, target_date, shipped_at, archived_at,
  created_at, updated_at,
  summary, embedding_model
) VALUES (
  $1,$2,$3,$4,
  $5,$6,$7,$8,$9,
  $10,$11,$12,$13,
  $14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,
  $18,$19,$20,
  $21,$22,
  $23,$24,$25::jsonb,$26,
  $27::timestamptz,$28::timestamptz,$29::timestamptz,$30::timestamptz,
  $31::timestamptz,$32::timestamptz,
  $33,$34
)
ON CONFLICT (id) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  tenant_id = EXCLUDED.tenant_id,
  parent_id = EXCLUDED.parent_id,
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  project_type = EXCLUDED.project_type,
  client_name = EXCLUDED.client_name,
  client_contact = EXCLUDED.client_contact,
  repo_url = EXCLUDED.repo_url,
  live_url = EXCLUDED.live_url,
  stack = EXCLUDED.stack,
  integrations = EXCLUDED.integrations,
  infra = EXCLUDED.infra,
  design_meta = EXCLUDED.design_meta,
  priority = EXCLUDED.priority,
  phase = EXCLUDED.phase,
  is_pinned = EXCLUDED.is_pinned,
  billing_type = EXCLUDED.billing_type,
  monthly_value = EXCLUDED.monthly_value,
  updated_by = EXCLUDED.updated_by,
  last_activity = EXCLUDED.last_activity,
  activity_log = EXCLUDED.activity_log,
  embedding_dirty = EXCLUDED.embedding_dirty,
  started_at = EXCLUDED.started_at,
  target_date = EXCLUDED.target_date,
  shipped_at = EXCLUDED.shipped_at,
  archived_at = EXCLUDED.archived_at,
  updated_at = EXCLUDED.updated_at,
  summary = EXCLUDED.summary,
  embedding_model = EXCLUDED.embedding_model`;

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
  return {
    dryRun: args.includes('--dry-run'),
    limit: args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 5000,
  };
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

function mirrorParams(m) {
  return [
    m.id,
    m.workspace_id,
    m.tenant_id,
    m.parent_id,
    m.name,
    m.slug,
    m.description,
    m.status,
    m.project_type,
    m.client_name,
    m.client_contact,
    m.repo_url,
    m.live_url,
    JSON.stringify(m.stack ?? []),
    JSON.stringify(m.integrations ?? []),
    JSON.stringify(m.infra ?? {}),
    JSON.stringify(m.design_meta ?? {}),
    m.priority,
    m.phase,
    m.is_pinned === true,
    m.billing_type,
    m.monthly_value,
    m.updated_by,
    m.last_activity,
    JSON.stringify(m.activity_log ?? []),
    m.embedding_dirty !== false,
    m.started_at,
    m.target_date,
    m.shipped_at,
    m.archived_at,
    m.created_at,
    m.updated_at,
    m.summary,
    m.embedding_model,
  ];
}

async function main() {
  loadEnvCloudflare();
  const opts = parseArgs();
  const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL');
    process.exit(1);
  }

  const limit = Math.min(Math.max(opts.limit, 1), 10000);
  const projects = d1Json(
    `SELECT p.*, wp.slug AS wp_slug,
            COALESCE(NULLIF(TRIM(p.tenant_id), ''), w.owner_tenant_id, w.default_tenant_id) AS resolved_tenant_id
     FROM projects p
     LEFT JOIN workspace_projects wp
       ON json_extract(wp.metadata_json, '$.projects_table_id') = p.id
     LEFT JOIN workspaces w ON w.id = p.workspace_id
     ORDER BY p.updated_at DESC
     LIMIT ${limit}`,
  );

  const report = {
    ok: true,
    dry_run: opts.dryRun,
    scanned: projects.length,
    upserted: 0,
    skipped: 0,
    errors: [],
  };

  const client = new pg.Client(pgOptions(dbUrl));
  if (!opts.dryRun) await client.connect();

  try {
    for (const row of projects) {
      const mirror = mapD1ProjectToSupabaseRow(row, {
        slug: row.wp_slug ?? null,
        resolvedTenantId: row.resolved_tenant_id ?? null,
      });
      if (!mirror) {
        report.skipped += 1;
        continue;
      }

      if (opts.dryRun) {
        report.upserted += 1;
        continue;
      }

      try {
        await client.query(UPSERT_SQL, mirrorParams(mirror));
        report.upserted += 1;
      } catch (e) {
        report.errors.push({
          id: mirror.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    if (!opts.dryRun) await client.end().catch(() => {});
  }

  if (!opts.dryRun && report.upserted > 0 && report.errors.length === 0) {
    try {
      d1Json(
        `UPDATE projects
         SET supabase_sync_status = 'synced',
             supabase_sync_error = NULL,
             supabase_synced_at = datetime('now')
         WHERE tenant_id IS NOT NULL AND TRIM(tenant_id) != ''`,
      );
    } catch (e) {
      report.sync_status_patch_error = e instanceof Error ? e.message : String(e);
    }
  }

  if (report.errors.length) report.ok = false;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
