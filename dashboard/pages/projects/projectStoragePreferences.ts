import type { ProjectStorageScope } from './projectDetailMeta';

/** Per-project storage prefs — local first; never hardcode client slugs in code paths. */
export type ProjectStoragePref = {
  bucket?: string;
  prefix?: string;
  /** auto = resolve from work-context API + project row; platform = ASSETS lane only */
  source?: 'auto' | 'platform_r2' | 'client_r2';
  updated_at?: number;
};

const LS_KEY = 'iam.project.storage.v1';

type PrefStore = Record<string, ProjectStoragePref>;

function readStore(): PrefStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as PrefStore;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function writeStore(store: PrefStore) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function readProjectStoragePref(projectId: string): ProjectStoragePref | null {
  const id = projectId?.trim();
  if (!id) return null;
  const row = readStore()[id];
  return row && typeof row === 'object' ? { ...row } : null;
}

export function writeProjectStoragePref(projectId: string, pref: ProjectStoragePref): void {
  const id = projectId?.trim();
  if (!id) return;
  const store = readStore();
  store[id] = { ...pref, updated_at: Date.now() };
  writeStore(store);
}

export type ProjectWorkContextBindings = {
  r2Bucket?: string | null;
  workerName?: string | null;
  workspaceId?: string | null;
};

/** D1-driven execution bindings — same source as project activate / Agent Sam. */
export async function fetchProjectWorkContextBindings(
  projectId: string,
): Promise<ProjectWorkContextBindings | null> {
  const id = projectId?.trim();
  if (!id) return null;
  try {
    const r = await fetch(`/api/projects/${encodeURIComponent(id)}/work-context`, {
      credentials: 'same-origin',
    });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      bindings?: {
        r2Bucket?: string | null;
        workerName?: string | null;
        workspaceId?: string | null;
      };
    };
    const b = data.bindings;
    if (!b) return null;
    return {
      r2Bucket: b.r2Bucket ?? null,
      workerName: b.workerName ?? null,
      workspaceId: b.workspaceId ?? null,
    };
  } catch {
    return null;
  }
}

export function storagePrefSummary(
  scope: ProjectStorageScope | null,
  pref: ProjectStoragePref | null,
): string {
  if (!scope) return 'Resolving storage…';
  const src =
    pref?.source === 'platform_r2'
      ? 'platform'
      : pref?.source === 'client_r2'
        ? 'client'
        : scope.source === 'platform_r2'
          ? 'platform default'
          : 'workspace bindings';
  return `${scope.bucket} · ${scope.prefix} (${src})`;
}
