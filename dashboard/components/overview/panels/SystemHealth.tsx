import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { DashboardBundle } from "../types";
import { T, DAYS } from "../constants";
import { Card, CardHeader, Dot, Pill, Tip, Ico } from "../primitives";

export function SystemHealth({ crons }: { crons?: DashboardBundle["cron_latest"] }) {
  const svcs =
    crons?.map((c) => ({
      name: String(c.job_name || "job"),
      status: String(c.status || "").toLowerCase() === "failed" ? "down" : String(c.status || "").toLowerCase() === "running" ? "warning" : "healthy",
      lat: `${Math.round(Number(c.duration_ms) || 0)}ms`,
      up: String(c.status || "—"),
    })) || [
      { name: "CF Workers", status: "healthy", lat: "12ms", up: "99.98%" },
      { name: "Supabase DB", status: "healthy", lat: "24ms", up: "99.95%" },
      { name: "MCP Server", status: "healthy", lat: "8ms", up: "99.99%" },
      { name: "D1 Database", status: "healthy", lat: "3ms", up: "100%" },
      { name: "R2 Storage", status: "healthy", lat: "18ms", up: "99.97%" },
      { name: "PTY", status: "healthy", lat: "6ms", up: "99.90%" },
      { name: "Ollama", status: "warning", lat: "142ms", up: "98.2%" },
    ];
  const sc: Record<string, string> = { healthy: T.green, warning: T.amber, down: T.red, completed: T.green, skipped: T.muted, failed: T.red };
  const uptime = DAYS.map((date) => ({ date, pct: 99.5 + Math.random() * 0.5 }));
  return (
    <Card style={{ flex: "1 1 240px" }}>
      <CardHeader icon={Ico.pulse} title="System Health" action={<Pill label="agentsam_cron_runs" />} />
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
        {svcs.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Dot c={sc[s.status] || T.muted} />
            <span style={{ fontSize: 10, flex: 1 }}>{s.name}</span>
            <span style={{ fontSize: 9, color: T.muted }}>{s.lat}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: sc[s.status] }}>{s.up}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
        <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Uptime (7d)</div>
        <ResponsiveContainer width="100%" height={52}>
          <AreaChart data={uptime} margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
            <XAxis hide />
            <YAxis domain={[99, 100.1]} hide />
            <Tooltip content={<Tip fmt={(v: number) => `${v.toFixed(3)}%`} />} />
            <Area type="monotone" dataKey="pct" name="Uptime" stroke={T.green} fill={T.green} fillOpacity={0.15} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
