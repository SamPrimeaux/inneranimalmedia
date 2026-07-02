import { uploadDashboardImage } from '../../api/uploadImage';

/** Platform ASSETS bucket — non-image project files only. */
const PLATFORM_ASSETS_BUCKET = 'inneranimalmedia';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Upload project cover or image file to Cloudflare Images (fast CDN delivery). */
export async function uploadProjectCoverImage(
  file: File,
  workspaceId?: string | null,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!isImageFile(file)) {
    return { ok: false, error: 'Choose an image file' };
  }
  return uploadDashboardImage(file, workspaceId);
}

export async function uploadProjectR2File(
  projectId: string,
  file: File,
  subpath: 'files' | 'cover' = 'files',
  workspaceId?: string | null,
): Promise<{ ok: boolean; url?: string; key?: string; error?: string }> {
  if (isImageFile(file)) {
    const cf = await uploadProjectCoverImage(file, workspaceId);
    if (!cf.ok) return cf;
    return { ok: true, url: cf.url };
  }

  const safeName = file.name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 120) || 'upload';
  const key =
    subpath === 'cover'
      ? `projects/${projectId}/cover/${Date.now()}-${safeName}`
      : `projects/${projectId}/files/${Date.now()}-${safeName}`;

  const fd = new FormData();
  fd.append('bucket', PLATFORM_ASSETS_BUCKET);
  fd.append('key', key);
  fd.append('file', file);

  try {
    const res = await fetch('/api/r2/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      key?: string;
      bucket?: string;
      error?: string;
    };
    if (!res.ok) return { ok: false, error: String(data.error || `Upload failed (${res.status})`) };
    const resolvedUrl =
      data.url ||
      (data.bucket && data.key
        ? `/api/r2/buckets/${encodeURIComponent(data.bucket)}/object/${encodeURIComponent(data.key)}`
        : undefined);
    return { ok: true, url: resolvedUrl, key: data.key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}

export async function uploadProjectTextFile(
  projectId: string,
  title: string,
  content: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const safeTitle = title.trim().replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'note';
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const file = new File([blob], `${safeTitle}.txt`, { type: 'text/plain' });
  return uploadProjectR2File(projectId, file, 'files');
}
