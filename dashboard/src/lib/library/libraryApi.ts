import { pickR2DisplayBuckets, type R2BucketsApiResponse } from '../r2Buckets';
import { partitionR2Listing, type R2ObjectRow } from '../r2Listing';

export type DriveApiFile = {
  id: string;
  name: string;
  mimeType?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
};

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export function isDriveFolder(file: Pick<DriveApiFile, 'mimeType'>) {
  return file.mimeType === DRIVE_FOLDER_MIME;
}

export async function fetchGoogleIntegrationReady(signal?: AbortSignal): Promise<boolean> {
  try {
    const st = await fetch('/api/integrations/status', { credentials: 'same-origin', signal });
    const status = st.ok ? await st.json().catch(() => ({})) : {};
    return !(st.ok && status && status.google === false);
  } catch {
    return false;
  }
}

export async function fetchDriveListing(
  folderId: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; files: DriveApiFile[]; error?: string; unauthorized?: boolean }> {
  try {
    const res = await fetch(
      `/api/integrations/gdrive/files?folderId=${encodeURIComponent(folderId)}`,
      { credentials: 'same-origin', signal },
    );
    if (res.status === 401 || res.status === 400) {
      return { ok: false, files: [], unauthorized: true, error: 'Google Drive not connected' };
    }
    if (!res.ok) {
      return { ok: false, files: [], error: `Drive list failed (${res.status})` };
    }
    const data = await res.json();
    const files = Array.isArray(data.files) ? (data.files as DriveApiFile[]) : [];
    return { ok: true, files };
  } catch (e) {
    return {
      ok: false,
      files: [],
      error: e instanceof Error ? e.message : 'Drive list failed',
    };
  }
}

export async function searchDriveFiles(
  query: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; files: DriveApiFile[]; error?: string }> {
  const raw = query.trim();
  if (raw.length < 2) return { ok: true, files: [] };
  const escaped = raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const driveQ = `name contains '${escaped}' and trashed=false`;
  try {
    const res = await fetch(`/api/drive/search?q=${encodeURIComponent(driveQ)}`, {
      credentials: 'same-origin',
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        files: [],
        error: typeof data.error === 'string' ? data.error : 'Drive search failed',
      };
    }
    return { ok: true, files: Array.isArray(data.files) ? data.files : [] };
  } catch (e) {
    return {
      ok: false,
      files: [],
      error: e instanceof Error ? e.message : 'Drive search failed',
    };
  }
}

export async function fetchR2BucketNames(signal?: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch('/api/r2/buckets', { credentials: 'same-origin', signal });
    if (!res.ok) {
      const listRes = await fetch('/api/r2/list?buckets=true', { credentials: 'same-origin', signal });
      if (!listRes.ok) return [];
      const listData = (await listRes.json()) as R2BucketsApiResponse;
      return pickR2DisplayBuckets(listData);
    }
    const data = (await res.json()) as R2BucketsApiResponse;
    return pickR2DisplayBuckets(data);
  } catch {
    return [];
  }
}

export type R2ListResponse = {
  ok: boolean;
  folders: string[];
  files: R2ObjectRow[];
  error?: string;
  cursor?: string | null;
  truncated?: boolean;
};

export async function fetchR2Listing(
  bucket: string,
  prefix: string,
  signal?: AbortSignal,
): Promise<R2ListResponse> {
  try {
    const qs = new URLSearchParams({ bucket, prefix });
    const res = await fetch(`/api/r2/list?${qs}`, { credentials: 'same-origin', signal });
    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        folders: [],
        files: [],
        error: typeof data.error === 'string' ? data.error : `R2 list failed (${res.status})`,
      };
    }
    const rows = (Array.isArray(data.objects) ? data.objects : []) as R2ObjectRow[];
    const prefs = Array.isArray(data.prefixes) ? data.prefixes : [];
    const { folders, files } = partitionR2Listing(rows, prefs, prefix);
    return {
      ok: true,
      folders,
      files,
      cursor: typeof data.cursor === 'string' ? data.cursor : null,
      truncated: !!data.truncated,
    };
  } catch (e) {
    return {
      ok: false,
      folders: [],
      files: [],
      error: e instanceof Error ? e.message : 'R2 list failed',
    };
  }
}

export async function fetchR2StorageLabel(bucket: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`/api/r2/stats?bucket=${encodeURIComponent(bucket)}`, {
      credentials: 'same-origin',
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const bytes = Number(data.total_bytes ?? data.bytes ?? data.size ?? 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB used`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB used`;
  } catch {
    return null;
  }
}

export function connectGoogleDrive(returnTo = '/dashboard/artifacts') {
  window.open(
    `/api/oauth/google/start?connectDrive=1&return_to=${encodeURIComponent(returnTo)}`,
    'google_oauth',
    'width=600,height=700,scrollbars=yes',
  );
}
