#!/usr/bin/env node
/**
 * post-services-sw-manifest-ingest.mjs — optional services control-plane SW manifest POST.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/post-services-sw-manifest-ingest.mjs
 *   SKIP_SERVICES_SW_INGEST=1 ./scripts/with-cloudflare-env.sh node scripts/post-services-sw-manifest-ingest.mjs
 *   STRICT_SERVICES_SW_INGEST=1 ./scripts/with-cloudflare-env.sh node scripts/post-services-sw-manifest-ingest.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const INGEST_URL = 'https://services.inneranimalmedia.com/api/deploy/ingest';
const TIMEOUT_MS = 15_000;

const args = process.argv.slice(2);
const manifestArg = args.find((a) => a.startsWith('--manifest='));
const manifestPath = manifestArg
  ? resolve(manifestArg.split('=').slice(1).join('='))
  : resolve(ROOT, '.deploy-sw-tiered-manifest.json');

const skip = process.env.SKIP_SERVICES_SW_INGEST === '1';
const strict = process.env.STRICT_SERVICES_SW_INGEST === '1';

function warnOptional(msg) {
  console.warn(`⚠ ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

if (skip) {
  console.log('[services-sw-ingest] SKIP_SERVICES_SW_INGEST=1 — skipping services SW manifest ingest');
  process.exit(0);
}

const token = String(process.env.PUSH_SERVICE_TOKEN || '').trim();
if (!token) {
  console.log('[services-sw-ingest] PUSH_SERVICE_TOKEN unset — skipping services SW manifest ingest');
  process.exit(0);
}

if (!existsSync(manifestPath)) {
  const msg = `manifest not found: ${manifestPath}`;
  if (strict) fail(msg);
  warnOptional(`${msg}; continuing because this step is optional.`);
  process.exit(0);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  const msg = `invalid manifest JSON (${manifestPath}): ${err?.message || err}`;
  if (strict) fail(msg);
  warnOptional(`Services SW manifest ingest failed or timed out; continuing because this step is optional.`);
  console.warn(`[services-sw-ingest] ${msg}`);
  process.exit(0);
}

// Merge PWA build receipt from publish-pwa-r2.mjs (written after Vite + bump-cache).
const pwaMetaPath = resolve(ROOT, 'dashboard/dist/pwa-build-meta.json');
if (existsSync(pwaMetaPath)) {
  try {
    const pwaMeta = JSON.parse(readFileSync(pwaMetaPath, 'utf8'));
    manifest.pwa = {
      inline_workbox: pwaMeta.inline_workbox ?? true,
      workbox_files: pwaMeta.workbox_files ?? [],
      workbox_import: pwaMeta.workbox_import ?? null,
      artifacts: pwaMeta.artifacts ?? [],
      published_at: pwaMeta.published_at ?? null,
      r2_prefix: pwaMeta.r2_prefix ?? 'static/dashboard',
    };
    if (pwaMeta.git_sha && !manifest.git_sha) manifest.git_sha = pwaMeta.git_sha;
    console.log(`[services-sw-ingest] merged pwa-build-meta (inline_workbox=${manifest.pwa.inline_workbox})`);
  } catch (err) {
    console.warn(`[services-sw-ingest] pwa-build-meta merge skipped: ${err?.message || err}`);
  }
}

const cacheBust = String(manifest?.cache_bust || '').trim();
if (!cacheBust) {
  const msg = 'manifest missing cache_bust — skipping ingest';
  console.log(`[services-sw-ingest] ${msg}`);
  process.exit(0);
}

console.log('→ Services SW manifest ingest (optional control-plane)…');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

let response;
try {
  response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(manifest),
    signal: controller.signal,
  });
} catch (err) {
  clearTimeout(timer);
  const reason = err?.name === 'AbortError' ? 'timed out after 15s' : (err?.message || String(err));
  if (strict) fail(`Services SW manifest ingest failed (${reason})`);
  warnOptional('Services SW manifest ingest failed or timed out; continuing because this step is optional.');
  console.warn(`[services-sw-ingest] ${reason}`);
  process.exit(0);
}

clearTimeout(timer);

if (!response.ok) {
  let body = '';
  try {
    body = (await response.text()).slice(0, 500);
  } catch {
    body = '';
  }
  const detail = `HTTP ${response.status}${body ? ` — ${body}` : ''}`;
  if (strict) fail(`Services SW manifest ingest failed (${detail})`);
  warnOptional('Services SW manifest ingest failed or timed out; continuing because this step is optional.');
  console.warn(`[services-sw-ingest] ${detail}`);
  process.exit(0);
}

console.log(`✓ Services SW manifest ingest OK (cache_bust=${cacheBust})`);
process.exit(0);
