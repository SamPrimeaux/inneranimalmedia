import { useMemo } from "react";
import type { DashboardBundle } from "../types";
import { T, STEP_COLORS, wfStepEpochSec } from "../constants";
import { PulseCard, CardHeader, NavLink, Ico } from "../primitives";
import { PulseEmpty } from "./PulseEmpty";
import { OVERVIEW_LINKS, go } from "../overviewLinks";

function statusLabel(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (s === "failed" || s === "error" || s === "timeout") return { text: "Failed", color: T.red };
  if (s === "running" || s === "started") return { text: "Running", color: T.amber };
  if (s === "completed" || s === "success") return { text: "Completed", color: T.green };
  return { text: status ? String(status) : "—", color: T.muted };
}

export function ToolWaterfall({ toolWaterfall }: { toolWaterfall?: DashboardBundle["tool_waterfall"] }) {
  const rawSteps = toolWaterfall?.steps;
  const run = toolWaterfall?.run;
  const runId = run?.id ? String(run.id) : null;
  const hasLive = Boolean(rawSteps?.length);

  const steps = useMemo(() => {
    if (!rawSteps?.length) return [];
    const runStart = wfStepEpochSec(rawSteps[0].started_at);
    const last = rawSteps[rawSteps.length - 1];
    const runEnd = wfStepEpochSec(last.completed_at ?? last.started_at);
    let totalSec = Math.max(runEnd - runStart, 0);
    if (totalSec <= 0) {
      const sumMs = rawSteps.reduce((s, r) => s + Math.max(0, Number(r.latency_ms) || 0), 0);
      totalSec = Math.max(sumMs / 1000, 1e-3);
    } else {
      totalSec = Math.max(totalSec, 1e-3);
    }
    const totalMs = totalSec * 1000;
    return rawSteps.map((s, i) => {
      const ms = Math.max(0, Number(s.latency_ms) || 0);
      const bar = ((wfStepEpochSec(s.started_at) - runStart) / totalSec) * 100;
      const len = Math.max((ms / totalMs) * 100, 2);
      const st = String(s.status || "").toLowerCase();
      let c = STEP_COLORS[i % STEP_COLORS.length];
      if (st === "success" || st === "completed") c = T.accent;
      else if (st === "failed" || st === "error") c = T.red;
      else if (st === "running") c = T.amber;
      const label = String(s.node_key || s.node_type || "step").slice(0, 40);
      return {
        n: i + 1,
        tool: label,
        dur: `${(ms / 1000).toFixed(2)}s`,
        bar,
        len,
        c,
        status: st,
      };
    });
  }, [rawSteps]);

  const totalS = useMemo(() => {
    if (!rawSteps?.length) return 0;
    const ms = rawSteps.reduce((s, r) => s + Math.max(0, Number(r.latency_ms) || 0), 0);
    return ms / 1000;
  }, [rawSteps]);

  const errN =
    rawSteps?.filter((r) => {
      const st = String(r.status || "").toLowerCase();
      return st.includes("error") || st === "failed" || st === "timeout";
    }).length ?? 0;

  const runTitle = run?.display_name ? String(run.display_name).slice(0, 120) : null;
  const runHref = runId ? OVERVIEW_LINKS.workflowRun(runId) : OVERVIEW_LINKS.workflowRuns;
  const badge = statusLabel(run?.status);

  return (
    <PulseCard>
      <CardHeader
        icon={Ico.zap}
        title="Tool Call Waterfall"
        action={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasLive ? (
              <span
                style={{
                  fontSize: 10,
                  color: badge.color,
                  background: `color-mix(in srgb, ${badge.color} 14%, transparent)`,
                  padding: "2px 8px",
                  borderRadius: 20,
                }}
              >
                {badge.text}
              </span>
            ) : null}
            <NavLink href={runHref} label={runId ? "Open run" : "Agent runs"} />
          </span>
        }
      />
      <div className="ov-pulse-body">
        {!hasLive ? (
          <PulseEmpty
            message="No execution steps yet. Complete a workflow run in this workspace to see the waterfall."
            href={OVERVIEW_LINKS.workflowRuns}
            linkLabel="View agent runs"
          />
        ) : (
          <>
            {runTitle ? (
              <button
                type="button"
                onClick={() => go(runHref)}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: T.text,
                  marginTop: -8,
                  marginBottom: 10,
                  lineHeight: 1.35,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: T.font,
                  width: "100%",
                }}
              >
                {runTitle}
              </button>
            ) : null}
            <div
              style={{
                fontSize: 9,
                display: "grid",
                gridTemplateColumns: "14px minmax(0, 1fr) 36px 1fr",
                gap: "0 8px",
                color: T.muted,
                paddingBottom: 6,
                borderBottom: `1px solid ${T.border}`,
                marginBottom: 8,
              }}
            >
              <span>#</span>
              <span>Node</span>
              <span>Dur</span>
              <span>Timeline</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {steps.map((s) => (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => go(runHref)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "14px minmax(0, 1fr) 36px 1fr",
                    gap: "0 8px",
                    alignItems: "center",
                    background: "none",
                    border: "none",
                    padding: "2px 0",
                    cursor: "pointer",
                    fontFamily: T.font,
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: 9, color: T.muted }}>{s.n}</span>
                  <span style={{ fontSize: 9, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.tool}
                  </span>
                  <span style={{ fontSize: 9, color: T.muted }}>{s.dur}</span>
                  <div style={{ height: 12, background: T.track, borderRadius: 3, position: "relative", overflow: "hidden" }}>
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${s.bar}%`,
                        width: `${s.len}%`,
                        background: s.c,
                        borderRadius: 3,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 10,
                paddingTop: 8,
                borderTop: `1px solid ${T.border}`,
                fontSize: 9,
                color: T.muted,
              }}
            >
              <span>Total: {totalS.toFixed(2)}s</span>
              <span>{steps.length} steps</span>
              <button
                type="button"
                onClick={() => go(runHref)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: errN > 0 ? T.red : T.muted,
                  cursor: "pointer",
                  fontFamily: T.font,
                  fontSize: 9,
                }}
              >
                {errN} errors
              </button>
            </div>
          </>
        )}
      </div>
    </PulseCard>
  );
}
