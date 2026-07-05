import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { registerIamServiceWorker, subscribeIamWebPush } from "../pwa/registerServiceWorker";
import { ensureFreshDashboardBundle } from '../pwa/ensureFreshDashboardBundle';
import {
  prepareRecentWorkspacesForSession,
  persistRecentWorkspaceSwitch,
} from "../recentWorkspacesStorage";
import {
  clearIamWorkspaceSession,
  patchIamWorkspaceSessionCurrent,
  readIamWorkspaceSession,
  readLatestIamWorkspaceSession,
  writeIamWorkspaceSession,
  type IamWorkspaceSessionPayload,
  type IamWorkspaceSettingsRow,
} from "../iamWorkspaceStorage";
import { clearIamGitStatusCache } from "../iamGitStatusCache";
import { normalizeGithubRepo } from "../normalizeGithubRepo";
import { isDashboardBootstrapPath, loadDashboardBootstrap, refreshDashboardBootstrap } from "../loadDashboardBootstrap";
import { invalidateAgentDomainCache } from "../agentDomainFetch";
import { coalesceLabel } from "../lib/coalesceLabel";
import { handleAuthHttpStatus } from "../pwa/authSessionState";

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  github_repo: string | null;
  database_studio_name?: string | null;
};

type WorkspaceContextValue = {
  sessionUserId: string | null;
  /** Signed-in user display name (first name preferred) — not workspace slug. */
  sessionUserName: string | null;
  /** Profile image from /api/auth/me (GitHub avatar, etc.). */
  sessionAvatarUrl: string | null;
  workspaceId: string | null;
  setWorkspaceId: (id: string) => void;
  workspaces: WorkspaceRow[];
  displayName: string | null;
  setDisplayName: (name: string | null) => void;
  loading: boolean;
  /** Re-fetch GET /api/settings/workspaces and refresh sessionStorage + context. */
  refreshWorkspaces: (opts?: { force?: boolean }) => Promise<void>;
  /** Server SSOT from auth_users.active_workspace_id (last GET /api/settings/workspaces). */
  canonicalWorkspaceId: string | null;
  /** True when UI workspaceId differs from server canonical (should self-heal on refresh). */
  workspaceDrift: boolean;
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
  const aligned = typeof row.name === "string" ? row.name.trim() : "";
  if (aligned) return aligned;
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  if (slug) return slug;
  const dn = typeof row.display_name === "string" ? row.display_name.trim() : "";
  if (dn) return dn;
  return row.id || null;
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
    database_studio_name:
      typeof (row as { database_studio_name?: string }).database_studio_name === "string"
        ? (row as { database_studio_name?: string }).database_studio_name!.trim() || null
        : null,
  };
}

function pickActiveWorkspace(
  list: IamWorkspaceSettingsRow[],
  settingsCurrent: string | null | undefined,
): { id: string; displayName: string | null } | null {
  const rows = list.filter((w) => w && typeof w.id === "string");
  if (rows.length === 0) return null;
  const byId = (id: string) => rows.find((w) => w.id === id);

  const cur = typeof settingsCurrent === "string" ? settingsCurrent.trim() : "";
  if (cur) {
    const row = byId(cur);
    if (row) return { id: row.id, displayName: rowDisplayName(row) };
  }
  const first = rows[0];
  return { id: first.id, displayName: rowDisplayName(first) };
}

function applySessionPayload(
  payload: IamWorkspaceSessionPayload,
): {
  workspaceRows: WorkspaceRow[];
  workspaceId: string | null;
  displayName: string | null;
  canonicalWorkspaceId: string | null;
} {
  const workspaceRows = payload.data.filter((w) => w?.id).map(mapSettingsRow);
  const serverCurrent =
    typeof payload.current === "string" && payload.current.trim() ? payload.current.trim() : null;
  const picked = pickActiveWorkspace(payload.data, payload.current);
  const nextId =
    serverCurrent && workspaceRows.some((w) => w.id === serverCurrent)
      ? serverCurrent
      : picked?.id ?? serverCurrent;
  const row = nextId ? workspaceRows.find((w) => w.id === nextId) : null;
  return {
    workspaceRows,
    workspaceId: nextId,
    displayName: (row?.name?.trim() || picked?.displayName) ?? null,
    canonicalWorkspaceId: serverCurrent,
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

function applyInSessionWorkspacePick(
  payload: IamWorkspaceSessionPayload,
  userPickedId: string | null | undefined,
): IamWorkspaceSessionPayload {
  const explicit = typeof userPickedId === "string" ? userPickedId.trim() : "";
  if (!explicit) return payload;
  if (!payload.data.some((w) => w.id === explicit)) return payload;
  return { ...payload, current: explicit };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionUserName, setSessionUserName] = useState<string | null>(null);
  const [sessionAvatarUrl, setSessionAvatarUrl] = useState<string | null>(null);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [canonicalWorkspaceId, setCanonicalWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionUserIdRef = useRef<string | null>(null);
  const workspaceIdRef = useRef<string | null>(null);
  /** Holds user-selected workspace until server refresh confirms the same id. */
  const userPickedWorkspaceRef = useRef<string | null>(null);
  const pendingWorkspaceIdRef = useRef<string | null>(null);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const bootstrapDoneRef = useRef(false);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const hydrateFromPayload = useCallback((payload: IamWorkspaceSessionPayload) => {
    const applied = applySessionPayload(payload);
    setWorkspaces(applied.workspaceRows);
    setCanonicalWorkspaceId(applied.canonicalWorkspaceId);

    const pending = userPickedWorkspaceRef.current;
    let nextId = applied.workspaceId;
    if (
      pending &&
      pendingWorkspaceIdRef.current === pending &&
      applied.workspaceRows.some((w) => w.id === pending)
    ) {
      nextId = pending;
    }

    if (nextId) setWorkspaceIdState(nextId);
    const row = nextId ? applied.workspaceRows.find((w) => w.id === nextId) : null;
    if (row?.name?.trim()) setDisplayName(row.name.trim());
    else if (applied.displayName) setDisplayName(applied.displayName);

    const serverCurrent = typeof payload.current === "string" ? payload.current.trim() : "";
    if (userPickedWorkspaceRef.current && serverCurrent === userPickedWorkspaceRef.current) {
      userPickedWorkspaceRef.current = null;
      pendingWorkspaceIdRef.current = null;
      setPendingWorkspaceId(null);
    }
  }, []);

  const refreshWorkspaces = useCallback(async (opts?: { force?: boolean }) => {
    const userId = sessionUserIdRef.current;
    if (!opts?.force) {
      const cached = readIamWorkspaceSession(userId);
      if (cached && cached.data.length > 0) {
        if (!userId || !cached.sessionUserId || cached.sessionUserId === userId) {
          hydrateFromPayload(cached);
          setLoading(false);
          return;
        }
      }
    }
    setLoading(true);
    try {
      const payload = await fetchSettingsWorkspaces();
      if (!payload) return;
      payload.sessionUserId = userId;
      const merged = applyInSessionWorkspacePick(payload, userPickedWorkspaceRef.current);
      writeIamWorkspaceSession(merged);
      hydrateFromPayload(merged);
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
      const allowed = workspaces.some((w) => w.id === trimmed);
      if (!allowed && workspaces.length > 0) {
        console.warn('[workspace] switch blocked — not in accessible list', trimmed);
        return;
      }
      const userId = sessionUserIdRef.current;
      userPickedWorkspaceRef.current = trimmed;
      pendingWorkspaceIdRef.current = trimmed;
      setPendingWorkspaceId(trimmed);
      workspaceIdRef.current = trimmed;
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
      }, userId);

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
            }, userId);
            if (data.workspace.display_name?.trim()) {
              setDisplayName(data.workspace.display_name.trim());
            }
            userPickedWorkspaceRef.current = null;
            pendingWorkspaceIdRef.current = null;
            setPendingWorkspaceId(null);
            if (isDashboardBootstrapPath()) {
              invalidateAgentDomainCache(trimmed);
              void refreshDashboardBootstrap();
            }
          }
        } catch {
          /* local + sessionStorage already updated */
        }
      }

      void refreshWorkspaces({ force: true });

      window.dispatchEvent(new CustomEvent("iam_workspace_id"));
    },
    [workspaces, refreshWorkspaces],
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
      patchIamWorkspaceSessionCurrent(wsId, { github_repo: normalized }, sessionUserIdRef.current);
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
      const early = readLatestIamWorkspaceSession();
      if (early?.payload?.data?.length) {
        hydrateFromPayload(
          { ...early.payload, sessionUserId: early.userId ?? early.payload.sessionUserId },
        );
        if (early.userId) {
          sessionUserIdRef.current = early.userId;
          setSessionUserId(early.userId);
        }
        setLoading(false);
      } else {
        setLoading(true);
      }
      let userId: string | null = null;
      const useBootstrap = isDashboardBootstrapPath();
      if (useBootstrap) {
        try {
          const boot = await loadDashboardBootstrap();
          if (boot?.me?.user?.id) {
            userId = String(boot.me.user.id).trim() || null;
            const rawName = coalesceLabel(boot.me.user.name, '');
            const emailLocal =
              boot.me.user.email != null ? String(boot.me.user.email).split("@")[0]?.trim() : "";
            setSessionUserName(rawName || emailLocal || null);
            const avatar =
              boot.me.user.avatar_url != null ? String(boot.me.user.avatar_url).trim() : "";
            setSessionAvatarUrl(avatar || null);
          }
          if (boot?.workspaces?.data?.length) {
            const payload: IamWorkspaceSessionPayload = {
              fetchedAt: boot.fetched_at ?? Date.now(),
              sessionUserId: userId,
              current: boot.workspaces.current ?? null,
              data: boot.workspaces.data.map((w) => ({
                id: w.id,
                name: w.name ?? w.id,
                slug: w.slug ?? w.handle ?? w.id.replace(/^ws_/, ""),
                status: w.status ?? "active",
                github_repo: w.github_repo ?? null,
                database_studio_name: w.database_studio_name ?? null,
              })),
            };
            writeIamWorkspaceSession(payload);
            hydrateFromPayload(payload);
          }
        } catch {
          /* fall through to /api/auth/me */
        }
      }
      if (!userId) {
        try {
          const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
          if (meRes.status === 401) {
            handleAuthHttpStatus(401, "/api/auth/me");
          } else if (meRes.ok) {
            const me = (await meRes.json()) as {
              id?: string | null;
              avatar_url?: string | null;
              user?: {
                id?: string | null;
                name?: string | null;
                email?: string | null;
                avatar_url?: string | null;
              };
            };
            const rawId = me?.user?.id ?? me?.id;
            userId = rawId != null && String(rawId).trim() ? String(rawId).trim() : null;
            const rawName = coalesceLabel(me?.user?.name, '');
            const emailLocal =
              me?.user?.email != null ? String(me.user.email).split("@")[0]?.trim() : "";
            setSessionUserName(rawName || emailLocal || null);
            const avatar =
              (me?.user?.avatar_url != null ? String(me.user.avatar_url).trim() : "") ||
              (me?.avatar_url != null ? String(me.avatar_url).trim() : "");
            setSessionAvatarUrl(avatar || null);
          }
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      setSessionUserId(userId);
      sessionUserIdRef.current = userId;
      prepareRecentWorkspacesForSession(userId);

      if (userId) {
        void registerIamServiceWorker()
          .then(() => {
            void ensureFreshDashboardBundle();
            return subscribeIamWebPush().catch(() => false);
          });
      }

      const cached = readIamWorkspaceSession(userId);
      if (cached && cached.data.length > 0 && (!userId || !cached.sessionUserId || cached.sessionUserId === userId)) {
        const withUser = { ...cached, sessionUserId: userId };
        writeIamWorkspaceSession(withUser);
        hydrateFromPayload(withUser);
        if (!cancelled) setLoading(false);
        if (userId && !useBootstrap) {
          try {
            const fresh = await fetchSettingsWorkspaces();
            if (!cancelled && fresh) {
              fresh.sessionUserId = userId;
              const merged = applyInSessionWorkspacePick(fresh, userPickedWorkspaceRef.current);
              writeIamWorkspaceSession(merged);
              hydrateFromPayload(merged);
            }
          } catch {
            /* cache hydrate already applied */
          }
        }
        return;
      }

      if (cached?.sessionUserId && userId && cached.sessionUserId !== userId) {
        clearIamWorkspaceSession(cached.sessionUserId);
      }

      if (userId && !useBootstrap) {
        try {
          const payload = await fetchSettingsWorkspaces();
          if (cancelled || !payload) return;
          payload.sessionUserId = userId;
          const merged = applyInSessionWorkspacePick(payload, userPickedWorkspaceRef.current);
          writeIamWorkspaceSession(merged);
          hydrateFromPayload(merged);
        } catch {
          /* ignore */
        }
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

  const workspaceDrift = useMemo(() => {
    if (pendingWorkspaceId) return false;
    if (!canonicalWorkspaceId || !workspaceId) return false;
    return workspaceId !== canonicalWorkspaceId;
  }, [canonicalWorkspaceId, workspaceId, pendingWorkspaceId]);

  useEffect(() => {
    if (!workspaceDrift || !canonicalWorkspaceId) return;
    userPickedWorkspaceRef.current = null;
    pendingWorkspaceIdRef.current = null;
    setPendingWorkspaceId(null);
    setWorkspaceIdState(canonicalWorkspaceId);
    patchIamWorkspaceSessionCurrent(canonicalWorkspaceId, undefined, sessionUserIdRef.current);
    void refreshWorkspaces({ force: true });
  }, [workspaceDrift, canonicalWorkspaceId, refreshWorkspaces]);

  const value = useMemo(
    () => ({
      sessionUserId,
      sessionUserName,
      sessionAvatarUrl,
      workspaceId,
      setWorkspaceId,
      workspaces,
      displayName,
      setDisplayName,
      loading,
      refreshWorkspaces,
      switchWorkspace,
      persistGithubRepo,
      canonicalWorkspaceId,
      workspaceDrift,
    }),
    [sessionUserId, sessionUserName, sessionAvatarUrl, workspaceId, setWorkspaceId, workspaces, displayName, loading, refreshWorkspaces, switchWorkspace, persistGithubRepo, canonicalWorkspaceId, workspaceDrift],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
