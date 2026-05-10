import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { T, DAYS } from "../constants";
import { Card, CardHeader, Dot, Tip, Ico } from "../primitives";

export function RagHealth() {
  const pie = [
    { name: "Healthy", value: 82, c: T.green },
    { name: "Warning", value: 11, c: T.amber },
    { name: "Stale", value: 5, c: T.muted },
    { name: "Critical", value: 2, c: T.red },
  ];
  const cov = DAYS.map((date) => ({ date, pct: 92 + Math.random() * 6 }));
  return (
    <Card style={{ flex: "2 1 380px" }}>
      <CardHeader icon={Ico.db} title="RAG / Document Health" action={<span style={{ fontSize: 10, color: T.accent, cursor: "pointer" }}>View All →</span>} />
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
            <ResponsiveContainer width={90} height={90}>
              <PieChart>
                <Pie data={pie} cx="50%" cy="50%" innerRadius={26} outerRadius={43} dataKey="value" strokeWidth={0}>
                  {pie.map((e, i) => (
                    <Cell key={i} fill={e.c} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>10.5K</span>
              <span style={{ fontSize: 8, color: T.muted }}>docs</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {pie.map((e) => (
              <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", minWidth: 110 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Dot c={e.c} />
                  <span style={{ fontSize: 10, color: T.muted }}>{e.name}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600 }}>{e.value}%</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Embedding Coverage (7d)</div>
          <ResponsiveContainer width="100%" height={72}>
            <LineChart data={cov} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: T.muted }} axisLine={false} tickLine={false} />
              <YAxis domain={[85, 100]} tick={{ fontSize: 8, fill: T.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<Tip fmt={(v: number) => `${v.toFixed(1)}%`} />} />
              <ReferenceLine y={90} stroke={T.amber} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="pct" name="Coverage" stroke={T.accent} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            {(
              [
                ["Chunks", "2.1M"],
                ["Embeddings", "1.8M"],
                ["Avg Latency", "241ms"],
                ["Updated", "2m ago"],
              ] as const
            ).map(([l, v]) => (
              <div key={l} style={{ background: T.surf2, borderRadius: 6, padding: "7px 10px" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
                <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
