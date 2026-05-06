#!/usr/bin/env node
/**
 * Build a deterministic deploy manifest from a local build directory (hashes + sizes).
 *
 * Usage:
 *   node scripts/build-r2-deploy-manifest.mjs --dist dashboard/dist --bucket inneranimalmedia \
 *     --prefix static/dashboard/agent --deploy-id deploy_abc123
 *
 * Writes: analytics/deploys/<deploy_id>/r2-manifest.json
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import pathMod from 'path';
import { fileURLToPath } from 'url';
import { repoRootDefault, sha256File, loadEnvCloudflare } from './lib/r2-inventory-core.mjs';

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
    prefix: get('--prefix', 'static/dashboard/agent').replace(/^\/+|\/+$/g, ''),
    deployId: get('--deploy-id', `deploy_${Date.now()}`),
    tenantId: get('--tenant-id', process.env.TENANT_ID || 'tenant_sam_primeaux'),
    workspaceId: get('--workspace-id', process.env.WORKSPACE_ID || 'ws_inneranimalmedia'),
    projectId: get('--project-id', process.env.DOCUMENTS_PROJECT_ID || 'inneranimalmedia'),
    outDir: get('--out-dir', ''),
  };
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

function contentTypeForKey(key) {
  const lower = key.toLowerCase();
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function main() {
  loadEnvCloudflare(root);
  const o = parseArgs();
  const absDist = pathMod.isAbsolute(o.dist) ? o.dist : pathMod.join(root, o.dist);
  const outRoot = o.outDir || pathMod.join(root, 'analytics', 'deploys', o.deployId);
  mkdirSync(outRoot, { recursive: true });

  const files = walkFiles(absDist);
  /** @type {{ object_key: string, size_bytes: number, content_sha256: string, content_type: string }[]} */
  const objects = [];
  let total = 0;
  for (const fp of files) {
    const rel = pathMod.relative(absDist, fp).split(pathMod.sep).join('/');
    const object_key = `${o.prefix}/${rel}`.replace(/\/+/g, '/');
    const size_bytes = statSync(fp).size;
    total += size_bytes;
    const hash = sha256File(fp);
    objects.push({
      object_key,
      size_bytes,
      content_sha256: hash,
      content_type: contentTypeForKey(object_key),
    });
  }

  const manifest = {
    version: 1,
    deploy_id: o.deployId,
    bucket_name: o.bucket,
    prefix: o.prefix,
    tenant_id: o.tenantId,
    workspace_id: o.workspaceId,
    project_id: o.projectId,
    created_at: new Date().toISOString(),
    objects,
    object_count: objects.length,
    total_size_bytes: total,
    live_url_base: `https://inneranimalmedia.com`,
    r2_public_url_pattern: `https://pub-<account>.r2.dev/${o.bucket}/{key}`,
  };

  const outPath = pathMod.join(outRoot, 'r2-manifest.json');
  writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`objects=${objects.length} bytes=${total}`);
}

main();
