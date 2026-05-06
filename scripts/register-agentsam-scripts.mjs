#!/usr/bin/env node
/**
 * Register curated scripts/*.sh rows into D1 agentsam_scripts (Workspace ws_inneranimalmedia).
 * Uses Wrangler remote execute with a generated SQL file.
 *
 * Usage: node scripts/register-agentsam-scripts.mjs --dry-run | --apply
 */
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { execFileSync } from 'child_process';
import { repoRoot } from './lib/supabase-deploy-paths.mjs';
import { loadDotEnvCloudflare } from './lib/supabase-deploy-context.mjs';
import { SCRIPT_ROWS, WORKSPACE_ID } from './lib/agentsam-scripts-registry.mjs';

function sqlEscape(s) {
  return String(s ?? '').replace(/'/g, "''");
}

function scriptId(file) {
  const base = file.replace(/\.sh$/i, '').replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
  return `ascr_${base}`;
}

function buildSql(rows) {
  const ts = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  const valueLines = [];
  for (const r of rows) {
    const id = scriptId(r.file);
    const path = `scripts/${r.file}`;
    const rb = r.run_before != null ? `'${sqlEscape(r.run_before)}'` : 'NULL';
    const ra = r.run_after != null ? `'${sqlEscape(r.run_after)}'` : 'NULL';
    const nw = r.never_run_with != null ? `'${sqlEscape(r.never_run_with)}'` : 'NULL';
    const pf = r.preferred_for != null ? `'${sqlEscape(r.preferred_for)}'` : 'NULL';
    const nt = r.notes != null ? `'${sqlEscape(r.notes)}'` : 'NULL';

    valueLines.push(
      `(${[
        `'${sqlEscape(id)}'`,
        `'${sqlEscape(WORKSPACE_ID)}'`,
        `'${sqlEscape(r.name)}'`,
        `'${sqlEscape(path)}'`,
        `'${sqlEscape(r.description)}'`,
        `'${sqlEscape(r.purpose)}'`,
        `'bash'`,
        String(r.requires_env ?? 1),
        String(r.owner_only ?? 1),
        String(r.safe_to_run ?? 1),
        rb,
        ra,
        nw,
        pf,
        nt,
        '1',
        ts,
        ts,
      ].join(', ')})`,
    );
  }

  const cols = [
    'id',
    'workspace_id',
    'name',
    'path',
    'description',
    'purpose',
    'runner',
    'requires_env',
    'owner_only',
    'safe_to_run',
    'run_before',
    'run_after',
    'never_run_with',
    'preferred_for',
    'notes',
    'is_active',
    'created_at',
    'updated_at',
  ].join(', ');

  return `INSERT INTO agentsam_scripts (${cols}) VALUES
${valueLines.join(',\n')}
ON CONFLICT(id) DO UPDATE SET
  workspace_id=excluded.workspace_id,
  name=excluded.name,
  path=excluded.path,
  description=excluded.description,
  purpose=excluded.purpose,
  runner=excluded.runner,
  requires_env=excluded.requires_env,
  owner_only=excluded.owner_only,
  safe_to_run=excluded.safe_to_run,
  run_before=excluded.run_before,
  run_after=excluded.run_after,
  never_run_with=excluded.never_run_with,
  preferred_for=excluded.preferred_for,
  notes=excluded.notes,
  is_active=excluded.is_active,
  updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'));`;
}

function wranglerFileArgs(repoRoot, sqlPath) {
  const wrapper = resolve(repoRoot, 'scripts/with-cloudflare-env.sh');
  return [
    wrapper,
    [
      'npx',
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--file',
      sqlPath,
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ];
}

function main() {
  const apply = process.argv.includes('--apply');
  const dryFlag = process.argv.includes('--dry-run');
  const effectiveDry = dryFlag || !apply;

  const root = repoRoot();
  loadDotEnvCloudflare(root);

  const rows = [];
  const missing = [];
  for (const def of SCRIPT_ROWS) {
    const fp = join(root, 'scripts', def.file);
    if (!existsSync(fp)) missing.push(def.file);
    else rows.push(def);
  }

  if (missing.length) {
    console.warn('[agentsam-scripts] Missing local files (skipped):', missing.join(', '));
  }

  if (!rows.length) {
    console.error('[agentsam-scripts] No local script files matched — abort');
    process.exit(1);
  }

  const sql = buildSql(rows);

  if (effectiveDry) {
    console.log('[agentsam-scripts] dry-run — would upsert', rows.length, 'rows');
    console.log(sql.slice(0, 12000));
    if (sql.length > 12000) console.log('\n... [truncated]');
    process.exit(0);
  }

  const tmp = join(root, `.tmp-agentsam-scripts-${Date.now()}.sql`);
  writeFileSync(tmp, sql, 'utf8');
  try {
    const [wrapper, args, opts] = wranglerFileArgs(root, tmp);
    execFileSync(wrapper, args, opts);
    console.log('[agentsam-scripts] Upserted', rows.length, 'rows via D1 remote');
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

main();
