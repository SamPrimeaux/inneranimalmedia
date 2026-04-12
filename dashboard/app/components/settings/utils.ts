// ─── Time helpers ─────────────────────────────────────────────────────────────

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export function formatLastRanUnix(unixSec: number | string | null | undefined): string | null {
  if (unixSec == null || unixSec === "") return null;
  const t = Number(unixSec);
  if (!Number.isFinite(t)) return null;
  const ms = t < 1e12 ? t * 1000 : t;
  const diff = Date.now() - ms;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return timeAgo(new Date(ms).toISOString());
}

/** Accepts unix seconds, unix ms, or ISO string. Returns human-readable relative time. */
export function relativeTime(ts: number | string | null | undefined): string | null {
  if (ts == null || ts === "") return null;
  let sec = Number(ts);
  if (!Number.isFinite(sec)) {
    const ms = Date.parse(String(ts));
    if (!Number.isFinite(ms)) return null;
    sec = ms / 1000;
  } else if (sec > 1e12) {
    sec /= 1000;
  }
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Currency / number helpers ────────────────────────────────────────────────

export function formatUsd2(n: number | string | null | undefined): string {
  const x = Number(n) || 0;
  return x.toLocaleString(undefined, {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function formatTokensK(n: number | string | null | undefined): string {
  const x = Number(n) || 0;
  if (x === 0) return "0k";
  return `${Math.round(x / 1000)}k`;
}

export function formatDayLabel(yyyyMmDd: string | null | undefined): string {
  if (!yyyyMmDd || typeof yyyyMmDd !== "string") return "—";
  const [y, m, d] = yyyyMmDd.split("-").map((v) => parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return yyyyMmDd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function formatSuccessRatePct(v: number | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  let x = Number(v);
  if (!Number.isFinite(x)) return null;
  if (x > 0 && x <= 1) x *= 100;
  return `${Math.round(x)}%`;
}

export function formatR2Bytes(n: number | string | null | undefined): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (x < 1024) return `${x} B`;
  if (x < 1048576) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / 1048576).toFixed(1)} MB`;
}

// ─── AgentSam workspace helpers ───────────────────────────────────────────────

export function agentsamWorkspaceQueryString(): string {
  return new URLSearchParams({ workspace_id: "" }).toString();
}

export function agentsamWorkspaceIdForNewRule(filter: string): string | null {
  if (filter === "workspace") return "tenant_sam_primeaux";
  return null;
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

type WithWorkspace = { workspace_id?: string | null };

function hasWorkspace(item: WithWorkspace): boolean {
  const w = item.workspace_id;
  return w != null && String(w).trim() !== "";
}

export function ruleMatchesFilter(rule: WithWorkspace, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "user") return !hasWorkspace(rule);
  if (filter === "workspace") return hasWorkspace(rule);
  return true;
}

export function subagentMatchesFilter(s: WithWorkspace, filter: string): boolean {
  return ruleMatchesFilter(s, filter);
}

export function skillMatchesFilter(skill: WithWorkspace, filter: string): boolean {
  return ruleMatchesFilter(skill, filter);
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    background: active ? "var(--bg-elevated)" : "var(--bg-canvas)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 16,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
    fontWeight: active ? 600 : 400,
  };
}

export function runCmd(
  runCommandRunnerRef: React.RefObject<{ runCommandInTerminal?: (cmd: string) => void }> | null | undefined,
  cmd: string,
): void {
  runCommandRunnerRef?.current?.runCommandInTerminal?.(cmd);
}
