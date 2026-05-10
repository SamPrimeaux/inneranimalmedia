import { useMemo } from "react";
import { AreaChart, Area, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { DashboardBundle } from "../types";
import { T, PC, DAYS, provSlug } from "../constants";
import { Card, CardHeader, Dot, Pill, Tip, Ico } from "../primitives";

export function RoutingDecisions({
  arms,
  routingTimeseries,
}: {
  arms?: DashboardBundle["routing_arms"];
  routingTimeseries?: DashboardBundle["routing_timeseries"];
}) {
  const data = useMemo(() => {
    if (routingTimeseries?.length) {
      return routingTimeseries.map((r) => ({
        date: String(r.date || "").slice(5),
        primary: Number(r.primary) || 0,
        fallback: Number(r.fallback) || 0,
        override: 0,
      }));
    }
    return DAYS.map((date) => ({ date, primary: 0, fallback: 0, override: 0 }));
  }, [routingTimeseries]);
  const share = useMemo(() => {
    if (!arms?.length) {
      return [
        { name: "OpenAI", v: 38, c: PC.openai },
        { name: "Anthropic", v: 29, c: PC.anthropic },
        { name: "Google", v: 18, c: PC.google },
        { name: "Meta", v: 10, c: PC.meta },
        { name: "Other", v: 5, c: PC.other },
      ];
    }
    const byP = new Map<string, number>();
    let tot = 0;
    for (const a of arms) {
      const p = String(a.provider || "other");
      const n = Number(a.total_executions) || 0;
      byP.set(p, (byP.get(p) || 0) + n);
      tot += n;
    }
    if (tot <= 0) {
      return [{ name: "routing_arms", v: 100, c: PC.other }];
    }
    const entries = [...byP.entries()].map(([name, v]) => ({
      name,
      frac: v / tot,
      c: PC[provSlug(name)] || PC.other,
    }));
    let rounded = entries.map((e) => ({ name: e.name, v: Math.floor(e.frac * 100), c: e.c }));
    const s = rounded.reduce((acc, x) => acc + x.v, 0);
    const rem = 100 - s;
    if (rem !== 0 && rounded.length) {
      const idx = rounded.reduce((best, x, i, arr) => (x.v > arr[best].v ? i : best), 0);
      rounded = rounded.map((x, i) => (i === idx ? { ...x, v: x.v + rem } : x));
    }
    return rounded;
  }, [arms]);
  return (
    <Card>
      <CardHeader icon={Ico.route} title="Routing Decisions" action={<Pill label="agentsam_routing_arms" />} />
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        {[
          ["Primary", T.accent],
          ["Fallback", T.amber],
          ["Override", T.violet],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted }}>
            <Dot c={c} />
            {l}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={108}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} />
          <Tooltip content={<Tip />} />
          <Area type="monotone" dataKey="primary" name="Primary" stroke={T.accent} fill={T.accent} fillOpacity={0.12} strokeWidth={1.5} />
          <Area type="monotone" dataKey="fallback" name="Fallback" stroke={T.amber} fill={T.amber} fillOpacity={0.12} strokeWidth={1.5} />
          <Area type="monotone" dataKey="override" name="Override" stroke={T.violet} fill={T.violet} fillOpacity={0.12} strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
        <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Provider Share</div>
        <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", gap: 1 }}>
          {share.map((p) => (
            <div key={p.name} title={`${p.name}: ${p.v}%`} style={{ width: `${p.v}%`, background: p.c }} />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 12px", marginTop: 7 }}>
          {share.map((p) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: T.muted }}>
              <Dot c={p.c} />
              {p.name} {p.v}%
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
