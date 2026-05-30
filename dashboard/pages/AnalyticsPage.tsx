import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { AnalyticsHeader } from '../components/analytics/AnalyticsHeader';
import type { AnalyticsLayoutResponse } from '../components/analytics/types';

type Range = '24h' | '7d' | '30d' | 'all';

type HealthTone = 'healthy' | 'degraded' | 'critical' | 'neutral';

type KpiTile = {
  label: string;
  value: string;
  tone: HealthTone;
  hint?: string;
};

type RoutingArmRow = Record<string, unknown>;

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d97757',
  google: '#4285f4',
  workers_ai: '#f38020',
  cloudflare: '#f38020',
};

const RANGE_DEFAULT: Range = '7d';

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fmtPct(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v * 10) / 10}%`;
}

function fmtMs(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${Math.round((v / 1000) * 100) / 100}s`;
}

function fmtCount(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return String(Math.round(v));
}

function toneClass(tone: HealthTone): string {
  if (tone === 'healthy') return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
  if (tone === 'degraded') return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
  if (tone === 'critical') return 'text-rose-400 border-rose-500/40 bg-rose-500/10';
  return 'text-[var(--text-muted)] border-[var(--border-subtle)] bg-[var(--bg-panel)]';
}

function toolSuccessTone(rate: number | null): HealthTone {
  if (rate == null) return 'neutral';
  if (rate >= 90) return 'healthy';
  if (rate >= 70) return 'degraded';
  return 'critical';
}

function latencyTone(p95: number | null): HealthTone {
  if (p95 == null) return 'neutral';
  if (p95 <= 2000) return 'healthy';
  if (p95 <= 5000) return 'degraded';
  return 'critical';
}

function openErrorsTone(count: number | null): HealthTone {
  if (count == null) return 'neutral';
  if (count === 0) return 'healthy';
  if (count <= 5) return 'degraded';
  return 'critical';
}

function activeArmsTone(count: number | null): HealthTone {
  if (count == null) return 'neutral';
  if (count > 0) return 'healthy';
  return 'degraded';
}

function okRateTone(rate: number | null): HealthTone {
  return toolSuccessTone(rate);
}

function providerColor(provider: string): string {
  const key = String(provider || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  return PROVIDER_COLORS[key] || '#64748b';
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
      <header className="border-b border-[var(--border-subtle)] px-3 py-2">
        <h2 className="text-[13px] font-semibold text-[var(--text)]">{title}</h2>
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={`rounded-lg border p-3 ${toneClass(tile.tone)}`}
        >
          <div className="text-[10px] uppercase tracking-wide opacity-80">{tile.label}</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums">{tile.value}</div>
          {tile.hint ? <div className="mt-1 text-[10px] opacity-70">{tile.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

export const AnalyticsPage: React.FC = () => {
  const params = useParams<{ tab?: string }>();
  const legacyTab = String(params.tab || '').trim().toLowerCase();

  const [range] = useState<Range>(RANGE_DEFAULT);
  const [layout, setLayout] = useState<AnalyticsLayoutResponse | null>(null);
  const [layoutLoadedAt, setLayoutLoadedAt] = useState(0);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [leaderboard, setLeaderboard] = useState<Record<string, unknown> | null>(null);
  const [mcpTools, setMcpTools] = useState<Record<string, unknown> | null>(null);
  const [routingArms, setRoutingArms] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const q = `range=${range}`;
    const [layoutRes, overviewRes, lbRes, mcpRes, armsRes] = await Promise.all([
      getJson<AnalyticsLayoutResponse>(`/api/analytics/layout?route=${encodeURIComponent('/dashboard/analytics')}`),
      getJson<Record<string, unknown>>(`/api/analytics/overview?${q}`),
      getJson<Record<string, unknown>>(`/api/analytics/models/leaderboard?${q}`),
      getJson<Record<string, unknown>>(`/api/analytics/mcp/tools?${q}`),
      getJson<Record<string, unknown>>(`/api/analytics/models/routing-arms?${q}`),
    ]);
    setLayout(layoutRes);
    setLayoutLoadedAt(Date.now());
    setOverview(overviewRes);
    setLeaderboard(lbRes);
    setMcpTools(mcpRes);
    setRoutingArms(armsRes);
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpiTiles = useMemo((): KpiTile[] => {
    const kpis = (overview?.kpis as Record<string, { value?: Record<string, unknown> }>) || {};
    const toolVal = kpis.toolSuccess?.value || {};
    const latVal = kpis.avgLatency?.value || {};
    const errVal = kpis.openErrors?.value || {};

    const toolRate =
      toolVal.success_rate_percent != null
        ? Number(toolVal.success_rate_percent)
        : overview?.summary && typeof overview.summary === 'object'
          ? Number((overview.summary as Record<string, unknown>).tool_success_rate)
          : null;
    const p95 = latVal.p95_ms != null ? Number(latVal.p95_ms) : null;
    const openErr =
      errVal.count != null
        ? Number(errVal.count)
        : overview?.summary && typeof overview.summary === 'object'
          ? Number((overview.summary as Record<string, unknown>).open_error_count)
          : null;

    const armRows = (routingArms?.rows as RoutingArmRow[]) || [];
    const activeArms = armRows.filter(
      (r) => Number(r.is_active ?? 0) === 1 && Number(r.is_eligible ?? 0) === 1,
    ).length;

    return [
      {
        label: 'Tool success rate',
        value: toolRate != null && Number.isFinite(toolRate) ? fmtPct(toolRate) : '—',
        tone: toolSuccessTone(Number.isFinite(toolRate) ? toolRate : null),
        hint: toolVal.source_table ? String(toolVal.source_table) : 'agentsam_execution_steps',
      },
      {
        label: 'Avg latency p95',
        value: fmtMs(p95),
        tone: latencyTone(Number.isFinite(p95) ? p95 : null),
        hint: 'agentsam_execution_performance_metrics',
      },
      {
        label: 'Active routing arms',
        value: routingArms ? fmtCount(activeArms) : '—',
        tone: activeArmsTone(routingArms ? activeArms : null),
        hint: 'agentsam_routing_arms · is_active=1 · is_eligible=1',
      },
      {
        label: 'Open errors',
        value: openErr != null && Number.isFinite(openErr) ? fmtCount(openErr) : '—',
        tone: openErrorsTone(Number.isFinite(openErr) ? openErr : null),
        hint: errVal.source_table ? String(errVal.source_table) : 'agentsam_error_log',
      },
    ];
  }, [overview, routingArms]);

  const modelBarData = useMemo(() => {
    const rows = (leaderboard?.modelLeaderboard as Record<string, unknown>[]) || [];
    return rows.slice(0, 12).map((r) => ({
      name: String(r.model_key || r.model || '(unknown)'),
      runs: Number(r.executions) || 0,
      provider: String(r.provider || ''),
      fill: providerColor(String(r.provider || '')),
    }));
  }, [leaderboard]);

  const scatterData = useMemo(() => {
    const rows = (leaderboard?.costLatencyScatter as Record<string, unknown>[]) || [];
    return rows
      .filter((r) => Number(r.avg_latency_ms) > 0 || Number(r.avg_cost_usd) > 0)
      .map((r) => ({
        name: `${String(r.model_key)} · ${String(r.provider || '')}`,
        x: Number(r.avg_latency_ms) || 0,
        y: Number(r.avg_cost_usd) || 0,
        z: Math.max(Number(r.executions) || 1, 1),
        provider: String(r.provider || ''),
      }));
  }, [leaderboard]);

  const toolRows = useMemo(() => {
    const rows = (mcpTools?.rows as Record<string, unknown>[]) || [];
    return rows.slice(0, 15).map((r) => {
      const calls = Number(r.calls) || 0;
      const ok = Number(r.successes) || 0;
      const rate = calls > 0 ? Math.round((ok / calls) * 1000) / 10 : null;
      return {
        tool_name: String(r.tool_name || '(unknown)'),
        okRate: rate,
        calls,
        tone: okRateTone(rate),
      };
    });
  }, [mcpTools]);

  const chainBreakSummary = useMemo(() => {
    const breaks = (mcpTools?.breakdowns as { rows?: Record<string, unknown>[] }[])?.[0]?.rows || [];
    const byTool = new Map<string, { count: number; lastSeen: number | null; lastError: string }>();
    for (const row of breaks) {
      const name = String(row.tool_name || '(unknown)');
      const seen = row.started_at != null ? Number(row.started_at) : row.completed_at != null ? Number(row.completed_at) : null;
      const prev = byTool.get(name) || { count: 0, lastSeen: null, lastError: '' };
      prev.count += 1;
      if (seen != null && (prev.lastSeen == null || seen > prev.lastSeen)) {
        prev.lastSeen = seen;
        prev.lastError = String(row.error_message || '');
      }
      byTool.set(name, prev);
    }
    return [...byTool.entries()]
      .map(([tool_name, v]) => ({ tool_name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [mcpTools]);

  const routingArmBars = useMemo(() => {
    const rows = (routingArms?.rows as RoutingArmRow[]) || [];
    return rows
      .map((r) => {
        const alpha = Number(r.success_alpha ?? 1);
        const beta = Number(r.success_beta ?? 1);
        const denom = alpha + beta;
        const confidence = denom > 0 ? alpha / denom : null;
        return {
          id: String(r.id || r.arm_key || `${r.model_key}-${r.task_type}`),
          model_key: String(r.model_key || r.model || '(unknown)'),
          task_type: String(r.task_type || '—'),
          decayed_score: Number(r.decayed_score ?? 0),
          total_executions: Number(r.total_executions ?? 0),
          confidence,
        };
      })
      .sort((a, b) => b.decayed_score - a.decayed_score)
      .slice(0, 24);
  }, [routingArms]);

  if (legacyTab) {
    return <Navigate to="/dashboard/analytics" replace />;
  }

  return (
    <div className="ov-wrap flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden w-full">
      <AnalyticsHeader layout={layout} layoutLoadedAt={layoutLoadedAt} />
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
        <SectionShell title="Platform pulse">
          <KpiStrip tiles={kpiTiles} />
        </SectionShell>

        <SectionShell title="Model intelligence">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] text-[var(--text-muted)]">Models by run count (by provider)</div>
              {modelBarData.length ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modelBarData} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                      <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={120} stroke="#64748b" tick={{ fontSize: 9 }} />
                      <Tooltip
                        formatter={(value: number, _name, item) => [
                          `${value} runs · ${String(item?.payload?.provider || '')}`,
                          'executions',
                        ]}
                      />
                      <Bar dataKey="runs" radius={[0, 3, 3, 0]}>
                        {modelBarData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-[var(--text-muted)]">—</div>
              )}
            </div>
            <div>
              <div className="mb-2 text-[11px] text-[var(--text-muted)]">Cost vs latency (dot size = executions)</div>
              {scatterData.length ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                      <XAxis type="number" dataKey="x" name="avg ms" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis type="number" dataKey="y" name="avg cost" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <ZAxis type="number" dataKey="z" range={[40, 400]} name="executions" />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        formatter={(value: number, name: string) => [value, name]}
                        labelFormatter={(_l, payload) => String(payload?.[0]?.payload?.name || '')}
                      />
                      <Scatter data={scatterData} fill="#22d3ee" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-[var(--text-muted)]">—</div>
              )}
            </div>
          </div>
        </SectionShell>

        <SectionShell title="Tool reliability">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] text-[var(--text-muted)]">Tool ok% (agentsam_tool_call_log / MCP exec)</div>
              <div className="space-y-2">
                {toolRows.length ? (
                  toolRows.map((t) => (
                    <div key={t.tool_name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-mono text-[var(--text)]">{t.tool_name}</span>
                        <span className={`tabular-nums ${toneClass(t.tone).split(' ')[0]}`}>
                          {t.okRate == null ? '—' : `${t.okRate}%`}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            t.tone === 'healthy'
                              ? 'bg-emerald-500'
                              : t.tone === 'degraded'
                                ? 'bg-amber-500'
                                : t.tone === 'critical'
                                  ? 'bg-rose-500'
                                  : 'bg-slate-500'
                          }`}
                          style={{ width: `${Math.min(Math.max(t.okRate ?? 0, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-[var(--text-muted)]">—</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] text-[var(--text-muted)]">
                Chain breaks · agentsam_tool_chain · failed / timeout / cancelled
              </div>
              <div className="max-h-72 overflow-auto space-y-2">
                {chainBreakSummary.length ? (
                  chainBreakSummary.map((row) => (
                    <div
                      key={row.tool_name}
                      className="rounded border border-[var(--border-subtle)] px-2 py-1.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[var(--text)] truncate">{row.tool_name}</span>
                        <span className="text-rose-400 tabular-nums shrink-0">{row.count} errors</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        Last seen:{' '}
                        {row.lastSeen != null
                          ? new Date(row.lastSeen > 1e12 ? row.lastSeen : row.lastSeen * 1000).toLocaleString()
                          : '—'}
                      </div>
                      {row.lastError ? (
                        <div className="text-[10px] text-[var(--text-muted)] truncate">{row.lastError}</div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-[var(--text-muted)]">—</div>
                )}
              </div>
            </div>
          </div>
        </SectionShell>

        <SectionShell title="Routing intelligence">
          <div className="mb-2 text-[11px] text-[var(--text-muted)]">
            Thompson sampling confidence · success_alpha / (success_alpha + success_beta) · sorted by decayed_score
          </div>
          <div className="space-y-2">
            {routingArmBars.length ? (
              routingArmBars.map((arm) => (
                <div key={arm.id} className="rounded border border-[var(--border-subtle)] px-2 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                    <div className="font-mono text-[var(--text)]">{arm.model_key}</div>
                    <div className="text-[var(--text-muted)]">
                      {arm.task_type} · score {arm.decayed_score.toFixed(3)} · {arm.total_executions} exec
                    </div>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-500/80"
                      style={{
                        width: `${Math.min(Math.max((arm.confidence ?? 0) * 100, 0), 100)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-muted)] tabular-nums">
                    confidence {arm.confidence == null ? '—' : fmtPct(arm.confidence * 100)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-[var(--text-muted)]">—</div>
            )}
          </div>
        </SectionShell>
      </div>
    </div>
  );
};
