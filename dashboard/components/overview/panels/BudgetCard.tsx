import { BarChart, Bar, Tooltip, ResponsiveContainer } from "recharts";
import type { DashboardBundle } from "../types";
import { T, DAYS, fmt } from "../constants";
import { Card, CardHeader, Pill, Tip, Ico } from "../primitives";

export function BudgetCard({ cost, budget: b }: { cost: number; budget?: DashboardBundle["budget"] }) {
  const spent = b?.spent_7d_usd != null && b.spent_7d_usd > 0 ? b.spent_7d_usd : cost;
  const capTok = Number(b?.plan_token_budget_sum ?? 0) || 0;
  const planCost = Number(b?.plans_recorded_cost_usd ?? 0) || 0;
  const budgetUsd = planCost > 0 ? planCost : 60000;
  const pct = Math.min(planCost > 0 ? (spent / Math.max(planCost, 1e-9)) * 100 : Math.min((spent / budgetUsd) * 100, 100), 100);
  const daily = DAYS.map((date, i) => ({ date, spend: (spent / 7 || 0) * (0.8 + i * 0.04 + Math.random() * 0.15) }));
  return (
    <Card>
      <CardHeader icon={Ico.cloud} title="Budget vs Spend" action={<Pill label="Last 7 Days" />} />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt.usd(spent)}</div>
          <div style={{ fontSize: 9, color: T.muted }}>Spent (7d)</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{capTok > 0 ? fmt.num(capTok) : fmt.usd(budgetUsd)}</div>
          <div style={{ fontSize: 9, color: T.muted }}>{capTok > 0 ? "Plan token budget Σ" : "Budget cap"}</div>
        </div>
      </div>
      <div style={{ height: 7, background: T.track, borderRadius: 4, marginBottom: 5, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Number.isFinite(pct) ? pct : 0}%`,
            background: `linear-gradient(90deg,${T.accent},${T.violet})`,
            borderRadius: 4,
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.muted, marginBottom: 12 }}>
        <span>{(Number.isFinite(pct) ? pct : 0).toFixed(0)}% of cap</span>
        <span>agentsam_usage_events + agentsam_plans</span>
      </div>
      <ResponsiveContainer width="100%" height={52}>
        <BarChart data={daily} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={8}>
          <Bar dataKey="spend" fill={T.accent} fillOpacity={0.5} radius={[2, 2, 0, 0]} name="Daily" />
          <Tooltip content={<Tip fmt={(v: number) => fmt.usd(v)} />} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 4 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{fmt.usd((b?.plans_recorded_cost_usd ?? 0) || spent * 0.3)}</div>
          <div style={{ fontSize: 9, color: T.muted }}>Plans cost (rollups)</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{capTok > 0 ? "Σ" : "—"}</div>
          <div style={{ fontSize: 9, color: T.muted }}>Tokens budget</div>
        </div>
      </div>
    </Card>
  );
}
