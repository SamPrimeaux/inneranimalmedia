/** Session-scoped workspace payload — key `iam_workspace` (survives in-tab navigations, cleared on tab close). */
export const IAM_WORKSPACE_SESSION_KEY = 'iam_workspace';

export type IamWorkspaceSettingsRow = {
  id: string;
  name?: string;
  display_name?: string;
  slug?: string;
  category?: string;
  brand?: string;
  github_repo?: string | null;
  status?: string;
};

export type IamWorkspaceSessionPayload = {
  fetchedAt: number;
  sessionUserId: string | null;
  current: string | null;
  data: IamWorkspaceSettingsRow[];
  workspaceThemes?: Record<string, string>;
  workspaces?: Record<string, unknown>;
};

function isPayload(v: unknown): v is IamWorkspaceSessionPayload {
  if (!v || typeof v !== 'object') return false;
  const o = v as IamWorkspaceSessionPayload;
  return Array.isArray(o.data) && typeof o.fetchedAt === 'number';
}

export function readIamWorkspaceSession(): IamWorkspaceSessionPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(IAM_WORKSPACE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeIamWorkspaceSession(payload: IamWorkspaceSessionPayload): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(IAM_WORKSPACE_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

/** Update active workspace id in session cache after selector switch (no API round-trip). */
export function patchIamWorkspaceSessionCurrent(
  workspaceId: string,
  patch?: Partial<IamWorkspaceSettingsRow>,
): void {
  const prev = readIamWorkspaceSession();
  if (!prev) return;
  const id = workspaceId.trim();
  if (!id) return;
  let data = prev.data;
  if (patch && Object.keys(patch).length > 0) {
    const idx = data.findIndex((r) => r.id === id);
    if (idx >= 0) {
      data = data.slice();
      data[idx] = { ...data[idx], ...patch, id };
    } else if (patch.name || patch.display_name) {
      data = [{ id, ...patch }, ...data];
    }
  }
  writeIamWorkspaceSession({
    ...prev,
    current: id,
    data,
    fetchedAt: Date.now(),
  });
}

export function clearIamWorkspaceSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(IAM_WORKSPACE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
