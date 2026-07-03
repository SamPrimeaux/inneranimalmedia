/**
 * @file dashboard/hooks/useTerminalWorkspace.ts
 *
 * Bridges workspace activation → terminal panel.
 *
 * When the user switches workspace (WorkspaceLauncher → onWorkspaceActivated),
 * this hook:
 *   1. Updates the active terminal workspace_id
 *   2. Fetches /api/terminal/splash-status?workspace_id=NEW_ID
 *   3. Signals XTermShell to disconnect current session + reconnect scoped to new workspace
 *   4. Persists per-workspace terminal prefs (lane, cwd, lastConnectedAt) in localStorage
 *
 * Usage in the shell/app root:
 *   const termWs = useTerminalWorkspace({ authWorkspaceId, onStatusReady });
 *   // Pass termWs.workspaceId + termWs.splashStatus to XTermShell
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type LaneStatus = 'ready' | 'offline' | 'pending' | 'error' | 'checking';

export type TerminalSplashStatus = {
  workspace_id: string;
  workspace_label: string;
  can_run_pty: boolean;
  pty_service_bound: boolean;
  workspace: { status: LaneStatus; label: string };
  runtime:   { status: LaneStatus; label: string; via_pty_service?: boolean };
  tunnel:    { status: LaneStatus; label: string; platform?: string | null; shell?: string | null };
  agent:     { status: LaneStatus; label: string };
  lanes: {
    local:   { target_type: string; ready: boolean; configured: boolean; shell?: string | null; platform?: string | null; error_code?: string | null };
    cloud:   { target_type: string; ready: boolean; configured: boolean; via_pty_service?: boolean; error_code?: string | null };
    sandbox: { target_type: string; ready: boolean; configured: boolean; error_code?: string | null };
  };
};

export type WorkspaceTerminalPrefs = {
  targetType: 'user_hosted_tunnel' | 'platform_vm' | 'sandbox';
  splashDismissed: boolean;
  workspaceName: string;
  cwd: string | null;
  lastConnectedAt: number | null;
};

const PREFS_KEY = 'iam_terminal_ws_prefs_v1';
const DEFAULT_PREFS: WorkspaceTerminalPrefs = {
  targetType: 'platform_vm',
  splashDismissed: false,
  workspaceName: '',
  cwd: null,
  lastConnectedAt: null,
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadAllPrefs(): Record<string, WorkspaceTerminalPrefs> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, WorkspaceTerminalPrefs>;
  } catch {
    return {};
  }
}

function savePrefsForWorkspace(workspaceId: string, prefs: Partial<WorkspaceTerminalPrefs>) {
  try {
    const all = loadAllPrefs();
    all[workspaceId] = { ...DEFAULT_PREFS, ...(all[workspaceId] ?? {}), ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(all));
  } catch {}
}

export function loadPrefsForWorkspace(workspaceId: string): WorkspaceTerminalPrefs {
  const all = loadAllPrefs();
  return { ...DEFAULT_PREFS, ...(all[workspaceId] ?? {}) };
}

export function listRecentTerminalWorkspaces(): Array<{ workspaceId: string } & WorkspaceTerminalPrefs> {
  const all = loadAllPrefs();
  return Object.entries(all)
    .filter(([, p]) => p.lastConnectedAt != null)
    .sort(([, a], [, b]) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    .map(([workspaceId, prefs]) => ({ workspaceId, ...prefs }));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

type UseTerminalWorkspaceOpts = {
  /** Currently authenticated workspace_id from app state */
  authWorkspaceId: string | null | undefined;
  /** Called when splash-status resolves for a workspace */
  onStatusReady?: (workspaceId: string, status: TerminalSplashStatus) => void;
  /** Called when workspace changes — use to signal XTermShell to disconnect */
  onWorkspaceChange?: (newWorkspaceId: string, prevWorkspaceId: string | null) => void;
};

export function useTerminalWorkspace({
  authWorkspaceId,
  onStatusReady,
  onWorkspaceChange,
}: UseTerminalWorkspaceOpts) {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    authWorkspaceId?.trim() || null,
  );
  const [splashStatus, setSplashStatus] = useState<TerminalSplashStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const prevWorkspaceRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch splash-status for a workspace
  const fetchStatus = useCallback(async (workspaceId: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatusLoading(true);
    setStatusError(null);

    try {
      const res = await fetch(
        `/api/terminal/splash-status?workspace_id=${encodeURIComponent(workspaceId)}`,
        { credentials: 'same-origin', signal: ctrl.signal },
      );
      if (!res.ok) throw new Error(`splash-status ${res.status}`);
      const data = (await res.json()) as TerminalSplashStatus;
      setSplashStatus(data);
      onStatusReady?.(workspaceId, data);

      // Persist workspace name + cwd from status
      savePrefsForWorkspace(workspaceId, {
        workspaceName: data.workspace_label ?? '',
        cwd: null, // updated on actual connect
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setStatusError((err as Error).message);
      setSplashStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [onStatusReady]);

  // React to authWorkspaceId changes (workspace switch from WorkspaceLauncher)
  useEffect(() => {
    const next = authWorkspaceId?.trim() || null;
    if (!next || next === prevWorkspaceRef.current) return;

    const prev = prevWorkspaceRef.current;
    prevWorkspaceRef.current = next;
    setActiveWorkspaceId(next);
    onWorkspaceChange?.(next, prev);
    void fetchStatus(next);
  }, [authWorkspaceId, fetchStatus, onWorkspaceChange]);

  // Manual switch (e.g. "Also open" footer click)
  const switchToWorkspace = useCallback(
    (workspaceId: string) => {
      const wid = workspaceId.trim();
      if (!wid || wid === prevWorkspaceRef.current) return;
      const prev = prevWorkspaceRef.current;
      prevWorkspaceRef.current = wid;
      setActiveWorkspaceId(wid);
      onWorkspaceChange?.(wid, prev);
      void fetchStatus(wid);
    },
    [fetchStatus, onWorkspaceChange],
  );

  // Persist lane preference for active workspace
  const saveTargetType = useCallback(
    (targetType: WorkspaceTerminalPrefs['targetType']) => {
      if (!activeWorkspaceId) return;
      savePrefsForWorkspace(activeWorkspaceId, { targetType });
    },
    [activeWorkspaceId],
  );

  // Mark as connected (updates lastConnectedAt + splashDismissed)
  const markConnected = useCallback(
    (cwd?: string) => {
      if (!activeWorkspaceId) return;
      savePrefsForWorkspace(activeWorkspaceId, {
        lastConnectedAt: Date.now(),
        splashDismissed: true,
        ...(cwd ? { cwd } : {}),
      });
    },
    [activeWorkspaceId],
  );

  // Get prefs for current workspace
  const currentPrefs = activeWorkspaceId
    ? loadPrefsForWorkspace(activeWorkspaceId)
    : DEFAULT_PREFS;

  // Best available lane from splash-status (respects saved preference)
  const recommendedTargetType = ((): WorkspaceTerminalPrefs['targetType'] => {
    if (!splashStatus) return currentPrefs.targetType;
    // Honor saved preference if that lane is ready
    const saved = currentPrefs.targetType;
    const lanes = splashStatus.lanes;
    if (saved === 'platform_vm' && lanes.cloud.ready) return 'platform_vm';
    if (saved === 'user_hosted_tunnel' && lanes.local.ready) return 'user_hosted_tunnel';
    if (saved === 'sandbox' && lanes.sandbox.ready) return 'sandbox';
    // Fall through to best available
    if (lanes.local.ready) return 'user_hosted_tunnel';
    if (lanes.cloud.ready) return 'platform_vm';
    if (lanes.sandbox.ready) return 'sandbox';
    return 'platform_vm'; // default even if not ready
  })();

  return {
    activeWorkspaceId,
    splashStatus,
    statusLoading,
    statusError,
    currentPrefs,
    recommendedTargetType,
    switchToWorkspace,
    saveTargetType,
    markConnected,
    refetchStatus: () => activeWorkspaceId && fetchStatus(activeWorkspaceId),
  };
}
