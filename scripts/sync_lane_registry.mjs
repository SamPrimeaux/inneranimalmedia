#!/usr/bin/env node
/**
 * Sync D1 agentsam_pgvector_lane_registry from src/core/vectorize-lane-config.js (runtime SSOT).
 * Registry is read-only audit/documentation — dispatchSemanticRetrieval reads LANE_CONFIG directly.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/sync_lane_registry.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/sync_lane_registry.mjs --dry-run
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANE_CONFIG } from '../src/core/vectorize-lane-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB = process.env.IAM_D1_DB || 'inneranimalmedia-business';
const WRANGLER_CFG = process.env.IAM_WRANGLER_CONFIG || 'wrangler.production.toml';
const DRY_RUN = process.argv.includes('--dry-run');

/** Stable registry ids keyed by LANE_CONFIG purpose. */
const LANE_REGISTRY_IDS = Object.freeze({
  codebase: 'pgv_codebase_1536',
  documents: 'pgv_documents_1536',
  memory: 'pgv_memory_1536',
  database_schema: 'pgv_database_schema_1536',
  deep_archive: 'pgv_deep_archive_1536',
});

/** Legacy rows superseded by LANE_CONFIG sync — deactivate, do not delete. */
const SUPERSEDED_LANE_IDS = [
  'pgv_codebase_chunks_1536',
  'pgv_codebase_files_1536',
  'pgv_deep_archive_3072',
];

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

function sqlLiteral(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function buildDescription(purpose, cfg) {
  const parts = [
    `purpose=${purpose}`,
    `ssot=${cfg.ssot}`,
    cfg.table ? `table=${cfg.table}` : null,
    cfg.vectorize ? `vectorize=${cfg.vectorize}` : null,
    `returns=${cfg.returns}`,
    cfg.reindex_script ? `reindex=${cfg.reindex_script}` : null,
    cfg.filters && Object.keys(cfg.filters).length ? `filters=${JSON.stringify(cfg.filters)}` : null,
    'mirror=vectorize-lane-config.js',
  ];
  return parts.filter(Boolean).join(' · ');
}

function resolveTableName(cfg) {
  if (cfg.table) return cfg.table;
  if (cfg.vectorize) return `vectorize:${cfg.vectorize}`;
  return `lane:${cfg.ssot}`;
}

function buildLaneRow(purpose, cfg) {
  const id = LANE_REGISTRY_IDS[purpose] || `pgv_${purpose}_1536`;
  return {
    id,
    schema_name: cfg.ssot === 'vectorize' ? 'cloudflare' : 'agentsam',
    table_name: resolveTableName(cfg),
    purpose,
    dimensions: 1536,
    metric: 'cosine',
    embedding_model: 'text-embedding-3-large',
    size_label: null,
    size_bytes: null,
    is_active: 1,
    is_archive: cfg.ssot === 'vectorize' || purpose === 'deep_archive' ? 1 : 0,
    description: buildDescription(purpose, cfg),
  };
}

function upsertSql(row) {
  return `INSERT INTO agentsam_pgvector_lane_registry (
  id, schema_name, table_name, purpose, dimensions, metric, embedding_model,
  size_label, size_bytes, is_active, is_archive, description, updated_at
) VALUES (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.schema_name)},
  ${sqlLiteral(row.table_name)},
  ${sqlLiteral(row.purpose)},
  ${row.dimensions},
  ${sqlLiteral(row.metric)},
  ${sqlLiteral(row.embedding_model)},
  ${row.size_label == null ? 'NULL' : sqlLiteral(row.size_label)},
  ${row.size_bytes == null ? 'NULL' : row.size_bytes},
  ${row.is_active},
  ${row.is_archive},
  ${sqlLiteral(row.description)},
  datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  schema_name = excluded.schema_name,
  table_name = excluded.table_name,
  purpose = excluded.purpose,
  dimensions = excluded.dimensions,
  metric = excluded.metric,
  embedding_model = excluded.embedding_model,
  is_active = excluded.is_active,
  is_archive = excluded.is_archive,
  description = excluded.description,
  updated_at = datetime('now');`;
}

function deactivateSupersededSql() {
  const ids = SUPERSEDED_LANE_IDS.map(sqlLiteral).join(', ');
  return `UPDATE agentsam_pgvector_lane_registry
SET is_active = 0,
    table_name = table_name || '_retired_' || id,
    description = COALESCE(description, '') || ' · superseded by vectorize-lane-config.js sync',
    updated_at = datetime('now')
WHERE id IN (${ids})
  AND COALESCE(is_active, 1) = 1;`;
}

function d1Execute(sql) {
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, '--remote', '-c', WRANGLER_CFG, '--command', sql],
    { cwd: ROOT, encoding: 'utf8', env: process.env, stdio: 'inherit' },
  );
}

function main() {
  loadEnvCloudflare();
  const statements = [];
  statements.push(deactivateSupersededSql());
  for (const [purpose, cfg] of Object.entries(LANE_CONFIG)) {
    statements.push(upsertSql(buildLaneRow(purpose, cfg)));
  }

  if (DRY_RUN) {
    console.log('-- dry-run: lane registry sync SQL --');
    for (const sql of statements) console.log(`${sql}\n`);
    return;
  }

  for (const sql of statements) {
    d1Execute(sql);
  }
  console.log(`✓ Synced ${Object.keys(LANE_CONFIG).length} lanes to agentsam_pgvector_lane_registry (${DB})`);
}

main();
