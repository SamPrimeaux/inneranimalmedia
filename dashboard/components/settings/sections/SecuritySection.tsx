import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { formatVaultCreated, relativeTime } from '../settingsUi';

export type SecuritySectionProps = { data: SettingsPanelModel };

export function SecuritySection({ data }: SecuritySectionProps) {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
        Security &amp; vault
      </h2>

      <section className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Your API keys</h3>
        <p className="text-[11px] text-[var(--text-muted)]">
          Keys are encrypted in the vault and scoped to your session. Removing a key revokes it for this account.
        </p>
        {data.llmKeys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-app)] p-6 text-[12px] text-[var(--text-muted)]">
            No keys stored yet.
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
            <table className="w-full text-[11px]">
              <thead className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">Provider</th>
                  <th className="px-3 py-2 font-semibold">Masked</th>
                  <th className="px-3 py-2 font-semibold">Added</th>
                  <th className="px-3 py-2 font-semibold w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.llmKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-3 py-2 text-[var(--text-main)]">{k.provider || k.key_name}</td>
                    <td className="px-3 py-2 font-mono text-[var(--solar-cyan)]">{k.masked}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{formatVaultCreated(k.created_at)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={data.llmBusy === k.id}
                        onClick={() => void data.removeLlmKey(k.id)}
                        className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Add key</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Provider</span>
            <select
              value={data.vaultProvider}
              onChange={(e) =>
                data.setVaultProvider(e.target.value as typeof data.vaultProvider)
              }
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
            >
              <option value="OPENAI_API_KEY">OpenAI</option>
              <option value="ANTHROPIC_API_KEY">Anthropic</option>
              <option value="GEMINI_API_KEY">Gemini</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
            <span className="text-[var(--text-muted)]">Key name (vault slot)</span>
            <input
              type="text"
              readOnly
              value={data.vaultProvider}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] font-mono text-[var(--text-muted)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
            <span className="text-[var(--text-muted)]">API key</span>
            <input
              type="password"
              autoComplete="off"
              value={data.vaultKeyValue}
              onChange={(e) => data.setVaultKeyValue(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={data.llmBusy === data.vaultProvider || !data.vaultKeyValue.trim()}
          onClick={() => void data.saveVaultKeyFromSecurity()}
          className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
        >
          Save
        </button>
      </section>

      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Active sessions
          </h3>
          <button
            type="button"
            disabled={data.sessionsLoading}
            onClick={() => void data.loadSecurity()}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40"
          >
            Refresh
          </button>
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
            return (
              <div
                key={String(s.id)}
                className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] items-center text-[11px]"
              >
                <div className="col-span-1">
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                    {String(s.provider || 'email')}
                  </span>
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
        <button
          type="button"
          onClick={() => void data.revokeOtherSessions()}
          className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          Revoke All Other Sessions
        </button>
      </section>

      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">MCP Auth Token</h3>
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

      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Security findings
        </h3>
        {data.findings.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-3 text-[11px] text-[var(--color-success)]">
            No security findings detected
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
            <div className="grid grid-cols-5 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
              <div className="col-span-1">Severity</div>
              <div className="col-span-2">Title</div>
              <div className="col-span-1">Date</div>
              <div className="col-span-1">Info</div>
            </div>
            {data.findings.map((f, i) => (
              <div
                key={String(f.id || i)}
                className="grid grid-cols-5 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center"
              >
                <div className="col-span-1">
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                    {String(f.severity || 'info')}
                  </span>
                </div>
                <div className="col-span-2 text-[var(--text-main)] truncate">{String(f.title || '')}</div>
                <div className="col-span-1 text-[10px] text-[var(--text-muted)]">
                  {f.created_at ? new Date(String(f.created_at)).toLocaleDateString() : '—'}
                </div>
                <div className="col-span-1 text-[10px] text-[var(--text-muted)] truncate">
                  {String(f.description || '').slice(0, 40)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
