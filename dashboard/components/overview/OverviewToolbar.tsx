import { useCallback, useEffect, useState } from "react";
import { T } from "./constants";
import { Ico } from "./primitives";
import { SignalDot } from "../SignalDot";

type WorkspaceRow = { id: string; name: string };

type Props = {
  onRefresh: () => void;
  refreshing?: boolean;
  signalActive: boolean;
  signalError?: boolean;
  lastSignalAt?: Date | null;
  /** When true, render nothing (e.g. /dashboard/overview uses inline refresh on Spend pillar). */
  hidden?: boolean;
};

function readWorkspaceId(): string {
  if (typeof window === "undefined") return "";
  const g = (window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__;
  const ws = g && g !== "global" ? String(g).trim() : "";
  return ws;
}

function environmentLabel(): string {
  if (typeof window === "undefined") return "Production";
  const h = window.location.hostname.toLowerCase();
  if (h === "inneranimalmedia.com" || h === "www.inneranimalmedia.com") return "Production";
  if (h.includes("localhost") || h.includes("127.0.0.1")) return "Local";
  return "Staging";
}

export function OverviewToolbar({
  onRefresh,
  refreshing = false,
  signalActive,
  signalError = false,
  lastSignalAt,
  hidden = false,
}: Props) {
  if (hidden) return null;
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [workspaceId, setWorkspaceId] = useState(readWorkspaceId);

  const loadWorkspaces = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!r.ok) return;
      const j = (await r.json()) as {
        workspace?: { id?: string; name?: string };
        workspaces?: Array<{ id?: string; name?: string }>;
      };
      const rows: WorkspaceRow[] = (j.workspaces || [])
        .filter((w) => w.id)
        .map((w) => ({ id: String(w.id), name: String(w.name || w.id) }));
      if (rows.length) setWorkspaces(rows);
      const cur = readWorkspaceId() || j.workspace?.id || rows[0]?.id || "";
      if (cur) setWorkspaceId(cur);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void loadWorkspaces();
    const onWs = () => setWorkspaceId(readWorkspaceId());
    window.addEventListener("iam_workspace_id", onWs);
    return () => window.removeEventListener("iam_workspace_id", onWs);
  }, [loadWorkspaces]);

  const onWorkspaceChange = (next: string) => {
    const id = next.trim();
    setWorkspaceId(id);
    if (typeof window !== "undefined") {
      (window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ = id || "global";
      window.dispatchEvent(new CustomEvent("iam_workspace_id"));
    }
    onRefresh();
  };

  const env = environmentLabel();

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}>
          <span style={{ fontWeight: 600, letterSpacing: "0.04em" }}>Workspace</span>
          <select
            value={workspaceId}
            onChange={(e) => onWorkspaceChange(e.target.value)}
            style={{
              fontSize: 11,
              color: T.text,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 7,
              padding: "5px 10px",
              maxWidth: 220,
              fontFamily: T.font,
            }}
          >
            {workspaces.length === 0 ? (
              <option value={workspaceId}>{workspaceId || "Default"}</option>
            ) : (
              workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))
            )}
          </select>
        </label>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: T.muted,
            background: T.surf2,
            border: `1px solid ${T.border}`,
            padding: "4px 10px",
            borderRadius: 20,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {env}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SignalDot active={signalActive} error={signalError} lastEventAt={lastSignalAt} />
        <a href="/dashboard/analytics/agent" style={{ fontSize: 10, textDecoration: "none", color: T.accent }}>
          Agent runs
        </a>
        <a href="/dashboard/tasks" style={{ fontSize: 10, textDecoration: "none", color: T.accent }}>
          Tasks
        </a>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            fontSize: 11,
            color: T.accent,
            background: "color-mix(in srgb, var(--accent-secondary, var(--solar-cyan)) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-secondary, var(--solar-cyan)) 28%, transparent)",
            borderRadius: 7,
            padding: "6px 14px",
            cursor: refreshing ? "wait" : "pointer",
            fontFamily: T.font,
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: refreshing ? 0.7 : 1,
          }}
        >
          {Ico.refresh} Refresh
        </button>
      </div>
    </div>
  );
}
