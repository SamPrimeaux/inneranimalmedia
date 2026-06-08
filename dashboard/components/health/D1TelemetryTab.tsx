import React, { useMemo } from 'react';
import { EmptyTelemetryState } from './EmptyTelemetryState';

type TableBundle = {
  available?: boolean;
  recent?: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  stale_preview?: Record<string, unknown>[];
  note?: string;
};

type Props = {
  payload: {
    ok?: boolean;
    hint?: string;
    agentsam_execution_performance_metrics_doc?: {
      realtime?: string;
      daily_cron?: string;
      code?: string[];
    };
    tables?: Record<string, TableBundle>;
  } | null;
};

function formatCell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v).slice(0, 120) + (JSON.stringify(v).length > 120 ? '…' : '');
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function DataTable({ rows, title }: { rows: Record<string, unknown>[]; title: string }) {
  const cols = useMemo(() => {
    if (!rows.length) return [];
    const keys = Object.keys(rows[0]);
    return keys.slice(0, 8);
  }, [rows]);

  if (!rows.length) {
    return <div className="text-[12px] text-[var(--text-muted)] py-2">No rows in range.</div>;
  }

  return (
    <div className="mt-2 overflow-x-auto max-h-[280px] overflow-y-auto rounded border border-[var(--border-subtle)]">
      <table className="w-full text-left text-[11px]">
        <caption className="sr-only">{title}</caption>
        <thead className="sticky top-0 bg-[var(--bg-panel)] z-[1] border-b border-[var(--border-subtle)]">
          <tr>
            {cols.map((c) => (
              <th key={c} className="p-2 font-semibold text-[var(--text-muted)] whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]">
              {cols.map((c) => (
                <td key={c} className="p-2 font-mono text-[var(--text)] align-top max-w-[200px] truncate" title={formatCell(r[c])}>
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  name,
  bundle,
  children,
}: {
  name: string;
  bundle?: TableBundle;
  children?: React.ReactNode;
}) {
  const live = bundle?.available === true;
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-[var(--text)]">{name}</h3>
        {!live ? (
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">not in schema</span>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-[var(--solar-cyan)]">live</span>
        )}
      </div>
      {bundle?.note ? <p className="text-[12px] text-[var(--text-muted)] mb-2">{bundle.note}</p> : null}
      {children}
    </section>
  );
}

export const D1TelemetryTab: React.FC<Props> = ({ payload }) => {
  const t = payload?.tables || {};
  const doc = payload?.agentsam_execution_performance_metrics_doc;

  if (payload == null) {
    return <EmptyTelemetryState title="No payload" hint="Refresh the Health page." />;
  }

  if (!payload?.ok) {
    return <EmptyTelemetryState title="D1 telemetry unavailable" hint={String((payload as any)?.error || 'Database not configured or request failed.')} />;
  }

  return (
    <div className="space-y-4 max-w-[1200px]">
      {payload.hint ? (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
          {payload.hint}
        </div>
      ) : null}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-2">agentsam_execution_performance_metrics</h2>
        <p className="text-[13px] text-[var(--text-muted)] leading-relaxed mb-2">
          One row per <code className="text-[12px]">(tenant_id, command_id, metric_date)</code>. Updated when a command run
          completes (incremental upsert) and reconciled by the daily rollup from{' '}
          <code className="text-[12px]">agentsam_command_run</code>.
        </p>
        <ul className="text-[12px] text-[var(--text-muted)] list-disc pl-5 space-y-1">
          <li>{doc?.realtime}</li>
          <li>{doc?.daily_cron}</li>
          {(doc?.code || []).map((line) => (
            <li key={line}>
              <code className="text-[11px]">{line}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section name="agentsam_execution_performance_metrics" bundle={t.agentsam_execution_performance_metrics}>
          {t.agentsam_execution_performance_metrics?.summary &&
          Object.keys(t.agentsam_execution_performance_metrics.summary).length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(t.agentsam_execution_performance_metrics.summary).map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[11px] border border-[var(--border-subtle)]"
                >
                  <span className="text-[var(--text-muted)]">{k}: </span>
                  <span className="font-mono text-[var(--text)]">{formatCell(v)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <DataTable rows={(t.agentsam_execution_performance_metrics?.recent || []) as Record<string, unknown>[]} title="epm" />
        </Section>

        <Section name="agentsam_agent_run" bundle={t.agentsam_agent_run}>
          <p className="text-[12px] text-[var(--text-muted)] mb-1">Scoped to your user id.</p>
          <DataTable rows={(t.agentsam_agent_run?.recent || []) as Record<string, unknown>[]} title="runs" />
        </Section>

        <Section name="agentsam_deployment_health" bundle={t.agentsam_deployment_health}>
          <DataTable rows={(t.agentsam_deployment_health?.recent || []) as Record<string, unknown>[]} title="deploy health" />
        </Section>

        <Section name="agentsam_health_daily" bundle={t.agentsam_health_daily}>
          <DataTable rows={(t.agentsam_health_daily?.recent || []) as Record<string, unknown>[]} title="health daily" />
        </Section>

        <Section name="agentsam_mcp_tool_execution" bundle={t.agentsam_mcp_tool_execution}>
          <DataTable rows={(t.agentsam_mcp_tool_execution?.recent || []) as Record<string, unknown>[]} title="mcp exec" />
        </Section>

        <Section name="agentsam_model_drift_signals" bundle={t.agentsam_model_drift_signals}>
          <DataTable rows={(t.agentsam_model_drift_signals?.recent || []) as Record<string, unknown>[]} title="drift" />
        </Section>

        <Section name="agentsam_tool_call_log" bundle={t.agentsam_tool_call_log}>
          <DataTable rows={(t.agentsam_tool_call_log?.recent || []) as Record<string, unknown>[]} title="tool log" />
        </Section>

        <Section name="agentsam_tool_stats_compacted" bundle={t.agentsam_tool_stats_compacted}>
          <DataTable rows={(t.agentsam_tool_stats_compacted?.recent || []) as Record<string, unknown>[]} title="tool stats" />
        </Section>

        <Section name="agentsam_usage_events" bundle={t.agentsam_usage_events}>
          <DataTable rows={(t.agentsam_usage_events?.recent || []) as Record<string, unknown>[]} title="usage" />
        </Section>

        <Section name="agentsam_webhook_events" bundle={t.agentsam_webhook_events}>
          <DataTable rows={(t.agentsam_webhook_events?.recent || []) as Record<string, unknown>[]} title="webhooks" />
        </Section>

        <Section name="agentsam_workflow_runs" bundle={t.agentsam_workflow_runs}>
          <p className="text-[12px] text-[var(--text-muted)] mb-1">
            Superadmin: all runs in tenant. Otherwise tenant + your user.
          </p>
          <DataTable rows={(t.agentsam_workflow_runs?.recent || []) as Record<string, unknown>[]} title="workflows" />
        </Section>

        <Section name="agentsam_codebase_index_health" bundle={t.agentsam_codebase_index_health}>
          {t.agentsam_codebase_index_health?.summary &&
          Object.keys(t.agentsam_codebase_index_health.summary).length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(t.agentsam_codebase_index_health.summary).map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[11px] border border-[var(--border-subtle)]"
                >
                  <span className="text-[var(--text-muted)]">{k}: </span>
                  <span className="font-mono text-[var(--text)]">{formatCell(v)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {(t.agentsam_codebase_index_health?.stale_preview?.length ?? 0) > 0 ? (
            <DataTable
              rows={(t.agentsam_codebase_index_health?.stale_preview || []) as Record<string, unknown>[]}
              title="stale codebase files"
            />
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">No stale index flags in latest weekly check.</p>
          )}
          <DataTable rows={(t.agentsam_codebase_index_health?.recent || []) as Record<string, unknown>[]} title="weekly runs" />
        </Section>

        <Section name="agentsam_analytics" bundle={t.agentsam_analytics}>
          <DataTable rows={(t.agentsam_analytics?.recent || []) as Record<string, unknown>[]} title="analytics" />
        </Section>
      </div>
    </div>
  );
};
