#!/usr/bin/env node
/**
 * Upload PWA root assets from dashboard/dist → R2 static/dashboard/*.
 * Invoked by deploy-frontend.sh after Vite build + bump-cache.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import pathMod from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { buildPwaPublishPlan, PWA_R2_PREFIX } from './lib/pwa-deploy-artifacts.mjs';
import { readCacheBustFromIndexHtml } from './lib/pwa-sw-manifest-tiers.mjs';

const ROOT = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = argv.slice(2);
  const get = (name, def = '') => {
    const i = a.indexOf(name);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    dist: get('--dist', 'dashboard/dist'),
    bucket: get('--bucket', 'inneranimalmedia'),
    toml: get('-c', get('--config', 'wrangler.production.toml')),
    gitSha: get('--git-sha', ''),
    dryRun: a.includes('--dry-run'),
  };
}

function resolveGitSha(explicit) {
  const trimmed = String(explicit || '').trim();
  if (trimmed) return trimmed;
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() : '';
}

function runWranglerPut({ bucket, r2Key, filePath, contentType, toml, dryRun }) {
  const label = `r2://${bucket}/${r2Key}`;
  if (dryRun) {
    console.log(`[publish-pwa] dry-run put ${label} ← ${filePath}`);
    return;
  }
  const script = pathMod.join(ROOT, 'scripts/with-cloudflare-env.sh');
  const args = [
    script,
    'npx',
    'wrangler',
    'r2',
    'object',
    'put',
    `${bucket}/${r2Key}`,
    '--file',
    filePath,
    '--content-type',
    contentType,
    '-c',
    toml,
    '--remote',
  ];
  const res = spawnSync(args[0], args.slice(1), { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`[publish-pwa] wrangler put failed for ${label}`);
  }
}

function main() {
  const opts = parseArgs(process.argv);
  const absDist = pathMod.isAbsolute(opts.dist) ? opts.dist : pathMod.join(ROOT, opts.dist);
  if (!existsSync(absDist)) {
    throw new Error(`[publish-pwa] dist not found: ${absDist}`);
  }

  const plan = buildPwaPublishPlan(absDist);
  const indexPath = pathMod.join(absDist, 'index.html');
  const cache_bust = readCacheBustFromIndexHtml(indexPath);
  const git_sha = resolveGitSha(opts.gitSha);

  console.log(
    `[publish-pwa] inline_workbox=${plan.inline_workbox} workbox_files=${plan.workbox_files.join(',') || '(none)'}`,
  );

  for (const item of plan.artifacts) {
    const src = pathMod.join(absDist, item.file);
    if (!existsSync(src)) {
      throw new Error(`[publish-pwa] missing artifact: ${src}`);
    }
    runWranglerPut({
      bucket: opts.bucket,
      r2Key: item.r2Key,
      filePath: src,
      contentType: item.contentType,
      toml: opts.toml,
      dryRun: opts.dryRun,
    });
    console.log(`[publish-pwa] ✓ ${item.publicPath} → ${item.r2Key}`);
  }

  const meta = {
    cache_bust,
    git_sha,
    published_at: new Date().toISOString(),
    inline_workbox: plan.inline_workbox,
    workbox_import: plan.workbox_import,
    workbox_files: plan.workbox_files,
    artifacts: plan.artifacts.map((a) => a.publicPath),
    r2_prefix: PWA_R2_PREFIX,
  };

  const metaLocal = pathMod.join(absDist, 'pwa-build-meta.json');
  writeFileSync(metaLocal, `${JSON.stringify(meta, null, 2)}\n`);

  if (!opts.dryRun) {
    runWranglerPut({
      bucket: opts.bucket,
      r2Key: `${PWA_R2_PREFIX}/pwa-build-meta.json`,
      filePath: metaLocal,
      contentType: 'application/json; charset=utf-8',
      toml: opts.toml,
      dryRun: false,
    });
    console.log(`[publish-pwa] ✓ pwa-build-meta.json cache_bust=${cache_bust}`);
  }
}

main();
