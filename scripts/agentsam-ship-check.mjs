#!/usr/bin/env node
/**
 * Dual-repo ship preflight (local CLI companion to agentsam_ship_check MCP tool).
 * Diffs migrations/*.sql in monorepo + MCP repo vs remote d1_migrations, then
 * statically validates pending SQL (same rules as MCP validateMigrationSql).
 *
 * Usage:
 *   node scripts/agentsam-ship-check.mjs
 *   node scripts/agentsam-ship-check.mjs --min-numeric=450
 *   SHIP_CHECK_MCP_ROOT=/path/to/inneranimalmedia-mcp-server node scripts/agentsam-ship-check.mjs
 *
 * Exit 0 = all lanes pass static validation (pending alone is OK / informational).
 * Exit 1 = validation failures or ledger read error.
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync } from 'fs';
import {
  listDiskMigrations,
  loadAppliedMigrationNames,
  diffPending,
  readMigrationContent,
  DEFAULT_MIN_NUMERIC,
} from './lib/d1-migration-ledger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_ROOT = resolve(__dirname, '..');
const MCP_ROOT =
  process.env.SHIP_CHECK_MCP_ROOT ||
  resolve(MAIN_ROOT, '../inneranimalmedia-mcp-server');

const DESTRUCTIVE_RE =
  /\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b|\bDROP\s+INDEX\b|\bDROP\s+COLUMN\b/i;
const MEMORY_INSERT_RE = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+agentsam_memory\b/i;
const MEMORY_ID_COL_RE = /\bmemory_id\b/i;

function parseArgs(argv) {
  let minNumeric = DEFAULT_MIN_NUMERIC;
  for (const a of argv) {
    if (a.startsWith('--min-numeric=')) minNumeric = Number(a.split('=')[1]) || minNumeric;
  }
  return { minNumeric };
}

function validateMigrationSql(sql, filename) {
  const content = String(sql || '');
  const issues = [];
  if (!content.trim()) issues.push({ code: 'EMPTY_SQL', severity: 'error', message: 'empty' });
  if (DESTRUCTIVE_RE.test(content) && !/\bIF\s+EXISTS\b/i.test(content)) {
    issues.push({ code: 'DESTRUCTIVE_UNGUARDED', severity: 'warn', message: 'destructive DDL' });
  }
  if (MEMORY_INSERT_RE.test(content) && !MEMORY_ID_COL_RE.test(content)) {
    issues.push({
      code: 'MEMORY_ID_REQUIRED',
      severity: 'error',
      message: 'agentsam_memory INSERT missing memory_id',
    });
  }
  const errors = issues.filter((i) => i.severity === 'error');
  return { ok: errors.length === 0, filename, issues };
}

function checkLane(label, repoRoot, applied, minNumeric) {
  if (!existsSync(resolve(repoRoot, 'migrations'))) {
    return { ok: false, label, repoRoot, error: 'migrations_dir_missing' };
  }
  const disk = listDiskMigrations(repoRoot, { minNumeric });
  const pending = diffPending(disk, applied);
  // Local CLI reads disk, so validate the full pending set; a deploy gate must never
  // report green for files it did not inspect.
  const validations = pending.map((f) => {
    const sql = readMigrationContent(repoRoot, f);
    return validateMigrationSql(sql, f);
  });
  const failures = validations.filter((v) => !v.ok);
  return {
    ok: failures.length === 0,
    label,
    repoRoot,
    tracked_count: disk.length,
    pending_count: pending.length,
    pending: pending.slice(0, 40),
    pending_truncated: pending.length > 40,
    validated_count: validations.length,
    validation_mode: 'static_lint',
    validation_failures: failures.length,
    failures: failures.map((f) => ({ filename: f.filename, issues: f.issues })),
  };
}

function main() {
  const { minNumeric } = parseArgs(process.argv.slice(2));
  let applied;
  try {
    applied = loadAppliedMigrationNames(MAIN_ROOT);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
    process.exit(1);
  }

  const lanes = [
    checkLane('main', MAIN_ROOT, applied, minNumeric),
    checkLane('mcp', MCP_ROOT, applied, minNumeric),
  ];
  const ok = lanes.every((l) => l.ok);
  const out = {
    ok,
    applied_count: applied.size,
    min_numeric: minNumeric,
    lanes,
    hint: ok
      ? null
      : { suggest: 'agentsam_d1_validate_migration', why: 'fix failing pending migrations before ship' },
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(ok ? 0 : 1);
}

main();
