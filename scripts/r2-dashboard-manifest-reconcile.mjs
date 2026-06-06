#!/usr/bin/env node
/**
 * Deterministic dashboard deploy cleanup: build manifest from dist, diff against
 * previous manifest in R2, delete stale keys under prefix, upload new previous manifest.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *
 * Usage:
 *   node scripts/r2-dashboard-manifest-reconcile.mjs \
 *     --dist dashboard/dist --bucket inneranimalmedia --prefix static/dashboard/app
 *
 *   node scripts/r2-dashboard-manifest-reconcile.mjs ... --dry-run
 *
 * Also builds tiered PWA manifest (tier0/1/2 + tier2_tabs) and uploads to R2
 * analytics/deploys/sw-manifest-tiered.json for services.inneranimalmedia.com ingest.
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { createReadStream, writeFileSync } from 'fs';
import { readdirSync, statSync, existsSync } from 'fs';
import pathMod from 'path';
import { fileURLToPath } from 'url';
import { AwsClient } from 'aws4fetch';
import { loadEnvCloudflare, repoRootDefault } from './lib/r2-inventory-core.mjs';
import { buildSwManifestTiers } from './lib/pwa-sw-manifest-tiers.mjs';

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
const root = repoRootDefault;

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (name, def = '') => {
    const i = a.indexOf(name);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    dist: get('--dist', 'dashboard/dist'),
    bucket: get('--bucket', 'inneranimalmedia'),
    prefix: get('--prefix', 'static/dashboard/app').replace(/^\/+|\/+$/g, ''),
    previousKey: get('--previous-key', 'analytics/deploys/previous-manifest.json'),
    swTieredKey: get('--sw-tiered-key', 'analytics/deploys/sw-manifest-tiered.json'),
    gitSha: get('--git-sha', ''),
    dryRun: a.includes('--dry-run'),
  };
}

function resolveGitSha(explicit) {
  const trimmed = String(explicit || '').trim();
  if (trimmed) return trimmed;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function walkFiles(absDir, files = []) {
  if (!existsSync(absDir)) return files;
  for (const name of readdirSync(absDir)) {
    const p = pathMod.join(absDir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, files);
    else files.push(p);
  }
  return files;
}

function sha256FileAsync(absPath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(absPath)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

async function buildManifest(absDist, prefix) {
  const files = walkFiles(absDist);
  /** @type {{ object_key: string, content_sha256: string, size_bytes: number }[]} */
  const objects = [];
  let total = 0;
  for (const fp of files) {
    const rel = pathMod.relative(absDist, fp).split(pathMod.sep).join('/');
    const object_key = `${prefix}/${rel}`.replace(/\/+/g, '/');
    const size_bytes = statSync(fp).size;
    total += size_bytes;
    const content_sha256 = await sha256FileAsync(fp);
    objects.push({ object_key, content_sha256, size_bytes });
  }
  return {
    version: 2,
    prefix,
    created_at: new Date().toISOString(),
    objects,
    object_count: objects.length,
    total_size_bytes: total,
  };
}

function r2Client() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY');
  }
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const aws = new AwsClient({ accessKeyId, secretAccessKey });
  return { aws, endpoint };
}

function objectUrl(endpoint, bucket, key) {
  const encPath = key.split('/').map(encodeURIComponent).join('/');
  return `${endpoint}/${bucket}/${encPath}`;
}

async function fetchPreviousManifest({ aws, endpoint }, bucket, key) {
  const url = objectUrl(endpoint, bucket, key);
  const res = await aws.fetch(url, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET ${key} failed ${res.status}: ${t.slice(0, 300)}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON in ${key}: ${e?.message ?? e}`);
  }
}

async function putManifest({ aws, endpoint }, bucket, key, manifest) {
  const url = objectUrl(endpoint, bucket, key);
  const body = JSON.stringify(manifest, null, 2);
  const res = await aws.fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PUT ${key} failed ${res.status}: ${t.slice(0, 300)}`);
  }
}

/**
 * @param {string} prefix
 * @param {{ objects?: { object_key?: string }[] }} manifest
 */
function keysFromManifest(prefix, manifest) {
  const listPrefix = `${prefix}/`;
  const keys = new Set();
  for (const o of manifest?.objects || []) {
    const k = o?.object_key;
    if (typeof k === 'string' && k.startsWith(listPrefix)) keys.add(k);
  }
  return keys;
}

async function deleteObject(client, bucket, key) {
  const url = objectUrl(client.endpoint, bucket, key);
  const res = await client.aws.fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DeleteObject ${key} failed ${res.status}: ${t.slice(0, 300)}`);
  }
}

async function main() {
  loadEnvCloudflare(root);
  const o = parseArgs();
  const absDist = pathMod.isAbsolute(o.dist) ? o.dist : pathMod.join(root, o.dist);
  if (!existsSync(absDist)) {
    throw new Error(`dist not found: ${absDist}`);
  }

  console.log(`[r2-manifest] building from ${absDist} prefix=${o.prefix}/`);
  const manifest = await buildManifest(absDist, o.prefix);
  console.log(`[r2-manifest] new manifest objects=${manifest.object_count} bytes=${manifest.total_size_bytes}`);

  const gitSha = resolveGitSha(o.gitSha);
  const swTiered = buildSwManifestTiers({ absDist, gitSha });
  console.log(
    `[r2-manifest] sw-tiered deploy_id=${swTiered.deploy_id} cache_bust=${swTiered.cache_bust} ` +
      `tier0=${swTiered.tier0.length} tier1=${swTiered.tier1.length} ` +
      `tier2_routes=${Object.keys(swTiered.tier2).length} tier2_tabs=${Object.keys(swTiered.tier2_tabs).length}`,
  );

  const client = r2Client();
  const previous = await fetchPreviousManifest(client, o.bucket, o.previousKey);
  const newKeys = keysFromManifest(o.prefix, manifest);
  const prevKeys = previous ? keysFromManifest(o.prefix, previous) : new Set();

  const stale = [...prevKeys].filter((k) => !newKeys.has(k));
  console.log(
    `[r2-manifest] previous=${prevKeys.size} new=${newKeys.size} stale_to_delete=${stale.length}`,
  );

  if (stale.length) {
    if (o.dryRun) {
      for (const k of stale.slice(0, 20)) console.log(`  [dry-run] would delete ${k}`);
      if (stale.length > 20) console.log(`  ... and ${stale.length - 20} more`);
    } else {
      for (const key of stale) {
        await deleteObject(client, o.bucket, key);
        console.log(`  deleted ${key}`);
      }
    }
  }

  if (!o.dryRun) {
    await putManifest(client, o.bucket, o.previousKey, manifest);
    console.log(`[r2-manifest] uploaded ${o.previousKey}`);
    await putManifest(client, o.bucket, o.swTieredKey, swTiered);
    console.log(`[r2-manifest] uploaded ${o.swTieredKey}`);
    writeFileSync(pathMod.join(root, '.deploy-sw-tiered-manifest.json'), JSON.stringify(swTiered, null, 2));
  } else {
    console.log(`[r2-manifest] dry-run — skipped upload of ${o.previousKey}`);
    console.log(`[r2-manifest] dry-run — skipped upload of ${o.swTieredKey}`);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
