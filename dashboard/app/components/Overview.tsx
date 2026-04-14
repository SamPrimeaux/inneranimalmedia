/**
 * dashboard/app/src/components/Overview.tsx
 * Root dashboard analytics view.
 * Fetches from /api/overview — does NOT require a workspace UUID.
 * Workspace-scoped data is loaded separately and only when a workspace is active.
 */

import { useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewStats {
  tasksCompleted: number;
  totalDeploys: number;
  agentCalls: number;
  platformHealth: 'OK' | 'DEGRADED' | 'DOWN';
  activeWorkspaces: number;
  r2Objects: number;
  mcpToolCalls: number;
  aiUsageToday: number;
  recentDeployments: RecentDeploy[];
  topModels: ModelStat[];
}

interface RecentDeploy {
  id: string;
  environment: string;
  version: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
}

interface ModelStat {
  model: string;
  calls: number;
  tokens: number;
}

type LoadState = 'idle' | 'loading' | 'ok' | 'error';

// ── Component ─────────────────────────────────────────────────────────────────

export function Overview() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const res = await fetch('/api/overview', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error(`/api/overview returned ${res.status}`);
      const data = await res.json();
      setStats(normalizeStats(data));
      setLastRefresh(new Date());
      setLoadState('ok');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load overview');
      setLoadState('error');
    }
  }, []);

  // Initial load + 60s auto-refresh
  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="ov-root">
      <header className="ov-header">
        <div className="ov-header-left">
          <h1 className="ov-title">Overview</h1>
          {lastRefresh && (
            <span className="ov-refresh-hint">
              Updated {formatRelativeTime(lastRefresh)}
            </span>
          )}
        </div>
        <button
          className="ov-refresh-btn"
          onClick={load}
          disabled={loadState === 'loading'}
          aria-label="Refresh overview"
        >
          <RefreshIcon spinning={loadState === 'loading'} />
        </button>
      </header>

      {loadState === 'error' && (
        <div className="ov-error-banner" role="alert">
          <span className="ov-error-icon">⚠</span>
          <span>{error}</span>
          <button className="ov-error-retry" onClick={load}>Retry</button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <section className="ov-grid-primary" aria-label="Platform analytics">
        <StatCard
          icon={<CheckIcon />}
          label="Tasks Completed"
          value={stats?.tasksCompleted}
          loading={loadState === 'loading'}
          accent="teal"
        />
        <StatCard
          icon={<DeployIcon />}
          label="Total Deploys"
          value={stats?.totalDeploys}
          loading={loadState === 'loading'}
          accent="blue"
        />
        <StatCard
          icon={<AgentIcon />}
          label="Agent Calls"
          value={stats?.agentCalls}
          loading={loadState === 'loading'}
          accent="purple"
          format="compact"
        />
        <StatCard
          icon={<HealthIcon status={stats?.platformHealth} />}
          label="Platform Health"
          value={stats?.platformHealth ?? '—'}
          loading={loadState === 'loading'}
          accent={healthAccent(stats?.platformHealth)}
          valueClass={`ov-health-${(stats?.platformHealth ?? 'unknown').toLowerCase()}`}
        />
      </section>

      {/* Secondary KPI Grid */}
      <section className="ov-grid-secondary" aria-label="Additional metrics">
        <StatCard
          icon={<WorkspaceIcon />}
          label="Active Workspaces"
          value={stats?.activeWorkspaces}
          loading={loadState === 'loading'}
          accent="teal"
          size="sm"
        />
        <StatCard
          icon={<StorageIcon />}
          label="R2 Objects"
          value={stats?.r2Objects}
          loading={loadState === 'loading'}
          accent="blue"
          size="sm"
          format="compact"
        />
        <StatCard
          icon={<MCPIcon />}
          label="MCP Tool Calls"
          value={stats?.mcpToolCalls}
          loading={loadState === 'loading'}
          accent="purple"
          size="sm"
          format="compact"
        />
        <StatCard
          icon={<AIIcon />}
          label="AI Calls Today"
          value={stats?.aiUsageToday}
          loading={loadState === 'loading'}
          accent="orange"
          size="sm"
          format="compact"
        />
      </section>

      <div className="ov-grid-bottom">
        {/* Recent Deployments */}
        <section className="ov-panel" aria-label="Recent deployments">
          <div className="ov-panel-header">
            <DeployIcon />
            <h2 className="ov-panel-title">Recent Deployments</h2>
          </div>
          <div className="ov-deploy-list">
            {loadState === 'loading' ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="ov-skeleton ov-skeleton-row" />
              ))
            ) : stats?.recentDeployments?.length ? (
              stats.recentDeployments.map((d) => (
                <DeployRow key={d.id} deploy={d} />
              ))
            ) : (
              <p className="ov-empty">No recent deployments</p>
            )}
          </div>
        </section>

        {/* Top Models */}
        <section className="ov-panel" aria-label="AI model usage">
          <div className="ov-panel-header">
            <AIIcon />
            <h2 className="ov-panel-title">Model Usage</h2>
          </div>
          <div className="ov-model-list">
            {loadState === 'loading' ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="ov-skeleton ov-skeleton-row" />
              ))
            ) : stats?.topModels?.length ? (
              stats.topModels.map((m, i) => (
                <ModelRow key={m.model} model={m} rank={i + 1} topCalls={stats.topModels[0].calls} />
              ))
            ) : (
              <p className="ov-empty">No model data</p>
            )}
          </div>
        </section>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  loading,
  accent = 'teal',
  format,
  size = 'lg',
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | undefined;
  loading: boolean;
  accent?: string;
  format?: 'compact';
  size?: 'lg' | 'sm';
  valueClass?: string;
}) {
  const display = value === undefined
    ? '—'
    : typeof value === 'number' && format === 'compact'
      ? compactNumber(value)
      : typeof value === 'number'
        ? value.toLocaleString()
        : value;

  return (
    <div className={`ov-stat-card ov-stat-card--${size} ov-accent-${accent}`} data-loading={loading}>
      <div className="ov-stat-icon">{icon}</div>
      <div className="ov-stat-body">
        <span className="ov-stat-label">{label}</span>
        {loading
          ? <div className="ov-skeleton ov-skeleton-value" />
          : <span className={`ov-stat-value ${valueClass ?? ''}`}>{display}</span>
        }
      </div>
    </div>
  );
}

function DeployRow({ deploy }: { deploy: RecentDeploy }) {
  return (
    <div className="ov-deploy-row">
      <span className={`ov-deploy-dot ov-deploy-dot--${deploy.status}`} aria-label={deploy.status} />
      <span className="ov-deploy-env">{deploy.environment}</span>
      <span className="ov-deploy-ver">{deploy.version}</span>
      <span className="ov-deploy-time">{formatRelativeTime(new Date(deploy.timestamp))}</span>
    </div>
  );
}

function ModelRow({ model, rank, topCalls }: { model: ModelStat; rank: number; topCalls: number }) {
  const pct = topCalls > 0 ? Math.round((model.calls / topCalls) * 100) : 0;
  return (
    <div className="ov-model-row">
      <span className="ov-model-rank">#{rank}</span>
      <div className="ov-model-info">
        <span className="ov-model-name">{model.model}</span>
        <div className="ov-model-bar-track">
          <div className="ov-model-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="ov-model-calls">{compactNumber(model.calls)}</span>
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'ov-spin 1s linear infinite' } : {}}>
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function CheckIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
}
function DeployIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
}
function AgentIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
}
function HealthIcon({ status }: { status?: string }) {
  const color = status === 'OK' ? '#4ade80' : status === 'DEGRADED' ? '#fb923c' : '#f87171';
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
}
function WorkspaceIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
}
function StorageIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3S3 13.66 3 12"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
}
function MCPIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/></svg>;
}
function AIIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function normalizeStats(raw: any): OverviewStats {
  return {
    tasksCompleted:    raw.tasksCompleted    ?? raw.tasks_completed    ?? 0,
    totalDeploys:      raw.totalDeploys      ?? raw.total_deploys      ?? 0,
    agentCalls:        raw.agentCalls        ?? raw.agent_calls        ?? 0,
    platformHealth:    raw.platformHealth    ?? raw.platform_health    ?? 'OK',
    activeWorkspaces:  raw.activeWorkspaces  ?? raw.active_workspaces  ?? 0,
    r2Objects:         raw.r2Objects         ?? raw.r2_objects         ?? 0,
    mcpToolCalls:      raw.mcpToolCalls      ?? raw.mcp_tool_calls     ?? 0,
    aiUsageToday:      raw.aiUsageToday      ?? raw.ai_usage_today     ?? 0,
    recentDeployments: raw.recentDeployments ?? raw.recent_deployments ?? [],
    topModels:         raw.topModels         ?? raw.top_models         ?? [],
  };
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function healthAccent(h?: string): string {
  return h === 'OK' ? 'green' : h === 'DEGRADED' ? 'orange' : 'red';
}

function formatRelativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES = `
.ov-root {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px 32px;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  color: var(--text-main, #e5e7eb);
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}

/* Header */
.ov-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ov-header-left { display: flex; align-items: baseline; gap: 12px; }
.ov-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--text-main, #f0f4f8);
  letter-spacing: -0.3px;
}
.ov-refresh-hint { font-size: 12px; color: var(--text-muted, #6b7280); }
.ov-refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.ov-refresh-btn:hover { background: rgba(255,255,255,0.08); color: var(--text-main, #e5e7eb); }
.ov-refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Error banner */
.ov-error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  background: rgba(239,68,68,0.12);
  border: 1px solid rgba(239,68,68,0.25);
  font-size: 13px;
  color: #fca5a5;
}
.ov-error-icon { font-size: 16px; }
.ov-error-retry {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(239,68,68,0.4);
  background: rgba(239,68,68,0.15);
  color: #fca5a5;
  font-size: 12px;
  cursor: pointer;
}
.ov-error-retry:hover { background: rgba(239,68,68,0.25); }

/* Primary grid — 4 equal columns */
.ov-grid-primary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

/* Secondary grid — 4 equal columns, smaller cards */
.ov-grid-secondary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

/* Stat cards */
.ov-stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 12px;
  background: var(--bg-card, rgba(255,255,255,0.04));
  border: 1px solid rgba(255,255,255,0.07);
  transition: border-color 0.2s, background 0.2s;
}
.ov-stat-card:hover {
  border-color: rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
}
.ov-stat-card--sm {
  padding: 14px 16px;
  gap: 10px;
}
.ov-stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 10px;
}
.ov-stat-card--sm .ov-stat-icon { width: 30px; height: 30px; border-radius: 8px; }

/* Accent colors for icons */
.ov-accent-teal   .ov-stat-icon { background: rgba(20,184,166,0.15); color: #2dd4bf; }
.ov-accent-blue   .ov-stat-icon { background: rgba(59,130,246,0.15); color: #60a5fa; }
.ov-accent-purple .ov-stat-icon { background: rgba(139,92,246,0.15); color: #a78bfa; }
.ov-accent-green  .ov-stat-icon { background: rgba(74,222,128,0.15); color: #4ade80; }
.ov-accent-orange .ov-stat-icon { background: rgba(251,146,60,0.15); color: #fb923c; }
.ov-accent-red    .ov-stat-icon { background: rgba(248,113,113,0.15); color: #f87171; }

.ov-stat-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.ov-stat-label {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  white-space: nowrap;
}
.ov-stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main, #f0f4f8);
  letter-spacing: -0.5px;
  line-height: 1;
}
.ov-stat-card--sm .ov-stat-value { font-size: 18px; }
.ov-health-ok      { color: #4ade80 !important; }
.ov-health-degraded{ color: #fb923c !important; }
.ov-health-down    { color: #f87171 !important; }

/* Bottom grid */
.ov-grid-bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* Panels */
.ov-panel {
  padding: 18px 20px;
  border-radius: 12px;
  background: var(--bg-card, rgba(255,255,255,0.04));
  border: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ov-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted, #9ca3af);
}
.ov-panel-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main, #e5e7eb);
  letter-spacing: -0.1px;
}
.ov-empty { margin: 0; font-size: 13px; color: var(--text-muted, #6b7280); }

/* Deploy rows */
.ov-deploy-list { display: flex; flex-direction: column; gap: 8px; }
.ov-deploy-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.03);
  font-size: 12.5px;
}
.ov-deploy-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ov-deploy-dot--success { background: #4ade80; box-shadow: 0 0 6px #4ade8080; }
.ov-deploy-dot--failed  { background: #f87171; box-shadow: 0 0 6px #f8717180; }
.ov-deploy-dot--pending { background: #fb923c; box-shadow: 0 0 6px #fb923c80; }
.ov-deploy-env  { font-weight: 500; color: var(--text-main, #e5e7eb); }
.ov-deploy-ver  { color: var(--text-muted, #9ca3af); font-family: monospace; font-size: 11.5px; }
.ov-deploy-time { margin-left: auto; color: var(--text-muted, #6b7280); white-space: nowrap; }

/* Model rows */
.ov-model-list { display: flex; flex-direction: column; gap: 10px; }
.ov-model-row { display: flex; align-items: center; gap: 10px; }
.ov-model-rank { font-size: 11px; color: var(--text-muted, #6b7280); width: 20px; flex-shrink: 0; }
.ov-model-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ov-model-name { font-size: 12.5px; font-weight: 500; color: var(--text-main, #e5e7eb); truncate: ellipsis; white-space: nowrap; overflow: hidden; }
.ov-model-bar-track {
  height: 3px;
  background: rgba(255,255,255,0.07);
  border-radius: 2px;
  overflow: hidden;
}
.ov-model-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #2dd4bf, #60a5fa);
  border-radius: 2px;
  transition: width 0.6s ease;
}
.ov-model-calls { font-size: 12px; color: var(--text-muted, #9ca3af); white-space: nowrap; }

/* Skeletons */
.ov-skeleton {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.06) 25%,
    rgba(255,255,255,0.10) 50%,
    rgba(255,255,255,0.06) 75%
  );
  background-size: 200% 100%;
  animation: ov-shimmer 1.4s infinite;
  border-radius: 6px;
}
.ov-skeleton-value { height: 24px; width: 80px; }
.ov-skeleton-row   { height: 36px; width: 100%; margin-bottom: 8px; }

@keyframes ov-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes ov-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 1100px) {
  .ov-grid-primary   { grid-template-columns: repeat(2, 1fr); }
  .ov-grid-secondary { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 700px) {
  .ov-root { padding: 16px; gap: 14px; }
  .ov-grid-primary   { grid-template-columns: 1fr; }
  .ov-grid-secondary { grid-template-columns: repeat(2, 1fr); }
  .ov-grid-bottom    { grid-template-columns: 1fr; }
}
`;
