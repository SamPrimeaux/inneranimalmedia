#!/usr/bin/env node
/**
 * Cloudflare Workers Builds — build step (runs on CF, not Mac/VM).
 *
 * Installs dashboard deps (vite lives there, not in root package.json),
 * builds with a raised heap (CF default ~2GB OOMs on this SPA), then bump-cache.
 *
 * Never use with-node-env-fallback here — it retries OOM 3× and has exited 0 on failure.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import pathMod from 'node:path';
import { fileURLToPath } from 'node:url';

const root = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..');
const dist = pathMod.join(root, 'dashboard/dist');
const dash = pathMod.join(root, 'dashboard');
const workerOnly = String(process.env.IAM_BUILD_WORKER_ONLY || '') === '1';

/** CF Builds / small VMs OOM around 2GB on this dashboard (excalidraw + realtimekit). */
const HEAP_MB = String(process.env.IAM_VITE_MAX_OLD_SPACE_MB || '8192').trim() || '8192';

function run(cmd, args, label, envExtra = {}) {
  console.log(`[smart-build] ${label}: ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...envExtra },
  });
  const code = res.status ?? 1;
  if (code !== 0) {
    console.error(`[smart-build] ✗ ${label} failed (exit ${code})`);
    process.exit(code);
  }
}

if (workerOnly) {
  console.log('[smart-build] IAM_BUILD_WORKER_ONLY=1 — skipping Vite (worker-only)');
  process.exit(0);
}

console.log(`[smart-build] full ship build — dashboard deps + Vite (heap=${HEAP_MB}MB) + bump-cache`);

// Root npm ci does not install dashboard/ (separate package). Vite is a dashboard devDependency.
const viteBin = pathMod.join(dash, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(viteBin)) {
  console.log('[smart-build] dashboard/node_modules/vite missing — npm ci --prefix dashboard --include=dev');
  run(
    'npm',
    ['ci', '--prefix', 'dashboard', '--include=dev', '--progress=false'],
    'dashboard-npm-ci',
    { NODE_ENV: 'development' },
  );
} else {
  console.log('[smart-build] dashboard vite present — skip dashboard npm ci');
}

if (!existsSync(viteBin)) {
  console.error('[smart-build] ✗ vite still missing after dashboard npm ci');
  process.exit(1);
}

if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
}

const nodeOpts = [process.env.NODE_OPTIONS, `--max-old-space-size=${HEAP_MB}`]
  .filter(Boolean)
  .join(' ')
  .trim();

// Direct vite — do not route through with-node-env-fallback (retry storm + bad exit codes).
run(
  'npm',
  ['--prefix', 'dashboard', 'run', 'build'],
  'vite',
  {
    NODE_ENV: 'production',
    NODE_OPTIONS: nodeOpts,
  },
);

if (!existsSync(pathMod.join(dist, 'index.html'))) {
  console.error(`[smart-build] ✗ missing ${dist}/index.html after Vite`);
  process.exit(1);
}

run('node', ['scripts/bump-cache.js'], 'bump-cache');
console.log('[smart-build] ✓ dashboard/dist ready for deploy:fast R2 delta');
