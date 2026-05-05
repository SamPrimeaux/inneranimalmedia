import React, { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HealthShell, type HealthTabId } from '../components/health/HealthShell';
import { HealthScoreCard } from '../components/health/HealthScoreCard';
import { EmptyTelemetryState } from '../components/health/EmptyTelemetryState';
import { D1TelemetryTab } from '../components/health/D1TelemetryTab';

async function j<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include', ...init });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function padChart<T extends Record<string, unknown>>(rows: T[], key: keyof T): T[] {
  if (rows.length === 0) return [];
  if (rows.length >= 2) return rows;
  return [rows[0], { ...rows[0], [key]: rows[0][key] } as T];
}

export const HealthPage: React.FC = () => {
  const [tab, setTab] = useState<HealthTabId>('overview');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [workers, setWorkers] = useState<any>(null);
  const [mcp, setMcp] = useState<any>(null);
  const [models, setModels] = useState<any>(null);
  const [advisors, setAdvisors] = useState<any>(null);
  const [deployments, setDeployments] = useState<any>(null);
  const [d1, setD1] = useState<any>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [s, a, w, m, mo, adv, dep, d1b] = await Promise.all([
      j('/api/health/summary'),
      j('/api/health/agent'),
      j('/api/health/workers'),
      j('/api/health/mcp'),
      j('/api/health/models'),
      j('/api/health/advisors'),
      j('/api/health/deployments'),
      j('/api/health/agentsam-d1'),
    ]);
    setSummary(s);
    setAgent(a);
    setWorkers(w);
    setMcp(m);
    setModels(mo);
    setAdvisors(adv);
    setDeployments(dep);
    setD1(d1b);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runMcpProbe = async () => {
    await fetch('/api/health/mcp/check', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_all: true }),
    });
    const m2 = await j('/api/health/mcp');
    setMcp(m2);
    const s2 = await j('/api/health/summary');
    setSummary(s2);
  };

  const lc = models?.latency_vs_cost || [];
  const chartLc = padChart(lc, 'latency_ms');

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
    <HealthShell
      tab={tab}
      onTab={setTab}
      actions={
        <button type="button" className="ov-btn" onClick={() => void loadAll()} disabled={loading}>
          Refresh
        </button>
      }
    >
      {loading && !summary ? (
        <div className="ov-inlineNotice">Loading health data…</div>
      ) : null}

      {tab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
          <HealthScoreCard score={summary?.score ?? 0} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(summary?.flags || {}).map(([k, v]) => (
              <div
                key={k}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 text-[13px]"
              >
                <div className="text-[var(--text-muted)] text-[11px] uppercase tracking-wide">{k}</div>
                <div className="text-[var(--text)] font-semibold">{v ? 'yes' : 'no'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'agent' && (
        <div className="space-y-3">
          {!agent?.stream_events?.length &&
          !agent?.tool_calls?.length &&
          !agent?.routing_decisions?.length ? (
            <EmptyTelemetryState
              title="No Supabase agent stream yet"
              hint="When Agent Sam streams complete, rows land in public.agentsam_stream_events, agentsam_routing_decisions, and agentsam_tool_call_events."
            />
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="ov-cardBody rounded border border-[var(--border-subtle)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Success rate (tool calls)</div>
              <div className="text-xl font-semibold">{agent?.success_rate != null ? `${agent.success_rate}%` : '—'}</div>
            </div>
            <div className="ov-cardBody rounded border border-[var(--border-subtle)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Avg latency</div>
              <div className="text-xl font-semibold">
                {agent?.avg_latency_ms != null ? `${agent.avg_latency_ms} ms` : '—'}
              </div>
            </div>
            <div className="ov-cardBody rounded border border-[var(--border-subtle)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Cost today</div>
              <div className="text-xl font-semibold">
                {agent?.cost_usd_today != null ? `$${Number(agent.cost_usd_today).toFixed(4)}` : '—'}
              </div>
            </div>
          </div>
          <div className="text-[12px] text-[var(--text-muted)]">
            Recent tool calls: {agent?.tool_calls?.length ?? 0} · Stream events: {agent?.stream_events?.length ?? 0}
          </div>
        </div>
      )}

      {tab === 'workers' && (
        <div className="space-y-3">
          {!workers?.has_data ? (
            <EmptyTelemetryState
              title="Worker telemetry is empty"
              hint="Worker ingestion schema is ready — wire agentsam.worker_events writes in src/index.js fetch handler to populate. D1 rollups use worker_analytics_events → worker_analytics_hourly."
            />
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border border-[var(--border-subtle)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">24h requests</div>
              <div className="text-lg font-semibold">{workers?.rollup_24h?.requests ?? 0}</div>
            </div>
            <div className="rounded border border-[var(--border-subtle)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">24h errors</div>
              <div className="text-lg font-semibold">{workers?.rollup_24h?.errors ?? 0}</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'mcp' && (
        <div className="space-y-3">
          <button type="button" className="ov-btn" onClick={() => void runMcpProbe()}>
            Run probes
          </button>
          <div className="grid gap-2 md:grid-cols-2">
            {(mcp?.tools || []).map((t: any) => (
              <div key={t.tool_name} className="rounded border border-[var(--border-subtle)] p-3 text-[13px]">
                <div className="font-medium text-[var(--text)]">{t.tool_name}</div>
                <div className="text-[var(--text-muted)]">
                  {t.status} · {t.latency_ms != null ? `${t.latency_ms} ms` : '—'}
                </div>
              </div>
            ))}
          </div>
          {!(mcp?.tools || []).length ? (
            <EmptyTelemetryState title="No MCP health rows" hint="Run probes to seed agentsam.mcp_health_checks." />
          ) : null}
        </div>
      )}

      {tab === 'd1' &&
        (loading && !d1 ? <div className="ov-inlineNotice">Loading D1 telemetry…</div> : <D1TelemetryTab payload={d1} />)}

      {tab === 'models' && (
        <div className="space-y-4">
          <div className="h-56 w-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartLc} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="model" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="latency_ms"
                  stroke="var(--solar-cyan, #06b6d4)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="cost_usd"
                  stroke="var(--solar-amber, #f59e0b)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {!chartLc.length ? (
            <EmptyTelemetryState title="No model latency/cost points" hint="Populate agentsam_stream_events and routing decisions." />
          ) : null}
        </div>
      )}

      {tab === 'advisors' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold mb-2">Security</h3>
            {(advisors?.security || []).map((a: any) => (
              <div key={a.id} className="mb-2 rounded border border-[var(--border-subtle)] p-2 text-[13px]">
                <div className="font-medium">{a.title}</div>
                <div className="text-[var(--text-muted)]">{a.fix_hint}</div>
              </div>
            ))}
            {!(advisors?.security || []).length ? <div className="text-[var(--text-muted)] text-sm">No security flags.</div> : null}
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Performance</h3>
            {(advisors?.performance || []).map((a: any) => (
              <div key={a.id} className="mb-2 rounded border border-[var(--border-subtle)] p-2 text-[13px]">
                <div className="font-medium">{a.title}</div>
                <div className="text-[var(--text-muted)]">{a.fix_hint}</div>
              </div>
            ))}
            {!(advisors?.performance || []).length ? (
              <div className="text-[var(--text-muted)] text-sm">No performance flags.</div>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'deployments' && (
        <div className="space-y-2 text-[13px]">
          <div className="text-[var(--text-muted)]">
            Last success: {deployments?.last_success_at || '—'} · Last failure: {deployments?.last_failure_at || '—'} · 7d
            count: {deployments?.deploy_count_7d ?? 0}
          </div>
          <div className="max-h-[420px] overflow-auto border border-[var(--border-subtle)] rounded">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[var(--bg-panel)] text-[11px] uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="p-2">Id</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Env</th>
                  <th className="p-2">When</th>
                </tr>
              </thead>
              <tbody>
                {(deployments?.deployments || []).map((d: any) => (
                  <tr key={d.id} className="border-t border-[var(--border-subtle)]">
                    <td className="p-2 font-mono text-[11px]">{String(d.id).slice(0, 12)}…</td>
                    <td className="p-2">{d.status}</td>
                    <td className="p-2">{d.environment}</td>
                    <td className="p-2 text-[var(--text-muted)]">{String(d.created_at || '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </HealthShell>
    </div>
  );
};
