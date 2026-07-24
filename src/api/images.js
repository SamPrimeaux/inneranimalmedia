/**
 * Unified dashboard images API — D1 registry + Cloudflare Images + Google Drive.
 *
 * P0 data isolation audit 2026-05-23 — unscoped SELECT lines (grep -v WHERE user_id|workspace_id|tenant_id):
 * Full log: artifacts/p0-data-isolation-audit-20260523.txt
 * images list: WHERE user_id = ? AND workspace_id = ? (see listD1Images).
 *
 * GET    /api/images?source=all|r2|cf_images|drive&page=1&per_page=50 (max 100)
 * POST   /api/images/upload  (multipart) — also POST /api/images (multipart or JSON url)
 * POST   /api/images/import/drive  { drive_file_id } — R2 + D1 only (never auto-hosts on CF Images)
 * GET    /api/images/drive/:fileId/preview|thumbnail — OAuth-proxied preview (browse only; no R2)
 * GET    /api/images/capabilities — CF / R2 / Drive connection summary for Storage sidebar
 * DELETE /api/images/:id
 * POST   /api/images/generate  { persist: false default — draft until commit }
 * POST   /api/images/save     { generation_id, category?, tags?, project_id? } — save draft to library
 * POST   /api/images/discard  { generation_id } — delete draft
 * POST   /api/images/rate     { generation_id, rating: 1|-1 } — thumbs → Thompson
 * POST   /api/images/:id/project { project_id | null } — attach/detach project
 * POST   /api/images/edit | /api/images/:id/meta  (legacy compat)
 * GET    /api/images/tags?workspace_id=
 * GET    /api/images/resource-tags/keys — CF Resource Tagging account keys
 * GET    /api/images/resource-tags/values/:key — values for a key (type=image)
 * GET    /api/images/:id/resource-tags — tags on one CF Image id
 * PATCH  /api/images/:id  { tags, resource_tags, label, notes, alt_text, category, project_slug, is_live, preferred_bg }
 *
 * Storage lanes (do not dilute):
 * - `images.r2_key` = R2 object path only (NULL when CF-hosted-only)
 * - `images.cloudflare_image_id` = CF Images UUID only (NULL when R2-only)
 * - Drive browse = no D1 row until Import (Import ≠ Host on CF Images)
 */

import { jsonResponse } from '../core/responses.js';
import { getR2Binding, listR2BucketsForCatalog, listBoundR2BucketNames } from './r2-api.js';
import { assertDashboardR2BucketAccess } from '../core/r2-storage-scope.js';
import { getOAuthToken } from '../core/user-oauth-token.js';
import { canAccessMediaObjectKey } from '../core/media-r2-access.js';
import { rateImageGeneration, runImageGenerationForTool } from '../tools/image_generation.js';
import {
  saveImageDraft,
  setImageProject,
  discardImageDraft,
  imageGenerationShouldPersist,
  IMAGE_SAVE_CATEGORY_PRESETS,
} from '../core/image-draft-store.js';
import {
  enrichItemsFromR2CustomMetadata,
  normalizeTags,
  parseIamMetaFromStorage,
  putR2ImageWithCustomMetadata,
  syncR2ObjectCustomMetadata,
} from '../core/r2-image-metadata.js';
import {
  getResourceTags,
  listAccountTagKeys,
  listValuesForKey,
  mergeResourceTag,
  removeResourceTag,
  syncImageResourceTags,
} from '../core/cf-resource-tags.js';
import {
  ALLOWED_TRANSFORM_OPS,
  LimitExceededError,
  TransformValidationError,
  applyBindingPipeline,
  assertTransformableMime,
  assertWithinBindingInputLimit,
  assertWithinHostedUploadLimit,
  batchDeleteFromCfImages,
  batchPatchCfImageMeta,
  batchUploadToCfImages,
  buildFlexibleDeliveryUrl,
  createCfImageVariant,
  listCfImageVariants,
  runCfImagesBatch,
} from '../core/cf-images-transform.js';

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

function proxyR2Url(origin, key, bucket = BUCKET) {
  const b = bucket || BUCKET;
  return `${origin}/api/r2/buckets/${encodeURIComponent(b)}/object/${encodeURIComponent(key)}`;
}

function mimeFromKey(key) {
  const ext = String(key || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'avif') return 'image/avif';
  return 'application/octet-stream';
}

function mapR2BrowseObject(obj, bucketName, origin, authUserId) {
  const key = obj.key;
  const legacyId = mediaKeyToId(key);
  const id = legacyId || `r2obj_${key.replace(/[^a-zA-Z0-9]/g, '').slice(0, 28)}`;
  const url = proxyR2Url(origin, key, bucketName);
  return {
    id,
    source: 'r2',
    filename: key.split('/').pop() || key,
    url,
    thumbnail_url: url,
    mime_type: mimeFromKey(key),
    size: Number(obj.size) || 0,
    width: null,
    height: null,
    created_at: obj.last_modified || new Date().toISOString(),
    user_id: authUserId,
    workspace_id: null,
    r2_key: key,
    r2_bucket: bucketName,
    cloudflare_image_id: null,
    alt_text: null,
    description: null,
    tags: [],
    meta: { label: key.split('/').pop() || key },
    _r2_browse_only: true,
  };
}

async function listR2BrowseImages(env, authUser, { bucket, prefix, origin, workspaceId }) {
  const access = await assertDashboardR2BucketAccess(env, authUser, bucket);
  if (!access.ok) {
    return { error: access.user_message || access.error || 'Forbidden', status: access.status || 403 };
  }

  const bucketName = access.bucket;
  const binding = getR2Binding(env, bucketName);
  if (!binding?.list) {
    return { error: 'R2 bucket binding not available', status: 503 };
  }

  const normPrefix = String(prefix || '').replace(/^\/+/, '');
  /** @type {{ key: string, size: number, last_modified: string|null }[]} */
  const allObjects = [];
  let cursor;
  do {
    const page = await binding.list({ prefix: normPrefix, limit: 1000, cursor });
    for (const o of page.objects || []) {
      if (!o?.key || o.key.endsWith('/') || o.key.endsWith('.iammeta.json')) continue;
      if (!IMAGE_EXT.test(o.key)) continue;
      allObjects.push({
        key: o.key,
        size: o.size ?? 0,
        last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && allObjects.length < 5000);

  const items = [];
  for (const o of allObjects) {
    if (bucketName === BUCKET && !(await canAccessMediaObjectKey(env, authUser, o.key))) continue;
    items.push(mapR2BrowseObject(o, bucketName, origin, authUser.id));
  }

  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { items, bucket: bucketName, prefix: normPrefix };
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

/**
 * Builds the *custom* metadata object for an image — only fields the user
 * actually set. Previously this always returned a full 7-key skeleton
 * (label/is_live/preferred_bg/notes/tenant_slug/category/project_slug) with
 * empty-string/false fallbacks for anything unset, which made every image
 * look like it had metadata even when CF's own record for it is `{}`. That's
 * a Detail-page UI concern (duplicating fields already shown elsewhere) —
 * the Metadata panel should honor CF's own convention: empty when empty.
 */
function buildMetaFromRow(row) {
  const metaObj = parseMetadata(row.metadata);
  const out = {};
  // `label` intentionally excludes the filename fallback — a label is only
  // "real" if the user explicitly set one; otherwise it's not metadata,
  // it's just the filename, which already has its own field in the UI.
  if (metaObj.label) out.label = metaObj.label;
  if (metaObj.is_live) out.is_live = true;
  if (metaObj.preferred_bg) out.preferred_bg = metaObj.preferred_bg;
  const notes = metaObj.notes || metaObj.description || row.description || '';
  if (notes) out.notes = notes;
  if (metaObj.tenant_slug) out.tenant_slug = metaObj.tenant_slug;
  if (metaObj.category) out.category = metaObj.category;
  if (metaObj.project_slug) out.project_slug = metaObj.project_slug;
  return out;
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
    r2_bucket: BUCKET,
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

function driveProxyPath(origin, fileId, variant = 'preview') {
  const id = String(fileId || '').trim();
  if (!id || !origin) return '';
  return `${origin}/api/images/drive/${encodeURIComponent(id)}/${variant}`;
}

function mapDriveFile(file, authUserId, origin) {
  const fileId = file.id;
  return {
    id: `drive_${fileId}`,
    source: 'drive',
    filename: file.name || fileId,
    url: driveProxyPath(origin, fileId, 'preview'),
    thumbnail_url: driveProxyPath(origin, fileId, 'thumbnail'),
    web_view_link: file.webViewLink || file.webContentLink || '',
    mime_type: file.mimeType || 'image/jpeg',
    size: Number(file.size) || 0,
    width: null,
    height: null,
    created_at: file.createdTime || new Date().toISOString(),
    user_id: authUserId,
    workspace_id: null,
    r2_key: null,
    cloudflare_image_id: null,
    drive_file_id: fileId,
    alt_text: null,
    tags: [],
    _drive_only: true,
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

async function listD1Images(env, { userId, workspaceId, source, tag, search, projectId, category, limit, offset }) {
  let sql = `SELECT * FROM images
    WHERE user_id = ? AND workspace_id = ? AND COALESCE(status, 'active') = 'active'`;
  const binds = [userId, workspaceId];
  if (source === 'r2') {
    sql += ` AND (cloudflare_image_id IS NULL OR cloudflare_image_id = '')`;
  } else if (source === 'cf_images') {
    sql += ` AND cloudflare_image_id IS NOT NULL AND cloudflare_image_id != ''`;
  }
  if (projectId) {
    sql += ` AND project_id = ?`;
    binds.push(String(projectId).trim());
  }
  if (category) {
    const c = String(category).trim().toLowerCase();
    sql += ` AND (
      lower(COALESCE(json_extract(metadata, '$.category'), '')) = ?
      OR lower(COALESCE(tags, '')) LIKE ?
    )`;
    binds.push(c, `%"${c}"%`);
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

async function driveAccountSummary(env, userId) {
  try {
    const { getIntegrationOAuthRow } = await import('../core/user-oauth-token.js');
    const row = await getIntegrationOAuthRow(env, userId, 'google_drive', '');
    if (!row) return { connected: false, account_email: null };
    return {
      connected: true,
      account_email: String(row.account_email || row.account_display || '').trim() || null,
      expires_at: row.expires_at != null ? Number(row.expires_at) : null,
      has_refresh: !!(row.refresh_token || row.vault_refresh_token_id || row.refresh_token_encrypted),
    };
  } catch {
    return { connected: false, account_email: null };
  }
}

async function listDriveImages(env, userId, origin) {
  const acct = await driveAccountSummary(env, userId);
  const token = await getOAuthToken(env, userId, 'google_drive');
  if (!token) return { items: [], ...acct, connected: false };

  const q = encodeURIComponent("mimeType contains 'image/' and trashed = false");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,createdTime,thumbnailLink,webViewLink,webContentLink)&pageSize=100&orderBy=createdTime desc`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      items: [],
      connected: true,
      account_email: acct.account_email,
      expires_at: acct.expires_at,
      has_refresh: acct.has_refresh,
      error: data.error?.message || res.statusText,
    };
  }
  const items = (data.files || []).map((f) => mapDriveFile(f, userId, origin));
  return {
    items,
    connected: true,
    account_email: acct.account_email,
    expires_at: acct.expires_at,
    has_refresh: acct.has_refresh,
  };
}

async function handleDriveMedia(env, authUser, fileId, variant) {
  const id = String(fileId || '').trim();
  if (!id) return jsonResponse({ error: 'file_id required' }, 400);

  const token = await getOAuthToken(env, authUser.id, 'google_drive');
  if (!token) return jsonResponse({ error: 'Google Drive not connected' }, 400);

  const authHeaders = { Authorization: `Bearer ${token}` };

  if (variant === 'thumbnail') {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=thumbnailLink,mimeType`,
      { headers: authHeaders },
    );
    const meta = await metaRes.json().catch(() => ({}));
    if (metaRes.ok && meta.thumbnailLink) {
      const thumbRes = await fetch(String(meta.thumbnailLink), { headers: authHeaders });
      if (thumbRes.ok && thumbRes.body) {
        return new Response(thumbRes.body, {
          headers: {
            'Content-Type': thumbRes.headers.get('Content-Type') || 'image/jpeg',
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }
    }
  }

  const mediaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
    { headers: authHeaders },
  );
  if (!mediaRes.ok || !mediaRes.body) {
    const err = await mediaRes.json().catch(() => ({}));
    return jsonResponse(
      { error: err.error?.message || 'Drive media unavailable' },
      mediaRes.status >= 400 ? mediaRes.status : 502,
    );
  }

  return new Response(mediaRes.body, {
    headers: {
      'Content-Type': mediaRes.headers.get('Content-Type') || 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

async function uploadToCfImages(env, file, metadata, creds = null) {
  const accountId = String(creds?.accountId || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(
    creds?.token || env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '',
  ).trim();
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
    iam_hosted: creds?.iam_hosted === true,
    cf_account_id: accountId,
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

async function syncImageStorageMeta(env, row, scope, { tags, meta, alt_text, resource_tags }) {
  const tagList = normalizeTags(tags ?? parseTags(row.tags));
  const metaFields = meta || buildMetaFromRow(row);
  const alt = alt_text ?? row.alt_text ?? null;
  const sync = { cf: null, r2: null, cf_tags: null };

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

  // Cloudflare Resource Tagging (account-level, resource_type=image) — best-effort beta sync.
  const cfImageId = String(row.cloudflare_image_id || '').trim();
  if (cfImageId && resource_tags !== undefined) {
    try {
      sync.cf_tags = await syncImageResourceTags(env, cfImageId, resource_tags || {});
    } catch (e) {
      sync.cf_tags = { ok: false, error: e?.message || 'cf_tags sync failed' };
    }
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
      created_at, updated_at, workspace_id, parent_image_id, transform_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
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
      row.parent_image_id || null,
      row.transform_json || null,
    )
    .run();
  return { ...row, created_at: now, updated_at: now, parent_image_id: row.parent_image_id || null, transform_json: row.transform_json || null };
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
  const tagFilter = (url.searchParams.get('tag') || '').trim().toLowerCase();
  const searchQ = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim();
  const projectIdFilter = (url.searchParams.get('project_id') || '').trim();
  const projectSlugFilter = (url.searchParams.get('project_slug') || '').trim().toLowerCase();
  const categoryFilter = (url.searchParams.get('category') || '').trim().toLowerCase();
  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const origin = url.origin;

  const matchesFilters = (item) => {
    if (tagFilter) {
      const tags = (item.tags || []).map((t) => String(t).toLowerCase());
      if (!tags.includes(tagFilter)) return false;
    }
    if (projectIdFilter) {
      if (String(item.project_id || '') !== projectIdFilter) return false;
    }
    if (projectSlugFilter) {
      const slug = String(item.meta?.project_slug || '').trim().toLowerCase();
      if (slug !== projectSlugFilter) return false;
    }
    if (categoryFilter) {
      const cat = String(item.meta?.category || '').toLowerCase();
      const tags = (item.tags || []).map((t) => String(t).toLowerCase());
      if (cat !== categoryFilter && !tags.includes(categoryFilter)) return false;
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
        item.meta?.size_label,
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
    const drive = await listDriveImages(env, scope.userId, origin);
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
      drive_error: drive.error || null,
      drive_account_email: drive.account_email || null,
      drive_expires_at: drive.expires_at ?? null,
      drive_has_refresh: drive.has_refresh ?? null,
      /** Browse-only: list/preview never writes R2/CF/D1. Copy only via POST /import/drive. */
      drive_browse_only: true,
      accountHash,
    });
  }

  const r2BucketParam = url.searchParams.get('r2_bucket')?.trim() || '';
  const r2PrefixParam = url.searchParams.get('r2_prefix') ?? '';
  const r2RegistryOnly = url.searchParams.get('r2_mode') === 'registry';

  let r2BucketsCatalog = null;
  if (source === 'r2') {
    try {
      r2BucketsCatalog = await listR2BucketsForCatalog(env, {
        authUser,
        workspaceId: scope.workspaceId,
      });
    } catch {
      r2BucketsCatalog = { buckets: [], bound: [], count: 0 };
    }

    if (!r2BucketParam) {
      return jsonResponse({
        items: [],
        images: [],
        total: 0,
        page,
        per_page: perPage,
        accountHash,
        workspace_id: scope.workspaceId,
        r2_buckets: r2BucketsCatalog?.buckets || [],
        r2_selection_required: true,
      });
    }
  }

  if (source === 'r2' && r2BucketParam && !r2RegistryOnly) {
    const browse = await listR2BrowseImages(env, authUser, {
      bucket: r2BucketParam,
      prefix: r2PrefixParam,
      origin,
      workspaceId: scope.workspaceId,
    });
    if (browse.error) {
      return jsonResponse(
        {
          error: browse.error,
          r2_buckets: r2BucketsCatalog?.buckets || [],
          r2_bucket: r2BucketParam,
          r2_prefix: r2PrefixParam,
        },
        browse.status || 400,
      );
    }

    const r2Binding = getR2Binding(env, browse.bucket || r2BucketParam);
    let items = browse.items || [];
    if (r2Binding) {
      items = await enrichItemsFromR2CustomMetadata(r2Binding, items);
    }
    const filtered = items.filter(matchesFilters);
    const total = filtered.length;
    const start = (page - 1) * perPage;
    const pageItems = filtered.slice(start, start + perPage);

    return jsonResponse({
      items: pageItems,
      images: pageItems,
      total,
      page,
      per_page: perPage,
      accountHash,
      workspace_id: scope.workspaceId,
      r2_buckets: r2BucketsCatalog?.buckets || [],
      r2_bucket: browse.bucket || r2BucketParam,
      r2_prefix: browse.prefix ?? r2PrefixParam,
      r2_browse: true,
    });
  }

  const merged = [];
  const knownCf = new Set();

  if (source === 'all' || source === 'r2' || source === 'cf_images') {
    const d1Rows = await listD1Images(env, {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      source: source === 'all' ? null : source,
      tag: tagFilter || null,
      search: null,
      projectId: projectIdFilter || null,
      category: categoryFilter || null,
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
    ...(source === 'r2' && r2BucketsCatalog
      ? {
          r2_buckets: r2BucketsCatalog.buckets || [],
          r2_bucket: r2BucketParam,
          r2_prefix: r2PrefixParam,
          r2_browse: false,
        }
      : {}),
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
  const { resolveCfImagesUploadContext } = await import('../core/cf-oauth-images.js');
  const cfCtx = await resolveCfImagesUploadContext(env, {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
  if (!cfCtx.ok) {
    return jsonResponse({ error: cfCtx.error, detail: cfCtx.detail, accounts: cfCtx.accounts }, 400);
  }
  const cf = await uploadToCfImages(env, fileBlob, cfMetaPayload, {
    accountId: cfCtx.accountId,
    token: cfCtx.token,
    iam_hosted: cfCtx.iam_hosted,
  });
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
  const accountHash =
    String(cfCtx.accountHash || env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
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
    metadata: JSON.stringify({
      ...iamMeta,
      registered_from: 'upload',
      iam_hosted: cfCtx.iam_hosted === true,
      cf_account_id: cfCtx.accountId,
      cf_images_source: cfCtx.source,
    }),
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

  // Import to R2 = R2 + D1 only. Never auto-upload to Cloudflare Images.
  const publicUrl = proxyR2Url(url.origin, r2Key);
  const thumbUrl = publicUrl;
  const cfId = null;

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

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
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
  return jsonResponse({ ok: true, item, image: item, imported_to: 'r2_d1' });
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
  const r2Key = String(row.r2_key || '').trim();
  if (r2Key && !r2Key.startsWith('__cf_hosted__/')) {
    const binding = getR2Binding(env, BUCKET);
    await binding?.delete?.(r2Key).catch(() => {});
    await binding?.delete?.(metaSidecarKey(r2Key)).catch(() => {});
  }

  await env.DB.prepare(
    `UPDATE images SET status = 'deleted', updated_at = unixepoch() WHERE id = ? AND user_id = ?`,
  )
    .bind(imageId, authUser.id)
    .run();

  return jsonResponse({ ok: true, id: imageId });
}

async function fetchCfImageDetail(env, cfId, creds = null) {
  const accountId = String(creds?.accountId || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(
    creds?.token || env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '',
  ).trim();
  if (!accountId || !token || !cfId) return null;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(cfId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) return null;
  return data.result || null;
}

async function resolveCfImagesApiCreds(env, scope) {
  try {
    const { resolveCfImagesUploadContext } = await import('../core/cf-oauth-images.js');
    const cfCtx = await resolveCfImagesUploadContext(env, {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    });
    if (cfCtx?.ok && cfCtx.accountId && cfCtx.token) {
      return {
        accountId: cfCtx.accountId,
        token: cfCtx.token,
        accountHash: cfCtx.accountHash || null,
      };
    }
  } catch {
    /* platform secrets */
  }
  return {
    accountId: String(env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
    token: String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim(),
    accountHash: String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim() || null,
  };
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

  const creds = await resolveCfImagesApiCreds(env, scope);
  const cfImg = await fetchCfImageDetail(env, cfId, creds);
  const cfRawMeta = cfImg?.metadata || cfImg?.meta || {};
  const parsed = parseIamMetaFromStorage(cfRawMeta);
  const imageUuid = crypto.randomUUID();
  const rowId = `img_${imageUuid.replace(/-/g, '').slice(0, 24)}`;
  const filename = safeFilename(parsed.meta.label || cfRawMeta.filename || cfRawMeta.name || cfId);
  const publicUrl = accountHash ? cfDeliveryUrl(accountHash, cfId, 'public') : '';
  const thumbUrl = accountHash ? cfDeliveryUrl(accountHash, cfId, 'thumbnail') : publicUrl;
  const uploaded = cfImg?.uploaded || cfImg?.created;
  const createdUnix = uploaded
    ? Math.floor(new Date(uploaded).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  // CF-hosted-only: r2_key stays NULL (migration 1024). Never invent a fake R2 path.
  const r2Key = null;

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
    r2_key: r2Key,
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
      cf_hosted_only: true,
    }),
    workspace_id: scope.workspaceId,
  };

  try {
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
  } catch (e) {
    const again = await env.DB.prepare(
      `SELECT * FROM images
       WHERE cloudflare_image_id = ? AND user_id = ?
         AND COALESCE(status, 'active') = 'active'
       LIMIT 1`,
    )
      .bind(cfId, scope.userId)
      .first()
      .catch(() => null);
    if (again) return again;
    console.warn('[images] registerCfImageToD1 insert failed', e?.message || e);
    return {
      ...row,
      created_at: createdUnix,
      updated_at: createdUnix,
      status: 'active',
      parent_image_id: null,
      transform_json: null,
      _synthetic: true,
    };
  }

  return {
    ...row,
    created_at: createdUnix,
    updated_at: Math.floor(Date.now() / 1000),
    status: 'active',
  };
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

/**
 * In-isolate cache for the real variants catalog — this rarely changes, and
 * refetching CF on every gallery/detail page load is wasteful. 5 min TTL is
 * a reasonable balance; a variant rename/resize in the CF dashboard will show
 * up here within that window, not instantly, which is an acceptable tradeoff.
 */
let _variantsCatalogCache = null; // { at: number, variants: Array }

async function handleVariantsCatalog(env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
  if (!accountId || !token) {
    return jsonResponse({ ok: true, variants: [], source: 'unconfigured' });
  }

  const now = Date.now();
  if (_variantsCatalogCache && now - _variantsCatalogCache.at < 5 * 60 * 1000) {
    return jsonResponse({ ok: true, variants: _variantsCatalogCache.variants, source: 'cache' });
  }

  try {
    const variants = await listCfImageVariants(accountId, token);
    _variantsCatalogCache = { at: now, variants };
    return jsonResponse({ ok: true, variants, source: 'live' });
  } catch (e) {
    // Serve stale cache over a hard failure if we have one, even past TTL.
    if (_variantsCatalogCache) {
      return jsonResponse({ ok: true, variants: _variantsCatalogCache.variants, source: 'stale_cache' });
    }
    return jsonResponse(
      { ok: false, variants: [], error: e?.message || 'Failed to load variants catalog' },
      502,
    );
  }
}

/** POST /api/images/variants — create account-level named variant (CF Images Write). */
async function handleCreateVariant(request, env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
  if (!accountId || !token) {
    return jsonResponse({ ok: false, error: 'Cloudflare Images credentials not configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  try {
    const variant = await createCfImageVariant(accountId, token, body || {});
    _variantsCatalogCache = null; // force catalog refresh
    return jsonResponse({ ok: true, variant });
  } catch (e) {
    if (e instanceof TransformValidationError) {
      return jsonResponse({ ok: false, error: e.message }, 400);
    }
    return jsonResponse({ ok: false, error: e?.message || 'Failed to create variant' }, 502);
  }
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
  if (payload.resource_tags !== undefined) {
    meta.cf_resource_tags =
      payload.resource_tags && typeof payload.resource_tags === 'object' && !Array.isArray(payload.resource_tags)
        ? payload.resource_tags
        : {};
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

  const resourceTagsForSync =
    payload.resource_tags !== undefined
      ? meta.cf_resource_tags
      : mergedMeta.cf_resource_tags !== undefined
        ? undefined
        : undefined;

  const storageSync = await syncImageStorageMeta(env, updated, scope, {
    tags: mergedTags,
    meta: mergedMeta,
    alt_text: mergedAlt,
    resource_tags: payload.resource_tags !== undefined ? meta.cf_resource_tags : undefined,
  });

  // Incremental add/remove (GET→merge→PUT) when UI sends a single op instead of full replace.
  if (payload.resource_tag_op && updated.cloudflare_image_id) {
    const op = payload.resource_tag_op;
    const opName = String(op.op || op.action || '').toLowerCase();
    try {
      if (opName === 'add' || opName === 'merge') {
        storageSync.cf_tags = await mergeResourceTag(
          env,
          updated.cloudflare_image_id,
          op.key,
          op.value,
        );
      } else if (opName === 'remove' || opName === 'delete') {
        storageSync.cf_tags = await removeResourceTag(env, updated.cloudflare_image_id, op.key);
      }
      if (storageSync.cf_tags?.ok && storageSync.cf_tags.tags) {
        const nextMeta = { ...mergedMeta, cf_resource_tags: storageSync.cf_tags.tags };
        await env.DB.prepare(`UPDATE images SET metadata = ?, updated_at = unixepoch() WHERE id = ?`)
          .bind(JSON.stringify(nextMeta), updated.id)
          .run()
          .catch(() => null);
      }
    } catch (e) {
      storageSync.cf_tags = { ok: false, error: e?.message || 'resource_tag_op failed' };
    }
  }

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const item = mapD1RowToItem(updated, { origin: url.origin, accountHash });
  if (storageSync.cf_tags?.tags) {
    item.resource_tags = storageSync.cf_tags.tags;
  } else if (meta.cf_resource_tags) {
    item.resource_tags = meta.cf_resource_tags;
  }
  return jsonResponse({
    ok: true,
    item,
    image: item,
    meta: item.meta,
    id: item.id,
    storage_sync: storageSync,
    resource_tags: item.resource_tags || null,
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

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseOpsFromQuery(searchParams) {
  const opsRaw = searchParams.get('ops');
  if (opsRaw) {
    try {
      const parsed = JSON.parse(opsRaw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // fall through to flat params
    }
  }
  const flat = {};
  for (const key of Object.keys(ALLOWED_TRANSFORM_OPS)) {
    if (searchParams.has(key)) flat[key] = searchParams.get(key);
  }
  return flat;
}

/**
 * Resolves binding-ready source bytes for an images row — R2 bytes directly (no fetch, no URL,
 * see QC-18 note in cf-images-transform.js), or the hosted CF delivery URL as a fallback.
 */
async function resolveImageSourceForBinding(env, row, accountHash) {
  if (row.r2_key) {
    const binding = getR2Binding(env, BUCKET);
    const obj = await binding?.get?.(row.r2_key).catch(() => null);
    if (!obj?.body) return { error: 'Source object not found in R2', status: 404 };
    return {
      stream: obj.body,
      byteLength: obj.size || 0,
      mime: obj.httpMetadata?.contentType || row.mime_type || 'image/jpeg',
    };
  }
  if (row.cloudflare_image_id) {
    const hash = accountHash || String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
    const srcUrl = cfDeliveryUrl(hash, row.cloudflare_image_id, 'public');
    if (!srcUrl) return { error: 'No delivery URL available for source image', status: 502 };
    const res = await fetch(srcUrl);
    if (!res.ok || !res.body) return { error: 'Failed to fetch hosted source image', status: 502 };
    const len = Number(res.headers.get('content-length')) || 0;
    return {
      stream: res.body,
      byteLength: len,
      mime: res.headers.get('content-type') || row.mime_type || 'image/jpeg',
    };
  }
  return { error: 'Image has no R2 or Cloudflare Images source', status: 400 };
}

async function handleGetImageDetail(url, env, authUser, identity, imageId) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const origin = url.origin;
  const id = String(imageId || '').trim();

  // Drive browse-only detail — never requires a D1 images row.
  if (id.startsWith('drive_')) {
    const fileId = id.slice('drive_'.length);
    if (!fileId) return jsonResponse({ error: 'Not found' }, 404);
    const token = await getOAuthToken(env, scope.userId, 'google_drive');
    if (!token) return jsonResponse({ error: 'Google Drive not connected' }, 400);
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,createdTime,thumbnailLink,webViewLink,webContentLink`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) {
      return jsonResponse({ error: meta.error?.message || 'Not found' }, metaRes.status === 404 ? 404 : 502);
    }
    const item = mapDriveFile(meta, scope.userId, origin);
    return jsonResponse({
      ok: true,
      item,
      image: item,
      variants: {},
      browse_only: true,
      source: 'drive',
      accountHash,
      parent_image_id: null,
      transform_json: null,
      derivatives: [],
      capabilities: { cf_images: false, drive: true },
    });
  }

  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  // CF live list ids — prefer existing D1 by cloudflare_image_id; else synthetic delivery URLs (no fake r2_key).
  if (id.startsWith('cf_live_')) {
    const cfId = id.slice('cf_live_'.length);
    let row = await env.DB.prepare(
      `SELECT * FROM images
       WHERE cloudflare_image_id = ? AND user_id = ?
         AND COALESCE(status, 'active') = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(cfId, scope.userId)
      .first()
      .catch(() => null);

    if (!row) {
      row = await registerCfImageToD1(env, scope, authUser, cfId, origin);
    }
    if (!row) return jsonResponse({ error: 'Not found' }, 404);

    const item = row._synthetic
      ? {
          ...mapCfApiImage(
            { id: cfId, metadata: {}, size: row.size, width: row.width, height: row.height, uploaded: row.created_at },
            accountHash,
            scope.userId,
          ),
          filename: row.filename,
          url: row.url || cfDeliveryUrl(accountHash, cfId, 'public'),
          thumbnail_url: row.thumbnail_url || cfDeliveryUrl(accountHash, cfId, 'thumbnail'),
          cloudflare_image_id: cfId,
          r2_key: null,
        }
      : mapD1RowToItem(row, { origin, accountHash });

    // Always expose real CF delivery URLs for hosted images.
    if (accountHash && cfId) {
      item.url = cfDeliveryUrl(accountHash, cfId, 'public') || item.url;
      item.thumbnail_url = cfDeliveryUrl(accountHash, cfId, 'thumbnail') || item.thumbnail_url;
      item.cloudflare_image_id = cfId;
      item.r2_key = row.r2_key || null;
      item.source = 'cf_images';
    }

    const variants = {};
    if (cfId && accountHash) {
      for (const v of ['public', 'thumbnail', 'small', 'medium', 'large', 'hero', 'avatar']) {
        variants[v] = cfDeliveryUrl(accountHash, cfId, v);
      }
    }

    let derivatives = [];
    if (!row._synthetic) {
      try {
        const { results } = await env.DB.prepare(
          `SELECT id, filename, thumbnail_url, url, created_at FROM images
           WHERE parent_image_id = ? AND COALESCE(status, 'active') = 'active'
           ORDER BY created_at DESC LIMIT 50`,
        )
          .bind(row.id)
          .all();
        derivatives = results || [];
      } catch {
        derivatives = [];
      }
    }

    const { resolveCfImagesUploadContext } = await import('../core/cf-oauth-images.js');
    const cfCtx = await resolveCfImagesUploadContext(env, {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    }).catch(() => null);

    return jsonResponse({
      ok: true,
      item,
      image: item,
      variants,
      accountHash,
      parent_image_id: row.parent_image_id || null,
      transform_json: row.transform_json ? safeJsonParse(row.transform_json) : null,
      derivatives,
      capabilities: { cf_images: !!(cfCtx && cfCtx.ok), source: cfCtx?.source || null },
    });
  }

  const rowOrErr = await getImageRowForPatch(env, id, scope, authUser, origin);
  if (!rowOrErr) return jsonResponse({ error: 'Not found' }, 404);
  if (rowOrErr.forbidden) return jsonResponse({ error: 'Forbidden' }, 403);
  const row = rowOrErr;

  const item = mapD1RowToItem(row, { origin, accountHash });
  if (row.cloudflare_image_id && accountHash) {
    item.url = cfDeliveryUrl(accountHash, row.cloudflare_image_id, 'public') || item.url;
    item.thumbnail_url =
      cfDeliveryUrl(accountHash, row.cloudflare_image_id, 'thumbnail') || item.thumbnail_url;
  }

  const variants = {};
  if (row.cloudflare_image_id) {
    for (const v of ['public', 'thumbnail', 'small', 'medium', 'large', 'hero', 'avatar']) {
      variants[v] = cfDeliveryUrl(accountHash, row.cloudflare_image_id, v);
    }
  }

  let derivatives = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, filename, thumbnail_url, url, created_at FROM images
       WHERE parent_image_id = ? AND COALESCE(status, 'active') = 'active'
       ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(row.id)
      .all();
    derivatives = results || [];
  } catch {
    derivatives = [];
  }

  const { resolveCfImagesUploadContext } = await import('../core/cf-oauth-images.js');
  const cfCtx = await resolveCfImagesUploadContext(env, {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  }).catch(() => null);

  let resourceTags = null;
  const cfIdForTags = String(row.cloudflare_image_id || '').trim();
  if (cfIdForTags) {
    const tagRes = await getResourceTags(env, cfIdForTags).catch(() => null);
    if (tagRes?.ok) {
      resourceTags = tagRes.tags || {};
      item.resource_tags = resourceTags;
    } else {
      const cached = parseMetadata(row.metadata)?.cf_resource_tags;
      if (cached && typeof cached === 'object') {
        resourceTags = cached;
        item.resource_tags = cached;
      }
    }
  }

  return jsonResponse({
    ok: true,
    item,
    image: item,
    variants,
    accountHash,
    parent_image_id: row.parent_image_id || null,
    transform_json: row.transform_json ? safeJsonParse(row.transform_json) : null,
    derivatives,
    resource_tags: resourceTags,
    capabilities: { cf_images: !!(cfCtx && cfCtx.ok), source: cfCtx?.source || null },
  });
}

/**
 * GET /api/images/:id/preview-url — allowlisted, clamped transform ops, streamed via the Images
 * binding (bytes in, bytes out — see QC-18 note). `mode=delivery` returns a cheap flexible-variant
 * delivery URL (JSON) instead of streaming bytes, for hosted images only.
 */
async function handlePreviewUrl(url, env, authUser, identity, imageId) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const rowOrErr = await getImageRowForPatch(env, imageId, scope, authUser, url.origin);
  if (!rowOrErr) return jsonResponse({ error: 'Not found' }, 404);
  if (rowOrErr.forbidden) return jsonResponse({ error: 'Forbidden' }, 403);
  const row = rowOrErr;

  try {
    assertTransformableMime(row.mime_type);
  } catch (e) {
    return jsonResponse({ error: e.message }, 400);
  }

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const rawOps = parseOpsFromQuery(url.searchParams);

  if (url.searchParams.get('mode') === 'delivery' && row.cloudflare_image_id) {
    const deliveryUrl = buildFlexibleDeliveryUrl(accountHash, row.cloudflare_image_id, rawOps);
    return jsonResponse({ ok: true, preview_url: deliveryUrl, mode: 'delivery' });
  }

  const source = await resolveImageSourceForBinding(env, row, accountHash);
  if (source.error) return jsonResponse({ error: source.error }, source.status || 502);

  try {
    assertWithinBindingInputLimit(source.byteLength || 0);
  } catch (e) {
    return jsonResponse({ error: e.message }, 413);
  }

  const watermark = ['1', 'true'].includes(url.searchParams.get('watermark') || '');

  let pipelineResult;
  try {
    pipelineResult = await applyBindingPipeline(env, source.stream, rawOps, {
      watermark,
      defaultFormat: 'webp',
      baseWidth: row.width || undefined,
    });
  } catch (e) {
    if (e instanceof LimitExceededError) return jsonResponse({ error: e.message }, 413);
    if (e instanceof TransformValidationError) {
      return jsonResponse({ error: e.message, details: e.details }, 400);
    }
    return jsonResponse({ error: e?.message || 'transform failed' }, 502);
  }

  const resp = pipelineResult.output.response();
  const headers = new Headers(resp.headers);
  headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  headers.set('X-IAM-Transform-Ops', JSON.stringify(pipelineResult.ops));
  if (pipelineResult.dropped.length) headers.set('X-IAM-Transform-Dropped', pipelineResult.dropped.join(','));
  return new Response(resp.body, { status: resp.status, headers });
}

/**
 * POST /api/images/:id/transform — commit an allowlisted transform via the Images binding.
 * Default `mode: "derivative"` inserts a new library row (parent_image_id, transform_json).
 * `mode: "replace"` must be explicit and overwrites the existing row's hosted image in place.
 */
async function handleTransformCommit(request, url, env, authUser, identity, imageId) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const rawOps = body.ops && typeof body.ops === 'object' ? body.ops : {};
  const mode = body.mode === 'replace' ? 'replace' : 'derivative';
  const watermark = body.watermark === true;

  const rowOrErr = await getImageRowForPatch(env, imageId, scope, authUser, url.origin);
  if (!rowOrErr) return jsonResponse({ error: 'Not found' }, 404);
  if (rowOrErr.forbidden) return jsonResponse({ error: 'Forbidden' }, 403);
  const row = rowOrErr;

  try {
    assertTransformableMime(row.mime_type);
  } catch (e) {
    return jsonResponse({ error: e.message }, 400);
  }

  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  const source = await resolveImageSourceForBinding(env, row, accountHash);
  if (source.error) return jsonResponse({ error: source.error }, source.status || 502);

  try {
    assertWithinBindingInputLimit(source.byteLength || 0);
  } catch (e) {
    return jsonResponse({ error: e.message }, 413);
  }

  let pipelineResult;
  try {
    pipelineResult = await applyBindingPipeline(env, source.stream, rawOps, {
      watermark,
      defaultFormat: 'webp',
      baseWidth: row.width || undefined,
    });
  } catch (e) {
    if (e instanceof LimitExceededError) return jsonResponse({ error: e.message }, 413);
    if (e instanceof TransformValidationError) {
      return jsonResponse({ error: e.message, details: e.details }, 400);
    }
    return jsonResponse({ error: e?.message || 'transform failed' }, 502);
  }

  const outBuf = await pipelineResult.output.response().arrayBuffer();
  try {
    assertWithinHostedUploadLimit(outBuf.byteLength);
  } catch (e) {
    return jsonResponse({ error: e.message }, 413);
  }

  const { resolveCfImagesUploadContext } = await import('../core/cf-oauth-images.js');
  const cfCtx = await resolveCfImagesUploadContext(env, {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
  if (!cfCtx.ok) {
    return jsonResponse({ error: cfCtx.error, detail: cfCtx.detail, accounts: cfCtx.accounts }, 403);
  }

  const ext = pipelineResult.format === 'jpeg' ? 'jpg' : pipelineResult.format;
  const baseName = String(row.filename || row.original_filename || 'image').replace(/\.[^.]+$/, '');
  const outFilename = safeFilename(`${baseName}-edit-${Date.now()}.${ext}`);
  const outMime = `image/${pipelineResult.format}`;
  const outFile = new File([outBuf], outFilename, { type: outMime });

  const transformMeta = {
    label: outFilename,
    category: '',
    project_slug: '',
    notes: mode === 'replace' ? 'replace edit' : 'derivative edit',
    tenant_slug: '',
    is_live: false,
    preferred_bg: '',
  };
  const cfMetaPayload = buildCfImagesMetaPayload({
    tags: parseTags(row.tags),
    meta: transformMeta,
    scope,
    alt_text: row.alt_text,
    filename: outFilename,
  });
  cfMetaPayload.iam_parent_image_id = String(mode === 'derivative' ? row.id : row.parent_image_id || row.id).slice(0, 64);

  const cf = await uploadToCfImages(env, outFile, cfMetaPayload, {
    accountId: cfCtx.accountId,
    token: cfCtx.token,
    iam_hosted: cfCtx.iam_hosted,
  });
  if (cf.error) return jsonResponse({ error: cf.error }, cf.status || 502);

  const newAccountHash = String(cfCtx.accountHash || accountHash || '').trim();
  const publicUrl = newAccountHash ? cfDeliveryUrl(newAccountHash, cf.imageId, 'public') : '';
  const thumbUrl = newAccountHash ? cfDeliveryUrl(newAccountHash, cf.imageId, 'thumbnail') : publicUrl;
  const transformJson = JSON.stringify({
    ops: pipelineResult.ops,
    dropped: pipelineResult.dropped,
    format: pipelineResult.format,
    watermark,
    mode,
    committed_at: new Date().toISOString(),
  });

  if (mode === 'replace') {
    if (row.cloudflare_image_id && row.cloudflare_image_id !== cf.imageId) {
      await deleteCfImage(env, row.cloudflare_image_id);
    }
    await env.DB.prepare(
      `UPDATE images SET cloudflare_image_id = ?, url = ?, thumbnail_url = ?, size = ?,
        mime_type = ?, transform_json = ?, updated_at = unixepoch() WHERE id = ?`,
    )
      .bind(cf.imageId, publicUrl, thumbUrl, outBuf.byteLength, outMime, transformJson, row.id)
      .run();

    const updated = await env.DB.prepare(`SELECT * FROM images WHERE id = ? LIMIT 1`).bind(row.id).first();
    const item = mapD1RowToItem(updated, { origin: url.origin, accountHash: newAccountHash });
    return jsonResponse({
      ok: true,
      mode,
      item,
      image: item,
      parent_image_id: updated.parent_image_id || null,
      transform_json: transformJson,
    });
  }

  const imageUuid = crypto.randomUUID();
  const rowId = `img_${imageUuid.replace(/-/g, '').slice(0, 24)}`;
  const newRow = await insertImageRow(env, {
    id: rowId,
    tenant_id: scope.tenantId,
    project_id: row.project_id || null,
    user_id: scope.userId,
    filename: outFilename,
    original_filename: row.original_filename || row.filename,
    mime_type: outMime,
    size: outBuf.byteLength,
    width: null,
    height: null,
    r2_key: null,
    cloudflare_image_id: cf.imageId,
    url: publicUrl,
    thumbnail_url: thumbUrl,
    alt_text: row.alt_text || null,
    description: row.description || null,
    tags: row.tags || '[]',
    metadata: JSON.stringify({
      ...transformMeta,
      registered_from: 'transform_derivative',
      iam_hosted: cfCtx.iam_hosted === true,
    }),
    workspace_id: scope.workspaceId,
    parent_image_id: row.id,
    transform_json: transformJson,
  });

  const item = mapD1RowToItem(newRow, { origin: url.origin, accountHash: newAccountHash });
  return jsonResponse({
    ok: true,
    mode,
    item,
    image: item,
    parent_image_id: newRow.parent_image_id,
    transform_json: newRow.transform_json,
  });
}

async function handleBatchTags(request, url, env, authUser, identity) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const add = normalizeTags(body.add);
  const remove = new Set(normalizeTags(body.remove));
  if (!ids.length) return jsonResponse({ error: 'ids required' }, 400);
  if (!add.length && !remove.size) return jsonResponse({ error: 'add or remove required' }, 400);

  const results = [];
  const cfPatchQueue = [];

  for (const id of ids) {
    const rowOrErr = await getImageRowForPatch(env, id, scope, authUser, url.origin);
    if (!rowOrErr || rowOrErr.forbidden) {
      results.push({ id, ok: false, error: !rowOrErr ? 'not_found' : 'forbidden' });
      continue;
    }
    const row = rowOrErr;
    const current = normalizeTags(parseTags(row.tags));
    const merged = normalizeTags([...current.filter((t) => !remove.has(t)), ...add]);
    await env.DB.prepare(`UPDATE images SET tags = ?, updated_at = unixepoch() WHERE id = ?`)
      .bind(JSON.stringify(merged), row.id)
      .run();
    if (row.cloudflare_image_id) {
      cfPatchQueue.push({ row, merged });
    } else if (row.r2_key) {
      const sidecar = buildR2SidecarPayload({
        tags: merged,
        meta: buildMetaFromRow(row),
        alt_text: row.alt_text,
        scope,
      });
      await syncR2ImageMeta(env, row.r2_key, sidecar, merged, scope, row.size);
    }
    results.push({ id, ok: true, tags: merged });
  }

  // CF-side meta patches route through the batch API once there's more than a couple of
  // hosted images involved (QC-13) — keeps multi-select tagging off the global CF API rate limit.
  if (cfPatchQueue.length) {
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const apiToken = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
    if (accountId && apiToken) {
      try {
        await runCfImagesBatch(accountId, apiToken, cfPatchQueue, async ({ row, merged }, batchToken) => {
          const payload = buildCfImagesMetaPayload({
            tags: merged,
            meta: buildMetaFromRow(row),
            scope,
            alt_text: row.alt_text,
            filename: row.filename,
          });
          return batchPatchCfImageMeta(batchToken, row.cloudflare_image_id, payload);
        });
      } catch {
        // best-effort — D1 tags are already the SSOT; CF meta mirror can lag and self-heal on next PATCH.
      }
    }
  }

  return jsonResponse({ ok: true, results });
}

async function handleBatchDelete(request, url, env, authUser, identity) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (!ids.length) return jsonResponse({ error: 'ids required' }, 400);

  const results = [];
  const cfDeleteQueue = [];

  for (const id of ids) {
    if (String(id).startsWith('drive_')) {
      results.push({ id, ok: false, error: 'drive items are browse-only' });
      continue;
    }
    if (String(id).startsWith('cf_live_')) {
      cfDeleteQueue.push({ id, cfId: String(id).slice('cf_live_'.length), r2Key: null });
      continue;
    }
    const row = await env.DB.prepare(`SELECT * FROM images WHERE id = ? LIMIT 1`).bind(id).first();
    if (!row) {
      results.push({ id, ok: false, error: 'not_found' });
      continue;
    }
    if (String(row.user_id) !== String(authUser.id) || String(row.workspace_id) !== String(scope.workspaceId)) {
      results.push({ id, ok: false, error: 'forbidden' });
      continue;
    }
    if (row.cloudflare_image_id) {
      cfDeleteQueue.push({ id, cfId: row.cloudflare_image_id, r2Key: row.r2_key });
      continue;
    }
    if (row.r2_key) {
      const binding = getR2Binding(env, BUCKET);
      await binding?.delete?.(row.r2_key).catch(() => {});
      await binding?.delete?.(metaSidecarKey(row.r2_key)).catch(() => {});
    }
    await env.DB.prepare(`UPDATE images SET status = 'deleted', updated_at = unixepoch() WHERE id = ?`)
      .bind(id)
      .run();
    results.push({ id, ok: true });
  }

  if (cfDeleteQueue.length) {
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const apiToken = String(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || '').trim();
    const useBatch = accountId && apiToken && cfDeleteQueue.length > 2;

    const finalizeOne = async (entry) => {
      if (entry.r2Key) {
        const binding = getR2Binding(env, BUCKET);
        await binding?.delete?.(entry.r2Key).catch(() => {});
        await binding?.delete?.(metaSidecarKey(entry.r2Key)).catch(() => {});
      }
      if (!String(entry.id).startsWith('cf_live_')) {
        await env.DB.prepare(`UPDATE images SET status = 'deleted', updated_at = unixepoch() WHERE id = ?`)
          .bind(entry.id)
          .run();
      }
    };

    if (useBatch) {
      try {
        await runCfImagesBatch(accountId, apiToken, cfDeleteQueue, async (entry, batchToken) => {
          await batchDeleteFromCfImages(batchToken, entry.cfId);
          await finalizeOne(entry);
          return true;
        });
        for (const entry of cfDeleteQueue) results.push({ id: entry.id, ok: true });
      } catch {
        for (const entry of cfDeleteQueue) {
          await deleteCfImage(env, entry.cfId);
          await finalizeOne(entry);
          results.push({ id: entry.id, ok: true });
        }
      }
    } else {
      for (const entry of cfDeleteQueue) {
        await deleteCfImage(env, entry.cfId);
        await finalizeOne(entry);
        results.push({ id: entry.id, ok: true });
      }
    }
  }

  return jsonResponse({ ok: true, results });
}

async function handleBatchMigrate(request, url, env, authUser, identity) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const target = body.target === 'r2' ? 'r2' : 'cf_images';
  if (!ids.length) return jsonResponse({ error: 'ids required' }, 400);
  if (target !== 'cf_images') {
    return jsonResponse(
      { error: 'migrate target=r2 not supported: iam-uploaded assets already keep an R2 original; use Export instead.' },
      400,
    );
  }

  const { resolveCfImagesUploadContext } = await import('../core/cf-oauth-images.js');
  const cfCtx = await resolveCfImagesUploadContext(env, {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
  if (!cfCtx.ok) {
    return jsonResponse({ error: cfCtx.error, detail: cfCtx.detail, accounts: cfCtx.accounts }, 403);
  }

  const rows = [];
  for (const id of ids) {
    const row = await env.DB.prepare(
      `SELECT * FROM images WHERE id = ? AND COALESCE(status,'active')='active' LIMIT 1`,
    )
      .bind(id)
      .first();
    if (!row) continue;
    if (String(row.user_id) !== String(authUser.id) || String(row.workspace_id) !== String(scope.workspaceId)) continue;
    if (row.cloudflare_image_id) continue; // already hosted
    if (!row.r2_key) continue;
    rows.push(row);
  }
  if (!rows.length) return jsonResponse({ ok: true, results: [], note: 'no eligible R2-only images found' });

  const binding = getR2Binding(env, BUCKET);
  const accountHash = cfCtx.accountHash || String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();

  const batchOutcomes = await runCfImagesBatch(cfCtx.accountId, cfCtx.token, rows, async (row, batchToken) => {
    const obj = await binding?.get?.(row.r2_key);
    if (!obj?.body) throw new Error('R2 object missing');
    const buf = await new Response(obj.body).arrayBuffer();
    assertWithinHostedUploadLimit(buf.byteLength);
    const meta = buildMetaFromRow(row);
    const cfMetaPayload = buildCfImagesMetaPayload({
      tags: parseTags(row.tags),
      meta,
      scope,
      alt_text: row.alt_text,
      filename: row.filename,
    });
    const file = new File([buf], row.filename || 'image.jpg', { type: row.mime_type || 'image/jpeg' });
    const result = await batchUploadToCfImages(batchToken, file, cfMetaPayload);
    const publicUrl = accountHash ? cfDeliveryUrl(accountHash, result.id, 'public') : row.url;
    const thumbUrl = accountHash ? cfDeliveryUrl(accountHash, result.id, 'thumbnail') : publicUrl;
    await env.DB.prepare(
      `UPDATE images SET cloudflare_image_id = ?, url = ?, thumbnail_url = ?, updated_at = unixepoch() WHERE id = ?`,
    )
      .bind(result.id, publicUrl, thumbUrl, row.id)
      .run();
    return { cloudflare_image_id: result.id };
  });

  const results = batchOutcomes.map((o) => ({
    id: o.item.id,
    ok: o.ok,
    cloudflare_image_id: o.ok ? o.result?.cloudflare_image_id : null,
    error: o.ok ? undefined : o.error,
  }));

  return jsonResponse({ ok: true, target, results });
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {unknown} env
 * @param {unknown} authUser
 * @param {{ workspaceId?: string, tenantId?: string } | null | undefined} identity
 */
async function handleImagesCapabilities(url, env, authUser, identity) {
  const scope = await resolveScope(
    env,
    authUser,
    identity,
    url.searchParams.get('workspace_id')?.trim(),
  );
  if (scope.error) return jsonResponse({ error: scope.error }, scope.status);

  const { resolveCloudflareOAuthToken } = await import('../core/user-oauth-token.js');
  const { resolveCfImagesUploadContext } = await import('../core/cf-oauth-images.js');

  const cfTok = await resolveCloudflareOAuthToken(env, scope.userId, { nearExpirySeconds: 300 });
  const cfCtx = await resolveCfImagesUploadContext(env, {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  }).catch(() => null);
  const drive = await driveAccountSummary(env, scope.userId);

  // Full catalog: Worker bindings + OAuth/S3 account buckets (BYOK customer path).
  // Do not stop at listBoundR2BucketNames — that is bindings-only.
  let r2Buckets = [];
  let r2Bound = [];
  let r2Via = null;
  try {
    r2Bound = listBoundR2BucketNames(env) || [];
  } catch {
    r2Bound = [];
  }
  try {
    const cat = await listR2BucketsForCatalog(env, {
      authUser,
      workspaceId: scope.workspaceId,
    });
    r2Buckets = (cat?.buckets || [])
      .map((b) => (typeof b === 'string' ? b : b?.name || b?.bucket_name || ''))
      .filter(Boolean);
    r2Via = cat?.via || cat?.source || null;
  } catch {
    r2Buckets = [];
  }
  if (!r2Buckets.length && r2Bound.length) r2Buckets = [...r2Bound];

  return jsonResponse({
    ok: true,
    cf_images: !!(cfCtx && cfCtx.ok),
    cf_oauth: !!(cfTok && cfTok.ok),
    cf_oauth_refreshed: !!(cfTok && cfTok.refreshed),
    cf_expires_at: cfTok?.expiresAt ?? null,
    account_hash: cfCtx?.accountHash || env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || null,
    accountHash: cfCtx?.accountHash || env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || null,
    account_id: cfCtx?.accountId || cfTok?.accountId || null,
    source: cfCtx?.source || null,
    r2: r2Buckets.length > 0,
    r2_buckets: r2Buckets,
    r2_bound_buckets: r2Bound,
    r2_catalog_via: r2Via,
    drive: !!drive.connected,
    drive_connected: !!drive.connected,
    drive_account_email: drive.account_email || null,
    drive_expires_at: drive.expires_at ?? null,
    drive_has_refresh: drive.has_refresh ?? null,
    images_transformed: null,
  });
}

export async function handleImagesApi(request, url, env, authUser, identity) {
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = request.method.toUpperCase();
  const wsHint = url.searchParams.get('workspace_id')?.trim() || identity?.workspaceId || '';

  if (pathLower === '/api/images/capabilities' && method === 'GET') {
    return handleImagesCapabilities(url, env, authUser, identity);
  }

  if (pathLower === '/api/images/tags' && method === 'GET') {
    return handleListTags(url, env, authUser, identity);
  }

  if (pathLower === '/api/images/variants/catalog' && method === 'GET') {
    return handleVariantsCatalog(env);
  }

  if (pathLower === '/api/images/variants' && method === 'POST') {
    return handleCreateVariant(request, env);
  }

  if (pathLower === '/api/images/resource-tags/keys' && method === 'GET') {
    const listed = await listAccountTagKeys(env);
    if (!listed.ok) return jsonResponse({ ok: false, error: listed.error, keys: [] }, listed.status || 502);
    return jsonResponse({ ok: true, keys: listed.keys });
  }

  const resourceTagValuesMatch = path.match(/^\/api\/images\/resource-tags\/values\/([^/]+)$/i);
  if (resourceTagValuesMatch && method === 'GET') {
    const listed = await listValuesForKey(env, decodeURIComponent(resourceTagValuesMatch[1]));
    if (!listed.ok) {
      return jsonResponse(
        { ok: false, error: listed.error, values: [], key: listed.key || null },
        listed.status || 502,
      );
    }
    return jsonResponse({ ok: true, key: listed.key, values: listed.values });
  }

  if (pathLower === '/api/images/resource-tags/catalog' && method === 'GET') {
    const keysRes = await listAccountTagKeys(env);
    if (!keysRes.ok) {
      return jsonResponse({ ok: false, error: keysRes.error, keys: [], groups: {} }, keysRes.status || 502);
    }
    const groups = {};
    for (const key of keysRes.keys.slice(0, 40)) {
      const vals = await listValuesForKey(env, key);
      groups[key] = vals.ok ? vals.values : [];
    }
    return jsonResponse({ ok: true, keys: keysRes.keys, groups });
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

  const driveMediaMatch = path.match(/^\/api\/images\/drive\/([^/]+)\/(preview|thumbnail)$/i);
  if (driveMediaMatch && method === 'GET') {
    return handleDriveMedia(env, authUser, driveMediaMatch[1], driveMediaMatch[2].toLowerCase());
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

  if (pathLower === '/api/images/save' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const generationId = String(body.generation_id || '').trim();
    if (!generationId) return jsonResponse({ error: 'generation_id required' }, 400);
    try {
      const out = await saveImageDraft(
        env,
        {
          authUser,
          workspaceId: wsHint || identity?.workspaceId || body.workspace_id || null,
          tenantId: identity?.tenantId || null,
          origin: url.origin,
        },
        body,
      );
      return jsonResponse({ ...out, category_presets: IMAGE_SAVE_CATEGORY_PRESETS });
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'save failed';
      const status =
        msg === 'draft_not_found' || msg === 'draft_expired'
          ? 404
          : msg === 'project_not_found'
            ? 404
            : 500;
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

  if (pathLower === '/api/images/rate' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const generationId = String(body.generation_id || '').trim();
    const ratingRaw = Number(body.rating);
    if (!generationId) return jsonResponse({ error: 'generation_id required' }, 400);
    if (ratingRaw !== 1 && ratingRaw !== -1) {
      return jsonResponse({ error: 'rating must be 1 (up) or -1 (down)' }, 400);
    }
    try {
      const out = await rateImageGeneration(env, {
        generationId,
        userId: authUser.id,
        workspaceId: wsHint || identity?.workspaceId || body.workspace_id || null,
        tenantId: identity?.tenantId || authUser?.tenant_id || authUser?.active_tenant_id || null,
        rating: /** @type {1 | -1} */ (ratingRaw),
      });
      return jsonResponse(out);
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'rate failed';
      const status =
        msg === 'draft_not_found' ? 404 : msg === 'forbidden' ? 403 : msg.includes('required') ? 400 : 500;
      return jsonResponse({ error: msg }, status);
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

  const projectMatch = path.match(/^\/api\/images\/([^/]+)\/project$/i);
  if (projectMatch && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const scope = await resolveScope(env, authUser, identity, wsHint || body.workspace_id);
    if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
    try {
      const out = await setImageProject(env, {
        imageId: projectMatch[1],
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        projectId: body.project_id === null || body.project_id === '' ? null : body.project_id,
      });
      return jsonResponse(out);
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : 'project attach failed';
      const status =
        msg === 'image_not_found' || msg === 'project_not_found'
          ? 404
          : msg === 'forbidden'
            ? 403
            : 500;
      return jsonResponse({ error: msg }, status);
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

  if (pathLower === '/api/images/batch/tags' && method === 'POST') {
    return handleBatchTags(request, url, env, authUser, identity);
  }

  if (pathLower === '/api/images/batch/delete' && method === 'POST') {
    return handleBatchDelete(request, url, env, authUser, identity);
  }

  if (pathLower === '/api/images/batch/migrate' && method === 'POST') {
    return handleBatchMigrate(request, url, env, authUser, identity);
  }

  const transformMatch = path.match(/^\/api\/images\/([^/]+)\/transform$/i);
  if (transformMatch && method === 'POST') {
    return handleTransformCommit(request, url, env, authUser, identity, transformMatch[1]);
  }

  const previewMatch = path.match(/^\/api\/images\/([^/]+)\/preview-url$/i);
  if (previewMatch && method === 'GET') {
    return handlePreviewUrl(url, env, authUser, identity, previewMatch[1]);
  }

  const resourceTagsMatch = path.match(/^\/api\/images\/([^/]+)\/resource-tags$/i);
  if (resourceTagsMatch && method === 'GET') {
    const imageId = resourceTagsMatch[1];
    const scope = await resolveScope(
      env,
      authUser,
      identity,
      url.searchParams.get('workspace_id')?.trim(),
    );
    if (scope.error) return jsonResponse({ error: scope.error }, scope.status);
    const rowOrErr = await getImageRowForPatch(env, imageId, scope, authUser, url.origin);
    if (!rowOrErr) return jsonResponse({ error: 'Not found' }, 404);
    if (rowOrErr.forbidden) return jsonResponse({ error: 'Forbidden' }, 403);
    const cfId = String(rowOrErr.cloudflare_image_id || '').trim();
    if (!cfId) {
      return jsonResponse({
        ok: true,
        tags: {},
        skipped: true,
        error: 'Image is not hosted on Cloudflare Images — Resource Tagging applies to image resources only',
      });
    }
    const tagRes = await getResourceTags(env, cfId);
    return jsonResponse({
      ok: tagRes.ok,
      tags: tagRes.tags || {},
      beta_untagged: !!tagRes.beta_untagged,
      error: tagRes.ok ? undefined : tagRes.error,
      cloudflare_image_id: cfId,
    }, tagRes.ok ? 200 : tagRes.status || 502);
  }

  if (resourceTagsMatch && method === 'PUT') {
    const imageId = resourceTagsMatch[1];
    const body = await request.json().catch(() => ({}));
    return handlePatchImage(request, url, env, authUser, identity, imageId, {
      resource_tags: body.tags || body.resource_tags || {},
    });
  }

  const patchMatch = path.match(/^\/api\/images\/([^/]+)$/i);
  if (patchMatch && method === 'PATCH') {
    return handlePatchImage(request, url, env, authUser, identity, patchMatch[1]);
  }

  const delMatch = path.match(/^\/api\/images\/([^/]+)$/i);
  if (delMatch && method === 'DELETE') {
    return handleDelete(delMatch[1], request, url, env, authUser, identity);
  }

  const detailMatch = path.match(/^\/api\/images\/([^/]+)$/i);
  if (detailMatch && method === 'GET') {
    return handleGetImageDetail(url, env, authUser, identity, detailMatch[1]);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

/** @deprecated alias */
export const handleImagesWorkspaceApi = handleImagesApi;
