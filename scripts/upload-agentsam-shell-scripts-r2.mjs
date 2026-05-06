#!/usr/bin/env node
/**
 * Upload registry-listed scripts/*.sh to R2 bucket inneranimalmedia under scripts/<filename>.
 * Uses wrangler r2 object put (same pattern as sync-scripts-to-r2.sh).
 * Writes analytics/deploys/latest-script-upload-inventory.json (gitignored dir).
 *
 * Usage: node scripts/upload-agentsam-shell-scripts-r2.mjs [--dry-run]
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { repoRoot } from './lib/supabase-deploy-paths.mjs';
import { loadDotEnvCloudflare } from './lib/supabase-deploy-context.mjs';
import { SCRIPT_ROWS } from './lib/agentsam-scripts-registry.mjs';

const BUCKET = 'inneranimalmedia';
const PREFIX = 'scripts/';
const PUBLIC_BASE = 'https://assets.inneranimalmedia.com';

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const root = repoRoot();
  loadDotEnvCloudflare(root);

  const wrapper = resolve(root, 'scripts/with-cloudflare-env.sh');
  const keys = [];
  let ok = 0;

  for (const row of SCRIPT_ROWS) {
    const fp = join(root, 'scripts', row.file);
    if (!existsSync(fp)) {
      console.warn('[upload-scripts] missing local file, skip:', row.file);
      continue;
    }
    const key = `${PREFIX}${row.file}`;
    keys.push(key);
    if (dryRun) continue;

    try {
      execFileSync(
        wrapper,
        [
          'npx',
          'wrangler',
          'r2',
          'object',
          'put',
          `${BUCKET}/${key}`,
          '--file',
          fp,
          '--content-type',
          'text/x-shellscript',
          '--remote',
          '-c',
          'wrangler.production.toml',
        ],
        { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      );
      ok += 1;
    } catch (e) {
      console.warn('[upload-scripts] failed', row.file, e?.message || e);
    }
  }

  const outDir = join(root, 'analytics', 'deploys');
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* ignore */
  }

  const inventory = {
    bucket_name: BUCKET,
    prefix: PREFIX,
    uploaded_count: dryRun ? 0 : ok,
    planned_count: keys.length,
    uploaded_keys: keys,
    public_urls: keys.map((k) => `${PUBLIC_BASE}/${k}`),
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
  };

  writeFileSync(join(outDir, 'latest-script-upload-inventory.json'), JSON.stringify(inventory, null, 2));
  console.log(JSON.stringify(inventory, null, 2));
}

main();
