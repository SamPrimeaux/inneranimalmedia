/**
 * Overview — remaster v2 (modular)
 * Inner Animal Media · Agent Sam Observability
 * Layout/typography use the same :root tokens as the rest of the dashboard.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ActivityData, AgentActivity, DashboardBundle, DeployData, KpiDef, KpiStripData, WorkflowData } from "./types";
import { T, fmt, seedArr, dashboardBundleUrl } from "./constants";
import { Ico } from "./primitives";
import { KpiStrip } from "./panels/KpiStrip";
import { SpendChart } from "./panels/SpendChart";
import { WorkflowPanel } from "./panels/WorkflowPanel";
import { TopServices } from "./panels/TopServices";
import { BudgetCard } from "./panels/BudgetCard";
import { WorkflowRunsChart } from "./panels/WorkflowRunsChart";
import { ToolWaterfall } from "./panels/ToolWaterfall";
import { ErrorInbox } from "./panels/ErrorInbox";
import { TokensChart } from "./panels/TokensChart";
import { SystemPulseGrid } from "./panels/SystemPulseGrid";
import { ModelLeaderboard } from "./panels/ModelLeaderboard";
import { CostLatency } from "./panels/CostLatency";
import { RoutingDecisions } from "./panels/RoutingDecisions";
import { RagHealth } from "./panels/RagHealth";
import { DeploymentsTimeline } from "./panels/DeploymentsTimeline";
import { SystemHealth } from "./panels/SystemHealth";
import { ActiveProjects } from "./panels/ActiveProjects";
import { QuickNav } from "./panels/QuickNav";

export default function OverviewPage() {
  const [kpi, setKpi] = useState<KpiStripData | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [agent, setAgent] = useState<AgentActivity | null>(null);
  const [wf, setWf] = useState<WorkflowData | null>(null);
  const [dep, setDep] = useState<DeployData | null>(null);
  const [bundle, setBundle] = useState<DashboardBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, a, ag, w, d, b] = await Promise.allSettled([
        fetch("/api/overview/kpi-strip").then((r) => r.json()),
        fetch("/api/overview/activity-strip").then((r) => r.json()),
        fetch("/api/overview/agent-activity").then((r) => r.json()),
        fetch("/api/overview/commands-workflows").then((r) => r.json()),
        fetch("/api/overview/deployments").then((r) => r.json()),
        fetch(dashboardBundleUrl()).then((r) => r.json()),
      ]);
      if (k.status === "fulfilled") setKpi(k.value);
      if (a.status === "fulfilled") setActivity(a.value);
      if (ag.status === "fulfilled") setAgent(ag.value);
      if (w.status === "fulfilled") setWf(w.value);
      if (d.status === "fulfilled") setDep(d.value);
      if (b.status === "fulfilled") setBundle(b.value as DashboardBundle);
    } finally {
      setLoading(false);
      setTs(new Date());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cost = kpi?.cost_usd ?? 0;
  const calls = activity?.weekly_activity?.agent_calls ?? kpi?.api_calls ?? 0;
  const hrs = activity?.worked_this_week?.hours_this_week ?? 0;
  const mcp = kpi?.mcp_calls ?? 0;
  const top = activity?.projects?.top ?? [];

  const BK = bundle?.kpis;
  const liveKpi = bundle?.ok === true && BK != null;

  const monthlyBurn = liveKpi ? Number(BK.monthly_burn_usd) || 0 : cost || 37245;
  const agentCalls7 = liveKpi ? Number(BK.agent_calls_7d) || 0 : calls || 128900;
  const tokens7 = liveKpi ? Number(BK.tokens_7d) || 0 : 1_280_000;
  const mcpToday = liveKpi ? Number(BK.mcp_calls_today) || 0 : mcp || 5842;
  const hoursWeekDistinct = liveKpi ? Number(BK.hours_week_distinct) || 0 : Math.round(hrs || 24.6);
  const openTasksStr = liveKpi ? String(Number(BK.open_tasks) || 0) : "247";
  const healthRatio = BK?.worker_health_ratio;
  const healthPct =
    liveKpi && healthRatio != null && Number.isFinite(Number(healthRatio))
      ? `${Number(healthRatio).toFixed(1)}%`
      : liveKpi
        ? "—"
        : "95%";
  const push7dStr = liveKpi ? String(Number(BK.github_push_events_7d) || 0) : "42";
  const wfRunsToday = liveKpi ? String(Number(BK.workflow_runs_today_total) || 0) : "128";
  const wfRunsTodayCmp = liveKpi
    ? `OK ${Number(BK.workflow_runs_today_success) || 0} · fail ${Number(BK.workflow_runs_today_failed) || 0}`
    : "vs yesterday 112";

  const topSvcEvents = useMemo(() => {
    if (bundle?.top_services?.length) {
      return bundle.top_services.map((t) => ({
        type: String(t.tool_name || "tool"),
        count: Math.round(Number(t.total_calls) || 0),
      }));
    }
    return agent?.events ?? [];
  }, [bundle?.top_services, agent?.events]);

  const kpis: KpiDef[] = [
    { icon: Ico.flame, label: "Monthly Burn", value: fmt.usd(monthlyBurn), trend: liveKpi ? 0 : 12.4, compare: liveKpi ? "MTD · agentsam_usage_events" : `vs last 7d ${fmt.usd(monthlyBurn * 0.88)}`, spark: seedArr(monthlyBurn, 9), color: T.amber },
    { icon: Ico.zap, label: "Agent Calls", value: fmt.num(agentCalls7), trend: liveKpi ? 0 : 18.6, compare: liveKpi ? "Last 7d · usage_events" : `vs last 7d ${fmt.num(agentCalls7 * 0.84)}`, spark: seedArr(agentCalls7, 9), color: T.accent },
    { icon: Ico.cpu, label: "Tokens", value: fmt.tok(tokens7), trend: liveKpi ? 0 : 5.2, compare: liveKpi ? "7d · tokens_in + tokens_out" : "cached + live", spark: seedArr(Math.min(tokens7 / 1e3, 999_999), 9), color: T.blue },
    { icon: Ico.tool, label: "MCP Calls Today", value: fmt.num(mcpToday), trend: liveKpi ? 0 : 23.1, compare: liveKpi ? "agentsam_mcp_tool_execution" : `vs yesterday ${fmt.num(mcpToday * 0.81)}`, spark: seedArr(mcpToday, 9), color: T.accent },
    { icon: Ico.route, label: "Workflow Runs Today", value: wfRunsToday, trend: liveKpi ? 0 : 6.2, compare: liveKpi ? wfRunsTodayCmp : "agentsam_workflow_runs", spark: seedArr(Number(wfRunsToday) || 128, 9), color: T.violet },
    { icon: Ico.clock, label: "Hours This Week", value: fmt.num(hoursWeekDistinct), trend: liveKpi ? 0 : 14.2, compare: liveKpi ? "Distinct hour buckets" : `vs last week ${fmt.hrs((hrs || 24.6) * 0.88)}`, spark: seedArr(hoursWeekDistinct || 24, 9), color: T.green },
    { icon: Ico.list, label: "Open Tasks", value: openTasksStr, trend: liveKpi ? 0 : 9.8, compare: liveKpi ? "agentsam_plans Σ(tasks_total−done)" : "vs yesterday 225", spark: seedArr(Number(openTasksStr) || 247, 9), color: T.amber },
    { icon: Ico.pulse, label: "Worker Health", value: healthPct, trend: liveKpi ? 0 : -4.2, compare: liveKpi ? "Latest deployment_health / worker" : "vs last 7d 91%", spark: seedArr(liveKpi && healthRatio != null ? Number(healthRatio) : 95, 9), color: T.green },
    { icon: Ico.deploy, label: "GitHub Push", value: push7dStr, trend: liveKpi ? 0 : 8.0, compare: liveKpi ? "Webhook push · 7d" : "deploy feed", spark: seedArr(Number(push7dStr) || 42, 9), color: T.violet },
  ];

  const timeStr = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <>
      <style>{`
        @keyframes ovpulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .ov-wrap *{box-sizing:border-box;}
        .ov-wrap a{color:var(--accent-secondary, var(--solar-cyan, #2dd4bf));}
      `}</style>
      <div className="ov-wrap" style={{ fontFamily: T.font, background: T.bg, color: T.text, minHeight: "100vh", padding: "22px 26px", overflowX: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted, marginBottom: 4 }}>OPS OVERVIEW</div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Overview</h1>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: T.muted }}>Live cost, health, and execution telemetry</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: T.muted }}>Last refreshed: {timeStr}</span>
            <a href="/dashboard/analytics" style={{ fontSize: 10, textDecoration: "none" }}>
              Health dashboard →
            </a>
            <button
              onClick={load}
              style={{
                fontSize: 11,
                color: T.accent,
                background: "color-mix(in srgb, var(--accent-secondary, var(--solar-cyan)) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent-secondary, var(--solar-cyan)) 28%, transparent)",
                borderRadius: 7,
                padding: "6px 14px",
                cursor: "pointer",
                fontFamily: T.font,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {Ico.refresh} Refresh
            </button>
          </div>
        </div>

        <QuickNav />

        <KpiStrip kpis={kpis} loading={loading} />

        <div style={{ display: "grid", gridTemplateColumns: "3fr 1.1fr 1.1fr 1.1fr", gap: 10, marginBottom: 10 }}>
          <SpendChart spendRows={bundle?.spend_by_day_provider} />
          <WorkflowPanel data={wf} workflowStats={bundle?.workflow_stats} />
          <TopServices events={topSvcEvents} />
          <BudgetCard cost={cost} budget={bundle?.budget} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0 12px", borderTop: `1px solid ${T.border}` }}>
          <span style={{ color: T.muted, display: "flex" }}>{Ico.pulse}</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.muted }}>System Pulse / Execution Analytics</span>
        </div>

        <SystemPulseGrid>
          <div id="workflow-runs">
            <WorkflowRunsChart workflowTimeseries={bundle?.workflow_timeseries} stackRows={bundle?.workflow_by_day_status} />
          </div>
          <div id="tool-waterfall">
            <ToolWaterfall toolWaterfall={bundle?.tool_waterfall} />
          </div>
          <div id="error-inbox">
            <ErrorInbox errorLog={bundle?.error_log} errorSeverityTimeseries={bundle?.error_severity_timeseries} />
          </div>
          <div id="tokens-chart">
            <TokensChart tokenTimeseries={bundle?.token_timeseries} />
          </div>
        </SystemPulseGrid>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <ModelLeaderboard perfRows={bundle?.model_leaderboard} />
          <CostLatency costLatency={bundle?.cost_latency} />
          <RoutingDecisions arms={bundle?.routing_arms} routingTimeseries={bundle?.routing_timeseries} />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <RagHealth />
          <DeploymentsTimeline
            data={dep}
            ghEvents={bundle?.github_push_events}
            deploymentStats={bundle?.deployment_stats}
            deploymentTimeseries={bundle?.deployment_timeseries}
          />
          <SystemHealth crons={bundle?.cron_latest} cronHeatmap={bundle?.cron_heatmap} />
        </div>

        <ActiveProjects projects={top} plans={bundle?.active_plans} />
      </div>
    </>
  );
}
