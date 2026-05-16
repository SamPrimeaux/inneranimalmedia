/**
 * API Service: R2 Storage Operations
 * Handles bucket management, object CRUD, search, and cross-bucket sync.
 * Deconstructed from legacy worker.js.
 */

import { getAuthUser, jsonResponse } from '../core/auth';
import { canAccessMediaObjectKey } from '../core/media-r2-access.js';
import {
  getR2S3Host,
  r2DeleteViaBindingOrS3,
  r2FetchObjectViaBindingOrS3,
  r2PutViaBindingOrS3,
  signR2Request,
} from '../core/r2.js';

/** Primary dashboard asset bucket (logical name); bindings may alias legacy names to the same bucket. */
function isDashboardMediaBucket(name) {
  return name === 'inneranimalmedia' || name === 'inneranimalmedia-assets';
}

const DASHBOARD_MEDIA_KEY_PREFIXES = ['users/', 'workspace-media/', 'uploads/', 'media/', 'captures/'];

function isDashboardMediaScopedKey(key) {
  return DASHBOARD_MEDIA_KEY_PREFIXES.some((p) => key.startsWith(p));
}

async function assertR2ObjectAccess(request, env, bucket, key) {
  if (!isDashboardMediaBucket(bucket) || !isDashboardMediaScopedKey(key)) return null;
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!(await canAccessMediaObjectKey(env, authUser, key))) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }
  return null;
}

/** Dashboard /api/r2/file sends binding labels; map to canonical R2 bucket names. */
const BINDING_LABEL_TO_BUCKET = {
  DASHBOARD: 'inneranimalmedia',
  ASSETS: 'inneranimalmedia-assets',
  R2: 'iam-platform',
  DOCS_BUCKET: 'iam-docs',
  AUTORAG_BUCKET: 'autorag',
};

export function resolveR2BucketName(env, bucketOrBinding) {
  const raw = String(bucketOrBinding || '').trim();
  if (!raw) return '';
  const mapped = BINDING_LABEL_TO_BUCKET[raw.toUpperCase()];
  if (mapped) return mapped;
  if (getR2Binding(env, raw)) return raw;
  return raw;
}

function resolveR2Access(env, bucketOrBinding) {
  const bucketName = resolveR2BucketName(env, bucketOrBinding);
  return { bucketName, binding: getR2Binding(env, bucketName) };
}

function hasR2S3Credentials(env) {
  return !!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && getR2S3Host(env));
}

/** Account-wide S3 API requires an authenticated dashboard user when no Worker binding exists. */
async function assertR2UnboundS3Auth(request, env, binding) {
  if (binding) return null;
  if (!hasR2S3Credentials(env)) {
    return jsonResponse({ error: 'Bucket not bound and R2 S3 credentials missing' }, 400);
  }
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  return null;
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);
const TEXT_EXT = new Set([
  'txt', 'md', 'json', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'css', 'html', 'htm', 'xml', 'yaml', 'yml',
  'sql', 'sh', 'env', 'csv', 'log', 'vue', 'svelte', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h',
]);

function isImageKeyOrType(key, contentType) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return true;
  const ext = (key.split('.').pop() || '').toLowerCase();
  return IMAGE_EXT.has(ext);
}

function isLikelyTextKeyOrType(key, contentType) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('text/') || ct.includes('json') || ct.includes('javascript') || ct.includes('xml')) {
    return true;
  }
  const ext = (key.split('.').pop() || '').toLowerCase();
  return TEXT_EXT.has(ext);
}

import { insertAiGenerationLog } from './telemetry';

/**
 * List one page of objects via binding or S3 API.
 * @returns {Promise<{ objects: Array<{key:string,size?:number,last_modified?:string|null}>, prefixes?: string[], cursor?: string, continuationToken?: string, error?: string }>}
 */
async function listR2ObjectPage(env, bucketName, binding, prefix, opts = {}) {
  const limit = Math.min(5000, Math.max(1, opts.limit || 1000));
  const recursive = opts.recursive === true;

  if (binding?.list) {
    const list = await binding.list({
      prefix: prefix || '',
      delimiter: recursive ? undefined : '/',
      limit,
      cursor: opts.cursor,
    });
    const objects = (list.objects || [])
      .filter((o) => !o.key.endsWith('/'))
      .map((o) => ({
        key: o.key,
        size: o.size ?? 0,
        last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
      }));
    return {
      objects,
      prefixes: list.delimitedPrefixes || list.rolledUpPrefixes || [],
      cursor: list.truncated ? list.cursor : undefined,
    };
  }

  if (!hasR2S3Credentials(env)) {
    return { objects: [], error: 'Binding not available' };
  }

  const queryParams = {
    'list-type': '2',
    prefix: prefix || '',
    'max-keys': String(Math.min(1000, limit)),
  };
  if (!recursive) queryParams.delimiter = '/';
  if (opts.continuationToken) queryParams['continuation-token'] = opts.continuationToken;

  const signed = await signR2Request('GET', bucketName, '', buildR2Query(queryParams), env);
  if (!signed) return { objects: [], error: 'S3 credentials missing' };

  const listResp = await fetch(signed.endpoint, { method: 'GET', headers: signed.headers });
  if (!listResp.ok) return { objects: [], error: `R2 list failed (${listResp.status})` };

  const xml = await listResp.text();
  const parsed = parseListObjectsV2Xml(xml);
  return {
    objects: parsed.objects.map((o) => ({
      key: o.key,
      size: o.size,
      last_modified: o.lastModified,
    })),
    prefixes: parsed.prefixes || [],
    continuationToken: parsed.isTruncated ? parsed.nextContinuationToken : undefined,
  };
}

async function handleR2FileRoute(request, url, env, method) {
  let body = {};
  if (method !== 'GET') {
    try {
      body = await request.clone().json();
    } catch (_) {
      body = {};
    }
  }

  const bucketParam =
    (url.searchParams.get('bucket') || body.bucket || '').trim();
  const key = (url.searchParams.get('key') || body.key || '').trim();
  if (!bucketParam || !key) return jsonResponse({ error: 'bucket and key required' }, 400);

  const { bucketName, binding } = resolveR2Access(env, bucketParam);
  const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
  if (s3Denied) return s3Denied;

  if (method === 'DELETE') {
    const denied = await assertR2ObjectAccess(request, env, bucketName, key);
    if (denied) return denied;
    const ok = await r2DeleteViaBindingOrS3(env, binding, bucketName, key);
    if (!ok) return jsonResponse({ error: 'Delete failed' }, 500);
    return jsonResponse({ ok: true, deleted: true, bucket: bucketName, key });
  }

  if (method === 'POST' || method === 'PUT') {
    const denied = await assertR2ObjectAccess(request, env, bucketName, key);
    if (denied) return denied;
    const content = body.content != null ? String(body.content) : '';
    const contentType =
      body.contentType || getContentTypeFromKey(key) || 'text/plain; charset=utf-8';
    const buf = new TextEncoder().encode(content);
    const ok = await r2PutViaBindingOrS3(env, binding, bucketName, key, buf, contentType);
    if (!ok) return jsonResponse({ error: 'Save failed' }, 500);
    return jsonResponse({ ok: true, bucket: bucketName, key });
  }

  if (method === 'GET') {
    const denied = await assertR2ObjectAccess(request, env, bucketName, key);
    if (denied) return denied;
    const fetched = await r2FetchObjectViaBindingOrS3(env, binding, bucketName, key);
    if (!fetched) return jsonResponse({ error: 'Not found' }, 404);

    const ct = fetched.contentType || getContentTypeFromKey(key) || 'application/octet-stream';
    const size = fetched.body.byteLength;
    const proxyUrl = `${url.origin}/api/r2/buckets/${encodeURIComponent(bucketName)}/object/${encodeURIComponent(key)}`;

    if (isImageKeyOrType(key, ct)) {
      const presigned = await presignR2GetObjectUrl(env, bucketName, key);
      return jsonResponse({
        bucket: bucketName,
        key,
        isImage: true,
        isBinary: true,
        contentType: ct,
        size,
        previewUrl: presigned || proxyUrl,
        url: proxyUrl,
      });
    }

    if (isLikelyTextKeyOrType(key, ct)) {
      const content = new TextDecoder('utf-8', { fatal: false }).decode(fetched.body);
      return jsonResponse({ bucket: bucketName, key, content, contentType: ct, size });
    }

    return jsonResponse({
      bucket: bucketName,
      key,
      isBinary: true,
      contentType: ct,
      size,
      message: 'Binary object — open via preview URL or download.',
      previewUrl: proxyUrl,
    });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}

/**
 * Primary router for all R2-related API requests.
 */
export async function handleR2Api(request, url, env) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  // 1. Buckets & Inventory
  if (pathLower === '/api/r2/buckets' && method === 'GET') {
    const bound = listBoundR2BucketNames(env);
    if (url.searchParams.get('all') !== 'true') {
      return jsonResponse({ buckets: bound, bound, source: 'bindings' });
    }
    const account = await listAllR2BucketsViaS3(env);
    if (account?.length) {
      const boundSet = new Set(bound);
      const merged = [...bound];
      for (const name of account) {
        if (!boundSet.has(name)) merged.push(name);
      }
      return jsonResponse({ buckets: merged, bound, account, source: 'bindings+s3' });
    }
    return jsonResponse({ buckets: bound, bound, source: 'bindings' });
  }

  if (pathLower === '/api/r2/stats' && method === 'GET' && url.searchParams.get('bucket')) {
    const b = url.searchParams.get('bucket').trim();
    const { binding } = resolveR2Access(env, b);
    const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
    if (s3Denied) return s3Denied;
    const stats = await r2LiveBucketStats(env, b);
    if (!stats.ok) {
      return jsonResponse({ error: stats.error || 'stats_failed', bucket: b }, stats.status || 400);
    }
    return jsonResponse({ bucket: b, object_count: stats.count, total_bytes: stats.bytes });
  }

  if (pathLower === '/api/r2/sync' && method === 'POST') {
    let syncBody = {};
    try {
      syncBody = await request.clone().json();
    } catch (_) {
      syncBody = {};
    }
    const source_bucket = syncBody.source_bucket != null ? String(syncBody.source_bucket).trim() : '';
    const dest_bucket = syncBody.dest_bucket != null ? String(syncBody.dest_bucket).trim() : '';
    const syncPrefix = syncBody.prefix != null ? String(syncBody.prefix) : '';
    
    if (source_bucket && dest_bucket) {
      const src = resolveR2Access(env, source_bucket);
      const dst = resolveR2Access(env, dest_bucket);
      if (!src.binding) {
        const denied = await assertR2UnboundS3Auth(request, env, null);
        if (denied) return denied;
      }
      if (!dst.binding) {
        const denied = await assertR2UnboundS3Auth(request, env, null);
        if (denied) return denied;
      }
      if (!src.binding && !hasR2S3Credentials(env)) {
        return jsonResponse({ error: 'Source bucket not available', source_bucket }, 400);
      }
      if (!dst.binding && !hasR2S3Credentials(env)) {
        return jsonResponse({ error: 'Destination bucket not available', dest_bucket }, 400);
      }

      let copied = 0;
      let bytes = 0;
      const errors = [];
      let cursor;
      let continuationToken;
      do {
        const page = await listR2ObjectPage(env, src.bucketName, src.binding, syncPrefix, {
          limit: 1000,
          cursor,
          continuationToken,
        });
        for (const o of page.objects) {
          if (o.key.endsWith('/')) continue;
          try {
            const fetched = await r2FetchObjectViaBindingOrS3(env, src.binding, src.bucketName, o.key);
            if (!fetched) continue;
            const ct =
              fetched.contentType || getContentTypeFromKey(o.key) || 'application/octet-stream';
            const ok = await r2PutViaBindingOrS3(
              env,
              dst.binding,
              dst.bucketName,
              o.key,
              fetched.body,
              ct,
            );
            if (!ok) {
              errors.push({ key: o.key, error: 'put_failed' });
              continue;
            }
            copied++;
            bytes += fetched.body.byteLength;
          } catch (e) {
            errors.push({ key: o.key, error: String(e?.message || e) });
          }
        }
        cursor = page.cursor;
        continuationToken = page.continuationToken;
      } while (cursor || continuationToken);
      return jsonResponse({ ok: true, copied, bytes, errors: errors.length ? errors : undefined });
    }
  }

  // 2. Object Management
  if (pathLower === '/api/r2/list' && method === 'GET') {
    if (url.searchParams.get('buckets') === 'true') {
      const bound = listBoundR2BucketNames(env);
      const listAll = url.searchParams.get('all') === 'true';
      if (!listAll) {
        return jsonResponse({ buckets: bound, bound, source: 'bindings' });
      }
      const account = await listAllR2BucketsViaS3(env);
      if (account?.length) {
        const boundSet = new Set(bound);
        const merged = [...bound];
        for (const name of account) {
          if (!boundSet.has(name)) merged.push(name);
        }
        return jsonResponse({ buckets: merged, bound, account, source: 'bindings+s3' });
      }
      return jsonResponse({ buckets: bound, bound, source: 'bindings' });
    }

    const bucket = url.searchParams.get('bucket');
    const prefix = url.searchParams.get('prefix') || '';
    const recursive = url.searchParams.get('recursive') === '1' || url.searchParams.get('recursive') === 'true';
    const limitParam = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit') || '1000', 10) || 1000));
    
    if (!bucket) return jsonResponse({ error: 'bucket required' }, 400);
    const { bucketName, binding } = resolveR2Access(env, bucket);

    if (binding && binding.list) {
      if (recursive) {
        const allObjects = [];
        let cursor;
        do {
          const pageLimit = Math.min(1000, limitParam - allObjects.length);
          if (pageLimit <= 0) break;
          const list = await binding.list({ prefix, limit: pageLimit, cursor });
          for (const o of list.objects || []) {
            if (o.key.endsWith('/')) continue;
            allObjects.push({
              key: o.key,
              size: o.size ?? 0,
              last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
            });
            if (allObjects.length >= limitParam) break;
          }
          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor && allObjects.length < limitParam);
        return jsonResponse({ objects: allObjects, prefixes: [] });
      }
      
      const list = await binding.list({ prefix, delimiter: '/', limit: limitParam });
      const objects = (list.objects || []).filter(o => !o.key.endsWith('/')).map(o => ({
        key: o.key,
        size: o.size ?? 0,
        last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
      }));
      return jsonResponse({ objects, prefixes: list.rolledUpPrefixes || [] });
    }
    
    const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
    if (s3Denied) return s3Denied;

    // S3 Compatibility Fallback (any account bucket when R2 API token is configured)
    const signed = await signR2Request(
      'GET',
      bucketName,
      '',
      recursive
        ? buildR2Query({ 'list-type': '2', prefix, 'max-keys': String(Math.min(1000, limitParam)) })
        : buildR2Query({ 'list-type': '2', prefix, delimiter: '/', 'max-keys': String(Math.min(1000, limitParam)) }),
      env,
    );
    if (!signed) return jsonResponse({ error: 'Bucket not bound and credentials missing' }, 400);
    
    const listResp = await fetch(signed.endpoint, { method: 'GET', headers: signed.headers });
    if (!listResp.ok) return jsonResponse({ error: 'R2 list failed', status: listResp.status }, 400);
    
    const parsed = parseListObjectsV2Xml(await listResp.text());
    return jsonResponse({ 
      objects: parsed.objects.map(o => ({ key: o.key, size: o.size, last_modified: o.lastModified })),
      prefixes: parsed.prefixes || []
    });
  }

  if (pathLower === '/api/r2/search' && method === 'GET') {
    const bucket = url.searchParams.get('bucket');
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const keyPrefix = (url.searchParams.get('prefix') || '').trim();
    if (!bucket) return jsonResponse({ error: 'bucket required' }, 400);
    const { bucketName, binding } = resolveR2Access(env, bucket);
    const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
    if (s3Denied) return s3Denied;

    const allObjects = [];
    let cursor;
    let continuationToken;
    do {
      const page = await listR2ObjectPage(env, bucketName, binding, keyPrefix, {
        limit: 500,
        cursor,
        continuationToken,
        recursive: true,
      });
      for (const o of page.objects) {
        if (o.key.endsWith('/')) continue;
        if (q.length >= 2 && !o.key.toLowerCase().includes(q)) continue;
        allObjects.push({
          key: o.key,
          path: o.key,
          name: o.key.split('/').pop() || o.key,
          size: o.size ?? 0,
          last_modified: o.last_modified ?? o.lastModified ?? null,
        });
        if (allObjects.length >= 100) break;
      }
      cursor = page.cursor;
      continuationToken = page.continuationToken;
    } while ((cursor || continuationToken) && allObjects.length < 100);
    return jsonResponse({ objects: allObjects });
  }

  if ((pathLower === '/api/r2/upload' && method === 'POST') || (pathLower === '/api/r2/put' && method === 'PUT')) {
    const bucket = url.searchParams.get('bucket');
    const key =
      url.searchParams.get('key') ||
      (pathLower === '/api/r2/upload' ? `upload/${Date.now()}-${crypto.randomUUID().slice(0, 8)}` : null);
    if (!bucket || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
    const { bucketName, binding } = resolveR2Access(env, bucket);
    const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
    if (s3Denied) return s3Denied;

    const denied = await assertR2ObjectAccess(request, env, bucketName, key);
    if (denied) return denied;

    const contentType =
      request.headers.get('Content-Type') || getContentTypeFromKey(key) || 'application/octet-stream';
    const body = await request.arrayBuffer();
    const ok = await r2PutViaBindingOrS3(env, binding, bucketName, key, body, contentType);
    if (!ok) return jsonResponse({ error: 'Put failed', bucket: bucketName, key }, 500);

    void insertAiGenerationLog(env, {
      generationType: pathLower === '/api/r2/put' ? 'r2_put' : 'r2_upload',
      responseText: `${bucketName}:${key}`,
      metadataJson: { key, byte_length: body.byteLength, content_type: contentType },
    });

    return jsonResponse({
      ok: true,
      key,
      bucket: bucketName,
      url: `${url.origin}/api/r2/buckets/${encodeURIComponent(bucketName)}/object/${encodeURIComponent(key)}`,
    });
  }

  if (pathLower === '/api/r2/delete' && method === 'DELETE') {
    let bucket = url.searchParams.get('bucket');
    let key = url.searchParams.get('key');
    if (!bucket || !key) {
      try {
        const body = await request.clone().json();
        if (!bucket && body?.bucket != null) bucket = String(body.bucket).trim();
        if (!key && body?.key != null) key = String(body.key).trim();
      } catch (_) {
        /* query params only */
      }
    }
    if (!bucket || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
    const { bucketName, binding } = resolveR2Access(env, bucket);
    const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
    if (s3Denied) return s3Denied;

    const denied = await assertR2ObjectAccess(request, env, bucketName, key);
    if (denied) return denied;

    const ok = await r2DeleteViaBindingOrS3(env, binding, bucketName, key);
    if (!ok) return jsonResponse({ error: 'Delete failed', bucket: bucketName, key }, 500);
    return jsonResponse({ ok: true, deleted: true, bucket: bucketName, key });
  }

  if (pathLower === '/api/r2/copy' && method === 'POST') {
    const bucket = url.searchParams.get('bucket');
    const fromKey = url.searchParams.get('from');
    const toKey = url.searchParams.get('to');
    if (!bucket || !fromKey || !toKey) {
      return jsonResponse({ error: 'bucket, from, and to required' }, 400);
    }
    const { bucketName, binding } = resolveR2Access(env, bucket);
    const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
    if (s3Denied) return s3Denied;

    const deniedFrom = await assertR2ObjectAccess(request, env, bucketName, fromKey);
    if (deniedFrom) return deniedFrom;
    const deniedTo = await assertR2ObjectAccess(request, env, bucketName, toKey);
    if (deniedTo) return deniedTo;

    const fetched = await r2FetchObjectViaBindingOrS3(env, binding, bucketName, fromKey);
    if (!fetched) return jsonResponse({ error: 'Source not found', bucket: bucketName, from: fromKey }, 404);

    const contentType =
      fetched.contentType || getContentTypeFromKey(toKey) || 'application/octet-stream';
    const ok = await r2PutViaBindingOrS3(env, binding, bucketName, toKey, fetched.body, contentType);
    if (!ok) return jsonResponse({ error: 'Copy put failed', bucket: bucketName, to: toKey }, 500);

    return jsonResponse({
      ok: true,
      bucket: bucketName,
      from: fromKey,
      to: toKey,
      bytes: fetched.body.byteLength,
    });
  }

  if (pathLower === '/api/r2/file') {
    return handleR2FileRoute(request, url, env, method);
  }

  if (pathLower === '/api/r2/url' && method === 'GET') {
    const bucket = url.searchParams.get('bucket');
    const key = url.searchParams.get('key');
    const exp = parseInt(url.searchParams.get('expires') || '3600', 10);
    if (!bucket || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
    
    const workerUrl = `${url.origin}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
    const presigned = await presignR2GetObjectUrl(env, bucket, key, exp);
    return jsonResponse({ url: workerUrl, presigned_s3_url: presigned });
  }

  // 3. Dynamic Sub-routes
  const bucketsObjectsMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/objects$/i);
  if (bucketsObjectsMatch && method === 'GET') {
    const name = decodeURIComponent(bucketsObjectsMatch[1]);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const { results } = await env.DB.prepare('SELECT * FROM r2_object_inventory WHERE bucket_name = ? ORDER BY object_key').bind(name).all();
    return jsonResponse({ objects: results || [] });
  }

  const objectKeyMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/object\/(.+)$/i);
  if (objectKeyMatch) {
    const name = decodeURIComponent(objectKeyMatch[1]);
    const key = decodeURIComponent(objectKeyMatch[2]);
    const { bucketName, binding } = resolveR2Access(env, name);

    if (method === 'GET') {
      const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
      if (s3Denied) return s3Denied;
      const deniedGet = await assertR2ObjectAccess(request, env, bucketName, key);
      if (deniedGet) return deniedGet;
      const fetched = await r2FetchObjectViaBindingOrS3(env, binding, bucketName, key);
      if (!fetched) return jsonResponse({ error: 'Not found' }, 404);
      const headers = new Headers();
      if (fetched.etag) headers.set('ETag', fetched.etag);
      const ct = fetched.contentType || getContentTypeFromKey(key) || 'application/octet-stream';
      headers.set('Content-Type', ct);
      headers.set('Content-Disposition', 'inline');
      return new Response(fetched.body, { status: 200, headers });
    }

    if (method === 'PUT') {
      const s3Denied = await assertR2UnboundS3Auth(request, env, binding);
      if (s3Denied) return s3Denied;
      const deniedPut = await assertR2ObjectAccess(request, env, bucketName, key);
      if (deniedPut) return deniedPut;
      const ct = request.headers.get('Content-Type') || getContentTypeFromKey(key) || 'application/octet-stream';
      const buf = await request.arrayBuffer();
      const ok = await r2PutViaBindingOrS3(env, binding, bucketName, key, buf, ct);
      if (!ok) return jsonResponse({ error: 'Put failed' }, 500);
      return jsonResponse({ ok: true, key, bucket: bucketName });
    }
  }

  return jsonResponse({ error: 'R2 route not matched' }, 404);
}

// --- HELPER FUNCTIONS (exported for storage dashboard API) ---

export function getR2Binding(env, bucketName) {
  const map = {
    'inneranimalmedia-assets': env.ASSETS,
    autorag: env.AUTORAG_BUCKET,
    inneranimalmedia: env.DASHBOARD,
    dashboard: env.DASHBOARD,
    'inneranimalmedia-sandbox-cicd': env.ASSETS,
    'iam-platform': env.R2,
    'iam-docs': env.DOCS_BUCKET,
    tools: env.DASHBOARD,
  };
  return map[bucketName] || null;
}

export function listBoundR2BucketNames(env) {
  const names = [];
  if (env.ASSETS) names.push('inneranimalmedia-assets');
  if (env.AUTORAG_BUCKET) names.push('autorag');
  if (env.DASHBOARD) {
    names.push('inneranimalmedia');
    names.push('tools');
  }
  if (env.R2) names.push('iam-platform');
  if (env.DOCS_BUCKET) names.push('iam-docs');
  return names;
}

export async function r2LiveBucketStats(env, bucketName) {
  const { bucketName: resolved, binding } = resolveR2Access(env, bucketName);
  let count = 0;
  let bytes = 0;
  let cursor;
  let continuationToken;
  do {
    const page = await listR2ObjectPage(env, resolved, binding, '', {
      limit: 1000,
      cursor,
      continuationToken,
      recursive: true,
    });
    if (page.error) return { ok: false, error: page.error };
    for (const o of page.objects) {
      if (o.key.endsWith('/')) continue;
      count++;
      bytes += o.size || 0;
    }
    cursor = page.cursor;
    continuationToken = page.continuationToken;
  } while (cursor || continuationToken);
  return { ok: true, count, bytes };
}

function getContentTypeFromKey(key) {
  const ext = (key.split('.').pop() || '').toLowerCase().replace(/[#?].*$/, '');
  const types = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
    html: 'text/html', css: 'text/css', js: 'application/javascript', mjs: 'application/javascript',
    json: 'application/json', xml: 'application/xml', txt: 'text/plain', md: 'text/markdown',
    pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  };
  return types[ext] || null;
}

// --- SIGV4 & PRE-SIGNING CORE ---

const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

async function sha256hex(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacBytes(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function hmacHex(key, message) {
  const bytes = await hmacBytes(key, message);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secret, date, region, service) {
  const kDate = await hmacBytes('AWS4' + secret, date);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}

async function presignR2GetObjectUrl(env, bucket, key, expiresSeconds = 3600) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const host = getR2S3Host(env);
  if (!accessKey || !secretKey || !host) return null;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const encodedKey = String(key).split('/').map(seg => encodeURIComponent(seg)).join('/');
  
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host'
  });
  
  const sortedPairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQueryString = sortedPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonicalRequest = ['GET', `/${bucket}/${encodedKey}`, canonicalQueryString, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');
  const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');
  const signature = await hmacHex(signingKey, stringToSign);
  
  return `https://${host}/${bucket}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

/** S3 ListBuckets (account-wide) when R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY are set. */
async function listAllR2BucketsViaS3(env) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const host = getR2S3Host(env);
  if (!accessKey || !secretKey || !host) return null;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const endpoint = `https://${host}/`;
  const headerMap = { host, 'x-amz-content-sha256': EMPTY_HASH, 'x-amz-date': amzDate };
  const sortedKeys = Object.keys(headerMap).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headerMap[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');
  const canonicalRequest = ['GET', '/', '', canonicalHeaders, signedHeaders, EMPTY_HASH].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');
  const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');
  const signature = await hmacHex(signingKey, stringToSign);
  const headers = {
    ...headerMap,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };

  const listResp = await fetch(endpoint, { method: 'GET', headers });
  if (!listResp.ok) return null;
  return parseListBucketsXml(await listResp.text());
}

function parseListBucketsXml(xml) {
  const buckets = [];
  const blocks = xml.match(/<Bucket>[\s\S]*?<\/Bucket>/gi) || [];
  for (const block of blocks) {
    const name = (block.match(/<Name>([^<]*)<\/Name>/i) || [])[1];
    if (name) buckets.push(name);
  }
  return buckets.sort((a, b) => a.localeCompare(b));
}

function parseListObjectsV2Xml(xml) {
  const objects = [];
  const prefixes = [];
  const contentsBlocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
  for (const block of contentsBlocks) {
    const key = (block.match(/<Key>([^<]*)<\/Key>/) || [])[1] || '';
    const size = parseInt((block.match(/<Size>([^<]*)<\/Size>/) || [])[1] || '0', 10);
    const lastModified = (block.match(/<LastModified>([^<]*)<\/LastModified>/) || [])[1] || null;
    objects.push({ key, size, lastModified });
  }
  const prefixBlocks = xml.match(/<CommonPrefixes>[\s\S]*?<\/CommonPrefixes>/g) || [];
  for (const block of prefixBlocks) {
    const prefix = (block.match(/<Prefix>([^<]*)<\/Prefix>/) || [])[1];
    if (prefix) prefixes.push(prefix);
  }
  const isTruncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const nextContinuationToken =
    (xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/i) || [])[1] || undefined;
  return { objects, prefixes, isTruncated, nextContinuationToken };
}

function buildR2Query(params) {
  const keys = Object.keys(params).filter(k => params[k] != null && params[k] !== '');
  keys.sort();
  return keys.map(k => k + '=' + encodeURIComponent(params[k])).join('&');
}
