import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Key,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { relativeTime } from '../settingsUi';

export type SecuritySectionProps = { data: SettingsPanelModel };

export function SecuritySection({ data }: SecuritySectionProps) {
  const navigate = useNavigate();

  const suspiciousUa = (ua: string) => {
    const u = ua.toLowerCase();
    return u.includes('python-requests') || u.includes('curl/');
  };

  const revokeAllOthers = () => {
    if (
      !window.confirm(
        'Revoke all sessions except the most recently active row shown? Confirm you are not locking yourself out.',
      )
    ) {
      return;
    }
    void data.revokeOtherSessions();
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
        Security
      </h2>

      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-[var(--solar-cyan)]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Keys &amp; secrets
          </h3>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Provider API keys, R2 BYOK, personal secrets, connected accounts, and security findings
          live on Keys &amp; Secrets.
        </p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/settings/keys')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30"
        >
          Open Keys &amp; Secrets
        </button>
      </section>

      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Account credentials
        </h3>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Change your login email or password under General.
        </p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/settings/general')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-main)] hover:border-[var(--solar-cyan)]/40"
        >
          Open General settings
        </button>
      </section>

      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Active sessions
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={data.sessionsLoading}
              onClick={() => void data.loadSecurity()}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => revokeAllOthers()}
              className="px-3 py-1.5 rounded-lg border border-[var(--color-warning)]/40 text-[11px] text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10"
            >
              Revoke all others
            </button>
          </div>
        </div>
        {data.sessionsError ? (
          <div className="text-[11px] text-[var(--color-danger)]">{data.sessionsError}</div>
        ) : null}
        <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
          <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
            <div className="col-span-1">Provider</div>
            <div className="col-span-1">IP</div>
            <div className="col-span-2">Agent</div>
            <div className="col-span-1">Active</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          {data.sessions.map((s) => {
            const ua = String(s.user_agent || '');
            const browser = ua.includes('Chrome')
              ? 'Chrome'
              : ua.includes('Firefox')
                ? 'Firefox'
                : ua.slice(0, 30);
            const flag = suspiciousUa(ua);
            return (
              <div
                key={String(s.id)}
                className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] items-center text-[11px]"
              >
                <div className="col-span-1 flex flex-wrap items-center gap-1">
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                    {String(s.provider || 'email')}
                  </span>
                  {flag ? (
                    <span className="inline-flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/40">
                      <ShieldAlert className="h-3 w-3" />
                      CLI
                    </span>
                  ) : null}
                </div>
                <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono truncate">
                  {String(s.ip_address || '—')}
                </div>
                <div className="col-span-2 text-[10px] text-[var(--text-muted)] truncate">
                  {browser || '—'}
                </div>
                <div className="col-span-1 text-[10px] text-[var(--text-muted)]">
                  {s.last_active_at ? relativeTime(s.last_active_at) : '—'}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const snapshot = data.sessions;
                      data.setSessions((p) => p.filter((x) => String(x.id) !== String(s.id)));
                      void data.revokeSession(String(s.id), snapshot);
                    }}
                    className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--solar-cyan)]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">MCP Auth Token</h3>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-[var(--text-muted)]">MCP Auth Token</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)] font-mono">••••••••••••</span>
            <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 font-black uppercase tracking-widest">
              Active
            </span>
            <button
              type="button"
              title="Contact admin to rotate"
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
            >
              Rotate
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
