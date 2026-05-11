import { useMemo, useState } from "react";
import { BarChart, Bar, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { DashboardBundle } from "../types";
import { T, relTime, formatErrorTypeTag, shortErrorSource, severityColor } from "../constants";
import { Card, CardHeader, Dot, Ico, Tip } from "../primitives";

const PREVIEW_ROWS = 5;

function bucketErrorLogByDay(
  log: NonNullable<DashboardBundle["error_log"]>,
): Array<{ date: string; high: number; medium: number; low: number }> {
  const by = new Map<string, { high: number; medium: number; low: number }>();
  for (const r of log) {
    const ms = typeof r.created_at === "number" ? (r.created_at > 1e12 ? r.created_at : r.created_at * 1000) : Date.parse(String(r.created_at));
    if (!Number.isFinite(ms)) continue;
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const sev = r.severity || "low";
    const cur = by.get(key) || { high: 0, medium: 0, low: 0 };
    if (sev === "high") cur.high += 1;
    else if (sev === "medium") cur.medium += 1;
    else cur.low += 1;
    by.set(key, cur);
  }
  return [...by.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
}

export function ErrorInbox({
  errorLog,
  errorSeverityTimeseries,
}: {
  errorLog?: DashboardBundle["error_log"];
  errorSeverityTimeseries?: DashboardBundle["error_severity_timeseries"];
}) {
  const [expanded, setExpanded] = useState(false);
  const log = errorLog ?? [];

  const chartData = useMemo(() => {
    if (errorSeverityTimeseries?.length) {
      return errorSeverityTimeseries.map((r) => ({
        date: String(r.date || "").slice(5),
        high: Number(r.high) || 0,
        medium: Number(r.medium) || 0,
        low: Number(r.low) || 0,
      }));
    }
    return bucketErrorLogByDay(log).map((r) => ({ ...r, date: r.date.slice(5) }));
  }, [errorSeverityTimeseries, log]);

  const hi = log.filter((r) => r.severity === "high").length;
  const med = log.filter((r) => r.severity === "medium").length;
  const lo = log.filter((r) => r.severity === "low").length;
  const counts = [
    { l: "High", n: hi, c: T.red },
    { l: "Medium", n: med, c: T.amber },
    { l: "Low", n: lo, c: T.accent },
  ];

  const rows = log.map((r) => {
    const sev = r.severity;
    const c = severityColor(sev);
    const tag = formatErrorTypeTag(String(r.error_type || ""));
    const src = shortErrorSource(String(r.source || ""));
    const msg = String(r.error_message || "").slice(0, 220);
    const time = relTime(r.created_at);
    return { time, tag, src, msg, c, sev };
  });

  const visible = expanded ? rows : rows.slice(0, PREVIEW_ROWS);
  const hasMore = rows.length > PREVIEW_ROWS;

  return (
    <Card>
      <CardHeader
        icon={Ico.pulse}
        title="Error Inbox"
        action={
          hasMore ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                fontSize: 10,
                color: T.accent,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {expanded ? "Show less" : `View all (${rows.length})`}
            </button>
          ) : null
        }
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {counts.map((s) => (
          <div key={s.l} style={{ flex: 1, background: T.surf2, borderRadius: 7, padding: "6px 10px", border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.c }}>{s.n}</div>
            <div style={{ fontSize: 9, color: T.muted }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Severity (7d)</div>
      <ResponsiveContainer width="100%" height={88}>
        <BarChart data={chartData.length ? chartData : [{ date: "—", high: 0, medium: 0, low: 0 }]} margin={{ top: 2, right: 4, left: -28, bottom: 0 }} barGap={1}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 8, fill: T.muted }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip content={<Tip />} />
          <Bar dataKey="high" stackId="sev" name="High" fill={T.red} radius={[0, 0, 0, 0]} />
          <Bar dataKey="medium" stackId="sev" name="Medium" fill={T.amber} radius={[0, 0, 0, 0]} />
          <Bar dataKey="low" stackId="sev" name="Low" fill={T.accent} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {[
          ["High", T.red],
          ["Medium", T.amber],
          ["Low", T.accent],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: T.muted }}>
            <Dot c={c} />
            {l}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Recent</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.length === 0 ? (
          <div style={{ fontSize: 9, color: T.muted, padding: "10px 0" }}>No open errors for this workspace.</div>
        ) : (
          visible.map((e, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 7,
                alignItems: "flex-start",
                padding: "7px 0",
                borderBottom: i < visible.length - 1 ? `1px solid ${T.border}` : "none",
              }}
            >
              <span style={{ fontSize: 9, color: T.muted, width: 52, flexShrink: 0, marginTop: 2 }}>{e.time}</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: e.c,
                  background: `color-mix(in srgb, ${e.c} 18%, transparent)`,
                  padding: "1px 6px",
                  borderRadius: 3,
                  flexShrink: 0,
                }}
              >
                {e.tag}
              </span>
              <span style={{ fontSize: 9, color: T.muted, lineHeight: 1.5, flex: 1, overflow: "hidden" }}>
                {e.src ? (
                  <>
                    <span style={{ color: T.text, opacity: 0.75 }}>{e.src}</span>
                    {e.msg ? " · " : ""}
                  </>
                ) : null}
                {e.msg}
              </span>
              <Dot c={e.c} />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
