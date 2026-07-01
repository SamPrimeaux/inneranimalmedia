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
  auto: 'Platform picks the best lane — GCP when your Mac may be offline.',
  remote:
    'GCP cloud desk VM — headless wrangler via CLOUDFLARE_API_TOKEN (sync-vm-env-cloudflare.sh). No OAuth login on VM.',
  local: 'Your Mac tunnel — wrangler login OAuth once, then deploy/d1/r2 from local PTY.',
  sandbox:
    'CF container pool — platform injects CLOUDFLARE_API_TOKEN for operators. Use wrangler whoami, not wrangler login OAuth.',
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
