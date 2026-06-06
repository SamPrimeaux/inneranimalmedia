import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Key,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { formatVaultCreated, relativeTime } from '../settingsUi';

export type SecuritySectionProps = { data: SettingsPanelModel };

export function SecuritySection({ data }: SecuritySectionProps) {
  const navigate = useNavigate();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

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

      {/* Password / email — preserved */}
      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Password</h3>
        {data.user?.passwordMethod === 'oauth' ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            You sign in via {data.user?.provider ?? 'external provider'}. No password set.
          </p>
        ) : !data.user ? (
          <p className="text-[11px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <>
            <p className="text-[11px] text-[var(--text-muted)]">
              Last changed:{' '}
              {data.user?.passwordUpdatedAt ? formatVaultCreated(data.user.passwordUpdatedAt) : '—'}
            </p>
            {!showPasswordForm ? (
              <button
                type="button"
                onClick={() => {
                  setPwMsg(null);
                  setShowPasswordForm(true);
                }}
                className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30"
              >
                Change password
              </button>
            ) : (
              <form
                className="grid gap-3 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  void (async () => {
                    if (pwNew.length < 10) {
                      setPwMsg({ ok: false, text: 'Min 10 characters' });
                      return;
                    }
                    if (pwNew !== pwConfirm) {
                      setPwMsg({ ok: false, text: 'Passwords do not match' });
                      return;
                    }
                    setPwLoading(true);
                    try {
                      const res = await fetch('/api/auth/password-change', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
                        credentials: 'include',
                      });
                      const json = (await res.json().catch(() => ({}))) as { error?: string };
                      if (res.ok) {
                        setPwMsg({ ok: true, text: 'Password updated.' });
                        setShowPasswordForm(false);
                        setPwCurrent('');
                        setPwNew('');
                        setPwConfirm('');
                      } else {
                        setPwMsg({
                          ok: false,
                          text: typeof json.error === 'string' ? json.error : 'Failed to update password.',
                        });
                      }
                    } finally {
                      setPwLoading(false);
                    }
                  })();
                }}
              >
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Current password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password (min 10 chars)"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
                >
                  Save new password
                </button>
              </form>
            )}
            {pwMsg ? (
              <div
                className={`text-[11px] ${pwMsg.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
              >
                {pwMsg.text}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Email address
        </h3>
        <p className="text-[11px] text-[var(--text-muted)]">
          Current: {data.user?.email ?? data.profileEmail ?? '—'}
        </p>
        {!showEmailForm ? (
          <button
            type="button"
            onClick={() => {
              setEmailMsg(null);
              setShowEmailForm(true);
            }}
            className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30"
          >
            Change email
          </button>
        ) : (
          <form
            className="grid gap-3 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setEmailLoading(true);
                try {
                  const res = await fetch('/api/auth/email-change/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newEmail }),
                    credentials: 'include',
                  });
                  const json = (await res.json().catch(() => ({}))) as { error?: string };
                  if (res.ok) {
                    setEmailMsg({
                      ok: true,
                      text: 'Check your inbox to confirm the new address.',
                    });
                    setShowEmailForm(false);
                    setNewEmail('');
                  } else {
                    setEmailMsg({
                      ok: false,
                      text:
                        typeof json.error === 'string' ? json.error : 'Failed to send verification.',
                    });
                  }
                } finally {
                  setEmailLoading(false);
                }
              })();
            }}
          >
            <input
              type="email"
              autoComplete="email"
              placeholder="New email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
            />
            <button
              type="submit"
              disabled={emailLoading}
              className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
            >
              Send verification
            </button>
          </form>
        )}
        {emailMsg ? (
          <div
            className={`text-[11px] ${emailMsg.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
          >
            {emailMsg.text}
          </div>
        ) : null}
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
