export type ProjectFileRef = {
  name: string;
  url: string;
  uploaded_at?: number;
  kind?: 'image' | 'document';
  r2_bucket?: string;
  r2_key?: string;
};

export type BrandTokens = {
  primary_color?: string;
  accent_color?: string;
  logo_url?: string;
  verified_at?: number;
};

export type ProjectStorageScope = {
  bucket: string;
  prefix: string;
  source: 'client_r2' | 'platform_r2' | 'metadata';
  publicBaseUrl?: string | null;
};

export type ProjectMeta = {
  cover_image_url?: string;
  project_files?: ProjectFileRef[];
  brand_assets?: ProjectFileRef[];
  brand_tokens?: BrandTokens;
  /** Override default R2 bucket (e.g. companionscpas vs inneranimalmedia). */
  storage_bucket?: string;
  /** Prefix within bucket for brand assets (default brand/{projectId}/). */
  storage_prefix?: string;
  brand_r2_prefix?: string;
  storage_public_url?: string;
};

export function parseProjectMeta(raw: unknown): ProjectMeta {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as ProjectMeta) };
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? (o as ProjectMeta) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function projectFilesFromMeta(raw: unknown): ProjectFileRef[] {
  const meta = parseProjectMeta(raw);
  const list = meta.project_files;
  return Array.isArray(list)
    ? list.filter((f) => f && typeof f.name === 'string' && typeof f.url === 'string')
    : [];
}

export function brandAssetsFromMeta(raw: unknown): ProjectFileRef[] {
  const meta = parseProjectMeta(raw);
  const list = meta.brand_assets;
  return Array.isArray(list)
    ? list.filter((f) => f && typeof f.name === 'string' && typeof f.url === 'string')
    : [];
}

export function brandTokensFromMeta(raw: unknown): BrandTokens {
  const meta = parseProjectMeta(raw);
  const t = meta.brand_tokens;
  return t && typeof t === 'object' ? { ...t } : {};
}

export function coverFromMeta(raw: unknown): string | null {
  const meta = parseProjectMeta(raw);
  const u = meta.cover_image_url != null ? String(meta.cover_image_url).trim() : '';
  return u || null;
}

export function isProjectImageFile(ref: ProjectFileRef): boolean {
  if (ref.kind === 'image') return true;
  if (ref.kind === 'document') return false;
  return /\.(png|jpe?g|gif|webp|avif|svg|heic)$/i.test(ref.name) || ref.url.includes('imagedelivery.net');
}

function isImageKey(key: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg|heic)$/i.test(key);
}

function parseR2BucketName(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as { bucket_name?: string; bucket?: string };
      return String(o.bucket_name || o.bucket || '').trim() || null;
    } catch {
      return null;
    }
  }
  return t.split(/[,;]/)[0]?.trim() || null;
}

export function resolveProjectStorageScope(project: {
  id: string;
  r2_buckets?: string | null;
  metadata_json?: string | null;
  worker_id?: string | null;
}): ProjectStorageScope {
  const meta = parseProjectMeta(project.metadata_json);
  const explicitBucket = meta.storage_bucket?.trim();
  const rowBucket = parseR2BucketName(project.r2_buckets);
  const bucket = explicitBucket || rowBucket || 'inneranimalmedia';
  const rawPrefix =
    meta.storage_prefix ||
    meta.brand_r2_prefix ||
    (bucket !== 'inneranimalmedia' ? 'brand/' : `brand/${project.id}/`);
  const prefix = rawPrefix.replace(/^\/*/, '');
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const isPlatformDefault = bucket === 'inneranimalmedia' && !rowBucket && !explicitBucket;
  return {
    bucket,
    prefix: normalizedPrefix,
    source: isPlatformDefault ? 'platform_r2' : 'client_r2',
    publicBaseUrl: meta.storage_public_url || null,
  };
}

function brandListPrefixes(scope: ProjectStorageScope): string[] {
  if (scope.source === 'client_r2') {
    return [...new Set([scope.prefix, 'brand/', 'assets/', 'images/', 'logos/'])];
  }
  return [scope.prefix];
}

export function r2ObjectUrl(bucket: string, key: string): string {
  return `/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
}

export function brandAssetBrowserUrl(scope: ProjectStorageScope): string {
  const q = new URLSearchParams({
    rail: 'r2',
    bucket: scope.bucket,
    prefix: scope.prefix,
  });
  return `/dashboard/artifacts?${q}`;
}

export async function listProjectBrandAssetsFromR2(
  scope: ProjectStorageScope,
): Promise<ProjectFileRef[]> {
  const prefixes = brandListPrefixes(scope);
  const seen = new Set<string>();
  const out: ProjectFileRef[] = [];

  for (const prefix of prefixes) {
    const q = new URLSearchParams({
      bucket: scope.bucket,
      prefix,
      recursive: '1',
      limit: '40',
    });
    const r = await fetch(`/api/r2/list?${q}`, { credentials: 'same-origin' });
    if (!r.ok) continue;
    const data = (await r.json().catch(() => ({}))) as {
      objects?: { key: string; last_modified?: string | null }[];
    };
    for (const o of data.objects || []) {
      if (!o?.key || !isImageKey(o.key) || seen.has(o.key)) continue;
      seen.add(o.key);
      out.push({
        name: o.key.split('/').pop() || o.key,
        url: r2ObjectUrl(scope.bucket, o.key),
        uploaded_at: o.last_modified ? Date.parse(o.last_modified) : undefined,
        kind: 'image' as const,
        r2_bucket: scope.bucket,
        r2_key: o.key,
      });
      if (out.length >= 12) return out;
    }
  }
  return out;
}

export function mergeBrandAssetLists(
  fromR2: ProjectFileRef[],
  fromMeta: ProjectFileRef[],
): ProjectFileRef[] {
  const seen = new Set<string>();
  const out: ProjectFileRef[] = [];
  for (const ref of [...fromR2, ...fromMeta]) {
    const dedupe = ref.r2_key || ref.url;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(ref);
  }
  return out.slice(0, 12);
}
