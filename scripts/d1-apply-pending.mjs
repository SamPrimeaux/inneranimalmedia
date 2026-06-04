#!/usr/bin/env node
/**
 * Diff migrations/*.sql (numeric, >= min) vs remote d1_migrations.name; optionally apply pending.
 *
 * Uses wrangler `d1 execute --file` — never `d1 migrations apply` (broken on prod ledger).
 *
 * Usage:
 *   node scripts/d1-apply-pending.mjs              # dry-run (lists pending, exit 1 if any)
 *   node scripts/d1-apply-pending.mjs --apply      # apply all pending in scope
 *   node scripts/d1-apply-pending.mjs --register-only --from 450 --to 522
 *
 * Env:
 *   D1_MIGRATION_MIN=450          numeric floor (default 450)
 *   D1_ALLOW_DESTRUCTIVE=1        allow DELETE/DROP migrations (deploy:full defaults to 1; set 0 to block)
 *   SKIP_D1_MIGRATIONS=1          (deploy) skip step entirely
 */
import { resolve } from 'path';
import {
  DEFAULT_MIN_NUMERIC,
  isDestructiveMigration,
  listDiskMigrations,
  loadAppliedMigrationNames,
  diffPending,
  readMigrationContent,
  registerMigration,
  runD1MigrationFile,
  parseMigrationNumericPrefix,
} from './lib/d1-migration-ledger.mjs';

const repoRoot = resolve(import.meta.dirname, '..');

function usage() {
  console.log(`Usage: node scripts/d1-apply-pending.mjs [options]

Options:
  --dry-run           List pending migrations (default)
  --apply             Execute pending migration files and register in d1_migrations
  --register-only     Register ledger rows without executing SQL
  --from <n>          Numeric floor (default ${DEFAULT_MIN_NUMERIC} or D1_MIGRATION_MIN)
  --to <n>            Numeric ceiling (optional)
  --allow-destructive   Apply/register destructive migrations (or D1_ALLOW_DESTRUCTIVE=1)
  -h, --help          Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    mode: 'dry-run',
    minNumeric: Number(process.env.D1_MIGRATION_MIN || DEFAULT_MIN_NUMERIC),
    maxNumeric: null,
    allowDestructive: process.env.D1_ALLOW_DESTRUCTIVE === '1',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--apply') {
      opts.mode = 'apply';
    } else if (arg === '--dry-run') {
      opts.mode = 'dry-run';
    } else if (arg === '--register-only') {
      opts.mode = 'register-only';
    } else if (arg === '--allow-destructive') {
      opts.allowDestructive = true;
    } else if (arg === '--from') {
      opts.minNumeric = Number(argv[++i]);
    } else if (arg === '--to') {
      opts.maxNumeric = Number(argv[++i]);
    } else {
      console.error(`Unknown argument: ${arg}`);
      opts.help = true;
    }
  }
  return opts;
}

function filterByNumericRange(filenames, minNumeric, maxNumeric) {
  return filenames.filter((f) => {
    const n = parseMigrationNumericPrefix(f);
    if (n == null) return false;
    if (Number.isFinite(minNumeric) && n < minNumeric) return false;
    if (maxNumeric != null && Number.isFinite(maxNumeric) && n > maxNumeric) return false;
    return true;
  });
}

function partitionDestructive(repoRoot, pending, allowDestructive) {
  const safe = [];
  const blocked = [];
  for (const file of pending) {
    const content = readMigrationContent(repoRoot, file);
    if (isDestructiveMigration(content) && !allowDestructive) {
      blocked.push(file);
    } else {
      safe.push(file);
    }
  }
  return { safe, blocked };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }

  const disk = listDiskMigrations(repoRoot, { minNumeric: opts.minNumeric });
  const applied = loadAppliedMigrationNames(repoRoot);
  let pending = diffPending(disk, applied);
  pending = filterByNumericRange(pending, opts.minNumeric, opts.maxNumeric);

  if (!pending.length) {
    console.log(
      `[d1-apply-pending] No pending migrations (scope >= ${opts.minNumeric}${
        opts.maxNumeric != null ? `, <= ${opts.maxNumeric}` : ''
      }; tracked ${disk.length}, applied ${applied.size}).`,
    );
    process.exit(0);
  }

  const { safe, blocked } = partitionDestructive(repoRoot, pending, opts.allowDestructive);

  console.log(
    `[d1-apply-pending] ${pending.length} pending (mode=${opts.mode}, min=${opts.minNumeric}${
      opts.maxNumeric != null ? `, max=${opts.maxNumeric}` : ''
    })`,
  );
  for (const file of pending) {
    const tag =
      blocked.includes(file) && opts.mode !== 'register-only' && !opts.allowDestructive
        ? 'BLOCKED(destructive)'
        : 'pending';
    console.log(`  - ${file} [${tag}]`);
  }

  if (opts.mode === 'dry-run') {
    process.exit(pending.length ? 1 : 0);
  }

  const queue =
    opts.mode === 'register-only'
      ? pending
      : opts.allowDestructive
        ? pending
        : safe;

  if (!queue.length && blocked.length && opts.mode === 'apply' && !opts.allowDestructive) {
    console.error(
      `[d1-apply-pending] ${blocked.length} destructive migration(s) blocked. Re-run with --allow-destructive or D1_ALLOW_DESTRUCTIVE=1.`,
    );
    process.exit(2);
  }

  for (const file of queue) {
    process.stdout.write(`[d1-apply-pending] ${opts.mode === 'register-only' ? 'register' : 'apply'} ${file}… `);
    try {
      if (opts.mode !== 'register-only') {
        await runD1MigrationFile(repoRoot, file);
      }
      await registerMigration(repoRoot, file);
      console.log('ok');
    } catch (err) {
      console.log('FAILED');
      console.error(String(err?.stderr || err?.message || err));
      process.exit(1);
    }
  }

  if (blocked.length && opts.mode === 'apply' && !opts.allowDestructive) {
    console.error(
      `[d1-apply-pending] Applied ${queue.length} safe migration(s); ${blocked.length} destructive migration(s) still pending. Re-run with --allow-destructive or D1_ALLOW_DESTRUCTIVE=1.`,
    );
    process.exit(queue.length > 0 ? 0 : 2);
  }

  console.log(`[d1-apply-pending] Done (${queue.length} migration(s)).`);
}

main().catch((err) => {
  console.error('[d1-apply-pending] fatal:', err?.message || err);
  process.exit(1);
});
