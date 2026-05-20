import { AreaChart, Area, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { DashboardBundle } from "../types";
import { T, PC, DAYS, rand, spendPivot } from "../constants";
import { Card, CardHeader, Ico, Pill, Tip } from "../primitives";

export function SpendChart({ spendRows }: { spendRows?: DashboardBundle["spend_by_day_provider"] }) {
  const data = spendRows?.length
    ? spendPivot(spendRows)
    : DAYS.map((date, i) => ({
        date,
        openai: 800 + i * 90 + rand(200),
        anthropic: 400 + i * 60 + rand(150),
        google: 250 + i * 30 + rand(100),
        meta: 120 + rand(80),
        other: 60 + rand(40),
      }));
  return (
    <Card>
      <CardHeader icon={Ico.flame} title="AI Spend Over Time" action={<Pill label="Last 7 Days" />} />
      <ResponsiveContainer width="100%" height={168}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <defs>
            {Object.entries(PC).map(([k, c]) => (
              <linearGradient key={k} id={`ag${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c} stopOpacity=".5" />
                <stop offset="95%" stopColor={c} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.muted }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: T.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} />
          <Tooltip content={<Tip fmt={(v: number) => `$${v.toFixed(2)}`} />} />
          {["openai", "anthropic", "google", "meta", "other"].map((k) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId="1"
              name={k.charAt(0).toUpperCase() + k.slice(1)}
              stroke={PC[k]}
              fill={`url(#ag${k})`}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {Object.entries({ OpenAI: "openai", Anthropic: "anthropic", Google: "google", Meta: "meta", Other: "other" }).map(([l, k]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: T.muted }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: PC[k] }} />
            {l}
          </div>
        ))}
      </div>
    </Card>
  );
}
