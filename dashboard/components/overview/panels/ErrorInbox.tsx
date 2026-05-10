import type { DashboardBundle } from "../types";
import { T, relTime, formatErrorTypeTag, shortErrorSource, severityColor } from "../constants";
import { Card, CardHeader, Dot, Ico } from "../primitives";

export function ErrorInbox({ errorLog }: { errorLog?: DashboardBundle["error_log"] }) {
  const log = errorLog ?? [];
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
  return (
    <Card>
      <CardHeader icon={Ico.pulse} title="Error Inbox" action={<span style={{ fontSize: 10, color: T.accent, cursor: "pointer" }}>View All →</span>} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {counts.map((s) => (
          <div key={s.l} style={{ flex: 1, background: T.surf2, borderRadius: 7, padding: "6px 10px", border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.c }}>{s.n}</div>
            <div style={{ fontSize: 9, color: T.muted }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.length === 0 ? (
          <div style={{ fontSize: 9, color: T.muted, padding: "10px 0" }}>No open errors for this workspace.</div>
        ) : (
          rows.map((e, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 7,
                alignItems: "flex-start",
                padding: "7px 0",
                borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : "none",
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
