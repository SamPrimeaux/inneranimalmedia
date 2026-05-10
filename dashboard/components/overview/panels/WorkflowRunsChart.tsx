import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { DashboardBundle } from "../types";
import { T, DAYS, workflowStackRows } from "../constants";
import { Card, CardHeader, Dot, Pill, Tip, Ico } from "../primitives";

export function WorkflowRunsChart({
  workflowTimeseries,
  stackRows,
}: {
  workflowTimeseries?: DashboardBundle["workflow_timeseries"];
  stackRows?: DashboardBundle["workflow_by_day_status"];
}) {
  const data =
    workflowTimeseries && workflowTimeseries.length > 0
      ? workflowTimeseries.map((r) => ({
          date: String(r.date || "").slice(5),
          succeeded: Number(r.succeeded) || 0,
          failed: Number(r.failed) || 0,
          running: Number(r.running) || 0,
        }))
      : stackRows?.length
        ? workflowStackRows(stackRows)
        : DAYS.map((date) => ({ date, succeeded: 0, failed: 0, running: 0 }));
  return (
    <Card>
      <CardHeader icon={Ico.cpu} title="Workflow Runs Over Time" action={<Pill label="Last 7 Days" />} />
      <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
        {[
          ["Succeeded", T.accent],
          ["Failed", T.red],
          ["Running", T.amber],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted }}>
            <Dot c={c} />
            {l}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} />
          <Tooltip content={<Tip />} />
          <Bar dataKey="succeeded" stackId="a" fill={T.accent} name="Succeeded" />
          <Bar dataKey="failed" stackId="a" fill={T.red} name="Failed" />
          <Bar dataKey="running" stackId="a" fill={T.amber} name="Running" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
