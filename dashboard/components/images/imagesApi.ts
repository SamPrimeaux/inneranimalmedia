import { useCallback, useState } from 'react';

export type ImagesSourceTab = 'all' | 'r2' | 'cf_images' | 'drive';

export type ImagesToast = { id: number; msg: string; type: 'ok' | 'err' };

/** Local toast hook for Images surfaces (not a shared package import). */
export function useImagesToast() {
  const [toasts, setToasts] = useState<ImagesToast[]>([]);
  const add = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);
  return { toasts, add };
}

export function imagesListUrl(
  workspaceId: string | null | undefined,
  source: ImagesSourceTab,
  page: number,
  perPage: number,
  tag?: string,
  q?: string,
  r2Bucket?: string,
  r2Prefix?: string,
) {
  const params = new URLSearchParams();
  params.set('source', source);
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  const ws = workspaceId?.trim();
  if (ws) params.set('workspace_id', ws);
  if (tag?.trim()) params.set('tag', tag.trim());
  if (q?.trim()) params.set('q', q.trim());
  if (source === 'r2' && r2Bucket?.trim()) {
    params.set('r2_bucket', r2Bucket.trim());
    params.set('r2_prefix', r2Prefix ?? '');
  }
  return `/api/images?${params.toString()}`;
}

export function imagesTagsUrl(workspaceId?: string | null) {
  const params = new URLSearchParams();
  const ws = workspaceId?.trim();
  if (ws) params.set('workspace_id', ws);
  const qs = params.toString();
  return qs ? `/api/images/tags?${qs}` : '/api/images/tags';
}

/** CF Resource Tagging account catalog (keys + values grouped). */
export function imagesResourceTagsCatalogUrl() {
  return '/api/images/resource-tags/catalog';
}

export function imagesResourceTagsUrl(imageId: string, workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  const base = `/api/images/${encodeURIComponent(imageId)}/resource-tags`;
  return ws ? `${base}?workspace_id=${encodeURIComponent(ws)}` : base;
}

export function imagesDetailUrl(imageId: string, workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  return ws
    ? `/api/images/${encodeURIComponent(imageId)}?workspace_id=${encodeURIComponent(ws)}`
    : `/api/images/${encodeURIComponent(imageId)}`;
}

export function imagesPatchUrl(imageId: string, workspaceId?: string | null) {
  return imagesDetailUrl(imageId, workspaceId);
}

export function imagesUploadUrl(workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  return ws
    ? `/api/images/upload?workspace_id=${encodeURIComponent(ws)}`
    : '/api/images/upload';
}

export function imagesShareUrl(imageId: string, workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  const base = `/api/images/${encodeURIComponent(imageId)}/share`;
  return ws ? `${base}?workspace_id=${encodeURIComponent(ws)}` : base;
}

export function imagesTransformUrl(imageId: string, workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  const base = `/api/images/${encodeURIComponent(imageId)}/transform`;
  return ws ? `${base}?workspace_id=${encodeURIComponent(ws)}` : base;
}

export function imagesPreviewUrl(
  imageId: string,
  ops: Record<string, string | number | boolean | undefined | null>,
  workspaceId?: string | null,
) {
  const params = new URLSearchParams();
  const ws = workspaceId?.trim();
  if (ws) params.set('workspace_id', ws);
  for (const [k, v] of Object.entries(ops)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return `/api/images/${encodeURIComponent(imageId)}/preview-url${qs ? `?${qs}` : ''}`;
}

export function imagesCapabilitiesUrl(workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  return ws
    ? `/api/images/capabilities?workspace_id=${encodeURIComponent(ws)}`
    : '/api/images/capabilities';
}

export function imagesBatchDeleteUrl(workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  return ws
    ? `/api/images/batch/delete?workspace_id=${encodeURIComponent(ws)}`
    : '/api/images/batch/delete';
}

export function imagesBatchExportUrl(workspaceId?: string | null) {
  const ws = workspaceId?.trim();
  return ws
    ? `/api/images/batch/export?workspace_id=${encodeURIComponent(ws)}`
    : '/api/images/batch/export';
}

export function cfDeliveryBase(accountHash: string) {
  return `https://imagedelivery.net/${accountHash}`;
}

export function buildCfImageUrl(accountHash: string, id: string, variant = 'public') {
  return `${cfDeliveryBase(accountHash)}/${id}/${variant}`;
}

export type ImagesCapabilities = {
  cf_images?: boolean;
  cf_oauth?: boolean;
  cf_oauth_refreshed?: boolean;
  cf_expires_at?: number | null;
  r2?: boolean;
  r2_buckets?: string[];
  drive?: boolean;
  drive_connected?: boolean;
  drive_account_email?: string | null;
  account_hash?: string;
  accountHash?: string;
  account_id?: string | null;
  images_transformed?: number | string | null;
  source?: string | null;
};

export async function fetchImagesCapabilities(
  workspaceId?: string | null,
): Promise<ImagesCapabilities | null> {
  try {
    const r = await fetch(imagesCapabilitiesUrl(workspaceId), { credentials: 'same-origin' });
    if (!r.ok) return null;
    return (await r.json()) as ImagesCapabilities;
  } catch {
    return null;
  }
}
