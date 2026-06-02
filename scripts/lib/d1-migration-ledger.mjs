/**
 * D1 migration ledger helpers — diff migrations/*.sql vs d1_migrations.name.
 * Remote apply uses wrangler d1 execute --file (not migrations apply).
 */
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { runD1Query, runD1Exec, wranglerWrapperPath } from './d1-deploy-record.mjs';

const execFile = promisify(execFileCb);

export const D1_DB = 'inneranimalmedia-business';
export const WRANGLER_CFG = 'wrangler.production.toml';
export const MIGRATIONS_DIR = 'migrations';

/** Files we never auto-apply (WIP / one-off / non-numbered). */
export const MIGRATION_DENYLIST = new Set([
  'agentsam_schema_unify.sql',
  'supabase_semantic_code_search_1536.sql',
]);

/** Default numeric floor — ledger backfill + auto-apply scope (450+ sprint). */
export const DEFAULT_MIN_NUMERIC = 450;

const NUMERIC_MIGRATION_RE = /^(\d+)_.+\.sql$/;
const DESTRUCTIVE_RE =
  /\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b|\bDROP\s+INDEX\b|\bDROP\s+COLUMN\b|\bDELETE\s+FROM\b/i;

export function parseMigrationNumericPrefix(filename) {
  const m = String(filename).match(NUMERIC_MIGRATION_RE);
  return m ? Number.parseInt(m[1], 10) : null;
}

export function isTrackedMigrationFilename(filename) {
  const name = String(filename || '').trim();
  if (!name.endsWith('.sql')) return false;
  if (name.startsWith('_')) return false;
  if (MIGRATION_DENYLIST.has(name)) return false;
  return NUMERIC_MIGRATION_RE.test(name);
}

export function migrationSortKey(filename) {
  const n = parseMigrationNumericPrefix(filename);
  if (n == null) return [1, filename];
  return [0, n, filename];
}

export function sortMigrationFilenames(filenames) {
  return [...filenames].sort((a, b) => {
    const ka = migrationSortKey(a);
    const kb = migrationSortKey(b);
    for (let i = 0; i < 3; i += 1) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}

export function listDiskMigrations(repoRoot, { minNumeric = DEFAULT_MIN_NUMERIC } = {}) {
  const dir = resolve(repoRoot, MIGRATIONS_DIR);
  const files = readdirSync(dir).filter(isTrackedMigrationFilename);
  const min = Number(minNumeric);
  const filtered =
    Number.isFinite(min) && min > 0
      ? files.filter((f) => {
          const n = parseMigrationNumericPrefix(f);
          return n != null && n >= min;
        })
      : files;
  return sortMigrationFilenames(filtered);
}

export function loadAppliedMigrationNames(repoRoot) {
  const rows = runD1Query(repoRoot, 'SELECT name FROM d1_migrations');
  return new Set(rows.map((r) => String(r.name || '').trim()).filter(Boolean));
}

export function diffPending(diskFiles, appliedSet) {
  return diskFiles.filter((f) => !appliedSet.has(f));
}

export function readMigrationContent(repoRoot, filename) {
  return readFileSync(resolve(repoRoot, MIGRATIONS_DIR, filename), 'utf8');
}

export function isDestructiveMigration(content) {
  return DESTRUCTIVE_RE.test(String(content || ''));
}

export async function runD1MigrationFile(repoRoot, filename) {
  const rel = `./${MIGRATIONS_DIR}/${filename}`;
  const wrapper = wranglerWrapperPath(repoRoot);
  const args = [
    'npx',
    'wrangler',
    'd1',
    'execute',
    D1_DB,
    '--remote',
    '-c',
    WRANGLER_CFG,
    '--file',
    rel,
  ];
  await execFile(wrapper, args, {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
}

export async function registerMigration(repoRoot, filename) {
  await runD1Exec(
    repoRoot,
    `INSERT OR IGNORE INTO d1_migrations (name) VALUES ('${String(filename).replace(/'/g, "''")}')`,
  );
}

export function summarizePending(repoRoot, { minNumeric = DEFAULT_MIN_NUMERIC } = {}) {
  const disk = listDiskMigrations(repoRoot, { minNumeric });
  const applied = loadAppliedMigrationNames(repoRoot);
  const pending = diffPending(disk, applied);
  return { disk, applied, pending };
}
