import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { T, fmt } from "../constants";
import { Card, CardHeader, Tip, Ico } from "../primitives";

export function TopServices({ events }: { events: Array<{ type: string; count: number }> }) {
  const svcs =
    events.length > 0
      ? events.slice(0, 7)
      : [
          { type: "Web Search", count: 18700 },
          { type: "Code Interpreter", count: 14200 },
          { type: "Vector Store", count: 11900 },
          { type: "Browser Auto", count: 9800 },
          { type: "File Reader", count: 7300 },
          { type: "DB Query", count: 5100 },
          { type: "R2 Write", count: 3400 },
        ];
  const maxCalls = svcs.length ? Math.max(...svcs.map((s) => s.count), 1) : 18700;
  const chartData = svcs.map((s) => ({ name: s.type.split(" ")[0], value: s.count }));
  return (
    <Card>
      <CardHeader icon={Ico.tool} title="Top Services (MCP)" />
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} width={54} />
          <Tooltip content={<Tip fmt={(v: number) => fmt.num(v)} />} />
          <Bar dataKey="value" name="Calls" radius={[0, 3, 3, 0]}>
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={`color-mix(in srgb, var(--accent-secondary, var(--solar-cyan)) ${Math.max(28, Math.round((1 - i * 0.11) * 100))}%, transparent)`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
        {svcs.slice(0, 4).map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 9, color: T.muted }}>
            <span style={{ width: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.type}</span>
            <div style={{ flex: 1, height: 3, background: T.track, borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${(s.count / maxCalls) * 100}%`,
                  background: `color-mix(in srgb, var(--accent-secondary, var(--solar-cyan)) ${Math.max(25, Math.round((0.9 - i * 0.18) * 100))}%, transparent)`,
                  borderRadius: 2,
                }}
              />
            </div>
            <span style={{ width: 32, textAlign: "right" }}>{fmt.num(s.count)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
