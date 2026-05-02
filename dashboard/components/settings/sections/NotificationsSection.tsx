import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { Toggle } from '../settingsUi';

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

export function NotificationsSection({ data }: NotificationsSectionProps) {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
        Notifications
      </h2>
      {data.notifyError ? (
        <div className="text-[11px] text-[var(--color-danger)]">{data.notifyError}</div>
      ) : null}
      {data.notifyLoading ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading…</div>
      ) : null}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
        {NOTIFY_ROWS.map((row) => {
          const on = String(data.notifyPrefs[row.key] || 'false') === 'true';
          return (
            <div
              key={row.key}
              className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]"
            >
              <div className="min-w-0 pr-3">
                <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{row.desc}</div>
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
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Webhook
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            POST request sent for all enabled events
          </div>
          <input
            className="mt-2 w-full px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px] font-mono"
            placeholder="https://"
            value={data.notifyWebhookUrl}
            onChange={(e) => data.setNotifyWebhookUrl(e.target.value)}
            onBlur={() => {
              const v = data.notifyWebhookUrl;
              void data.patchProfile([{ setting_key: 'notify.webhook_url', setting_value: v }]).catch(() => null);
            }}
          />
        </div>

        <div className="px-4 py-4 border-t border-[var(--border-subtle)]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Notification email
          </div>
          <div className="mt-2 text-[12px] text-[var(--text-muted)]">{data.profileEmail || '—'}</div>
        </div>
      </div>
    </div>
  );
}
