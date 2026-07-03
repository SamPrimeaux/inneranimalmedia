/**
 * Bridges workspace activation → terminal panel.
 *
 * When the user switches workspace (WorkspaceLauncher → onWorkspaceActivated),
 * this hook fetches /api/terminal/splash-status, recommends a lane, and signals
 * XTermShell to disconnect/reconnect scoped to the new workspace.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalTarget } from '../components/LocalTerminalSetup';
import {
  fetchTerminalSplashStatus,
  type TerminalSplashStatus,
} from '../src/lib/terminalSplashStatus';
import {
  getTerminalWorkspacePref,
  patchTerminalWorkspacePref,
  type TerminalWorkspacePref,
} from '../src/lib/terminalWorkspacePrefs';

export type { TerminalSplashStatus };
export type WorkspaceTerminalPrefs = TerminalWorkspacePref;

const DEFAULT_PREFS: TerminalWorkspacePref = {
  targetType: 'platform_vm',
  splashDismissed: false,
};

/** @deprecated alias — use getTerminalWorkspacePref */
export function loadPrefsForWorkspace(workspaceId: string): WorkspaceTerminalPrefs {
  return getTerminalWorkspacePref(workspaceId);
}

export function listRecentTerminalWorkspaces(): Array<{ workspaceId: string } & WorkspaceTerminalPrefs> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('iam_terminal_ws_prefs_v1');
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, WorkspaceTerminalPrefs>;
    return Object.entries(all)
      .filter(([, p]) => p.lastConnectedAt != null)
      .sort(([, a], [, b]) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      .map(([workspaceId, prefs]) => ({ workspaceId, ...DEFAULT_PREFS, ...prefs }));
  } catch {
    return [];
  }
}

function recommendTarget(
  status: TerminalSplashStatus,
  prefs: TerminalWorkspacePref,
): TerminalTarget {
  if (prefs.splashDismissed && prefs.targetType) return prefs.targetType;
  const t = status.targets;
  if (t?.local?.ready) return 'user_hosted_tunnel';
  if (t?.cloud?.ready) return 'platform_vm';
  if (t?.sandbox?.ready) return 'sandbox';
  if (t?.local?.configured) return 'user_hosted_tunnel';
  if (t?.cloud?.configured) return 'platform_vm';
  return status.preferredLane === 'local'
    ? 'user_hosted_tunnel'
    : status.preferredLane === 'sandbox'
      ? 'sandbox'
      : 'platform_vm';
}

export function laneReadyFromStatus(status: TerminalSplashStatus | null): boolean {
  if (!status?.targets) return false;
  if (status.targets.can_run_pty === false) return false;
  return (
    status.targets.local?.ready === true ||
    status.targets.cloud?.ready === true ||
    status.targets.sandbox?.ready === true
  );
}

type UseTerminalWorkspaceOpts = {
  authWorkspaceId: string | null | undefined;
  onStatusReady?: (workspaceId: string, status: TerminalSplashStatus) => void;
  onWorkspaceChange?: (newWorkspaceId: string, prevWorkspaceId: string | null) => void;
};

export function useTerminalWorkspace({
  authWorkspaceId,
  onStatusReady,
  onWorkspaceChange,
}: UseTerminalWorkspaceOpts) {
  const [splashStatus, setSplashStatus] = useState<TerminalSplashStatus | null>(null);
  const [recommendedTargetType, setRecommendedTargetType] = useState<TerminalTarget>('platform_vm');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const onWorkspaceChangeRef = useRef(onWorkspaceChange);
  const onStatusReadyRef = useRef(onStatusReady);
  useEffect(() => {
    onWorkspaceChangeRef.current = onWorkspaceChange;
  }, [onWorkspaceChange]);
  useEffect(() => {
    onStatusReadyRef.current = onStatusReady;
  }, [onStatusReady]);

  const prevWorkspaceRef = useRef<string | null>(null);
  const activeWorkspaceId = authWorkspaceId?.trim() || '';

  const fetchStatus = useCallback(async (workspaceId: string) => {
    const wid = workspaceId.trim();
    if (!wid) {
      setSplashStatus(null);
      return null;
    }

    setStatusLoading(true);
    setStatusError(null);

    try {
      const status = await fetchTerminalSplashStatus(wid);
      setSplashStatus(status);
      const prefs = getTerminalWorkspacePref(wid);
      setRecommendedTargetType(recommendTarget(status, prefs));
      onStatusReadyRef.current?.(wid, status);

      if (status.workspaceMeta?.name) {
        patchTerminalWorkspacePref(wid, { workspaceName: status.workspaceMeta.name });
      }

      return status;
    } catch (err) {
      setStatusError((err as Error).message);
      setSplashStatus(null);
      return null;
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const wid = activeWorkspaceId;
    const prev = prevWorkspaceRef.current;

    if (wid && prev && prev !== wid) {
      onWorkspaceChangeRef.current?.(wid, prev);
    }
    prevWorkspaceRef.current = wid || null;

    if (!wid) {
      setSplashStatus(null);
      setRecommendedTargetType('platform_vm');
      return;
    }

    let cancelled = false;
    setStatusLoading(true);
    void fetchTerminalSplashStatus(wid).then((status) => {
      if (cancelled) return;
      setSplashStatus(status);
      const prefs = getTerminalWorkspacePref(wid);
      setRecommendedTargetType(recommendTarget(status, prefs));
      onStatusReadyRef.current?.(wid, status);
      if (status.workspaceMeta?.name) {
        patchTerminalWorkspacePref(wid, { workspaceName: status.workspaceMeta.name });
      }
      setStatusLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setStatusError((err as Error).message);
      setSplashStatus(null);
      setStatusLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  const switchToWorkspace = useCallback(
    (workspaceId: string) => {
      const wid = workspaceId.trim();
      if (!wid || wid === prevWorkspaceRef.current) return;
      const prev = prevWorkspaceRef.current;
      prevWorkspaceRef.current = wid;
      onWorkspaceChangeRef.current?.(wid, prev);
      void fetchStatus(wid);
    },
    [fetchStatus],
  );

  const saveTargetType = useCallback((targetType: TerminalTarget) => {
    const wid = activeWorkspaceId.trim();
    if (!wid) return;
    setRecommendedTargetType(targetType);
    patchTerminalWorkspacePref(wid, { targetType });
  }, [activeWorkspaceId]);

  const markConnected = useCallback(
    (cwd?: string | null, targetType?: TerminalTarget) => {
      const wid = activeWorkspaceId.trim();
      if (!wid) return;
      patchTerminalWorkspacePref(wid, {
        splashDismissed: true,
        targetType: targetType ?? recommendedTargetType,
        cwd: cwd ?? null,
        lastConnectedAt: Date.now(),
        workspaceName: splashStatus?.workspaceMeta?.name ?? undefined,
      });
    },
    [activeWorkspaceId, recommendedTargetType, splashStatus?.workspaceMeta?.name],
  );

  const currentPrefs = activeWorkspaceId
    ? getTerminalWorkspacePref(activeWorkspaceId)
    : DEFAULT_PREFS;

  return {
    activeWorkspaceId,
    splashStatus,
    statusLoading,
    statusError,
    currentPrefs,
    recommendedTargetType,
    ptyReady: laneReadyFromStatus(splashStatus),
    switchToWorkspace,
    saveTargetType,
    setRecommendedTargetType: saveTargetType,
    markConnected,
    refreshStatus: () => (activeWorkspaceId ? fetchStatus(activeWorkspaceId) : Promise.resolve(null)),
    refetchStatus: () => activeWorkspaceId && fetchStatus(activeWorkspaceId),
  };
}
