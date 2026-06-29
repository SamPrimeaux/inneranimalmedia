import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { Toggle } from '../settingsUi';
import { useSettingsSectionStatus } from '../hooks/useSettingsSectionStatus';
import {
  ActionRow,
  DataTable,
  EmptyState,
  LoadingRow,
  RelTime,
  SectionHeader,
  SummaryGrid,
  WarningStrip,
} from '../components/SectionPrimitives';

export type NotificationsSectionProps = { data: SettingsPanelModel };

const NOTIFY_ROWS: { key: string; label: string; desc: string }[] = [
  {
    key: 'notify.deploy_success',
    label: 'Deployment Success',
    desc: 'Email when a deploy completes successfully',
  },
  {
    key: 'notify.deploy_failure',
    label: 'Deployment Failure',
    desc: 'Email when a deploy fails or errors',
  },
  {
    key: 'notify.agent_error',
    label: 'Agent Error',
    desc: 'Email when an agent run hits an unhandled error',
  },
  {
    key: 'notify.spend_threshold',
    label: 'Spend Alert',
    desc: 'Email when monthly spend exceeds your limit',
  },
  {
    key: 'notify.benchmark_fail',
    label: 'Benchmark Failure',
    desc: 'Email when a benchmark run regresses',
  },
];

type ErrorRow = {
  id?: string;
  severity?: string;
  source?: string;
  message?: string;
  created_at?: string | number | null;
};

type EscalationRow = {
  id?: string;
  level?: string;
  status?: string;
  reason?: string;
  created_at?: string | number | null;
};

type ApprovalRow = {
  id?: string;
  kind?: string;
  status?: string;
  requested_by?: string;
  created_at?: string | number | null;
};

type WebhookEventRow = {
  id?: string;
  source?: string;
  event_type?: string;
  status?: string;
  created_at?: string | number | null;
};

type IntegrationEventRow = {
  id?: string;
  slug?: string;
  event_type?: string;
  severity?: string;
  created_at?: string | number | null;
};

type NotificationsSummary = {
  recent_errors?: number;
  open_escalations?: number;
  pending_approvals?: number;
  recent_webhook_events?: number;
  recent_integration_events?: number;
};

type NotificationsExtra = {
  errors?: ErrorRow[];
  escalations?: EscalationRow[];
  approvals?: ApprovalRow[];
  webhook_events?: WebhookEventRow[];
  integration_events?: IntegrationEventRow[];
};

export function NotificationsSection({ data }: NotificationsSectionProps) {
  const { data: section, loading, error, reload } = useSettingsSectionStatus({
    endpoint: '/api/settings/notifications',
  });
  const summary = (section?.summary || {}) as NotificationsSummary;
  const extra = (section?.extra || {}) as NotificationsExtra;

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <SectionHeader
        title="Notifications"
        description="Notification preference storage is intentionally not yet schema'd. Toggles below mirror your profile settings until a dedicated table is wired."
        right={
          <button
            type="button"
            onClick={() => reload()}
            disabled={loading}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-muted hover:text-main disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {data.notifyError ? (
        <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-xl px-3 py-2">
          {data.notifyError}
        </div>
      ) : null}
      {error ? (
        <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-xl px-3 py-2">
          {error}
        </div>
      ) : null}
      {data.notifyLoading || (loading && !section) ? <LoadingRow /> : null}

      {section ? (
        <>
          <SummaryGrid
            items={[
              { label: 'Recent errors', value: String(summary.recent_errors ?? 0) },
              { label: 'Open escalations', value: String(summary.open_escalations ?? 0) },
              { label: 'Pending approvals', value: String(summary.pending_approvals ?? 0) },
              { label: 'Webhook events', value: String(summary.recent_webhook_events ?? 0) },
              { label: 'Integration events', value: String(summary.recent_integration_events ?? 0) },
            ]}
          />
          <WarningStrip warnings={section.warnings} />
          <ActionRow actions={section.actions} />
        </>
      ) : null}

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
        <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-muted bg-[var(--bg-app)] border-b border-[var(--border-subtle)]">
          Profile-backed preference toggles
        </div>
        {NOTIFY_ROWS.map((row) => {
          const on = String(data.notifyPrefs[row.key] || 'false') === 'true';
          return (
            <div
              key={row.key}
              className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]"
            >
              <div className="min-w-0 pr-3">
                <div className="text-[12px] font-semibold text-main">{row.label}</div>
                <div className="text-[11px] text-muted mt-0.5">{row.desc}</div>
              </div>
              <Toggle
                on={on}
                onChange={(v) => {
                  const prev = data.notifyPrefs;
                  data.setNotifyPrefs((p) => ({ ...p, [row.key]: v ? 'true' : 'false' }));
                  void data
                    .patchProfile([
                      { setting_key: row.key, setting_value: v ? 'true' : 'false' },
                    ])
                    .catch(() => data.setNotifyPrefs(prev));
                }}
              />
            </div>
          );
        })}

        <div className="px-4 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-app)]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Webhook
          </div>
          <div className="text-[11px] text-muted mt-1">
            POST request sent for all enabled events
          </div>
          <input
            className="mt-2 w-full px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px] font-mono"
            placeholder="https://"
            value={data.notifyWebhookUrl}
            onChange={(e) => data.setNotifyWebhookUrl(e.target.value)}
            onBlur={() => {
              const v = data.notifyWebhookUrl;
              void data
                .patchProfile([{ setting_key: 'notify.webhook_url', setting_value: v }])
                .catch(() => null);
            }}
          />
        </div>

        <div className="px-4 py-4 border-t border-[var(--border-subtle)]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Notification email
          </div>
          <div className="mt-2 text-[12px] text-muted">{data.profileEmail || '—'}</div>
        </div>
      </div>

      {section ? (
        <section className="flex flex-col gap-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted">
            Alert source feeds
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted">
                Recent errors (agentsam_error_log)
              </div>
              {(extra.errors || []).length === 0 ? (
                <EmptyState message="No recent errors logged." />
              ) : (
                <DataTable<ErrorRow>
                  emptyMessage="No errors."
                  rows={extra.errors || []}
                  columns={[
                    {
                      key: 'created_at',
                      label: 'When',
                      widthClass: 'minmax(0, 0.7fr)',
                      render: (r) => <RelTime value={r.created_at ?? null} />,
                    },
                    { key: 'severity', label: 'Severity', widthClass: 'minmax(0, 0.5fr)' },
                    { key: 'source', label: 'Source', widthClass: 'minmax(0, 0.7fr)' },
                  ]}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted">
                Open escalations (agentsam_escalation)
              </div>
              {(extra.escalations || []).length === 0 ? (
                <EmptyState message="No escalations recorded." />
              ) : (
                <DataTable<EscalationRow>
                  emptyMessage="No escalations."
                  rows={extra.escalations || []}
                  columns={[
                    {
                      key: 'created_at',
                      label: 'When',
                      render: (r) => <RelTime value={r.created_at ?? null} />,
                    },
                    { key: 'level', label: 'Level' },
                    { key: 'status', label: 'Status' },
                  ]}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted">
                Pending approvals (agentsam_approval_queue)
              </div>
              {(extra.approvals || []).length === 0 ? (
                <EmptyState message="No approvals pending." />
              ) : (
                <DataTable<ApprovalRow>
                  emptyMessage="No approvals."
                  rows={extra.approvals || []}
                  columns={[
                    {
                      key: 'created_at',
                      label: 'When',
                      render: (r) => <RelTime value={r.created_at ?? null} />,
                    },
                    { key: 'kind', label: 'Kind' },
                    { key: 'status', label: 'Status' },
                  ]}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted">
                Webhook + integration events
              </div>
              {(extra.webhook_events || []).length + (extra.integration_events || []).length ===
              0 ? (
                <EmptyState message="No webhook or integration events." />
              ) : (
                <DataTable
                  emptyMessage="No events."
                  rows={[
                    ...(extra.webhook_events || []).map((r) => ({
                      ...r,
                      _kind: 'webhook',
                    })),
                    ...(extra.integration_events || []).map((r) => ({
                      ...r,
                      _kind: 'integration',
                    })),
                  ]}
                  columns={[
                    {
                      key: 'created_at',
                      label: 'When',
                      render: (r) => (
                        <RelTime value={(r as { created_at?: unknown }).created_at as string | number | null} />
                      ),
                    },
                    {
                      key: '_kind',
                      label: 'Kind',
                    },
                    {
                      key: 'event_type',
                      label: 'Event',
                    },
                    {
                      key: 'severity',
                      label: 'Severity',
                      render: (r) =>
                        String(
                          (r as { severity?: unknown; status?: unknown }).severity ||
                            (r as { status?: unknown }).status ||
                            '—',
                        ),
                    },
                  ]}
                />
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
