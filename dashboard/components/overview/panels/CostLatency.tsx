import { useMemo } from "react";
import { ScatterChart, Scatter, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { CostLatencyPoint, DashboardBundle } from "../types";
import { T, PC, fmt, providerPcKey } from "../constants";
import { Card, CardHeader, Pill, Ico } from "../primitives";

function CostLatencyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CostLatencyPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const sr = p.success_rate;
  const srStr =
    sr == null || !Number.isFinite(Number(sr)) ? "—" : Number(sr) <= 1 ? `${(Number(sr) * 100).toFixed(1)}%` : `${Number(sr).toFixed(1)}%`;
  return (
    <div style={{ background: T.tooltipBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 11, fontFamily: T.font, maxWidth: 280 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: T.text }}>{String(p.model_key || "—")}</div>
      <div style={{ color: T.muted, marginBottom: 3 }}>
        Runs: <span style={{ color: T.text, fontWeight: 600 }}>{fmt.num(Number(p.runs) || 0)}</span>
      </div>
      <div style={{ color: T.muted, marginBottom: 3 }}>
        Quality: <span style={{ color: T.text, fontWeight: 600 }}>{Number(p.quality).toFixed(4)}</span>
      </div>
      <div style={{ color: T.muted }}>
        Success rate: <span style={{ color: T.text, fontWeight: 600 }}>{srStr}</span>
      </div>
      <div style={{ color: T.muted, marginTop: 6, fontSize: 10 }}>
        Latency {Math.round(p.x)} ms · Cost ${Number(p.y).toFixed(6)}
      </div>
    </div>
  );
}

function scatterRadiusFromRuns(runs: number): number {
  return Math.max(4, Math.sqrt(Math.max(0, Number(runs) || 0)) * 0.8);
}

function makeScatterShape(fill: string) {
  return function ScatterDot(props: { cx?: number; cy?: number; payload?: CostLatencyPoint }) {
    const cx = props.cx ?? 0;
    const cy = props.cy ?? 0;
    const rad = scatterRadiusFromRuns(props.payload?.runs ?? 0);
    return <circle cx={cx} cy={cy} r={rad} fill={fill} fillOpacity={0.88} stroke="none" />;
  };
}

export function CostLatency({ costLatency }: { costLatency?: DashboardBundle["cost_latency"] }) {
  const sets = useMemo(() => {
    const rows = costLatency?.length
      ? costLatency
      : [
          { model_key: "gpt-4o", provider: "OpenAI", runs: 8200, latency_ms: 2300, cost_usd: 0.021, quality: 0.82, success_rate: 0.97 },
          { model_key: "gpt-4o-mini", provider: "OpenAI", runs: 21000, latency_ms: 1800, cost_usd: 0.006, quality: 0.78, success_rate: 0.95 },
          { model_key: "claude-3-5-sonnet", provider: "Anthropic", runs: 6400, latency_ms: 3100, cost_usd: 0.018, quality: 0.8, success_rate: 0.96 },
          { model_key: "claude-3-haiku", provider: "Anthropic", runs: 12000, latency_ms: 2100, cost_usd: 0.004, quality: 0.74, success_rate: 0.93 },
          { model_key: "gemini-1.5-pro", provider: "Google", runs: 4800, latency_ms: 3900, cost_usd: 0.012, quality: 0.77, success_rate: 0.94 },
        ];
    const byProv = new Map<string, CostLatencyPoint[]>();
    for (const r of rows) {
      const name = String(r.provider || "other").trim() || "other";
      const pt: CostLatencyPoint = {
        x: Number(r.latency_ms) || 0,
        y: Number(r.cost_usd) || 0,
        model_key: String(r.model_key || "—"),
        runs: Number(r.runs) || 0,
        quality: Number(r.quality) || 0,
        success_rate: r.success_rate == null || !Number.isFinite(Number(r.success_rate)) ? null : Number(r.success_rate),
      };
      if (!byProv.has(name)) byProv.set(name, []);
      byProv.get(name)!.push(pt);
    }
    return [...byProv.entries()].map(([name, data]) => ({
      name,
      color: PC[providerPcKey(name)] || PC.other,
      data,
    }));
  }, [costLatency]);
  return (
    <Card>
      <CardHeader icon={Ico.route} title="Cost vs Latency" action={<Pill label="agentsam_routing_arms" />} />
      <div style={{ display: "flex", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        {sets.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: T.muted }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={178}>
        <ScatterChart margin={{ top: 4, right: 8, left: -16, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
          <XAxis
            type="number"
            dataKey="x"
            name="Latency"
            unit=" ms"
            tick={{ fontSize: 9, fill: T.muted }}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
            label={{ value: "Latency (ms)", position: "insideBottom", offset: -6, fontSize: 9, fill: T.muted }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Cost"
            tick={{ fontSize: 9, fill: T.muted }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${Number(v).toFixed(4)}`}
          />
          <Tooltip content={<CostLatencyTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          {sets.map((s) => (
            <Scatter key={s.name} name={s.name} data={s.data} fill={s.color} shape={makeScatterShape(s.color)} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );
}
