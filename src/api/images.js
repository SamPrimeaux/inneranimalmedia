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
 * POST   /api/images/generate  { persist: false default — draft until commit }
 * POST   /api/images/commit   { generation_id } — save draft to library
 * POST   /api/images/discard  { generation_id } — delete draft
 * POST   /api/images/edit | /api/images/:id/meta  (legacy compat)
 * GET    /api/images/tags?workspace_id=
 * PATCH  /api/images/:id  { tags, label, notes, alt_text, category, project_slug, is_live, preferred_bg }
 *
 * Storage sync (triple-write):
 * - D1 `images` — query/filter SSOT for dashboard
 * - CF Images `meta` — PATCH v1/{id} on save; read on cf_live list (1024 byte cap)
 * - R2 customMetadata (x-amz-meta-* iam_* keys, 2KB) + `{key}.iammeta.json` sidecar for full notes
 */

import { jsonResponse } from '../core/responses.js';
import { getR2Binding } from './r2-api.js';
import { getOAuthToken } from '../core/user-oauth-token.js';
import { canAccessMediaObjectKey } from '../core/media-r2-access.js';
import { runImageGenerationForTool } from '../tools/image_generation.js';
import {
  commitImageDraft,
  discardImageDraft,
  imageGenerationShouldPersist,
} from '../core/image-draft-store.js';
import {
  enrichItemsFromR2CustomMetadata,
  normalizeTags,
  parseIamMetaFromStorage,
  putR2ImageWithCustomMetadata,
  syncR2ObjectCustomMetadata,
} from '../core/r2-image-metadata.js';

const BUCKET = 'inneranimalmedia';
const MAX_BYTES = 15 * 1024 * 1024;
const CF_META_MAX_BYTES = 1024;
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
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map((t) => String(t).trim()).filter(Boolean) : [];
  } catch {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(String(raw));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

function buildMetaFromRow(row) {
  const metaObj = parseMetadata(row.metadata);
  return {
    label: metaObj.label || row.filename || row.original_filename || '',
    is_live: !!metaObj.is_live,
    preferred_bg: metaObj.preferred_bg || '',
    notes: metaObj.notes || metaObj.description || row.description || '',
    tenant_slug: metaObj.tenant_slug || '',
    category: metaObj.category || '',
    project_slug: metaObj.project_slug || '',
  };
}

/** CF Images meta payload — must stay under 1024 bytes (JSON string). */
function buildCfImagesMetaPayload({ tags, meta, scope, alt_text, filename }) {
  const normalized = normalizeTags(tags);
  /** @type {Record<string, string>} */
  const cfMeta = {
    userId: String(scope.userId || '').slice(0, 64),
    workspaceId: String(scope.workspaceId || '').slice(0, 64),
    tenantId: String(scope.tenantId || '').slice(0, 64),
    filename: String(filename || meta?.label || '').slice(0, 120),
  };
  if (normalized.length) cfMeta.iam_tags = normalized.join(',').slice(0, 400);
  if (meta?.label) cfMeta.iam_label = String(meta.label).slice(0, 120);
  if (meta?.category) cfMeta.iam_category = String(meta.category).slice(0, 64);
  if (meta?.project_slug) cfMeta.iam_project_slug = String(meta.project_slug).slice(0, 64);
  if (meta?.tenant_slug) cfMeta.iam_tenant_slug = String(meta.tenant_slug).slice(0, 64);
  if (meta?.preferred_bg) cfMeta.iam_preferred_bg = String(meta.preferred_bg).slice(0, 16);
  if (meta?.is_live) cfMeta.iam_is_live = '1';
  if (alt_text) cfMeta.iam_alt_text = String(alt_text).slice(0, 160);
  if (meta?.notes) cfMeta.iam_notes = String(meta.notes).slice(0, 240);

  let json = JSON.stringify(cfMeta);
  while (json.length > CF_META_MAX_BYTES && cfMeta.iam_notes) {
    cfMeta.iam_notes = cfMeta.iam_notes.slice(0, Math.max(0, cfMeta.iam_notes.length - 32));
    if (!cfMeta.iam_notes) delete cfMeta.iam_notes;
    json = JSON.stringify(cfMeta);
  }
  while (json.length > CF_META_MAX_BYTES && cfMeta.iam_tags) {
    const parts = cfMeta.iam_tags.split(',');
    parts.pop();
    if (parts.length) cfMeta.iam_tags = parts.join(',');
    else delete cfMeta.iam_tags;
    json = JSON.stringify(cfMeta);
  }
  return cfMeta;
}

function buildR2SidecarPayload({ tags, meta, alt_text, scope }) {
  return {
    tags: normalizeTags(tags),
    meta: meta || {},
    alt_text: alt_text || null,
    workspace_id: scope.workspaceId,
    user_id: scope.userId,
    tenant_id: scope.tenantId,
    synced_at: new Date().toISOString(),
  };
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
    project_id: row.project_id || null,
    r2_key: row.r2_key || null,
    cloudflare_image_id: row.cloudflare_image_id || null,
    alt_text: row.alt_text || null,
    description: row.description || null,
    tags: parseTags(row.tags),
    meta: buildMetaFromRow(row),
  };
}

function mapCfApiImage(img, accountHash, authUserId) {
  const meta = img.metadata || img.meta || {};
  const userMeta = meta.userId || meta.user_id || meta.userid;
  if (userMeta && String(userMeta) !== String(authUserId)) return null;
  const parsed = parseIamMetaFromStorage(meta);
  const id = img.id;
  const url = cfDeliveryUrl(accountHash, id, 'public');
  return {
    id: `cf_live_${id}`,
    source: 'cf_images',
    filename: parsed.meta.label || meta.filename || meta.name || id,
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
    alt_text: parsed.alt_text,
    tags: parsed.tags,
    meta: {
      ...parsed.meta,
      label: parsed.meta.label || meta.filename || meta.name || id,
    },
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

async function listD1Images(env, { userId, workspaceId, source, tag, search, limit, offset }) {
  let sql = `SELECT * FROM images
    WHERE user_id = ? AND workspace_id = ? AND COALESCE(status, 'active') = 'active'`;
  const binds = [userId, workspaceId];
  if (source === 'r2') {
    sql += ` AND (cloudflare_image_id IS NULL OR cloudflare_image_id = '')`;
  } else if (source === 'cf_images') {
    sql += ` AND cloudflare_image_id IS NOT NULL AND cloudflare_image_id != ''`;
  }
  if (tag) {
    sql += ` AND (
      lower(tags) LIKE ? OR lower(tags) LIKE ? OR lower(tags) LIKE ? OR lower(tags) = ?
    )`;
    const t = String(tag).trim().toLowerCase();
    binds.push(`%"${t}"%`, `%"${t}"`, `%${t},%`, `["${t}"]`);
  }
  if (search) {
    const q = `%${String(search).trim().toLowerCase()}%`;
    sql += ` AND (
      lower(COALESCE(filename, '')) LIKE ? OR lower(COALESCE(original_filename, '')) LIKE ?
      OR lower(COALESCE(alt_text, '')) LIKE ? OR lower(COALESCE(description, '')) LIKE ?
      OR lower(COALESCE(tags, '')) LIKE ? OR lower(COALESCE(metadata, '')) LIKE ?
    )`;
    binds.push(q, q, q, q, q, q);
  }
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results || [];
}

async function listAllCfImagesLive(env, authUserId, knownCfIds) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  if (!accountId || !token || !accountHash) return { items: [], accountHash: '' };

  const known = knownCfIds || new Set();
  const items = [];
  let continuationToken = null;
  let pages = 0;
  const MAX_PAGES = 64;

  const mapBatch = (images) => {
    for (const img of images || []) {
      if (!img?.id || known.has(img.id)) continue;
      const mapped = mapCfApiImage(img, accountHash, authUserId);
      if (mapped) items.push(mapped);
    }
  };

  // Prefer V2 — up to 1000 per page + continuation_token (full account catalog).
  do {
    const qs = new URLSearchParams({ per_page: '1000', sort_order: 'desc' });
    if (continuationToken) qs.set('continuation_token', continuationToken);
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      const result = data.result || {};
      mapBatch(result.images);
      continuationToken = result.continuation_token || null;
      pages += 1;
      if (!continuationToken) break;
      continue;
    }
    // Fallback to V1 page index when V2 is unavailable.
    continuationToken = null;
    break;
  } while (continuationToken && pages < MAX_PAGES);

  if (items.length === 0 && pages === 0) {
    let page = 1;
    while (page <= MAX_PAGES) {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1?page=${page}&per_page=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) break;
      const batch = data.result?.images || data.result || [];
      if (!Array.isArray(batch) || batch.length === 0) break;
      mapBatch(batch);
      if (batch.length < 100) break;
      page += 1;
    }
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

async function patchCfImageMeta(env, cfImageId, metaPayload) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
  if (!accountId || !token || !cfImageId) {
    return { ok: false, error: 'Cloudflare Images not configured' };
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(cfImageId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ metadata: metaPayload, meta: metaPayload }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    const msg = data?.errors?.[0]?.message || data?.messages?.[0]?.message || 'CF Images meta PATCH failed';
    return { ok: false, error: msg, status: res.status };
  }
  return { ok: true, result: data.result };
}

async function writeR2MetaSidecar(binding, r2Key, payload) {
  if (!binding?.put || !r2Key) return;
  await binding.put(metaSidecarKey(r2Key), JSON.stringify(payload ?? {}), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

async function syncR2ImageMeta(env, r2Key, sidecarPayload, tags, scope, sizeBytes) {
  const binding = getR2Binding(env, BUCKET);
  if (!binding?.put || !r2Key) return { ok: false, error: 'R2 not configured' };

  await writeR2MetaSidecar(binding, r2Key, sidecarPayload);

  const sync = await syncR2ObjectCustomMetadata(binding, r2Key, {
    tags,
    meta: sidecarPayload.meta,
    scope,
    alt_text: sidecarPayload.alt_text,
    description: sidecarPayload.description,
    sizeBytes,
    maxBytes: MAX_BYTES,
  });

  return {
    ok: sync.ok,
    customMetadata: sync.customMetadata,
    sidecar_only: !sync.object_updated,
  };
}

async function syncImageStorageMeta(env, row, scope, { tags, meta, alt_text }) {
  const tagList = normalizeTags(tags ?? parseTags(row.tags));
  const metaFields = meta || buildMetaFromRow(row);
  const alt = alt_text ?? row.alt_text ?? null;
  const sync = { cf: null, r2: null };

  if (row.cloudflare_image_id) {
    const cfPayload = buildCfImagesMetaPayload({
      tags: tagList,
      meta: metaFields,
      scope,
      alt_text: alt,
      filename: row.filename,
    });
    sync.cf = await patchCfImageMeta(env, row.cloudflare_image_id, cfPayload);
  }

  if (row.r2_key) {
    const sidecar = buildR2SidecarPayload({
      tags: tagList,
      meta: metaFields,
      alt_text: alt,
      scope,
    });
    sync.r2 = await syncR2ImageMeta(env, row.r2_key, sidecar, tagList, scope, row.size);
  }

  return sync;
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
  const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10) || 50));
  const tagFilter = (url.searchParams.get('tag') || '').trim().toLowerCase();
  const searchQ = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim();
  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const origin = url.origin;

  const matchesFilters = (item) => {
    if (tagFilter) {
      const tags = (item.tags || []).map((t) => String(t).toLowerCase());
      if (!tags.includes(tagFilter)) return false;
    }
    if (searchQ) {
      const q = searchQ.toLowerCase();
      const hay = [
        item.filename,
        item.id,
        item.r2_key,
        item.alt_text,
        item.description,
        item.meta?.label,
        item.meta?.notes,
        item.meta?.category,
        item.meta?.project_slug,
        ...(item.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

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
      tag: null,
      search: null,
      limit: 5000,
      offset: 0,
    });
    for (const row of d1Rows) {
      if (row.cloudflare_image_id) knownCf.add(row.cloudflare_image_id);
      merged.push(mapD1RowToItem(row, { origin, accountHash }));
    }
  }

  if ((source === 'all' || source === 'cf_images') && env.CLOUDFLARE_IMAGES_TOKEN) {
    const live = await listAllCfImagesLive(env, scope.userId, knownCf);
    merged.push(...live.items);
  }

  merged.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const r2Binding = getR2Binding(env, BUCKET);
  const enriched = await enrichItemsFromR2CustomMetadata(r2Binding, merged);

  const filtered = enriched.filter(matchesFilters);
  const total = filtered.length;
  const start = (page - 1) * perPage;
  const items = filtered.slice(start, start + perPage);

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
  const uploadTags = normalizeTags(parseTags(tagsJson));
  const iamMeta = {
    label: filename,
    category: '',
    project_slug: '',
    notes: '',
    tenant_slug: '',
    is_live: false,
    preferred_bg: '',
  };

  const cfMetaPayload = buildCfImagesMetaPayload({
    tags: uploadTags,
    meta: iamMeta,
    scope,
    alt_text: altText,
    filename,
  });

  const fileBlob = new File([buf], filename, { type: mime });
  const cf = await uploadToCfImages(env, fileBlob, cfMetaPayload);
  if (cf.error) return jsonResponse({ error: cf.error }, cf.status || 502);

  const r2Sidecar = buildR2SidecarPayload({
    tags: uploadTags,
    meta: iamMeta,
    alt_text: altText,
    scope,
  });
  await putR2ImageWithCustomMetadata(binding, r2Key, buf, {
    contentType: mime,
    tags: uploadTags,
    meta: iamMeta,
    scope,
    alt_text: altText,
  });
  await writeR2MetaSidecar(binding, r2Key, r2Sidecar);

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
    metadata: JSON.stringify({ ...iamMeta, registered_from: 'upload' }),
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

  const driveTags = ['drive_import'];
  const driveMeta = {
    label: filename,
    category: '',
    project_slug: '',
    notes: '',
    tenant_slug: '',
    is_live: false,
    preferred_bg: '',
  };
  const cfMetaPayload = buildCfImagesMetaPayload({
    tags: driveTags,
    meta: driveMeta,
    scope,
    alt_text: null,
    filename,
  });
  cfMetaPayload.driveFileId = driveFileId;

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  let cfId = null;
  let publicUrl = proxyR2Url(url.origin, r2Key);
  let thumbUrl = publicUrl;

  const fileBlob = new File([buf], filename, { type: mime });
  const cf = await uploadToCfImages(env, fileBlob, cfMetaPayload);
  if (!cf.error && cf.imageId) {
    cfId = cf.imageId;
    publicUrl = cfDeliveryUrl(accountHash, cfId, 'public') || publicUrl;
    thumbUrl = cfDeliveryUrl(accountHash, cfId, 'thumbnail') || publicUrl;
  }

  const r2Sidecar = buildR2SidecarPayload({
    tags: driveTags,
    meta: driveMeta,
    alt_text: null,
    scope,
  });
  await putR2ImageWithCustomMetadata(binding, r2Key, buf, {
    contentType: mime,
    tags: driveTags,
    meta: driveMeta,
    scope,
    alt_text: null,
    extra: { drive_file_id: driveFileId },
  });
  await writeR2MetaSidecar(binding, r2Key, r2Sidecar);

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
    tags: JSON.stringify(driveTags),
    metadata: JSON.stringify({ ...driveMeta, drive_file_id: driveFileId }),
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
    await binding?.delete?.(metaSidecarKey(row.r2_key)).catch(() => {});
  }

  await env.DB.prepare(
    `UPDATE images SET status = 'deleted', updated_at = unixepoch() WHERE id = ? AND user_id = ?`,
  )
    .bind(imageId, authUser.id)
    .run();

  return jsonResponse({ ok: true, id: imageId });
}

async function fetchCfImageDetail(env, cfId) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
  if (!accountId || !token || !cfId) return null;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(cfId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) return null;
  return data.result || null;
}

async function registerCfImageToD1(env, scope, authUser, cfId, origin) {
  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const existing = await env.DB.prepare(
    `SELECT * FROM images
     WHERE cloudflare_image_id = ? AND user_id = ? AND workspace_id = ?
       AND COALESCE(status, 'active') = 'active'
     LIMIT 1`,
  )
    .bind(cfId, scope.userId, scope.workspaceId)
    .first()
    .catch(() => null);
  if (existing) return existing;

  const cfImg = await fetchCfImageDetail(env, cfId);
  const cfRawMeta = cfImg?.metadata || cfImg?.meta || {};
  const parsed = parseIamMetaFromStorage(cfRawMeta);
  const imageUuid = crypto.randomUUID();
  const rowId = `img_${imageUuid.replace(/-/g, '').slice(0, 24)}`;
  const filename = safeFilename(parsed.meta.label || cfRawMeta.filename || cfRawMeta.name || cfId);
  const publicUrl = accountHash ? cfDeliveryUrl(accountHash, cfId, 'public') : '';
  const thumbUrl = accountHash ? cfDeliveryUrl(accountHash, cfId, 'thumbnail') : publicUrl;
  const uploaded = cfImg?.uploaded || cfImg?.created;
  const createdUnix = uploaded ? Math.floor(new Date(uploaded).getTime() / 1000) : Math.floor(Date.now() / 1000);

  const row = {
    id: rowId,
    tenant_id: scope.tenantId,
    project_id: null,
    user_id: scope.userId,
    filename,
    original_filename: filename,
    mime_type: cfRawMeta.mime || 'image/jpeg',
    size: Number(cfImg?.size) || 0,
    width: cfImg?.width != null ? Number(cfImg.width) : null,
    height: cfImg?.height != null ? Number(cfImg.height) : null,
    r2_key: null,
    cloudflare_image_id: cfId,
    url: publicUrl,
    thumbnail_url: thumbUrl,
    alt_text: parsed.alt_text,
    description: null,
    tags: JSON.stringify(parsed.tags),
    metadata: JSON.stringify({
      ...parsed.meta,
      registered_from: 'cf_live',
      origin: origin || '',
    }),
    workspace_id: scope.workspaceId,
  };

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
      row.project_id,
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
      createdUnix,
      Math.floor(Date.now() / 1000),
      row.workspace_id,
    )
    .run();

  return { ...row, created_at: createdUnix, updated_at: Math.floor(Date.now() / 1000) };
}

async function getImageRowForPatch(env, imageId, scope, authUser, origin) {
  if (String(imageId).startsWith('cf_live_')) {
    const cfId = String(imageId).slice('cf_live_'.length);
    return registerCfImageToD1(env, scope, authUser, cfId, origin);
  }
  const row = await env.DB.prepare(
    `SELECT * FROM images WHERE id = ? AND COALESCE(status, 'active') = 'active' LIMIT 1`,
  )
    .bind(imageId)
    .first();
  if (!row) return null;
  if (String(row.user_id) !== String(authUser.id)) return { forbidden: true };
  if (String(row.workspace_id) !== String(scope.workspaceId)) return { forbidden: true };
  return row;
}

async function handleListTags(url, env, authUser, identity) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
  if (!env?.DB) return jsonResponse({ tags: [] });

  const { results } = await env.DB.prepare(
    `SELECT tags FROM images
     WHERE user_id = ? AND workspace_id = ? AND COALESCE(status, 'active') = 'active'
       AND tags IS NOT NULL AND trim(tags) != '' AND tags != '[]'`,
  )
    .bind(scope.userId, scope.workspaceId)
    .all()
    .catch(() => ({ results: [] }));

  const counts = new Map();
  for (const row of results || []) {
    for (const tag of parseTags(row.tags)) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const tags = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return jsonResponse({ ok: true, tags });
}

async function handlePatchImage(request, url, env, authUser, identity, imageId, payloadOverride) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const payload = payloadOverride ?? (await request.json().catch(() => ({})));
  const rowOrErr = await getImageRowForPatch(env, imageId, scope, authUser, url.origin);
  if (!rowOrErr) return jsonResponse({ error: 'Not found' }, 404);
  if (rowOrErr.forbidden) return jsonResponse({ error: 'Forbidden' }, 403);
  const row = rowOrErr;

  const meta = parseMetadata(row.metadata);
  const sets = [];
  const binds = [];

  if (payload.tags !== undefined) {
    sets.push('tags = ?');
    binds.push(JSON.stringify(normalizeTags(payload.tags)));
  }
  if (payload.label !== undefined) {
    meta.label = String(payload.label || '').trim();
  }
  if (payload.notes !== undefined) {
    meta.notes = String(payload.notes || '').trim();
  }
  if (payload.is_live !== undefined) {
    meta.is_live = !!payload.is_live;
  }
  if (payload.preferred_bg !== undefined) {
    meta.preferred_bg = String(payload.preferred_bg || '').trim();
  }
  if (payload.category !== undefined) {
    meta.category = String(payload.category || '').trim();
  }
  if (payload.project_slug !== undefined) {
    meta.project_slug = String(payload.project_slug || '').trim();
  }
  if (payload.tenant_slug !== undefined) {
    meta.tenant_slug = String(payload.tenant_slug || '').trim();
  }

  sets.push('metadata = ?');
  binds.push(JSON.stringify(meta));

  if (payload.alt_text !== undefined) {
    sets.push('alt_text = ?');
    binds.push(String(payload.alt_text || '').trim() || null);
  }
  if (payload.description !== undefined) {
    sets.push('description = ?');
    binds.push(String(payload.description || '').trim() || null);
  }
  if (payload.label !== undefined && String(payload.label || '').trim()) {
    sets.push('filename = ?');
    binds.push(String(payload.label).trim());
  }

  sets.push('updated_at = unixepoch()');
  binds.push(row.id);

  await env.DB.prepare(`UPDATE images SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

  const updated = await env.DB.prepare(`SELECT * FROM images WHERE id = ? LIMIT 1`)
    .bind(row.id)
    .first();

  const mergedMeta = buildMetaFromRow(updated);
  const mergedTags = payload.tags !== undefined
    ? normalizeTags(payload.tags)
    : parseTags(updated.tags);
  const mergedAlt = payload.alt_text !== undefined
    ? String(payload.alt_text || '').trim() || null
    : updated.alt_text;

  const storageSync = await syncImageStorageMeta(env, updated, scope, {
    tags: mergedTags,
    meta: mergedMeta,
    alt_text: mergedAlt,
  });

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const item = mapD1RowToItem(updated, { origin: url.origin, accountHash });
  return jsonResponse({
    ok: true,
    item,
    image: item,
    meta: item.meta,
    id: item.id,
    storage_sync: storageSync,
  });
}

async function handleLegacyMeta(request, env, authUser, imageId) {
  const key = mediaIdToKey(imageId);
  if (!key) return jsonResponse({ error: 'Not found' }, 404);
  const binding = getR2Binding(env, BUCKET);
  if (!(await canAccessMediaObjectKey(env, authUser, key))) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }
  const payload = await request.json().catch(() => ({}));
  const tags = normalizeTags(payload?.tags);
  const sidecar = {
    ...(payload ?? {}),
    tags,
    synced_at: new Date().toISOString(),
  };
  await syncR2ImageMeta(
    env,
    key,
    {
      tags,
      meta: {
        label: payload?.label || '',
        notes: payload?.notes || '',
        category: payload?.category || '',
        project_slug: payload?.project_slug || '',
        is_live: !!payload?.is_live,
        preferred_bg: payload?.preferred_bg || '',
        tenant_slug: payload?.tenant_slug || '',
      },
      alt_text: payload?.alt_text || null,
    },
    tags,
    { userId: authUser.id, workspaceId: authUser.workspace_id || '', tenantId: authUser.tenant_id || '' },
    null,
  );
  return jsonResponse({ ok: true, meta: sidecar });
}

async function handleLegacyD1Meta(env, authUser, identity, request, url, imageId, payload) {
  return handlePatchImage(request, url, env, authUser, identity, imageId, payload ?? {});
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

  if (pathLower === '/api/images/tags' && method === 'GET') {
    return handleListTags(url, env, authUser, identity);
  }

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
    const persist = imageGenerationShouldPersist(body);
    try {
      const out = await runImageGenerationForTool(env, 'imgx_generate_image', body, {
        authUser,
        workspaceId: wsHint || identity?.workspaceId || null,
        tenantId: identity?.tenantId || null,
        userId: authUser?.id || null,
        origin: url.origin,
      });
      return jsonResponse({
        ok: true,
        generation_id: out.generation_id,
        status: out.status || (persist ? 'saved' : 'draft'),
        preview_url: out.preview_url || out.image_url,
        expires_at: out.expires_at,
        image_url: out.image_url,
        provider: out.provider,
        model: out.model,
        persist,
        source: 'image_gen',
      });
    } catch (e) {
      return jsonResponse({ error: e?.message || 'generate failed' }, 500);
    }
  }

  if (pathLower === '/api/images/commit' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const generationId = String(body.generation_id || '').trim();
    if (!generationId) return jsonResponse({ error: 'generation_id required' }, 400);
    try {
      const out = await commitImageDraft(env, {
        authUser,
        workspaceId: wsHint || identity?.workspaceId || body.workspace_id || null,
        tenantId: identity?.tenantId || null,
        origin: url.origin,
      }, body);
      return jsonResponse(out);
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'commit failed';
      const status = msg === 'draft_not_found' || msg === 'draft_expired' ? 404 : 500;
      return jsonResponse({ error: msg }, status);
    }
  }

  if (pathLower === '/api/images/discard' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const generationId = String(body.generation_id || '').trim();
    if (!generationId) return jsonResponse({ error: 'generation_id required' }, 400);
    try {
      const out = await discardImageDraft(env, generationId, authUser.id);
      return jsonResponse(out);
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'discard failed';
      return jsonResponse({ error: msg }, msg === 'draft_not_found' ? 404 : 500);
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
      return jsonResponse({
        ok: true,
        generation_id: out.generation_id,
        status: out.status || 'draft',
        preview_url: out.preview_url || out.image_url,
        expires_at: out.expires_at,
        image_url: out.image_url,
        provider: out.provider,
        model: out.model,
        persist: out.persist ?? false,
        source: 'image_gen',
      });
    } catch (e) {
      return jsonResponse({ error: e?.message || 'edit failed' }, 500);
    }
  }

  const metaMatch = path.match(/^\/api\/images\/([^/]+)\/meta$/i);
  if (metaMatch && (method === 'POST' || method === 'PATCH')) {
    const imageId = metaMatch[1];
    const payload = await request.json().catch(() => ({}));
    if (mediaIdToKey(imageId)) return handleLegacyMeta(request, env, authUser, imageId);
    if (env?.DB) return handleLegacyD1Meta(env, authUser, identity, request, url, imageId, payload);
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const patchMatch = path.match(/^\/api\/images\/([^/]+)$/i);
  if (patchMatch && method === 'PATCH') {
    return handlePatchImage(request, url, env, authUser, identity, patchMatch[1]);
  }

  const delMatch = path.match(/^\/api\/images\/([^/]+)$/i);
  if (delMatch && method === 'DELETE') {
    return handleDelete(delMatch[1], request, url, env, authUser, identity);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

/** @deprecated alias */
export const handleImagesWorkspaceApi = handleImagesApi;
