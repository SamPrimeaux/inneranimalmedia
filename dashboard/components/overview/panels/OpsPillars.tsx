import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DashboardBundle } from "../types";
import { T, fmt, spendPivot } from "../constants";
import { Sparkline, Skel, Ico } from "../primitives";

const GRID_STYLE = `
.ov-pillars {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) {
  .ov-pillars { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .ov-pillars { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.ov-pillar {
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  background: var(--dashboard-panel, #0a1620);
  border: 1px solid var(--dashboard-border, rgba(148,163,184,0.14));
  border-radius: var(--border-radius, 10px);
  padding: 14px 16px;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  transition: border-color 0.15s ease;
}
.ov-pillar:hover {
  border-color: color-mix(in srgb, var(--accent-secondary, #2dd4bf) 40%, transparent);
}
.ov-pillar:focus-visible {
  outline: 2px solid var(--accent-secondary, #2dd4bf);
  outline-offset: 2px;
}
.ov-pillar-wrap--spend {
  position: relative;
  min-width: 0;
}
.ov-pillar-wrap--spend > .ov-pillar {
  width: 100%;
}
.ov-pillar-refresh {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dashboard-muted, var(--text-muted, #8aa0aa));
  opacity: 0.55;
  cursor: pointer;
  transition: opacity 0.15s ease, color 0.15s ease;
}
.ov-pillar-refresh:hover:not(:disabled) {
  opacity: 1;
  color: var(--accent-secondary, var(--solar-cyan, #2dd4bf));
}
.ov-pillar-refresh:disabled {
  cursor: wait;
  opacity: 0.35;
}
.ov-pillar-refresh svg {
  width: 16px;
  height: 16px;
}
`;

type Pillar = {
  id: string;
  title: string;
  primary: string;
  secondary?: string;
  tertiary?: string;
  badge?: string;
  trendPct?: number | null;
  spark?: number[];
  href: string;
  scrollId: string;
};

function trendBadge(pct: number | null | undefined) {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return null;
  const up = pct > 0;
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: up ? T.red : T.green,
        marginLeft: 6,
      }}
    >
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

function sumSpendSpark(rows: NonNullable<DashboardBundle["spend_by_day_provider"]>): number[] {
  const pivoted = spendPivot(rows);
  return pivoted.map((r) => r.openai + r.anthropic + r.google + r.meta + r.other);
}

function sumWfSpark(ts: NonNullable<DashboardBundle["workflow_timeseries"]>): number[] {
  return ts.map((r) => (Number(r.succeeded) || 0) + (Number(r.failed) || 0) + (Number(r.running) || 0));
}

function seriesHasNonZero(values: number[]) {
  return values.some((v) => v > 0);
}

export function OpsPillars({
  bundle,
  loading,
  onRefreshSpend,
  refreshingSpend = false,
}: {
  bundle: DashboardBundle | null;
  loading: boolean;
  /** Same handler as the former top-bar Refresh (reloads overview bundle / spend). */
  onRefreshSpend?: () => void;
  refreshingSpend?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const onOverview = location.pathname === "/dashboard/overview" || location.pathname === "/dashboard/overview/";
  const live = bundle?.ok === true && bundle.kpis != null;
  const k = bundle?.kpis ?? {};

  const pillars: Pillar[] = useMemo(() => {
    const monthlyBurn = Number(k.monthly_burn_usd) || 0;
    const priorBurn = Number(k.prior_monthly_burn_usd) || 0;
    const burnTrend =
      priorBurn > 0 && live ? ((monthlyBurn - priorBurn) / priorBurn) * 100 : null;

    const tokens7 = Number(k.tokens_7d) || 0;
    const agentCalls7 = Number(k.agent_calls_7d) || 0;
    const mcpToday = Number(k.mcp_calls_today) || 0;
    const wfOk = Number(k.workflow_runs_today_success) || 0;
    const wfFail = Number(k.workflow_runs_today_failed) || 0;
    const openTasks = Number(k.open_tasks) || 0;
    const plansN = bundle?.active_plans?.length ?? 0;
    const healthRatio = k.worker_health_ratio;
    const healthPrimary =
      healthRatio != null && Number.isFinite(Number(healthRatio))
        ? `${Number(healthRatio).toFixed(1)}%`
        : "--";
    const push7 = Number(k.github_push_events_7d) || 0;
    const deployOk = Number(bundle?.deployment_stats?.succeeded) || 0;

    const spendSpark =
      bundle?.spend_by_day_provider?.length && seriesHasNonZero(sumSpendSpark(bundle.spend_by_day_provider))
        ? sumSpendSpark(bundle.spend_by_day_provider)
        : undefined;
    const wfSpark =
      bundle?.workflow_timeseries?.length && seriesHasNonZero(sumWfSpark(bundle.workflow_timeseries))
        ? sumWfSpark(bundle.workflow_timeseries)
        : undefined;

    const showTokens = live ? tokens7 > 0 : false;
    const showAgentCalls = live ? agentCalls7 > 0 : false;
    const showPush = live ? push7 > 0 : false;
    const showDeploys = live ? deployOk > 0 : false;

    return [
      {
        id: "spend",
        title: "Spend and usage",
        primary: live ? fmt.usd(monthlyBurn) : "--",
        secondary: showTokens ? `${fmt.tok(tokens7)} tokens` : undefined,
        tertiary: showAgentCalls ? `${fmt.num(agentCalls7)} calls` : undefined,
        trendPct: burnTrend,
        spark: spendSpark,
        href: "/dashboard/analytics/costs",
        scrollId: "spend-chart",
      },
      {
        id: "execution",
        title: "Execution",
        primary: live ? fmt.num(agentCalls7) : "--",
        secondary: live ? `OK ${wfOk} / failed ${wfFail}` : undefined,
        badge: mcpToday > 0 ? `${fmt.num(mcpToday)} MCP today` : undefined,
        spark: wfSpark,
        href: "/dashboard/analytics/agent",
        scrollId: "workflow-runs",
      },
      {
        id: "plans",
        title: "Plans and work",
        primary: live ? String(openTasks) : "--",
        secondary: live ? `${plansN} active plans` : undefined,
        href: "/dashboard/tasks?plan_status=active",
        scrollId: "active-plans",
      },
      {
        id: "platform",
        title: "Platform",
        primary: healthPrimary,
        secondary: showPush ? `${fmt.num(push7)} pushes 7d` : undefined,
        tertiary: showDeploys ? `${fmt.num(deployOk)} deploys` : undefined,
        href: "/dashboard/analytics/deploys",
        scrollId: "deployments-timeline",
      },
    ];
  }, [bundle, k, live]);

  const handleClick = (p: Pillar) => {
    if (onOverview) {
      const el = document.getElementById(p.scrollId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    navigate(p.href);
  };

  return (
    <>
      <style>{GRID_STYLE}</style>
      <div className="ov-pillars" role="group" aria-label="Operations pillars">
        {pillars.map((p) => {
          const body = (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted }}>
                {p.title}
              </div>
              {loading ? (
                <>
                  <Skel h={22} w="50%" />
                  <Skel h={32} />
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{p.primary}</span>
                    {trendBadge(p.trendPct)}
                    {p.badge ? (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: T.accent,
                          background: `color-mix(in srgb, ${T.accent} 12%, transparent)`,
                          padding: "2px 8px",
                          borderRadius: 20,
                          marginLeft: "auto",
                        }}
                      >
                        {p.badge}
                      </span>
                    ) : null}
                  </div>
                  {p.spark && p.spark.length >= 2 ? (
                    <Sparkline data={p.spark} color={T.accent} h={32} w={120} />
                  ) : null}
                  {p.secondary ? (
                    <div style={{ fontSize: 10, color: T.muted }}>{p.secondary}</div>
                  ) : null}
                  {p.tertiary ? (
                    <div style={{ fontSize: 10, color: T.muted }}>{p.tertiary}</div>
                  ) : null}
                </>
              )}
            </>
          );

          if (p.id === "spend" && onRefreshSpend) {
            return (
              <div key={p.id} className="ov-pillar-wrap--spend" data-pillar={p.id}>
                <button
                  type="button"
                  className="ov-pillar-refresh"
                  aria-label="Refresh spend and usage"
                  title="Refresh spend and usage"
                  disabled={refreshingSpend || loading}
                  onClick={() => onRefreshSpend()}
                >
                  {Ico.refresh}
                </button>
                <button type="button" className="ov-pillar" style={{ width: "100%", border: "none" }} onClick={() => handleClick(p)}>
                  {body}
                </button>
              </div>
            );
          }

          return (
            <button key={p.id} type="button" className="ov-pillar" onClick={() => handleClick(p)} data-pillar={p.id}>
              {body}
            </button>
          );
        })}
      </div>
    </>
  );
}
