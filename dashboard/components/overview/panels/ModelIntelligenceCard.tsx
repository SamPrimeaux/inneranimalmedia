import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
} from "recharts";
import type { CostLatencyPoint, DashboardBundle } from "../types";
import { T, PC, DAYS, fmt, providerPcKey, provSlug } from "../constants";
import { Card, Ico, NavLink } from "../primitives";
import { PulseEmpty } from "./PulseEmpty";
import { OVERVIEW_LINKS } from "../overviewLinks";

type TabId = "leaderboard" | "cost_latency" | "routing";

const CHART_ROWS = 8;

type LbRow = {
  model: string;
  prov: string;
  pk: string;
  runs: number;
  success: number;
  lat: number;
  costPer1k: number;
  decayed: number | null;
  listIn: number | null;
  listOut: number | null;
  realizedPer1k: number | null;
  status: { label: string; color: string };
  driftPct: number | null;
};

function pricingStatus(row: {
  routing_eligible?: number | null;
  requires_owner_approval?: number | null;
  is_paused?: number | null;
}): { label: string; color: string } {
  if (Number(row.requires_owner_approval) === 1) return { label: "BLOCKED", color: T.red };
  if (Number(row.routing_eligible) === 1 && Number(row.is_paused) !== 1) return { label: "ACTIVE", color: T.green };
  if (row.routing_eligible == null && row.is_paused == null) return { label: "—", color: T.muted };
  return { label: "GATED", color: T.amber };
}

function costDriftPct(realized: number | null | undefined, listIn: number | null | undefined): number | null {
  const r = realized != null ? Number(realized) : NaN;
  const l = listIn != null ? Number(listIn) : NaN;
  if (!Number.isFinite(r) || !Number.isFinite(l) || l <= 0) return null;
  const pct = ((r - l) / l) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return null;
  return Math.round(pct * 10) / 10;
}

function armRole(arm: { is_eligible?: number; is_paused?: number }): { label: string; color: string } {
  if (Number(arm.is_paused) === 1) return { label: "Fallback", color: T.amber };
  if (Number(arm.is_eligible) === 1) return { label: "Primary", color: T.green };
  return { label: "Override", color: T.violet };
}

function estSuccessPct(alpha?: number, beta?: number): number | null {
  const a = Number(alpha);
  const b = Number(beta);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a + b <= 0) return null;
  return Math.round((a / (a + b)) * 1000) / 10;
}

function scatterRadiusFromRuns(runs: number): number {
  return Math.max(5, Math.sqrt(Math.max(0, Number(runs) || 0)) * 0.85);
}

function CostLatencyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CostLatencyPoint & { success_alpha?: number; success_beta?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const est = estSuccessPct(p.success_alpha, p.success_beta);
  return (
    <div
      style={{
        background: T.tooltipBg,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 11,
        fontFamily: T.font,
        maxWidth: 300,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: T.text }}>{String(p.model_key || "—")}</div>
      <div style={{ color: T.muted }}>
        Cost mean: <span style={{ color: T.text }}>${Number(p.y).toFixed(6)}</span>
      </div>
      <div style={{ color: T.muted }}>
        Latency mean: <span style={{ color: T.text }}>{Math.round(Number(p.x))} ms</span>
      </div>
      {p.quality != null ? (
        <div style={{ color: T.muted }}>
          Decayed score: <span style={{ color: T.text }}>{Number(p.quality).toFixed(4)}</span>
        </div>
      ) : null}
      {est != null ? (
        <div style={{ color: T.muted }}>
          Est. success: <span style={{ color: T.text }}>{est}%</span>
        </div>
      ) : null}
      <div style={{ color: T.muted, marginTop: 4 }}>
        Runs: <span style={{ color: T.text }}>{fmt.num(Number(p.runs) || 0)}</span>
      </div>
    </div>
  );
}

function LeaderboardTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; runsN: number; success: number; raw: LbRow } }>;
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
      {raw.decayed != null ? (
        <div style={{ color: T.muted, marginTop: 4 }}>
          Decayed score: <span style={{ color: T.text }}>{Number(raw.decayed).toFixed(3)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ModelIntelligenceCard({
  perfRows,
  costLatency,
  arms,
  routingTimeseries,
}: {
  perfRows?: DashboardBundle["model_leaderboard"];
  costLatency?: DashboardBundle["cost_latency"];
  arms?: DashboardBundle["routing_arms"];
  routingTimeseries?: DashboardBundle["routing_timeseries"];
}) {
  const [tab, setTab] = useState<TabId>("leaderboard");
  const [selectedScatter, setSelectedScatter] = useState<string | null>(null);

  const lbRows: LbRow[] = useMemo(() => {
    if (!perfRows?.length) return [];
    return perfRows.map((r) => {
      const prov = String(r.provider || "—");
      const pk = providerPcKey(prov);
      const runs = Math.round(Number(r.runs) || 0);
      const listIn = r.list_in_per_1k != null ? Number(r.list_in_per_1k) : null;
      const listOut = r.list_out_per_1k != null ? Number(r.list_out_per_1k) : null;
      const realized = r.realized_per_1k != null ? Number(r.realized_per_1k) : null;
      return {
        model: String(r.model_key || "—").slice(0, 40),
        prov,
        pk,
        runs,
        success: Math.round((Number(r.success_pct) || 0) * 10) / 10,
        lat: (Number(r.avg_latency_ms) || 0) / 1000,
        costPer1k: realized ?? 0,
        decayed: r.decayed_score,
        listIn,
        listOut,
        realizedPer1k: realized,
        status: pricingStatus(r),
        driftPct: costDriftPct(realized, listIn),
      };
    });
  }, [perfRows]);

  const chartSlice = lbRows.slice(0, CHART_ROWS);
  const maxR = Math.max(...chartSlice.map((r) => r.runs), 1);
  const chartData = chartSlice.map((r) => ({
    name: r.model.length > 18 ? `${r.model.slice(0, 17)}…` : r.model,
    runsN: Math.round((r.runs / maxR) * 1000) / 10,
    success: r.success,
    raw: r,
  }));
  const chartH = Math.max(120, chartSlice.length * 26);

  const scatterSets = useMemo(() => {
    if (!costLatency?.length) return [];
    const byProv = new Map<string, (CostLatencyPoint & { success_alpha?: number; success_beta?: number })[]>();
    for (const r of costLatency) {
      const arm = arms?.find((a) => String(a.model_key) === String(r.model_key));
      const name = String(r.provider || "other").trim() || "other";
      const pt = {
        x: Number(r.latency_ms) || 0,
        y: Number(r.cost_usd) || 0,
        model_key: String(r.model_key || "—"),
        runs: Number(r.runs) || 0,
        quality: Number(r.quality) || 0,
        success_rate: r.success_rate == null || !Number.isFinite(Number(r.success_rate)) ? null : Number(r.success_rate),
        success_alpha: arm?.success_alpha != null ? Number(arm.success_alpha) : undefined,
        success_beta: arm?.success_beta != null ? Number(arm.success_beta) : undefined,
      };
      if (!byProv.has(name)) byProv.set(name, []);
      byProv.get(name)!.push(pt);
    }
    return [...byProv.entries()].map(([name, data]) => ({
      name,
      color: PC[providerPcKey(name)] || PC.other,
      data,
    }));
  }, [costLatency, arms]);

  const selectedArmDetail = useMemo(() => {
    if (!selectedScatter) return null;
    const cl = costLatency?.find((r) => String(r.model_key) === selectedScatter);
    const arm = arms?.find((a) => String(a.model_key) === selectedScatter);
    if (!cl && !arm) return null;
    return { cl, arm };
  }, [selectedScatter, costLatency, arms]);

  const routingTs = useMemo(() => {
    if (routingTimeseries?.length) {
      return routingTimeseries.map((r) => ({
        date: String(r.date || "").slice(5),
        primary: Number(r.primary) || 0,
        fallback: Number(r.fallback) || 0,
      }));
    }
    return DAYS.map((date) => ({ date, primary: 0, fallback: 0 }));
  }, [routingTimeseries]);

  const providerShare = useMemo(() => {
    if (!arms?.length) return [];
    const byP = new Map<string, number>();
    let tot = 0;
    for (const a of arms) {
      const p = String(a.provider || "other");
      const n = Number(a.total_executions) || 0;
      byP.set(p, (byP.get(p) || 0) + n);
      tot += n;
    }
    if (tot <= 0) return [];
    return [...byP.entries()].map(([name, v]) => ({
      name,
      v: Math.round((v / tot) * 100),
      c: PC[provSlug(name)] || PC.other,
    }));
  }, [arms]);

  const armRows = useMemo(() => {
    if (!arms?.length) return [];
    return arms.slice(0, 12).map((a) => ({
      model: String(a.model_key || "—").slice(0, 36),
      decayed: a.decayed_score != null ? Number(a.decayed_score) : null,
      costMean: Number(a.cost_mean) || 0,
      latencyMean: Number(a.latency_mean) || 0,
      role: armRole(a),
    }));
  }, [arms]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "leaderboard", label: "Leaderboard" },
    { id: "cost_latency", label: "Cost and Latency" },
    { id: "routing", label: "Routing" },
  ];

  return (
    <Card
      style={{ marginBottom: 10 }}
      data-source="agentsam_agent_run,agentsam_model_pricing,agentsam_routing_arms"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ color: T.muted, display: "flex" }}>{Ico.list}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Model Intelligence</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, background: T.surf2, borderRadius: 8, padding: 3, border: `1px solid ${T.border}` }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: T.font,
                  color: tab === t.id ? T.text : T.muted,
                  background: tab === t.id ? T.surface : "transparent",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <NavLink href="/dashboard/analytics/models" label="Full table" />
        </div>
      </div>

      {tab === "leaderboard" ? (
        lbRows.length === 0 ? (
          <PulseEmpty message="No model runs in this workspace yet." href={OVERVIEW_LINKS.workflowRuns} linkLabel="View agent runs" />
        ) : (
          <>
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ color: T.muted, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>
                    {["Model", "Provider", "Runs", "Success %", "Realized $/1K", "List in / out", "Status"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lbRows.map((r) => (
                    <tr key={r.model} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "7px 8px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.model}>
                        {r.model}
                      </td>
                      <td style={{ padding: "7px 8px", color: PC[r.pk] || T.muted }}>{r.prov}</td>
                      <td style={{ padding: "7px 8px" }}>{fmt.num(r.runs)}</td>
                      <td style={{ padding: "7px 8px", color: r.success > 95 ? T.green : T.amber }}>{r.success}%</td>
                      <td style={{ padding: "7px 8px" }}>
                        {r.realizedPer1k != null ? `$${r.realizedPer1k.toFixed(4)}` : "—"}
                        {r.driftPct != null ? (
                          <span style={{ marginLeft: 6, fontSize: 9, color: r.driftPct > 0 ? T.red : T.green }}>
                            {r.driftPct > 0 ? "+" : ""}
                            {r.driftPct}%
                          </span>
                        ) : null}
                      </td>
                      <td style={{ padding: "7px 8px", color: T.muted }}>
                        {r.listIn != null && r.listOut != null
                          ? `$${r.listIn.toFixed(2)} / $${r.listOut.toFixed(2)}`
                          : "—"}
                      </td>
                      <td style={{ padding: "7px 8px" }}>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: r.status.color,
                            background: `color-mix(in srgb, ${r.status.color} 14%, transparent)`,
                            padding: "2px 8px",
                            borderRadius: 20,
                          }}
                        >
                          {r.status.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 8 }}>Runs (scaled) vs success %</div>
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 2, right: 8, left: 0, bottom: 2 }} barCategoryGap={10}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: T.muted }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 8, fill: T.muted }} axisLine={false} tickLine={false} />
                <Tooltip content={<LeaderboardTooltip />} cursor={{ fill: "color-mix(in srgb, var(--dashboard-text) 4%, transparent)" }} />
                <Bar dataKey="runsN" name="Runs (scaled)" fill={T.accent} radius={[0, 3, 3, 0]} barSize={8} />
                <Bar dataKey="success" name="Success %" fill={T.green} radius={[0, 3, 3, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )
      ) : null}

      {tab === "cost_latency" ? (
        scatterSets.length === 0 ? (
          <PulseEmpty message="No routing arm statistics for this workspace." href="/dashboard/analytics/models" linkLabel="Models analytics" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Latency"
                  tick={{ fontSize: 9, fill: T.muted }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "Latency (ms)", position: "insideBottom", offset: -8, fontSize: 9, fill: T.muted }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Cost"
                  tick={{ fontSize: 9, fill: T.muted }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${Number(v).toFixed(4)}`}
                  label={{
                    value: "Cost ($/call avg)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    fontSize: 9,
                    fill: T.muted,
                  }}
                />
                <Tooltip content={<CostLatencyTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                {scatterSets.map((s) => (
                  <Scatter
                    key={s.name}
                    name={s.name}
                    data={s.data}
                    fill={s.color}
                    onClick={(pt) => {
                      const mk = String((pt as { payload?: { model_key?: string } }).payload?.model_key || "");
                      setSelectedScatter((cur) => (cur === mk ? null : mk));
                    }}
                    shape={(props: { cx?: number; cy?: number; payload?: CostLatencyPoint }) => {
                      const cx = props.cx ?? 0;
                      const cy = props.cy ?? 0;
                      const mk = String(props.payload?.model_key || "");
                      const rad = scatterRadiusFromRuns(props.payload?.runs ?? 0);
                      const selected = selectedScatter === mk;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={rad}
                          fill={PC[providerPcKey(s.name)] || s.color}
                          fillOpacity={selected ? 1 : 0.88}
                          stroke={selected ? T.text : "none"}
                          strokeWidth={selected ? 2 : 0}
                          style={{ cursor: "pointer" }}
                        />
                      );
                    }}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
            {selectedArmDetail ? (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: T.surf2,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  fontSize: 10,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6, color: T.text }}>{selectedScatter}</div>
                {selectedArmDetail.cl ? (
                  <>
                    <div style={{ color: T.muted }}>
                      Latency mean {Math.round(Number(selectedArmDetail.cl.latency_ms) || 0)} ms · Cost mean $
                      {Number(selectedArmDetail.cl.cost_usd).toFixed(6)} · Runs {fmt.num(Number(selectedArmDetail.cl.runs) || 0)}
                    </div>
                    {selectedArmDetail.cl.quality != null ? (
                      <div style={{ color: T.muted, marginTop: 4 }}>
                        Decayed score {Number(selectedArmDetail.cl.quality).toFixed(4)}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {selectedArmDetail.arm ? (
                  <div style={{ color: T.muted, marginTop: 4 }}>
                    Thompson arm: alpha {Number(selectedArmDetail.arm.success_alpha).toFixed(1)} / beta{" "}
                    {Number(selectedArmDetail.arm.success_beta).toFixed(1)}
                    {estSuccessPct(selectedArmDetail.arm.success_alpha, selectedArmDetail.arm.success_beta) != null
                      ? ` · est. ${estSuccessPct(selectedArmDetail.arm.success_alpha, selectedArmDetail.arm.success_beta)}% success`
                      : ""}
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: 9, color: T.muted, marginTop: 6 }}>Click a point for model and arm breakdown (Workers AI and long ids supported).</div>
            )}
          </>
        )
      ) : null}

      {tab === "routing" ? (
        !arms?.length && !routingTimeseries?.length ? (
          <PulseEmpty message="No routing arms configured for this workspace." href="/dashboard/analytics/models" linkLabel="Models analytics" />
        ) : (
          <>
            {providerShare.length > 0 ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 8 }}>
                  {providerShare.map((p) => (
                    <div key={p.name} title={`${p.name}: ${p.v}%`} style={{ width: `${p.v}%`, background: p.c }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 9, color: T.muted }}>
                  {providerShare.map((p) => (
                    <span key={p.name}>
                      {p.name} {p.v}%
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <ResponsiveContainer width="100%" height={108}>
              <AreaChart data={routingTs} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="primary" name="Primary" stroke={T.accent} fill={T.accent} fillOpacity={0.12} strokeWidth={1.5} />
                <Area type="monotone" dataKey="fallback" name="Fallback" stroke={T.amber} fill={T.amber} fillOpacity={0.12} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
            {armRows.length > 0 ? (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ color: T.muted, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>
                      {["Model", "Decayed Score", "Cost Mean", "Latency Mean", "Role"].map((h) => (
                        <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {armRows.map((r) => (
                      <tr key={r.model} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "7px 8px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.model}>
                          {r.model}
                        </td>
                        <td style={{ padding: "7px 8px" }}>{r.decayed != null ? r.decayed.toFixed(3) : "—"}</td>
                        <td style={{ padding: "7px 8px" }}>${r.costMean.toFixed(4)}</td>
                        <td style={{ padding: "7px 8px" }}>{Math.round(r.latencyMean)} ms</td>
                        <td style={{ padding: "7px 8px" }}>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: r.role.color,
                              background: `color-mix(in srgb, ${r.role.color} 14%, transparent)`,
                              padding: "2px 8px",
                              borderRadius: 20,
                            }}
                          >
                            {r.role.label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </Card>
  );
}
