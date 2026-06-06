import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { registerIamServiceWorker, subscribeIamWebPush } from "../pwa/registerServiceWorker";
import {
  getTrustedRecentWorkspaceId,
  prepareRecentWorkspacesForSession,
  persistRecentWorkspaceSwitch,
} from "../recentWorkspacesStorage";
import {
  clearIamWorkspaceSession,
  patchIamWorkspaceSessionCurrent,
  readIamWorkspaceSession,
  writeIamWorkspaceSession,
  type IamWorkspaceSessionPayload,
  type IamWorkspaceSettingsRow,
} from "../iamWorkspaceStorage";
import { clearIamGitStatusCache } from "../iamGitStatusCache";
import { normalizeGithubRepo } from "../normalizeGithubRepo";

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  github_repo: string | null;
};

type WorkspaceContextValue = {
  sessionUserId: string | null;
  workspaceId: string | null;
  setWorkspaceId: (id: string) => void;
  workspaces: WorkspaceRow[];
  displayName: string | null;
  setDisplayName: (name: string | null) => void;
  loading: boolean;
  /** Re-fetch GET /api/settings/workspaces and refresh sessionStorage + context. */
  refreshWorkspaces: (opts?: { force?: boolean }) => Promise<void>;
  /** Switch active workspace: updates context, sessionStorage, and optionally syncs server. */
  switchWorkspace: (
    id: string,
    meta?: { displayName?: string; slug?: string; github_repo?: string | null; sync?: boolean },
  ) => Promise<void>;
  /** Persist repo pick to D1 workspaces.github_repo (status bar + git SSOT). */
  persistGithubRepo: (repoFullName: string, workspaceIdOverride?: string | null) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function rowDisplayName(row: IamWorkspaceSettingsRow): string | null {
  const dn = typeof row.display_name === "string" ? row.display_name.trim() : "";
  if (dn) return dn;
  const n = typeof row.name === "string" ? row.name.trim() : "";
  if (n) return n;
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  return slug || null;
}

function mapSettingsRow(row: IamWorkspaceSettingsRow): WorkspaceRow {
  const name = rowDisplayName(row) || row.id;
  const slug =
    typeof row.slug === "string" && row.slug.trim()
      ? row.slug.trim()
      : row.id.replace(/^ws_/, "") || row.id;
  return {
    id: row.id,
    name,
    slug,
    status: typeof row.status === "string" && row.status.trim() ? row.status.trim() : "active",
    github_repo: row.github_repo ?? null,
  };
}

function pickActiveWorkspace(
  list: IamWorkspaceSettingsRow[],
  settingsCurrent: string | null | undefined,
  userId: string | null,
): { id: string; displayName: string | null } | null {
  const rows = list.filter((w) => w && typeof w.id === "string");
  if (rows.length === 0) return null;
  const byId = (id: string) => rows.find((w) => w.id === id);

  const cur = typeof settingsCurrent === "string" ? settingsCurrent.trim() : "";
  if (cur) {
    const row = byId(cur);
    if (row) return { id: row.id, displayName: rowDisplayName(row) };
  }
  try {
    const rid = getTrustedRecentWorkspaceId(userId);
    if (rid) {
      const row = byId(rid);
      if (row) return { id: row.id, displayName: rowDisplayName(row) };
    }
  } catch {
    /* ignore */
  }
  const first = rows[0];
  return { id: first.id, displayName: rowDisplayName(first) };
}

function applySessionPayload(
  payload: IamWorkspaceSessionPayload,
  userId: string | null,
): {
  workspaceRows: WorkspaceRow[];
  workspaceId: string | null;
  displayName: string | null;
} {
  const workspaceRows = payload.data.filter((w) => w?.id).map(mapSettingsRow);
  const picked = pickActiveWorkspace(payload.data, payload.current, userId);
  return {
    workspaceRows,
    workspaceId: picked?.id ?? payload.current?.trim() ?? null,
    displayName: picked?.displayName ?? null,
  };
}

async function fetchSettingsWorkspaces(): Promise<IamWorkspaceSessionPayload | null> {
  const r = await fetch("/api/settings/workspaces", { credentials: "same-origin" });
  if (!r.ok) return null;
  const d = (await r.json()) as {
    data?: IamWorkspaceSettingsRow[];
    current?: string | null;
    workspaceThemes?: Record<string, string>;
    workspaces?: Record<string, unknown>;
  };
  const data = Array.isArray(d.data) ? d.data.filter((w) => w && typeof w.id === "string") : [];
  const current =
    typeof d.current === "string" && d.current.trim() ? d.current.trim() : null;
  return {
    fetchedAt: Date.now(),
    sessionUserId: null,
    current,
    data,
    workspaceThemes: d.workspaceThemes,
    workspaces: d.workspaces,
  };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionUserIdRef = useRef<string | null>(null);
  const bootstrapDoneRef = useRef(false);

  const hydrateFromPayload = useCallback((payload: IamWorkspaceSessionPayload, userId: string | null) => {
    const applied = applySessionPayload(payload, userId);
    setWorkspaces(applied.workspaceRows);
    if (applied.workspaceId) setWorkspaceIdState(applied.workspaceId);
    if (applied.displayName) setDisplayName(applied.displayName);
  }, []);

  const refreshWorkspaces = useCallback(async (opts?: { force?: boolean }) => {
    const userId = sessionUserIdRef.current;
    if (!opts?.force) {
      const cached = readIamWorkspaceSession(userId);
      if (cached && cached.data.length > 0) {
        if (!userId || !cached.sessionUserId || cached.sessionUserId === userId) {
          hydrateFromPayload(cached, userId);
          return;
        }
      }
    }
    setLoading(true);
    try {
      const payload = await fetchSettingsWorkspaces();
      if (!payload) return;
      payload.sessionUserId = userId;
      writeIamWorkspaceSession(payload);
      hydrateFromPayload(payload, userId);
    } finally {
      setLoading(false);
    }
  }, [hydrateFromPayload]);

  const switchWorkspace = useCallback(
    async (
      id: string,
      meta?: { displayName?: string; slug?: string; github_repo?: string | null; sync?: boolean },
    ) => {
      const trimmed = id.trim();
      if (!trimmed) return;
      const userId = sessionUserIdRef.current;
      setWorkspaceIdState(trimmed);
      if (meta?.displayName?.trim()) setDisplayName(meta.displayName.trim());
      else {
        const row = workspaces.find((w) => w.id === trimmed);
        if (row?.name?.trim()) setDisplayName(row.name.trim());
      }

      patchIamWorkspaceSessionCurrent(trimmed, {
        id: trimmed,
        display_name: meta?.displayName,
        slug: meta?.slug,
        github_repo: meta?.github_repo,
      });

      persistRecentWorkspaceSwitch(userId, {
        id: trimmed,
        display_name: meta?.displayName || workspaces.find((w) => w.id === trimmed)?.name || trimmed,
        slug: meta?.slug || workspaces.find((w) => w.id === trimmed)?.slug || trimmed,
        updated_at: Math.floor(Date.now() / 1000),
      });

      const shouldSync = meta?.sync !== false;
      if (shouldSync) {
        try {
          const r = await fetch("/api/settings/workspaces/active", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: trimmed }),
          });
          const data = (await r.json().catch(() => ({}))) as {
            success?: boolean;
            workspace?: {
              id: string;
              display_name?: string;
              slug?: string;
              github_repo?: string | null;
            };
          };
          if (r.ok && data.workspace) {
            patchIamWorkspaceSessionCurrent(trimmed, {
              id: data.workspace.id,
              display_name: data.workspace.display_name,
              slug: data.workspace.slug,
              github_repo: data.workspace.github_repo ?? null,
            });
            if (data.workspace.display_name?.trim()) {
              setDisplayName(data.workspace.display_name.trim());
            }
          }
        } catch {
          /* local + sessionStorage already updated */
        }
      }

      window.dispatchEvent(new CustomEvent("iam_workspace_id"));
    },
    [workspaces],
  );

  const setWorkspaceId = useCallback((id: string) => {
    void switchWorkspace(id, { sync: false });
  }, [switchWorkspace]);

  const persistGithubRepo = useCallback(
    async (repoFullName: string, workspaceIdOverride?: string | null) => {
      const wsId = (workspaceIdOverride ?? workspaceId ?? "").trim();
      const normalized = normalizeGithubRepo(repoFullName);
      if (!wsId || !normalized) return;

      const current = workspaces.find((w) => w.id === wsId)?.github_repo?.trim() || null;
      if (current === normalized) return;

      setWorkspaces((prev) =>
        prev.map((w) => (w.id === wsId ? { ...w, github_repo: normalized } : w)),
      );
      patchIamWorkspaceSessionCurrent(wsId, { github_repo: normalized });
      clearIamGitStatusCache();

      try {
        const r = await fetch(`/api/workspaces/${encodeURIComponent(wsId)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ github_repo: normalized }),
        });
        if (r.ok) {
          window.dispatchEvent(new CustomEvent("iam_workspace_github_repo", { detail: { workspaceId: wsId, github_repo: normalized } }));
        }
      } catch {
        /* local cache already updated */
      }
    },
    [workspaceId, workspaces],
  );

  useEffect(() => {
    if (bootstrapDoneRef.current) return;
    bootstrapDoneRef.current = true;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      let userId: string | null = null;
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (meRes.ok) {
          const me = (await meRes.json()) as { id?: string | null; user?: { id?: string | null } };
          const rawId = me?.user?.id ?? me?.id;
          userId = rawId != null && String(rawId).trim() ? String(rawId).trim() : null;
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      setSessionUserId(userId);
      sessionUserIdRef.current = userId;
      prepareRecentWorkspacesForSession(userId);

      if (userId) {
        void registerIamServiceWorker().then(() => subscribeIamWebPush().catch(() => false));
      }

      const cached = readIamWorkspaceSession(userId);
      if (cached && cached.data.length > 0 && (!userId || !cached.sessionUserId || cached.sessionUserId === userId)) {
        const withUser = { ...cached, sessionUserId: userId };
        writeIamWorkspaceSession(withUser);
        hydrateFromPayload(withUser, userId);
        if (!cancelled) setLoading(false);
        try {
          const fresh = await fetchSettingsWorkspaces();
          if (!cancelled && fresh) {
            fresh.sessionUserId = userId;
            writeIamWorkspaceSession(fresh);
            hydrateFromPayload(fresh, userId);
          }
        } catch {
          /* cache hydrate already applied */
        }
        return;
      }

      if (cached?.sessionUserId && userId && cached.sessionUserId !== userId) {
        clearIamWorkspaceSession(cached.sessionUserId);
      }

      try {
        const payload = await fetchSettingsWorkspaces();
        if (cancelled || !payload) return;
        payload.sessionUserId = userId;
        writeIamWorkspaceSession(payload);
        hydrateFromPayload(payload, userId);
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateFromPayload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ = workspaceId || "global";
    window.dispatchEvent(new CustomEvent("iam_workspace_id"));
  }, [workspaceId]);

  const value = useMemo(
    () => ({
      sessionUserId,
      workspaceId,
      setWorkspaceId,
      workspaces,
      displayName,
      setDisplayName,
      loading,
      refreshWorkspaces,
      switchWorkspace,
      persistGithubRepo,
    }),
    [sessionUserId, workspaceId, setWorkspaceId, workspaces, displayName, loading, refreshWorkspaces, switchWorkspace, persistGithubRepo],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
