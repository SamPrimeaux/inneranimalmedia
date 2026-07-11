#!/usr/bin/env node
/**
 * Cloudflare Workers Builds — build step (runs on CF, not Mac/VM).
 *
 * Mac-free ship: push/ship:remote → this build → deploy:fast:cf
 *
 * Skips legacy CMS vendor npm reinstall (react@18 UMD) — vendor files are
 * already in dashboard/public/cms/vendor and cms-editor is Vite-built.
 * Set IAM_BUILD_WORKER_ONLY=1 to skip Vite entirely.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import pathMod from 'node:path';
import { fileURLToPath } from 'node:url';

const root = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..');
const dist = pathMod.join(root, 'dashboard/dist');
const workerOnly = String(process.env.IAM_BUILD_WORKER_ONLY || '') === '1';

function run(cmd, args, label, envExtra = {}) {
  console.log(`[smart-build] ${label}: ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...envExtra },
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

if (workerOnly) {
  console.log('[smart-build] IAM_BUILD_WORKER_ONLY=1 — skipping Vite (worker-only)');
  process.exit(0);
}

console.log('[smart-build] full ship build — Vite + cache bump (CF Builds / deploy:fast)');
if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
}

// Legacy CMS Babel UMD is unused by Vite cms-editor — never npm install react@18 on CF Builds (~19s waste).
if (process.env.CI === 'true' || process.env.WORKERS_CI === '1' || process.env.CF_PAGES === '1' || process.env.SKIP_CMS_VENDOR_COPY === '1') {
  console.log('[smart-build] skip copy-cms-vendor (CI / SKIP_CMS_VENDOR_COPY)');
} else {
  const vendorReact = pathMod.join(root, 'dashboard/public/cms/vendor/react.production.min.js');
  if (existsSync(vendorReact)) {
    console.log('[smart-build] CMS vendor already present — skip npm install');
  } else {
    run('bash', [pathMod.join(root, 'scripts/copy-cms-vendor.sh')], 'copy-cms-vendor');
  }
}

run('npm', ['run', 'build:vite-only'], 'vite');
run('node', ['scripts/bump-cache.js'], 'bump-cache');

if (!existsSync(pathMod.join(dist, 'index.html'))) {
  console.error(`[smart-build] missing ${dist}/index.html after Vite`);
  process.exit(1);
}

console.log('[smart-build] ✓ dashboard/dist ready for deploy:fast R2 delta');
