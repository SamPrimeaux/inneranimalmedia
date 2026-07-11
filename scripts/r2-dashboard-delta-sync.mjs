#!/usr/bin/env node
/**
 * Content-addressed R2 dashboard sync (no rclone).
 *
 * Prefer S3 API (R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY) for parallel puts.
 * Fallback: wrangler r2 object put/get/delete (CF Builds API token lane).
 *
 * Usage:
 *   node scripts/r2-dashboard-delta-sync.mjs
 *   node scripts/r2-dashboard-delta-sync.mjs --dry-run
 *   node scripts/r2-dashboard-delta-sync.mjs --concurrency 16 --no-pwa
 */
import { createHash } from 'crypto';
import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import pathMod from 'path';
import { execFileSync } from 'child_process';
import { AwsClient } from 'aws4fetch';
import { loadEnvCloudflare, repoRootDefault } from './lib/r2-inventory-core.mjs';
import { buildSwManifestTiers } from './lib/pwa-sw-manifest-tiers.mjs';
import { buildPwaPublishPlan, PWA_R2_PREFIX } from './lib/pwa-deploy-artifacts.mjs';

const root = repoRootDefault;

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (name, def = '') => {
    const i = a.indexOf(name);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  const concurrency = Math.max(
    1,
    Number.parseInt(get('--concurrency', process.env.R2_DELTA_CONCURRENCY || '12'), 10) || 12,
  );
  return {
    dist: get('--dist', 'dashboard/dist'),
    bucket: get('--bucket', 'inneranimalmedia'),
    prefix: get('--prefix', 'static/dashboard/app').replace(/^\/+|\/+$/g, ''),
    previousKey: get('--previous-key', 'analytics/deploys/previous-manifest.json'),
    swTieredKey: get('--sw-tiered-key', 'analytics/deploys/sw-manifest-tiered.json'),
    gitSha: get('--git-sha', ''),
    concurrency,
    dryRun: a.includes('--dry-run'),
    noPwa: a.includes('--no-pwa'),
    noCanonical: a.includes('--no-canonical'),
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
    if (name === '.DS_Store' || name.startsWith('._') || name.endsWith('.map')) continue;
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

function contentTypeForKey(key) {
  const base = key.split('/').pop() || '';
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
  switch (ext) {
    case 'js':
    case 'mjs':
      return 'application/javascript; charset=utf-8';
    case 'css':
      return 'text/css; charset=utf-8';
    case 'html':
    case 'htm':
      return 'text/html; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'webmanifest':
      return 'application/manifest+json; charset=utf-8';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'woff2':
      return 'font/woff2';
    case 'woff':
      return 'font/woff';
    default:
      return 'application/octet-stream';
  }
}

async function buildManifest(absDist, prefix) {
  const files = walkFiles(absDist);
  /** @type {{ object_key: string, content_sha256: string, size_bytes: number, abs_path: string }[]} */
  const objects = [];
  let total = 0;
  for (const fp of files) {
    const rel = pathMod.relative(absDist, fp).split(pathMod.sep).join('/');
    const object_key = `${prefix}/${rel}`.replace(/\/+/g, '/');
    const size_bytes = statSync(fp).size;
    total += size_bytes;
    const content_sha256 = await sha256FileAsync(fp);
    objects.push({ object_key, content_sha256, size_bytes, abs_path: fp });
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

function hasS3Env() {
  return Boolean(
    String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim() &&
      String(process.env.R2_ACCESS_KEY_ID || '').trim() &&
      String(process.env.R2_SECRET_ACCESS_KEY || '').trim(),
  );
}

function wranglerToml() {
  return process.env.CF_BUILDS_WRANGLER_CONFIG || 'wrangler.production.toml';
}

function createBackend() {
  if (hasS3Env()) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const aws = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
    const objectUrl = (bucket, key) =>
      `${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

    return {
      mode: 's3',
      async getJson(bucket, key) {
        const res = await aws.fetch(objectUrl(bucket, key), { method: 'GET' });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GET ${key} failed ${res.status}`);
        return JSON.parse(await res.text());
      },
      async putFile(bucket, key, absPath, contentType) {
        const res = await aws.fetch(objectUrl(bucket, key), {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: readFileSync(absPath),
        });
        if (!res.ok) throw new Error(`PutObject ${key} failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
      },
      async putBytes(bucket, key, body, contentType) {
        const res = await aws.fetch(objectUrl(bucket, key), {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body,
        });
        if (!res.ok) throw new Error(`PutObject ${key} failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
      },
      async delete(bucket, key) {
        const res = await aws.fetch(objectUrl(bucket, key), { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
          throw new Error(`DeleteObject ${key} failed ${res.status}`);
        }
      },
    };
  }

  console.warn('[r2-delta] S3 keys missing — using wrangler r2 fallback (slower; fine for CF Builds)');
  return {
    mode: 'wrangler',
    async getJson(bucket, key) {
      const tmp = pathMod.join(process.env.TMPDIR || '/tmp', `iam-r2-${process.pid}-${Date.now()}.json`);
      try {
        execFileSync(
          'npm',
          [
            'exec',
            '--',
            'wrangler',
            'r2',
            'object',
            'get',
            `${bucket}/${key}`,
            '--file',
            tmp,
            '-c',
            wranglerToml(),
            '--remote',
          ],
          { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        return JSON.parse(readFileSync(tmp, 'utf8'));
      } catch {
        return null;
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
    },
    async putFile(bucket, key, absPath, contentType) {
      execFileSync(
        'npm',
        [
          'exec',
          '--',
          'wrangler',
          'r2',
          'object',
          'put',
          `${bucket}/${key}`,
          '--file',
          absPath,
          '--content-type',
          contentType,
          '-c',
          wranglerToml(),
          '--remote',
        ],
        { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    },
    async putBytes(bucket, key, body, contentType) {
      const tmp = pathMod.join(process.env.TMPDIR || '/tmp', `iam-r2-put-${process.pid}-${Date.now()}`);
      writeFileSync(tmp, body);
      try {
        await this.putFile(bucket, key, tmp, contentType);
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
    },
    async delete(bucket, key) {
      try {
        execFileSync(
          'npm',
          [
            'exec',
            '--',
            'wrangler',
            'r2',
            'object',
            'delete',
            `${bucket}/${key}`,
            '-c',
            wranglerToml(),
            '--remote',
          ],
          { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch {
        /* missing ok */
      }
    },
  };
}

async function mapPool(items, concurrency, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

function prevHashMap(previous) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const o of previous?.objects || []) {
    if (o?.object_key && o?.content_sha256) map.set(o.object_key, o.content_sha256);
  }
  return map;
}

async function main() {
  loadEnvCloudflare(root);
  const o = parseArgs();
  const absDist = pathMod.isAbsolute(o.dist) ? o.dist : pathMod.join(root, o.dist);
  if (!existsSync(absDist) || !existsSync(pathMod.join(absDist, 'index.html'))) {
    throw new Error(`dist missing or incomplete: ${absDist} (need index.html)`);
  }

  const t0 = Date.now();
  console.log(`[r2-delta] building manifest from ${absDist} prefix=${o.prefix}/`);
  const manifest = await buildManifest(absDist, o.prefix);
  console.log(`[r2-delta] local objects=${manifest.object_count} bytes=${manifest.total_size_bytes}`);

  const backend = createBackend();
  console.log(`[r2-delta] backend=${backend.mode}`);
  const previous = await backend.getJson(o.bucket, o.previousKey);
  const prev = prevHashMap(previous);

  /** @type {typeof manifest.objects} */
  const toUpload = [];
  for (const obj of manifest.objects) {
    if (prev.get(obj.object_key) !== obj.content_sha256) toUpload.push(obj);
  }

  const newKeys = new Set(manifest.objects.map((x) => x.object_key));
  const stale = [...prev.keys()].filter((k) => k.startsWith(`${o.prefix}/`) && !newKeys.has(k));
  const concurrency = backend.mode === 'wrangler' ? Math.min(o.concurrency, 4) : o.concurrency;

  console.log(
    `[r2-delta] previous=${prev.size} upload=${toUpload.length} delete=${stale.length} concurrency=${concurrency}`,
  );

  if (o.dryRun) {
    for (const u of toUpload.slice(0, 15)) console.log(`  [dry-run] put ${u.object_key}`);
    if (toUpload.length > 15) console.log(`  [dry-run] … +${toUpload.length - 15} more puts`);
    for (const k of stale.slice(0, 15)) console.log(`  [dry-run] delete ${k}`);
    if (stale.length > 15) console.log(`  [dry-run] … +${stale.length - 15} more deletes`);
    console.log(`[r2-delta] dry-run complete in ${Date.now() - t0}ms`);
    return;
  }

  let uploaded = 0;
  await mapPool(toUpload, concurrency, async (obj) => {
    await backend.putFile(o.bucket, obj.object_key, obj.abs_path, contentTypeForKey(obj.object_key));
    uploaded += 1;
    if (uploaded === 1 || uploaded % 25 === 0 || uploaded === toUpload.length) {
      console.log(`[r2-delta] uploaded ${uploaded}/${toUpload.length}`);
    }
  });

  let deleted = 0;
  await mapPool(stale, Math.min(concurrency, 8), async (key) => {
    await backend.delete(o.bucket, key);
    deleted += 1;
  });
  if (stale.length) console.log(`[r2-delta] deleted stale=${deleted}`);

  const persistManifest = {
    version: manifest.version,
    prefix: manifest.prefix,
    created_at: manifest.created_at,
    git_sha: resolveGitSha(o.gitSha),
    object_count: manifest.object_count,
    total_size_bytes: manifest.total_size_bytes,
    objects: manifest.objects.map(({ object_key, content_sha256, size_bytes }) => ({
      object_key,
      content_sha256,
      size_bytes,
    })),
  };
  await backend.putBytes(
    o.bucket,
    o.previousKey,
    JSON.stringify(persistManifest, null, 2),
    'application/json; charset=utf-8',
  );
  console.log(`[r2-delta] wrote ${o.previousKey}`);

  const gitSha = persistManifest.git_sha;
  const swTiered = buildSwManifestTiers({ absDist, gitSha });
  await backend.putBytes(
    o.bucket,
    o.swTieredKey,
    JSON.stringify(swTiered, null, 2),
    'application/json; charset=utf-8',
  );
  writeFileSync(pathMod.join(root, '.deploy-sw-tiered-manifest.json'), JSON.stringify(swTiered, null, 2));
  console.log(`[r2-delta] wrote ${o.swTieredKey}`);

  if (!o.noPwa) {
    const plan = buildPwaPublishPlan(absDist);
    let pwaN = 0;
    for (const item of plan.artifacts) {
      const src = pathMod.join(absDist, item.file);
      if (!existsSync(src)) throw new Error(`[r2-delta] missing PWA artifact: ${src}`);
      await backend.putFile(o.bucket, item.r2Key, src, item.contentType);
      pwaN += 1;
    }
    const meta = {
      cache_bust: swTiered.cache_bust,
      git_sha: gitSha,
      published_at: new Date().toISOString(),
      inline_workbox: plan.inline_workbox,
      workbox_import: plan.workbox_import,
      workbox_files: plan.workbox_files,
      artifacts: plan.artifacts.map((a) => a.publicPath),
      r2_prefix: PWA_R2_PREFIX,
    };
    const metaLocal = pathMod.join(absDist, 'pwa-build-meta.json');
    writeFileSync(metaLocal, `${JSON.stringify(meta, null, 2)}\n`);
    await backend.putFile(
      o.bucket,
      `${PWA_R2_PREFIX}/pwa-build-meta.json`,
      metaLocal,
      'application/json; charset=utf-8',
    );
    console.log(`[r2-delta] PWA published objects=${pwaN + 1} cache_bust=${meta.cache_bust}`);
  }

  if (!o.noCanonical) {
    const extras = [
      {
        local: pathMod.join(root, 'dashboard/public/static/dashboard/shell.css'),
        key: 'static/dashboard/shell.css',
        type: 'text/css; charset=utf-8',
      },
      {
        local: pathMod.join(root, 'dashboard/iam-workspace-shell.html'),
        key: 'static/dashboard/iam-workspace-shell.html',
        type: 'text/html; charset=utf-8',
      },
      {
        local: pathMod.join(absDist, 'index.html'),
        key: 'static/dashboard/app.html',
        type: 'text/html; charset=utf-8',
      },
    ];
    for (const e of extras) {
      if (!existsSync(e.local)) {
        console.warn(`[r2-delta] skip missing canonical ${e.key}`);
        continue;
      }
      await backend.putFile(o.bucket, e.key, e.local, e.type);
      console.log(`[r2-delta] canonical ${e.key}`);
    }
  }

  const ms = Date.now() - t0;
  console.log(
    `[r2-delta] done in ${ms}ms upload=${toUpload.length} delete=${stale.length} objects=${manifest.object_count} backend=${backend.mode}`,
  );
  writeFileSync(
    pathMod.join(root, '.deploy-r2-delta-stats.json'),
    JSON.stringify(
      {
        ms,
        uploaded: toUpload.length,
        deleted: stale.length,
        object_count: manifest.object_count,
        total_size_bytes: manifest.total_size_bytes,
        git_sha: gitSha,
        backend: backend.mode,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
