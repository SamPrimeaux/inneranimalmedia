/** Exec lane preference for mobile / agent terminal routing. */

export type ExecLane = 'auto' | 'remote' | 'local' | 'sandbox';

export const LS_EXEC_LANE_MOBILE = 'iam:exec-lane-mobile';

export const EXEC_LANE_LABELS: Record<ExecLane, string> = {
  auto: 'Auto',
  remote: 'Cloud desk',
  local: 'Local Mac',
  sandbox: 'CF container',
};

export const EXEC_LANE_DESCRIPTIONS: Record<ExecLane, string> = {
  auto: 'On phone (operator): Cloud desk GCP VM — Mac not required. Tenants: CF container sandbox.',
  remote:
    'GCP cloud desk (terminal.inneranimalmedia.com) — full git/shell/wrangler. Primary iPhone lane for operators.',
  local: 'Your Mac tunnel — optional when awake; not required for operator mobile work.',
  sandbox:
    'CF container pool — heavy builds (vite, Playwright). Operators: use Cloud desk for routine shell/git.',
};

export function isPlatformOperatorFromPolicy(policy: Record<string, unknown> | null | undefined): boolean {
  if (!policy) return false;
  return (
    policy.platform_operator === 1 ||
    policy.platform_operator === true ||
    policy.is_superadmin === 1 ||
    policy.is_superadmin === true
  );
}

export function readStoredExecLane(surface?: string, isPlatformOperator = false): ExecLane {
  try {
    const raw = localStorage.getItem(LS_EXEC_LANE_MOBILE);
    if (raw === 'auto' || raw === 'remote' || raw === 'local' || raw === 'sandbox') return raw;
  } catch {
    /* ignore */
  }
  return defaultExecLaneForSurface(surface ?? 'desktop_web', isPlatformOperator);
}

export function writeStoredExecLane(lane: ExecLane): void {
  try {
    localStorage.setItem(LS_EXEC_LANE_MOBILE, lane);
  } catch {
    /* ignore */
  }
}

export function defaultExecLaneForSurface(surface: string, isPlatformOperator = false): ExecLane {
  if (surface.startsWith('mobile')) {
    return isPlatformOperator ? 'remote' : 'sandbox';
  }
  return 'auto';
}
