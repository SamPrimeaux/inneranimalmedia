import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { initialsFromDisplayName, relativeTime } from '../settingsUi';

export type WorkspaceSectionProps = { data: SettingsPanelModel };

export function WorkspaceSection({ data }: WorkspaceSectionProps) {
  const wd = data.workspaceData;
  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Workspace</h2>
      {data.workspaceError2 ? (
        <div className="text-[11px] text-[var(--color-danger)]">{data.workspaceError2}</div>
      ) : null}
      {data.workspaceLoading2 && !wd ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading workspace…</div>
      ) : null}
      {wd && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Workspace info
            </div>
            <div className="mt-2 text-[18px] text-[var(--text-heading)] font-semibold">
              {String(wd.workspace?.name || '—')}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--solar-cyan)]">
                {String(wd.workspace?.slug || wd.workspace_id || '—')}
              </code>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    String(wd.workspace?.slug || wd.workspace_id || ''),
                  )
                }
                className="px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                Copy
              </button>
            </div>
            <div className="mt-2 text-[11px] text-[var(--text-muted)]">
              Tenant: <span className="font-mono">{String(wd.workspace?.tenant_id || '—')}</span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Created:{' '}
              {wd.workspace?.created_at
                ? new Date(String(wd.workspace.created_at)).toLocaleDateString()
                : '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Members
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                {Array.isArray(wd.members) ? wd.members.length : 0}
              </span>
            </div>
            {(Array.isArray(wd.members) ? wd.members : []).map((m: any) => {
              const role = String(m.role || 'member');
              const roleClass =
                role === 'owner'
                  ? 'text-[var(--color-warning)]'
                  : role === 'admin'
                    ? 'text-[var(--solar-blue)]'
                    : 'text-[var(--text-muted)]';
              return (
                <div
                  key={String(m.user_id)}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center text-[11px] font-bold text-[var(--solar-cyan)]">
                      {initialsFromDisplayName(String(m.display_name || m.email || '?'))}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] text-[var(--text-main)] truncate">
                        {String(m.display_name || '—')}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        {String(m.email || '—')}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-black uppercase tracking-widest ${roleClass}`}
                  >
                    {role}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Limits
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  Max daily cost
                </div>
                <div className="mt-1 text-[12px] text-[var(--text-main)] font-mono">
                  {wd.workspace?.max_daily_cost_usd != null
                    ? `$${Number(wd.workspace.max_daily_cost_usd).toFixed(2)} / day`
                    : 'No limits configured'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  Max members
                </div>
                <div className="mt-1 text-[12px] text-[var(--text-main)] font-mono">
                  {wd.workspace?.max_members != null
                    ? `${Number(wd.workspace.max_members)} members`
                    : 'No limits configured'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Code index
              </div>
              <button
                type="button"
                onClick={() => void data.postWorkspaceReindex()}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                Re-index
              </button>
            </div>
            {wd.indexJob ? (
              <div className="mt-3 text-[11px]">
                <div className="flex items-center gap-2">
                  {(() => {
                    const st = String(wd.indexJob.status || 'idle');
                    const cls =
                      st === 'running'
                        ? 'text-[var(--solar-blue)]'
                        : st === 'complete'
                          ? 'text-[var(--color-success)]'
                          : st === 'error'
                            ? 'text-[var(--color-danger)]'
                            : 'text-[var(--text-muted)]';
                    const label =
                      st === 'running'
                        ? 'Indexing…'
                        : st === 'complete'
                          ? 'Up to date'
                          : st === 'error'
                            ? 'Error'
                            : 'Not indexed';
                    return (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-black uppercase tracking-widest ${cls}`}
                      >
                        {label}
                      </span>
                    );
                  })()}
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {Number(wd.indexJob.indexed_file_count || 0)} / {Number(wd.indexJob.file_count || 0)}{' '}
                    files
                  </span>
                </div>
                {String(wd.indexJob.status || '') === 'running' ? (
                  <div className="mt-2 h-2 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--solar-cyan)]"
                      style={{
                        width: `${Math.max(0, Math.min(100, Number(wd.indexJob.progress_percent || 0)))}%`,
                      }}
                    />
                  </div>
                ) : null}
                <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                  Last sync:{' '}
                  {wd.indexJob.last_sync_at ? relativeTime(wd.indexJob.last_sync_at) : 'Never'}
                </div>
                {wd.indexJob.last_error ? (
                  <div className="mt-1 text-[10px] text-[var(--color-danger)]">
                    {String(wd.indexJob.last_error)}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 text-[11px] text-[var(--text-muted)]">No index job found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
