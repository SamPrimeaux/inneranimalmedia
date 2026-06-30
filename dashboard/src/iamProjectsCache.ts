import type { OverviewProject } from '../api/projects';

const LS_PREFIX = 'iam_projects_v1';

export type IamProjectsCachePayload = {
  workspaceId: string;
  fetchedAt: number;
  projects: OverviewProject[];
};

function storageKey(workspaceId: string) {
  return `${LS_PREFIX}:${workspaceId.trim()}`;
}

export function readIamProjectsCache(workspaceId: string | null | undefined): IamProjectsCachePayload | null {
  if (typeof window === 'undefined') return null;
  const ws = workspaceId?.trim();
  if (!ws) return null;
  try {
    const raw = localStorage.getItem(storageKey(ws));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IamProjectsCachePayload;
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeIamProjectsCache(workspaceId: string, projects: OverviewProject[]): void {
  if (typeof window === 'undefined') return;
  const ws = workspaceId.trim();
  if (!ws) return;
  try {
    const payload: IamProjectsCachePayload = {
      workspaceId: ws,
      fetchedAt: Date.now(),
      projects,
    };
    localStorage.setItem(storageKey(ws), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}
