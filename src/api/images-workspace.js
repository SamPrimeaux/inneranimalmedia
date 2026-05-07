/**
 * Dashboard /api/images — R2-backed media & capture library on bucket `inneranimalmedia`.
 *
 * GET    /api/images?workspace_id=&per_page=&mode=images|media
 * POST   /api/images  (multipart file or JSON { url })
 * DELETE /api/images/:id   (id = base64url UTF-8 object key)
 * POST   /api/images/:id/meta  ({ ...meta } stored as sibling .iammeta.json)
 */

import { jsonResponse } from '../core/responses.js';
import { getR2Binding } from './r2-api.js';
import {
  canAccessMediaObjectKey,
  resolveMediaListPrefixes,
  resolvePrimaryUploadPrefix,
} from '../core/media-r2-access.js';

const BUCKET = 'inneranimalmedia';
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|avif|zip|har|jsonl|json|webm|md|txt|csv)$/i;
const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

function mediaKeyToId(key) {
  return Buffer.from(String(key), 'utf8').toString('base64url');
}

function mediaIdToKey(id) {
  try {
    const k = Buffer.from(String(id), 'base64url').toString('utf8');
    return k || null;
  } catch {
    return null;
  }
}

function metaSidecarKey(imageKey) {
  return `${imageKey}.iammeta.json`;
}

function listExtPattern(mode) {
  return mode === 'media' ? MEDIA_EXT : IMAGE_EXT;
}

function rowKind(key) {
  return IMAGE_EXT.test(key) ? 'image' : 'artifact';
}

function proxyObjectUrl(url, key) {
  const origin = url.origin;
  return `${origin}/api/r2/buckets/${encodeURIComponent(BUCKET)}/object/${encodeURIComponent(key)}`;
}

function basenameKey(key) {
  const i = key.lastIndexOf('/');
  return i >= 0 ? key.slice(i + 1) : key;
}

/**
 * Merge-list R2 keys across prefixes, newest first.
 * @param {import('@cloudflare/workers-types').R2Bucket} binding
 * @param {string[]} prefixes
 * @param {number} limitTotal
 * @param {RegExp} extRegex
 */
async function collectListedObjects(binding, prefixes, limitTotal, extRegex) {
  const perPrefixCap = Math.min(2000, Math.max(limitTotal * 2, 400));
  const byKey = new Map();

  for (const prefix of prefixes) {
    let cursor;
    let got = 0;
    do {
      const pageLimit = Math.min(1000, perPrefixCap - got);
      if (pageLimit <= 0) break;
      const list = await binding.list({ prefix, limit: pageLimit, cursor });
      for (const o of list.objects || []) {
        const key = o.key;
        if (!key || key.endsWith('/')) continue;
        if (key.endsWith('.iammeta.json')) continue;
        if (!extRegex.test(key)) continue;
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : undefined,
          });
          got++;
        }
        if (got >= perPrefixCap) break;
      }
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor && got < perPrefixCap);
  }

  const rows = [...byKey.values()];
  rows.sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || ''));
  return rows.slice(0, limitTotal);
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {unknown} env
 * @param {unknown} authUser
 * @param {{ workspaceId?: string } | null | undefined} identity
 */
export async function handleImagesWorkspaceApi(request, url, env, authUser, identity) {
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  const binding = getR2Binding(env, BUCKET);
  if (!binding?.list || !binding.get || !binding.put || !binding.delete) {
    return jsonResponse({ error: 'R2 bucket inneranimalmedia not configured', source: 'r2' }, 503);
  }

  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = request.method.toUpperCase();

  const qWs = url.searchParams.get('workspace_id')?.trim();
  const wsHint = qWs || identity?.workspaceId?.trim() || '';

  const listPack = await resolveMediaListPrefixes(env, authUser, wsHint || null);
  if (listPack.error) return jsonResponse({ error: listPack.error, source: 'r2' }, listPack.status || 400);

  const uploadPack = await resolvePrimaryUploadPrefix(env, authUser, wsHint || null);
  if (uploadPack.error) return jsonResponse({ error: uploadPack.error, source: 'r2' }, uploadPack.status || 400);
  const uploadPrefix = uploadPack.prefix;

  // ── GET /api/images ───────────────────────────────────────────────────────
  if (pathLower === '/api/images' && method === 'GET') {
    const mode = url.searchParams.get('mode') === 'media' ? 'media' : 'images';
    const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('per_page') || '1000', 10) || 1000));
    const extPattern = listExtPattern(mode);

    const rawRows = await collectListedObjects(binding, listPack.prefixes, limit, extPattern);

    const META_CAP = 120;
    const out = [];
    for (let i = 0; i < rawRows.length; i++) {
      const { key, uploaded } = rawRows[i];
      let meta = {};
      if (i < META_CAP) {
        try {
          const metaObj = await binding.get(metaSidecarKey(key));
          if (metaObj?.body) {
            const txt = await metaObj.text();
            meta = JSON.parse(txt || '{}');
          }
        } catch {
          meta = {};
        }
      }
      const kind = rowKind(key);
      out.push({
        id: mediaKeyToId(key),
        kind,
        filename: basenameKey(key),
        r2_key: key,
        uploaded,
        url: proxyObjectUrl(url, key),
        thumbnail: kind === 'image' ? proxyObjectUrl(url, key) : '',
        variants: [],
        meta: typeof meta === 'object' && meta ? meta : {},
      });
    }

    return jsonResponse({
      images: out,
      accountHash: '',
      source: 'r2',
      bucket: BUCKET,
      mode,
      workspace_slug: listPack.slug || undefined,
      prefixes: listPack.prefixes,
      registry: 'r2_only',
    });
  }

  // ── POST /api/images (upload) ─────────────────────────────────────────────
  if (pathLower === '/api/images' && method === 'POST') {
    const ct = (request.headers.get('Content-Type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      const srcUrl = String(body.url || '').trim();
      if (!srcUrl) return jsonResponse({ error: 'url required', source: 'r2' }, 400);
      let res;
      try {
        res = await fetch(srcUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'InnerAnimalMedia-ImagesImport/1.0' },
        });
      } catch (e) {
        return jsonResponse({ error: `fetch failed: ${e?.message || e}`, source: 'r2' }, 400);
      }
      if (!res.ok) return jsonResponse({ error: `upstream ${res.status}`, source: 'r2' }, 400);
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_IMPORT_BYTES) {
        return jsonResponse({ error: 'image too large (max 15MB)', source: 'r2' }, 400);
      }
      const upstreamCt = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (!upstreamCt.startsWith('image/')) {
        return jsonResponse({ error: 'URL did not return an image content-type', source: 'r2' }, 400);
      }
      const ext =
        upstreamCt === 'image/jpeg'
          ? 'jpg'
          : upstreamCt === 'image/png'
            ? 'png'
            : upstreamCt === 'image/webp'
              ? 'webp'
              : upstreamCt === 'image/gif'
                ? 'gif'
                : upstreamCt === 'image/svg+xml'
                  ? 'svg'
                  : upstreamCt === 'image/avif'
                    ? 'avif'
                    : 'bin';
      const safeExt = ext === 'bin' ? 'jpg' : ext;
      const key = `${uploadPrefix}import-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;
      await binding.put(key, buf, { httpMetadata: { contentType: upstreamCt || 'application/octet-stream' } });
      const img = {
        id: mediaKeyToId(key),
        kind: 'image',
        filename: basenameKey(key),
        r2_key: key,
        uploaded: new Date().toISOString(),
        url: proxyObjectUrl(url, key),
        thumbnail: proxyObjectUrl(url, key),
        variants: [],
        meta: {},
      };
      return jsonResponse({ ok: true, image: img, source: 'r2' });
    }

    const fd = await request.formData().catch(() => null);
    const file = fd?.get('file');
    if (!file || typeof file === 'string') {
      return jsonResponse({ error: 'file field required', source: 'r2' }, 400);
    }
    const fnameRaw = ('name' in file && file.name) || 'upload';
    const safeName = String(fnameRaw).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    const buf = await file.arrayBuffer();
    if (buf.byteLength > MAX_IMPORT_BYTES) {
      return jsonResponse({ error: 'file too large (max 15MB)', source: 'r2' }, 400);
    }
    const mime = (file.type || 'application/octet-stream').split(';')[0].trim();
    const key = `${uploadPrefix}${Date.now()}-${safeName}`;
    await binding.put(key, buf, { httpMetadata: { contentType: mime || getContentTypeFromKey(key) } });
    const kind = rowKind(key);
    const img = {
      id: mediaKeyToId(key),
      kind,
      filename: basenameKey(key),
      r2_key: key,
      uploaded: new Date().toISOString(),
      url: proxyObjectUrl(url, key),
      thumbnail: kind === 'image' ? proxyObjectUrl(url, key) : '',
      variants: [],
      meta: {},
    };
    return jsonResponse({ ok: true, image: img, source: 'r2' });
  }

  const metaMatch = path.match(/^\/api\/images\/([^/]+)\/meta$/i);
  const delMatch = path.match(/^\/api\/images\/([^/]+)$/i);

  // ── POST /api/images/:id/meta ─────────────────────────────────────────────
  if (metaMatch && method === 'POST') {
    const key = mediaIdToKey(metaMatch[1]);
    if (!key) return jsonResponse({ error: 'Not found', source: 'r2' }, 404);
    if (!(await canAccessMediaObjectKey(env, authUser, key))) {
      return jsonResponse({ error: 'Forbidden', source: 'r2' }, 403);
    }
    const payload = await request.json().catch(() => ({}));
    const metaJson = JSON.stringify(payload ?? {}, null, 0);
    await binding.put(metaSidecarKey(key), metaJson, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    return jsonResponse({ ok: true, meta: payload ?? {}, source: 'r2' });
  }

  // ── DELETE /api/images/:id ────────────────────────────────────────────────
  if (delMatch && method === 'DELETE') {
    const key = mediaIdToKey(delMatch[1]);
    if (!key) return jsonResponse({ error: 'Not found', source: 'r2' }, 404);
    if (!(await canAccessMediaObjectKey(env, authUser, key))) {
      return jsonResponse({ error: 'Forbidden', source: 'r2' }, 403);
    }
    await binding.delete(key).catch(() => {});
    await binding.delete(metaSidecarKey(key)).catch(() => {});
    return jsonResponse({ ok: true, source: 'r2' });
  }

  return jsonResponse({ error: 'Not found', source: 'r2' }, 404);
}

function getContentTypeFromKey(key) {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.har')) return 'application/json';
  if (lower.endsWith('.jsonl')) return 'application/x-ndjson';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  return 'application/octet-stream';
}
