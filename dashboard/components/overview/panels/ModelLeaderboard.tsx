import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { DashboardBundle } from "../types";
import { T, PC, fmt, providerPcKey, decayedScore01 } from "../constants";
import { Card, CardHeader, Pill, Ico } from "../primitives";

const CHART_ROWS = 8;

type Row = {
  rank: number;
  model: string;
  prov: string;
  pk: string;
  runs: number;
  success: number;
  lat: number;
  costPer1k: number;
  decayed: number | null;
};

function LeaderboardTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; runsN: number; success: number; raw: Row } }>;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0].payload.raw;
  return (
    <div
      style={{
        background: T.tooltipBg,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 11,
        fontFamily: T.font,
        maxWidth: 280,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: T.text }}>{raw.model}</div>
      <div style={{ color: T.muted }}>
        Provider: <span style={{ color: PC[raw.pk] || T.text }}>{raw.prov}</span>
      </div>
      <div style={{ color: T.muted }}>
        Runs: <span style={{ color: T.text, fontWeight: 600 }}>{fmt.num(raw.runs)}</span>
      </div>
      <div style={{ color: T.muted }}>
        Success: <span style={{ color: raw.success > 95 ? T.green : T.amber, fontWeight: 600 }}>{raw.success}%</span>
      </div>
      <div style={{ color: T.muted }}>
        Avg latency: <span style={{ color: T.text }}>{raw.lat.toFixed(2)}s</span>
      </div>
      <div style={{ color: T.muted }}>
        $/1K tok: <span style={{ color: T.text }}>${raw.costPer1k.toFixed(3)}</span>
      </div>
      {raw.decayed != null ? (
        <div style={{ color: T.muted, marginTop: 4 }}>
          Decayed score: <span style={{ color: T.text }}>{Number(raw.decayed).toFixed(3)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ModelLeaderboard({ perfRows }: { perfRows?: DashboardBundle["model_leaderboard"] }) {
  const [showTable, setShowTable] = useState(false);
  const rows: Row[] = perfRows?.length
    ? perfRows.map((r, i) => {
        const prov = String(r.provider || "—");
        const pk = providerPcKey(prov);
        const runs = Math.round(Number(r.runs) || 0);
        const success = Math.round((Number(r.success_pct) || 0) * 10) / 10;
        const lat = (Number(r.avg_latency_ms) || 0) / 1000;
        const tok = Number(r.total_tokens) || 0;
        const spent = Number(r.total_cost_usd) || 0;
        const costPer1k = tok > 0 ? (spent / tok) * 1000 : 0;
        return {
          rank: i + 1,
          model: String(r.model_key || "—").slice(0, 32),
          prov,
          pk,
          runs,
          success,
          lat,
          costPer1k,
          decayed: r.decayed_score,
        };
      })
    : [
        { rank: 1, model: "gpt-4o", prov: "OpenAI", pk: "openai", runs: 28400, success: 98.5, lat: 2.3, costPer1k: 0.021, decayed: 0.72 },
        { rank: 2, model: "claude-3-5-sonnet", prov: "Anthropic", pk: "anthropic", runs: 19700, success: 97.1, lat: 3.1, costPer1k: 0.018, decayed: 0.65 },
      ];

  const chartSlice = rows.slice(0, CHART_ROWS);
  const maxR = Math.max(...chartSlice.map((r) => r.runs), 1);
  const chartData = chartSlice.map((r) => ({
    name: r.model.length > 20 ? `${r.model.slice(0, 19)}…` : r.model,
    runsN: Math.round((r.runs / maxR) * 1000) / 10,
    success: r.success,
    raw: r,
  }));

  const chartH = Math.max(120, chartSlice.length * 26);

  return (
    <Card>
      <CardHeader
        icon={Ico.list}
        title="Model Leaderboard"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Pill label="agentsam_agent_run" />
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              style={{ fontSize: 10, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {showTable ? "Hide table" : "Full table"}
            </button>
          </div>
        }
      />
      <div style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>Runs (scaled) vs success % — hover a row for detail.</div>
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 2, right: 8, left: 0, bottom: 2 }} barCategoryGap={10}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.grid} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: T.muted }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 8, fill: T.muted }} axisLine={false} tickLine={false} />
          <Tooltip content={<LeaderboardTooltip />} cursor={{ fill: "color-mix(in srgb, var(--dashboard-text) 4%, transparent)" }} />
          <Bar dataKey="runsN" name="Runs (scaled 0–100)" fill={T.accent} radius={[0, 3, 3, 0]} barSize={8} maxBarSize={14} />
          <Bar dataKey="success" name="Success %" fill={T.green} radius={[0, 3, 3, 0]} barSize={8} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 12, marginTop: 8, marginBottom: showTable ? 10 : 0, flexWrap: "wrap", fontSize: 9, color: T.muted }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: T.accent }} />
          Runs (0–100, vs top model)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: T.green }} />
          Success %
        </span>
      </div>
      {showTable ? (
        <>
          <div
            style={{
              fontSize: 9,
              display: "grid",
              gridTemplateColumns: "16px minmax(0,1fr) 58px 40px 46px 38px 50px",
              gap: "0 8px",
              color: T.muted,
              paddingBottom: 7,
              borderBottom: `1px solid ${T.border}`,
              marginBottom: 6,
              marginTop: 4,
            }}
          >
            <span>#</span>
            <span>Model</span>
            <span>Provider</span>
            <span>Runs</span>
            <span>Success</span>
            <span>Avg s</span>
            <span>$/1K</span>
          </div>
          {rows.map((r) => (
            <div key={r.rank} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  display: "grid",
                  gridTemplateColumns: "16px minmax(0,1fr) 58px 40px 46px 38px 50px",
                  gap: "0 8px",
                  alignItems: "center",
                  marginBottom: 3,
                }}
              >
                <span style={{ color: T.muted }}>{r.rank}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.model}</span>
                <span style={{ color: PC[r.pk] || T.muted, fontSize: 9 }}>{r.prov}</span>
                <span style={{ color: T.muted }}>{fmt.num(r.runs)}</span>
                <span style={{ color: r.success > 95 ? T.green : T.amber }}>{r.success}%</span>
                <span style={{ color: T.muted }}>{r.lat.toFixed(2)}s</span>
                <span style={{ color: T.muted }}>${r.costPer1k.toFixed(3)}</span>
              </div>
              <div style={{ height: 4, background: T.track, borderRadius: 2, marginLeft: 24, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(r.runs / Math.max(...rows.map((x) => x.runs), 1)) * 100}%`, background: PC[r.pk] || T.accent, borderRadius: 2 }} />
              </div>
              <div style={{ height: 3, background: T.track, borderRadius: 2, marginLeft: 24, marginTop: 4, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${decayedScore01(r.decayed) * 100}%`,
                    background: T.accent2,
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          ))}
        </>
      ) : null}
    </Card>
  );
}
