export type ProjectFileRef = {
  name: string;
  url: string;
  uploaded_at?: number;
};

export type ProjectMeta = {
  cover_image_url?: string;
  project_files?: ProjectFileRef[];
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

export function coverFromMeta(raw: unknown): string | null {
  const meta = parseProjectMeta(raw);
  const u = meta.cover_image_url != null ? String(meta.cover_image_url).trim() : '';
  return u || null;
}
