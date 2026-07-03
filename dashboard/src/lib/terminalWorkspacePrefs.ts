import type { TerminalTarget } from '../../components/LocalTerminalSetup';

export type TerminalWorkspacePref = {
  targetType: TerminalTarget;
  splashDismissed: boolean;
  workspaceName?: string;
  cwd?: string | null;
  lastConnectedAt?: number;
};

const LS_KEY = 'iam_terminal_ws_prefs_v1';

function readAll(): Record<string, TerminalWorkspacePref> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw?.trim()) return {};
    const parsed = JSON.parse(raw) as Record<string, TerminalWorkspacePref>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(prefs: Record<string, TerminalWorkspacePref>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

export function getTerminalWorkspacePref(workspaceId: string): TerminalWorkspacePref {
  const wid = workspaceId.trim();
  if (!wid) {
    return { targetType: 'platform_vm', splashDismissed: false };
  }
  const row = readAll()[wid];
  return {
    targetType: row?.targetType ?? 'platform_vm',
    splashDismissed: row?.splashDismissed === true,
    workspaceName: row?.workspaceName,
    cwd: row?.cwd ?? null,
    lastConnectedAt: row?.lastConnectedAt,
  };
}

export function patchTerminalWorkspacePref(
  workspaceId: string,
  patch: Partial<TerminalWorkspacePref>,
): TerminalWorkspacePref {
  const wid = workspaceId.trim();
  if (!wid) return { targetType: 'platform_vm', splashDismissed: false };
  const all = readAll();
  const next: TerminalWorkspacePref = {
    ...getTerminalWorkspacePref(wid),
    ...patch,
  };
  all[wid] = next;
  writeAll(all);
  return next;
}

export function listTerminalWorkspaceSessions(excludeWorkspaceId?: string): TerminalWorkspacePref[] {
  const exclude = excludeWorkspaceId?.trim() || '';
  return Object.entries(readAll())
    .filter(([id, pref]) => id !== exclude && pref.splashDismissed)
    .map(([, pref]) => pref)
    .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0));
}

export function targetFromSplashLane(lane: 'local' | 'cloud' | 'sandbox' | null): TerminalTarget {
  if (lane === 'local') return 'user_hosted_tunnel';
  if (lane === 'sandbox') return 'sandbox';
  return 'platform_vm';
}
