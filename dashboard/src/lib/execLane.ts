/** Exec lane preference for mobile / agent terminal routing. */

export type ExecLane = 'auto' | 'remote' | 'local' | 'sandbox';

export const LS_EXEC_LANE_MOBILE = 'iam:exec-lane-mobile';

export const EXEC_LANE_LABELS: Record<ExecLane, string> = {
  auto: 'Auto',
  remote: 'Cloud desk',
  local: 'Local Mac',
  sandbox: 'Sandbox',
};

export function readStoredExecLane(): ExecLane {
  try {
    const raw = localStorage.getItem(LS_EXEC_LANE_MOBILE);
    if (raw === 'auto' || raw === 'remote' || raw === 'local' || raw === 'sandbox') return raw;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export function writeStoredExecLane(lane: ExecLane): void {
  try {
    localStorage.setItem(LS_EXEC_LANE_MOBILE, lane);
  } catch {
    /* ignore */
  }
}

export function defaultExecLaneForSurface(surface: string): ExecLane {
  return surface.startsWith('mobile') ? 'auto' : 'auto';
}
