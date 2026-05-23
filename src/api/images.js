/**
 * Unified dashboard images API — D1 registry + Cloudflare Images + Google Drive.
 *
 * P0 data isolation audit 2026-05-23 — unscoped SELECT lines (grep -v WHERE user_id|workspace_id|tenant_id):
 * Full log: artifacts/p0-data-isolation-audit-20260523.txt
 * images list: WHERE user_id = ? AND workspace_id = ? (see listD1Images).
 *
 * GET    /api/images?source=all|r2|cf_images|drive&page=1&per_page=50
 * POST   /api/images/upload  (multipart) — also POST /api/images (multipart or JSON url)
 * POST   /api/images/import/drive  { drive_file_id }
 * DELETE /api/images/:id
 * POST   /api/images/generate | /api/images/edit | /api/images/:id/meta  (legacy compat)
 */

import { jsonResponse } from '../core/responses.js';
import { getR2Binding } from './r2-api.js';
import { getOAuthToken } from '../core/user-oauth-token.js';
import { canAccessMediaObjectKey } from '../core/media-r2-access.js';
import { runImageGenerationForTool } from '../tools/image_generation.js';

const BUCKET = 'inneranimalmedia';
const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

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

function cfDeliveryUrl(accountHash, imageId, variant = 'public') {
  if (!accountHash || !imageId) return '';
  return `https://imagedelivery.net/${accountHash}/${imageId}/${variant}`;
}

function proxyR2Url(origin, key) {
  return `${origin}/api/r2/buckets/${encodeURIComponent(BUCKET)}/object/${encodeURIComponent(key)}`;
}

function extFromMime(mime) {
  const ct = String(mime || '').split(';')[0].trim().toLowerCase();
  if (ct === 'image/jpeg') return 'jpg';
  if (ct === 'image/png') return 'png';
  if (ct === 'image/webp') return 'webp';
  if (ct === 'image/gif') return 'gif';
  if (ct === 'image/svg+xml') return 'svg';
  if (ct === 'image/avif') return 'avif';
  return 'jpg';
}

function safeFilename(name) {
  return String(name || 'upload')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

function createdAtIso(unix) {
  const n = Number(unix);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

function parseTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function rowSource(row) {
  if (row.cloudflare_image_id) return 'cf_images';
  return 'r2';
}

function mapD1RowToItem(row, { origin, accountHash }) {
  const source = rowSource(row);
  let url = row.url || '';
  let thumbnail_url = row.thumbnail_url || '';
  if (!url && row.cloudflare_image_id && accountHash) {
    url = cfDeliveryUrl(accountHash, row.cloudflare_image_id, 'public');
  }
  if (!url && row.r2_key && origin) {
    url = proxyR2Url(origin, row.r2_key);
  }
  if (!thumbnail_url) {
    thumbnail_url =
      (row.cloudflare_image_id && accountHash
        ? cfDeliveryUrl(accountHash, row.cloudflare_image_id, 'thumbnail')
        : '') || url;
  }
  return {
    id: row.id,
    source,
    filename: row.filename || row.original_filename || 'image',
    url,
    thumbnail_url,
    mime_type: row.mime_type || 'image/jpeg',
    size: Number(row.size) || 0,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    created_at: createdAtIso(row.created_at),
    user_id: row.user_id,
    workspace_id: row.workspace_id,
    r2_key: row.r2_key || null,
    cloudflare_image_id: row.cloudflare_image_id || null,
    alt_text: row.alt_text || null,
    tags: parseTags(row.tags),
  };
}

function mapCfApiImage(img, accountHash, authUserId) {
  const meta = img.metadata || img.meta || {};
  const userMeta = meta.userId || meta.user_id || meta.userid;
  if (userMeta && String(userMeta) !== String(authUserId)) return null;
  const id = img.id;
  const url = cfDeliveryUrl(accountHash, id, 'public');
  return {
    id: `cf_live_${id}`,
    source: 'cf_images',
    filename: meta.filename || meta.name || id,
    url,
    thumbnail_url: cfDeliveryUrl(accountHash, id, 'thumbnail') || url,
    mime_type: meta.mime || 'image/jpeg',
    size: Number(img.size) || 0,
    width: img.width != null ? Number(img.width) : null,
    height: img.height != null ? Number(img.height) : null,
    created_at: img.uploaded || img.created || new Date().toISOString(),
    user_id: authUserId,
    workspace_id: meta.workspaceId || meta.workspace_id || null,
    r2_key: null,
    cloudflare_image_id: id,
    alt_text: null,
    tags: [],
    _cf_only: true,
  };
}

function mapDriveFile(file, authUserId) {
  return {
    id: `drive_${file.id}`,
    source: 'drive',
    filename: file.name || file.id,
    url: file.webViewLink || file.webContentLink || '',
    thumbnail_url: file.thumbnailLink || '',
    mime_type: file.mimeType || 'image/jpeg',
    size: Number(file.size) || 0,
    width: null,
    height: null,
    created_at: file.createdTime || new Date().toISOString(),
    user_id: authUserId,
    workspace_id: null,
    r2_key: null,
    cloudflare_image_id: null,
    drive_file_id: file.id,
    alt_text: null,
    tags: [],
  };
}

async function resolveScope(env, authUser, identity, wsHint) {
  const userId = String(authUser?.id || '').trim();
  const workspaceId =
    String(wsHint || identity?.workspaceId || authUser?.workspace_id || '').trim() || null;
  let tenantId = String(identity?.tenantId || authUser?.tenant_id || '').trim() || null;
  if (!tenantId && workspaceId && env?.DB) {
    const row = await env.DB.prepare(
      `SELECT tenant_id FROM agentsam_workspace WHERE id = ? LIMIT 1`,
    )
      .bind(workspaceId)
      .first()
      .catch(() => null);
    tenantId = row?.tenant_id ? String(row.tenant_id) : tenantId;
  }
  if (!tenantId) {
    tenantId = String(authUser?.tenant_id || '').trim() || null;
  }
  if (!workspaceId) return { error: 'workspace_id required', status: 400 };
  if (!tenantId) return { error: 'tenant_id could not be resolved', status: 400 };
  return { userId, workspaceId, tenantId };
}

async function listD1Images(env, { userId, workspaceId, source, limit, offset }) {
  let sql = `SELECT * FROM images
    WHERE user_id = ? AND workspace_id = ? AND COALESCE(status, 'active') = 'active'`;
  const binds = [userId, workspaceId];
  if (source === 'r2') {
    sql += ` AND (cloudflare_image_id IS NULL OR cloudflare_image_id = '')`;
  } else if (source === 'cf_images') {
    sql += ` AND cloudflare_image_id IS NOT NULL AND cloudflare_image_id != ''`;
  }
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results || [];
}

async function listCfImagesLive(env, authUserId, knownCfIds) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  if (!accountId || !token || !accountHash) return { items: [], accountHash: '' };

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1?per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) return { items: [], accountHash };

  const known = knownCfIds || new Set();
  const items = [];
  for (const img of data.result?.images || data.result || []) {
    if (!img?.id || known.has(img.id)) continue;
    const mapped = mapCfApiImage(img, accountHash, authUserId);
    if (mapped) items.push(mapped);
  }
  return { items, accountHash };
}

async function listDriveImages(env, userId) {
  const token = await getOAuthToken(env, userId, 'google_drive');
  if (!token) return { items: [], connected: false };

  const q = encodeURIComponent("mimeType contains 'image/' and trashed = false");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,createdTime,thumbnailLink,webViewLink,webContentLink)&pageSize=100&orderBy=createdTime desc`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { items: [], connected: true, error: data.error?.message || res.statusText };
  }
  const items = (data.files || []).map((f) => mapDriveFile(f, userId));
  return { items, connected: true };
}

async function uploadToCfImages(env, file, metadata) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
  if (!accountId || !token) {
    return { error: 'Cloudflare Images not configured', status: 503 };
  }
  const form = new FormData();
  form.append('file', file, file.name || 'upload.jpg');
  form.append('requireSignedURLs', 'false');
  form.append('metadata', JSON.stringify(metadata));

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    const msg = json?.errors?.[0]?.message || json?.messages?.[0]?.message || 'CF Images upload failed';
    return { error: msg, status: res.status >= 400 ? res.status : 502 };
  }
  const imageId = json?.result?.id;
  if (!imageId) return { error: 'No image id from Cloudflare', status: 502 };
  return {
    imageId,
    variants: json?.result?.variants || [],
    uploaded: json?.result?.uploaded,
  };
}

async function deleteCfImage(env, cfImageId) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
  if (!accountId || !token || !cfImageId) return;
  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(cfImageId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  ).catch(() => {});
}

async function insertImageRow(env, row) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO images (
      id, tenant_id, project_id, user_id, filename, original_filename,
      mime_type, size, width, height, r2_key, cloudflare_image_id,
      url, thumbnail_url, alt_text, description, tags, metadata, status,
      created_at, updated_at, workspace_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )`,
  )
    .bind(
      row.id,
      row.tenant_id,
      row.project_id || null,
      row.user_id,
      row.filename,
      row.original_filename,
      row.mime_type,
      row.size,
      row.width,
      row.height,
      row.r2_key,
      row.cloudflare_image_id,
      row.url,
      row.thumbnail_url,
      row.alt_text,
      row.description,
      row.tags,
      row.metadata,
      'active',
      now,
      now,
      row.workspace_id,
    )
    .run();
  return { ...row, created_at: now, updated_at: now };
}

async function handleGetImages(request, url, env, authUser, identity) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);

  const source = (url.searchParams.get('source') || 'all').toLowerCase();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10) || 50));
  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const origin = url.origin;

  if (source === 'drive') {
    const drive = await listDriveImages(env, scope.userId);
    const total = drive.items.length;
    const start = (page - 1) * perPage;
    const items = drive.items.slice(start, start + perPage);
    return jsonResponse({
      items,
      images: items,
      total,
      page,
      per_page: perPage,
      drive_connected: drive.connected,
      accountHash,
    });
  }

  const merged = [];
  const knownCf = new Set();

  if (source === 'all' || source === 'r2' || source === 'cf_images') {
    const d1Rows = await listD1Images(env, {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      source: source === 'all' ? null : source,
      limit: 5000,
      offset: 0,
    });
    for (const row of d1Rows) {
      if (row.cloudflare_image_id) knownCf.add(row.cloudflare_image_id);
      merged.push(mapD1RowToItem(row, { origin, accountHash }));
    }
  }

  if ((source === 'all' || source === 'cf_images') && env.CLOUDFLARE_IMAGES_TOKEN) {
    const live = await listCfImagesLive(env, scope.userId, knownCf);
    merged.push(...live.items);
  }

  merged.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = merged.length;
  const start = (page - 1) * perPage;
  const items = merged.slice(start, start + perPage);

  return jsonResponse({
    items,
    images: items,
    total,
    page,
    per_page: perPage,
    accountHash,
    workspace_id: scope.workspaceId,
  });
}

async function handleUpload(request, url, env, authUser, identity) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const binding = getR2Binding(env, BUCKET);
  if (!binding?.put) return jsonResponse({ error: 'R2 not configured' }, 503);

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  let buf;
  let mime;
  let originalName;
  let altText = '';
  let tagsJson = '[]';

  if (ct.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    altText = String(body.alt_text || '').trim();
    tagsJson = JSON.stringify(Array.isArray(body.tags) ? body.tags : []);
    const srcUrl = String(body.url || '').trim();
    if (!srcUrl) return jsonResponse({ error: 'url required' }, 400);
    let res;
    try {
      res = await fetch(srcUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'InnerAnimalMedia-ImagesImport/1.0' },
      });
    } catch (e) {
      return jsonResponse({ error: `fetch failed: ${e?.message || e}` }, 400);
    }
    if (!res.ok) return jsonResponse({ error: `upstream ${res.status}` }, 400);
    buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return jsonResponse({ error: 'image too large (max 15MB)' }, 400);
    mime = (res.headers.get('Content-Type') || 'image/jpeg').split(';')[0].trim();
    if (!mime.startsWith('image/')) return jsonResponse({ error: 'URL did not return an image' }, 400);
    originalName = safeFilename(srcUrl.split('/').pop() || 'import.jpg');
  } else {
    const fd = await request.formData().catch(() => null);
    const file = fd?.get('file');
    if (!file || typeof file === 'string') return jsonResponse({ error: 'file required' }, 400);
    altText = String(fd?.get('alt_text') || '').trim();
    const tagsRaw = fd?.get('tags');
    if (tagsRaw && typeof tagsRaw === 'string') {
      try {
        tagsJson = JSON.stringify(JSON.parse(tagsRaw));
      } catch {
        tagsJson = JSON.stringify(
          tagsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
    }
    buf = await file.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return jsonResponse({ error: 'file too large (max 15MB)' }, 400);
    mime = (file.type || 'image/jpeg').split(';')[0].trim();
    originalName = safeFilename(('name' in file && file.name) || 'upload.jpg');
  }

  const ext = extFromMime(mime);
  const imageUuid = crypto.randomUUID();
  const r2Key = `images/${scope.workspaceId}/${scope.userId}/${imageUuid}.${ext}`;
  const filename = originalName || `${imageUuid}.${ext}`;

  const metadata = {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    tenantId: scope.tenantId,
    filename,
  };

  const fileBlob = new File([buf], filename, { type: mime });
  const cf = await uploadToCfImages(env, fileBlob, metadata);
  if (cf.error) return jsonResponse({ error: cf.error }, cf.status || 502);

  await binding.put(r2Key, buf, { httpMetadata: { contentType: mime } });

  const cfId = cf.imageId;
  const publicUrl = accountHash ? cfDeliveryUrl(accountHash, cfId, 'public') : '';
  const thumbUrl = accountHash ? cfDeliveryUrl(accountHash, cfId, 'thumbnail') : publicUrl;

  const rowId = `img_${imageUuid.replace(/-/g, '').slice(0, 24)}`;
  const row = await insertImageRow(env, {
    id: rowId,
    tenant_id: scope.tenantId,
    project_id: null,
    user_id: scope.userId,
    filename,
    original_filename: originalName,
    mime_type: mime,
    size: buf.byteLength,
    width: null,
    height: null,
    r2_key: r2Key,
    cloudflare_image_id: cfId,
    url: publicUrl,
    thumbnail_url: thumbUrl,
    alt_text: altText || null,
    description: null,
    tags: tagsJson,
    metadata: JSON.stringify(metadata),
    workspace_id: scope.workspaceId,
  });

  const item = mapD1RowToItem(row, { origin: url.origin, accountHash });
  return jsonResponse({ ok: true, item, image: item });
}

async function handleDriveImport(request, url, env, authUser, identity) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);

  const body = await request.json().catch(() => ({}));
  const driveFileId = String(body.drive_file_id || body.file_id || '').trim();
  if (!driveFileId) return jsonResponse({ error: 'drive_file_id required' }, 400);

  const token = await getOAuthToken(env, scope.userId, 'google_drive');
  if (!token) return jsonResponse({ error: 'Google Drive not connected' }, 400);

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?fields=id,name,mimeType,size`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const meta = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok) return jsonResponse({ error: meta.error?.message || 'Drive file not found' }, 404);

  const dlRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!dlRes.ok) return jsonResponse({ error: 'Drive download failed' }, 502);
  const buf = await dlRes.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return jsonResponse({ error: 'file too large (max 15MB)' }, 400);

  const mime = meta.mimeType || 'image/jpeg';
  const filename = safeFilename(meta.name || `drive-${driveFileId}.jpg`);
  const ext = extFromMime(mime);
  const imageUuid = crypto.randomUUID();
  const r2Key = `images/${scope.workspaceId}/${scope.userId}/${imageUuid}.${ext}`;

  const binding = getR2Binding(env, BUCKET);
  if (!binding?.put) return jsonResponse({ error: 'R2 not configured' }, 503);
  await binding.put(r2Key, buf, { httpMetadata: { contentType: mime } });

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  let cfId = null;
  let publicUrl = proxyR2Url(url.origin, r2Key);
  let thumbUrl = publicUrl;

  const fileBlob = new File([buf], filename, { type: mime });
  const cf = await uploadToCfImages(env, fileBlob, {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    tenantId: scope.tenantId,
    filename,
    driveFileId,
  });
  if (!cf.error && cf.imageId) {
    cfId = cf.imageId;
    publicUrl = cfDeliveryUrl(accountHash, cfId, 'public') || publicUrl;
    thumbUrl = cfDeliveryUrl(accountHash, cfId, 'thumbnail') || publicUrl;
  }

  const rowId = `img_${imageUuid.replace(/-/g, '').slice(0, 24)}`;
  const row = await insertImageRow(env, {
    id: rowId,
    tenant_id: scope.tenantId,
    project_id: null,
    user_id: scope.userId,
    filename,
    original_filename: meta.name || filename,
    mime_type: mime,
    size: buf.byteLength,
    width: null,
    height: null,
    r2_key: r2Key,
    cloudflare_image_id: cfId,
    url: publicUrl,
    thumbnail_url: thumbUrl,
    alt_text: null,
    description: null,
    tags: JSON.stringify(['drive_import']),
    metadata: JSON.stringify({ drive_file_id: driveFileId }),
    workspace_id: scope.workspaceId,
  });

  const item = mapD1RowToItem(row, { origin: url.origin, accountHash });
  return jsonResponse({ ok: true, item, image: item });
}

async function handleDelete(imageId, request, url, env, authUser, identity) {
  if (String(imageId).startsWith('drive_')) {
    return jsonResponse({ error: 'Drive items must be imported before delete' }, 400);
  }
  if (String(imageId).startsWith('cf_live_')) {
    const cfId = String(imageId).slice('cf_live_'.length);
    await deleteCfImage(env, cfId);
    return jsonResponse({ ok: true, deleted: cfId, source: 'cf_images' });
  }

  const legacyKey = mediaIdToKey(imageId);
  if (legacyKey) {
    const binding = getR2Binding(env, BUCKET);
    if (!(await canAccessMediaObjectKey(env, authUser, legacyKey))) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    await binding?.delete?.(legacyKey).catch(() => {});
    await binding?.delete?.(metaSidecarKey(legacyKey)).catch(() => {});
    return jsonResponse({ ok: true, source: 'r2_legacy' });
  }

  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const row = await env.DB.prepare(`SELECT * FROM images WHERE id = ? LIMIT 1`)
    .bind(imageId)
    .first();
  if (!row) return jsonResponse({ error: 'Not found' }, 404);
  if (String(row.user_id) !== String(authUser.id)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  if (row.cloudflare_image_id) await deleteCfImage(env, row.cloudflare_image_id);
  if (row.r2_key) {
    const binding = getR2Binding(env, BUCKET);
    await binding?.delete?.(row.r2_key).catch(() => {});
  }

  await env.DB.prepare(
    `UPDATE images SET status = 'deleted', updated_at = unixepoch() WHERE id = ? AND user_id = ?`,
  )
    .bind(imageId, authUser.id)
    .run();

  return jsonResponse({ ok: true, id: imageId });
}

async function handleLegacyMeta(request, env, authUser, imageId) {
  const key = mediaIdToKey(imageId);
  if (!key) return jsonResponse({ error: 'Not found' }, 404);
  const binding = getR2Binding(env, BUCKET);
  if (!(await canAccessMediaObjectKey(env, authUser, key))) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }
  const payload = await request.json().catch(() => ({}));
  await binding.put(metaSidecarKey(key), JSON.stringify(payload ?? {}), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  return jsonResponse({ ok: true, meta: payload ?? {} });
}

async function handleLegacyD1Meta(env, authUser, imageId, payload) {
  const row = await env.DB.prepare(`SELECT user_id, metadata FROM images WHERE id = ? LIMIT 1`)
    .bind(imageId)
    .first();
  if (!row) return jsonResponse({ error: 'Not found' }, 404);
  if (String(row.user_id) !== String(authUser.id)) return jsonResponse({ error: 'Forbidden' }, 403);
  let meta = {};
  try {
    meta = row.metadata ? JSON.parse(row.metadata) : {};
  } catch {
    meta = {};
  }
  const merged = { ...meta, ...payload };
  await env.DB.prepare(`UPDATE images SET metadata = ?, updated_at = unixepoch() WHERE id = ?`)
    .bind(JSON.stringify(merged), imageId)
    .run();
  return jsonResponse({ ok: true, meta: merged });
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {unknown} env
 * @param {unknown} authUser
 * @param {{ workspaceId?: string, tenantId?: string } | null | undefined} identity
 */
export async function handleImagesApi(request, url, env, authUser, identity) {
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = request.method.toUpperCase();
  const wsHint = url.searchParams.get('workspace_id')?.trim() || identity?.workspaceId || '';

  if (pathLower === '/api/images' && method === 'GET') {
    return handleGetImages(request, url, env, authUser, identity);
  }

  if ((pathLower === '/api/images/upload' || pathLower === '/api/images') && method === 'POST') {
    return handleUpload(request, url, env, authUser, identity);
  }

  if (pathLower === '/api/images/import/drive' && method === 'POST') {
    return handleDriveImport(request, url, env, authUser, identity);
  }

  if (pathLower === '/api/images/generate' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || body.description || '').trim();
    if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);
    try {
      const out = await runImageGenerationForTool(env, 'imgx_generate_image', body, {
        authUser,
        workspaceId: wsHint || identity?.workspaceId || null,
        tenantId: identity?.tenantId || null,
        userId: authUser?.id || null,
        origin: url.origin,
      });
      return jsonResponse({ ok: true, ...out, source: 'image_gen' });
    } catch (e) {
      return jsonResponse({ error: e?.message || 'generate failed' }, 500);
    }
  }

  if (pathLower === '/api/images/edit' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    const imageUrl = String(body.image_url || body.image || '').trim();
    if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);
    if (!imageUrl) return jsonResponse({ error: 'image_url required' }, 400);
    try {
      const out = await runImageGenerationForTool(env, 'imgx_edit_image', body, {
        authUser,
        workspaceId: wsHint || identity?.workspaceId || null,
        tenantId: identity?.tenantId || null,
        userId: authUser?.id || null,
        origin: url.origin,
      });
      return jsonResponse({ ok: true, ...out, source: 'image_gen' });
    } catch (e) {
      return jsonResponse({ error: e?.message || 'edit failed' }, 500);
    }
  }

  const metaMatch = path.match(/^\/api\/images\/([^/]+)\/meta$/i);
  if (metaMatch && method === 'POST') {
    const imageId = metaMatch[1];
    const payload = await request.json().catch(() => ({}));
    if (mediaIdToKey(imageId)) return handleLegacyMeta(request, env, authUser, imageId);
    if (env?.DB) return handleLegacyD1Meta(env, authUser, imageId, payload);
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const delMatch = path.match(/^\/api\/images\/([^/]+)$/i);
  if (delMatch && method === 'DELETE') {
    return handleDelete(delMatch[1], request, url, env, authUser, identity);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

/** @deprecated alias */
export const handleImagesWorkspaceApi = handleImagesApi;
