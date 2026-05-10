import { AreaChart, Area, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { DashboardBundle } from "../types";
import { T, DAYS, fmt } from "../constants";
import { Card, CardHeader, Dot, Pill, Tip, Ico } from "../primitives";

export function TokensChart({ tokenTimeseries }: { tokenTimeseries?: DashboardBundle["token_timeseries"] }) {
  const data = tokenTimeseries?.length
    ? tokenTimeseries.map((r) => ({
        date: String(r.date || "").slice(5),
        input: Number(r.input) || 0,
        output: Number(r.output) || 0,
        cached: Number(r.cached) || 0,
      }))
    : DAYS.map((date) => ({
        date,
        input: Math.round(180000 + Math.random() * 300000),
        output: Math.round(80000 + Math.random() * 180000),
        cached: Math.round(40000 + Math.random() * 90000),
      }));
  return (
    <Card>
      <CardHeader icon={Ico.zap} title="Tokens Over Time" action={<Pill label="Last 7 Days" />} />
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        {(
          [
            ["Input", T.accent],
            ["Output", T.violet],
            ["Cached", T.blue],
          ] as const
        ).map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted }}>
            <Dot c={c} />
            {l}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={148}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -22, bottom: 0 }}>
          <defs>
            {(
              [
                ["ti", T.accent],
                ["to", T.violet],
                ["tc", T.blue],
              ] as const
            ).map(([id, c]) => (
              <linearGradient key={id} id={`tg${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c} stopOpacity=".4" />
                <stop offset="95%" stopColor={c} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt.tok(v)} />
          <Tooltip content={<Tip fmt={(v: number) => fmt.tok(v)} />} />
          <Area type="monotone" dataKey="input" name="Input" stroke={T.accent} fill="url(#tgti)" strokeWidth={1.5} />
          <Area type="monotone" dataKey="output" name="Output" stroke={T.violet} fill="url(#tgto)" strokeWidth={1.5} />
          <Area type="monotone" dataKey="cached" name="Cached" stroke={T.blue} fill="url(#tgtc)" strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
