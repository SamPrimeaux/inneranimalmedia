import React, { useEffect, useMemo, useState } from 'react';
import type { AnalyticsLayoutResponse } from '../types';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';

type Props = { layout: AnalyticsLayoutResponse | null };

type AnalyticsResponse = {
  ok: boolean;
  backend: 'd1' | 'supabase' | 'mixed';
  range: '24h' | '7d' | '30d' | 'all';
  generated_at: number;
  summary: Record<string, any>;
  rows: Array<Record<string, any>>;
  warnings: Array<{ code: string; message: string; severity: 'info' | 'warn' | 'critical' }>;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fmtNumber(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${Math.round(v / 10_000) / 100}M`;
  if (v >= 10_000) return `${Math.round(v / 100) / 10}K`;
  return String(Math.round(v));
}

function fmtCurrency(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(v < 1 ? 4 : 2)}`;
}

function fmtMs(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${Math.round((v / 1000) * 10) / 10}s`;
}

function SourceBadge({ backend }: { backend: 'd1' | 'supabase' | 'mixed' }) {
  const label = backend === 'd1' ? 'D1' : backend === 'supabase' ? 'Supabase' : 'Mixed';
  return (
    <span className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--bg-canvas)]">
      {label}
    </span>
  );
}

export default function OverviewTab(_props: Props) {
  const [overview, setOverview] = useState<AnalyticsResponse | null>(null);
  const [health, setHealth] = useState<AnalyticsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [o, h] = await Promise.all([
        getJson<AnalyticsResponse>('/api/analytics/overview?range=7d'),
        getJson<AnalyticsResponse>('/api/analytics/source-health?range=30d'),
      ]);
      if (!alive) return;
      setOverview(o);
      setHealth(h);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const kpis = useMemo(() => {
    const s = overview?.summary || {};
    const b = (overview?.backend || 'mixed') as 'd1' | 'supabase' | 'mixed';
    return [
      { label: 'Workflow Runs', value: fmtNumber(s.workflow_run_count), backend: 'd1' as const },
      { label: 'Tool Success', value: s.tool_success_rate != null ? `${s.tool_success_rate}%` : '—', backend: 'd1' as const },
      { label: 'Open Errors', value: fmtNumber(s.open_error_count), backend: 'd1' as const },
      { label: 'Token Usage', value: fmtNumber(s.total_tokens), backend: 'd1' as const },
      { label: 'AI Cost', value: fmtCurrency(s.total_cost_usd), backend: 'd1' as const },
      { label: 'Avg Latency', value: fmtMs(s.avg_latency_ms), backend: 'd1' as const },
      { label: 'RAG Documents', value: fmtNumber(s.rag_document_count), backend: b !== 'd1' ? ('supabase' as const) : ('d1' as const) },
      { label: 'Codebase Files', value: fmtNumber(s.codebase_file_count), backend: b !== 'd1' ? ('supabase' as const) : ('d1' as const) },
      { label: 'Eval Runs', value: fmtNumber(s.eval_run_count), backend: b !== 'd1' ? ('supabase' as const) : ('d1' as const) },
      { label: 'Deploy Events', value: fmtNumber(s.deploy_event_count), backend: b !== 'd1' ? ('supabase' as const) : ('d1' as const) },
    ];
  }, [overview]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {overview?.ok ? (
          kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{k.label}</div>
                <SourceBadge backend={k.backend} />
              </div>
              <div className="mt-1 text-[18px] font-semibold text-[var(--text)]">{k.value}</div>
            </div>
          ))
        ) : (
          <EmptyTelemetryCard
            title="Overview KPIs"
            dataSourceKey="systemPulse"
            status="not_connected_yet"
            reason="Overview KPI endpoint is not returning yet (D1 and/or Hyperdrive bindings missing, or tenant not resolved)."
            suggestedAction="Verify env.DB and env.HYPERDRIVE bindings, and confirm tenant identity resolves in requests."
          />
        )}
      </div>

      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Data quality</div>
            <div className="text-sm font-semibold text-[var(--text)]">Sources and freshness</div>
          </div>
          <SourceBadge backend="mixed" />
        </div>

        <div className="mt-3 overflow-auto border border-[var(--border-subtle)] rounded">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-[var(--bg-panel)] text-[11px] uppercase text-[var(--text-muted)]">
              <tr>
                <th className="p-2">Source</th>
                <th className="p-2">Backend</th>
                <th className="p-2">Table</th>
                <th className="p-2">Rows</th>
                <th className="p-2">Latest</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(health?.rows || []).slice(0, 20).map((r: any, idx: number) => (
                <tr key={`${r.table}-${idx}`} className="border-t border-[var(--border-subtle)]">
                  <td className="p-2">{r.source}</td>
                  <td className="p-2">{r.backend}</td>
                  <td className="p-2 font-mono text-[11px]">{r.table}</td>
                  <td className="p-2">{fmtNumber(r.row_count)}</td>
                  <td className="p-2 text-[var(--text-muted)]">{String(r.latest_row ?? '—')}</td>
                  <td className="p-2">{String(r.status || 'unknown')}</td>
                </tr>
              ))}
              {!(health?.rows || []).length ? (
                <tr>
                  <td className="p-2 text-[var(--text-muted)]" colSpan={6}>
                    Source health is not connected yet. Wire `/api/analytics/source-health` and verify Hyperdrive + D1 bindings.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

