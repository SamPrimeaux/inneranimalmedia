import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getTrustedRecentWorkspaceId,
  prepareRecentWorkspacesForSession,
} from "../recentWorkspacesStorage";

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
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function pickActiveWorkspace(
  list: Array<{ id: string; display_name?: string; slug?: string }>,
  settingsCurrent: string | null | undefined,
  userId: string | null,
): { id: string; displayName: string | null } | null {
  const rows = list.filter((w) => w && typeof w.id === "string");
  if (rows.length === 0) return null;
  const byId = (id: string) => rows.find((w) => w.id === id);
  const trimName = (w: (typeof rows)[0]) => {
    const dn = typeof w.display_name === "string" ? w.display_name.trim() : "";
    return dn || (typeof w.slug === "string" && w.slug.trim() ? w.slug.trim() : null);
  };

  const cur = typeof settingsCurrent === "string" ? settingsCurrent.trim() : "";
  if (cur) {
    const row = byId(cur);
    if (row) return { id: row.id, displayName: trimName(row) };
  }
  try {
    const rid = getTrustedRecentWorkspaceId(userId);
    if (rid) {
      const row = byId(rid);
      if (row) return { id: row.id, displayName: trimName(row) };
    }
  } catch {
    /* ignore */
  }
  const first = rows[0];
  return { id: first.id, displayName: trimName(first) };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setWorkspaceId = useCallback((id: string) => {
    setWorkspaceIdState(id.trim() || null);
  }, []);

  useEffect(() => {
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
      prepareRecentWorkspacesForSession(userId);

      let settingsCurrent: string | null = null;
      try {
        const r = await fetch("/api/settings/workspaces", { credentials: "same-origin" });
        const d = r.ok ? ((await r.json()) as { current?: string }) : null;
        if (d?.current && typeof d.current === "string" && d.current.trim()) {
          settingsCurrent = d.current.trim();
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      let pickedId: string | null = null;
      try {
        const r = await fetch("/api/workspaces/list", { credentials: "same-origin" });
        const d = r.ok
          ? ((await r.json()) as {
              workspaces?: Array<{
                id: string;
                display_name?: string;
                slug?: string;
                status?: string;
                github_repo?: string | null;
              }>;
            })
          : null;
        if (cancelled) return;
        const rows = Array.isArray(d?.workspaces) ? d.workspaces : [];
        setWorkspaces(
          rows
            .filter((w) => w && typeof w.id === "string")
            .map((w) => ({
              id: w.id,
              name:
                typeof w.display_name === "string" && w.display_name.trim()
                  ? w.display_name
                  : w.slug || w.id,
              slug: w.slug || w.id,
              status: w.status || "active",
              github_repo: w.github_repo || null,
            })),
        );
        const picked = pickActiveWorkspace(rows, settingsCurrent, userId);
        if (picked?.id) {
          pickedId = picked.id;
          setWorkspaceIdState(picked.id);
          if (picked.displayName) setDisplayName(picked.displayName);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled && !pickedId && settingsCurrent) {
        setWorkspaceIdState(settingsCurrent);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
    }),
    [sessionUserId, workspaceId, setWorkspaceId, workspaces, displayName, loading],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
