import { useMemo } from "react";
import type { DashboardBundle } from "../types";
import { T, STEP_COLORS, wfStepEpochSec } from "../constants";
import { Card, CardHeader, Ico } from "../primitives";

export function ToolWaterfall({ toolWaterfall }: { toolWaterfall?: DashboardBundle["tool_waterfall"] }) {
  const rawSteps = toolWaterfall?.steps;
  const steps = useMemo(() => {
    const fallback = [
      { n: 1, tool: "read_file", dur: "1.21s", bar: 0, len: 10, c: T.accent },
      { n: 2, tool: "search_docs", dur: "2.18s", bar: 10, len: 18, c: T.blue },
      { n: 3, tool: "code_interpreter", dur: "3.02s", bar: 28, len: 25, c: T.violet },
      { n: 4, tool: "vector_search", dur: "1.65s", bar: 53, len: 14, c: T.amber },
      { n: 5, tool: "write_file", dur: "0.87s", bar: 67, len: 7, c: T.green },
      { n: 6, tool: "deploy_preview", dur: "1.32s", bar: 74, len: 11, c: T.accent },
      { n: 7, tool: "smoke_test", dur: "0.94s", bar: 85, len: 8, c: T.blue },
    ];
    if (!rawSteps?.length) return fallback;
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
      };
    });
  }, [rawSteps]);
  const totalS = useMemo(() => {
    if (!rawSteps?.length) return 11.19;
    const ms = rawSteps.reduce((s, r) => s + Math.max(0, Number(r.latency_ms) || 0), 0);
    return ms / 1000;
  }, [rawSteps]);
  const errN =
    rawSteps?.filter((r) => {
      const st = String(r.status || "").toLowerCase();
      return st.includes("error") || st === "failed" || st === "timeout";
    }).length ?? 0;
  const runTitle = toolWaterfall?.run?.display_name ? String(toolWaterfall.run.display_name).slice(0, 120) : null;
  return (
    <Card>
      <CardHeader
        icon={Ico.zap}
        title="Tool Call Waterfall"
        action={
          <span
            style={{
              fontSize: 10,
              color: T.green,
              background: "color-mix(in srgb, var(--color-success-strong, var(--solar-green)) 14%, transparent)",
              padding: "2px 8px",
              borderRadius: 20,
            }}
          >
            Success
          </span>
        }
      />
      {runTitle ? (
        <div style={{ fontSize: 10, fontWeight: 600, color: T.text, marginTop: -8, marginBottom: 10, lineHeight: 1.35 }}>{runTitle}</div>
      ) : null}
      <div
        style={{
          fontSize: 9,
          display: "grid",
          gridTemplateColumns: "14px 88px 36px 1fr",
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
          <div key={s.n} style={{ display: "grid", gridTemplateColumns: "14px 88px 36px 1fr", gap: "0 8px", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: T.muted }}>{s.n}</span>
            <span style={{ fontSize: 9, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tool}</span>
            <span style={{ fontSize: 9, color: T.muted }}>{s.dur}</span>
            <div style={{ height: 12, background: T.track, borderRadius: 3, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${s.bar}%`, width: `${s.len}%`, background: s.c, borderRadius: 3, opacity: 0.85 }} />
            </div>
          </div>
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
        <span>{errN} errors</span>
      </div>
    </Card>
  );
}
