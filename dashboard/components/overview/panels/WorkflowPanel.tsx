import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { DashboardBundle, WorkflowData } from "../types";
import { T } from "../constants";
import { Card, CardHeader, Dot, Ico } from "../primitives";

function workflowStatusPieMeta(statusRaw: string): { label: string; color: string } {
  const st = String(statusRaw || "").toLowerCase();
  if (st === "completed" || st === "success" || st === "succeeded" || st === "ok") {
    return { label: "Completed", color: T.accent };
  }
  if (st === "failed" || st === "error") {
    return { label: "Failed", color: T.red };
  }
  if (st === "timeout") {
    return { label: "Timeout", color: T.red };
  }
  if (st === "running") {
    return { label: "Running", color: T.amber };
  }
  if (st === "cancelled") {
    return { label: "Cancelled", color: T.muted };
  }
  return { label: statusRaw || "unknown", color: T.text };
}

export function WorkflowPanel({
  data,
  workflowStats,
}: {
  data: WorkflowData | null;
  workflowStats?: DashboardBundle["workflow_stats"];
}) {
  const byStatus = new Map<string, number>();
  for (const row of workflowStats || []) {
    const st = String(row.status || "unknown");
    byStatus.set(st, (byStatus.get(st) || 0) + (Number(row.cnt) || 0));
  }
  const totalPie = [...byStatus.values()].reduce((s, n) => s + n, 0);
  const pieFromBundle =
    totalPie > 0
      ? [...byStatus.entries()].map(([status, cnt]) => {
          const { label, color } = workflowStatusPieMeta(status);
          return {
            name: label,
            value: Math.round((cnt / totalPie) * 1000) / 10,
            color,
            _key: `${status}:${label}`,
          };
        })
      : null;
  const pieDefault = [
    { name: "Completed", value: 74, color: T.accent },
    { name: "Succeeded", value: 16, color: T.green },
    { name: "Failed", value: 7, color: T.red },
    { name: "Running", value: 3, color: T.amber },
  ];
  const pie = pieFromBundle?.length ? pieFromBundle : pieDefault;
  const total = totalPie > 0 ? totalPie : data?.total || 1248;

  const byKey = new Map<string, number>();
  for (const row of workflowStats || []) {
    const k = String(row.workflow_key || "(none)");
    byKey.set(k, (byKey.get(k) || 0) + (Number(row.cnt) || 0));
  }
  const intentsFromBundle = [...byKey.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([intent, count]) => ({ intent, count }));
  const intents =
    intentsFromBundle.length > 0
      ? intentsFromBundle
      : data?.by_intent?.slice(0, 5) || [
          { intent: "code_gen", count: 341 },
          { intent: "file_ops", count: 279 },
          { intent: "search", count: 214 },
          { intent: "deploy", count: 187 },
          { intent: "mcp_tool", count: 156 },
        ];
  const maxI = Math.max(...intents.map((i) => i.count), 1);
  return (
    <Card>
      <CardHeader icon={Ico.cpu} title="Batch / Workflow" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
          <ResponsiveContainer width={88} height={88}>
            <PieChart>
              <Pie data={pie} cx="50%" cy="50%" innerRadius={26} outerRadius={42} dataKey="value" strokeWidth={0}>
                {pie.map((e, i) => (
                  <Cell key={"_key" in e ? String((e as { _key: string })._key) : i} fill={e.color} />
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
            <span style={{ fontSize: 13, fontWeight: 700 }}>{total >= 1000 ? `${(total / 1000).toFixed(1)}K` : String(Math.round(total))}</span>
            <span style={{ fontSize: 8, color: T.muted }}>runs</span>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          {pie.map((e) => (
            <div key={e.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Dot c={e.color} />
                <span style={{ fontSize: 10, color: T.muted }}>{e.name}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{e.value}%</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
        <div
          style={{
            fontSize: 9,
            color: T.muted,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 7,
          }}
        >
          By workflow_key
        </div>
        {intents.map((it) => (
          <div key={it.intent} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <div
              style={{
                fontSize: 9,
                color: T.muted,
                width: 60,
                flexShrink: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {it.intent}
            </div>
            <div style={{ flex: 1, height: 4, background: T.track, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(it.count / maxI) * 100}%`, background: T.accent, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 9, color: T.muted, width: 26, textAlign: "right" }}>{it.count}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
