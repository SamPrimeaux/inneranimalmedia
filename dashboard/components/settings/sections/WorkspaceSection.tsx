import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { initialsFromDisplayName, relativeTime } from '../settingsUi';

type CmsPipeline = {
  cms_editing_mode?: string;
  storage_output?: string;
  default_theme_slug?: string;
  platform_r2_upload?: boolean | number;
  r2?: {
    bucket_name?: string;
    binding_name?: string;
    public_base_url?: string;
    cms_prefix?: string;
    themes_prefix?: string;
    captures_prefix?: string;
  };
  github?: {
    branch?: string;
    theme_package_path?: string;
    cms_export_path?: string;
    pr_preference?: string;
  };
  agent_sam_cms?: Record<string, boolean | string | number>;
  browser_monaco?: Record<string, boolean | string | number>;
  validation?: { require_approval_publish?: boolean };
};

const CMS_MODES: { v: string; label: string }[] = [
  { v: 'preview_only', label: 'Preview only' },
  { v: 'draft_edits', label: 'Draft edits' },
  { v: 'live_session', label: 'Live edit session' },
  { v: 'publish_approval', label: 'Publish with approval' },
  { v: 'agent_assisted', label: 'Agent-assisted edits' },
];

const STORAGE_OPTS: { v: string; label: string }[] = [
  { v: 'platform_r2', label: 'InnerAnimalMedia R2 (platform)' },
  { v: 'workspace_r2', label: 'Workspace R2' },
  { v: 'github', label: 'GitHub repo' },
  { v: 'zip', label: 'Export zip' },
  { v: 'ask', label: 'Ask each time' },
];

const AGENT_KEYS: { key: string; label: string }[] = [
  { key: 'inspect_only', label: 'Inspect only' },
  { key: 'draft_changes', label: 'Draft changes' },
  { key: 'create_theme_packages', label: 'Create theme packages' },
  { key: 'upload_r2', label: 'Upload to R2' },
  { key: 'apply_workspace_theme', label: 'Apply workspace theme' },
  { key: 'publish_after_approval_only', label: 'Publish only after approval' },
  { key: 'rollback', label: 'Rollback' },
];

const BROWSER_MONACO_KEYS: { key: string; label: string }[] = [
  { key: 'browser_inspect_dom', label: 'BrowserView inspect DOM' },
  { key: 'browser_map_cms', label: 'Map selection → CMS sections (when metadata exists)' },
  { key: 'monaco_open_sources', label: 'Monaco open source / R2 / GitHub files' },
  { key: 'chat_receive_selection', label: 'ChatAssistant receives BrowserView selection' },
  { key: 'agent_propose_edits', label: 'Agent Sam proposes edits' },
  { key: 'agent_apply_draft', label: 'Agent Sam applies draft edits' },
  { key: 'agent_validate_browser', label: 'Validate with BrowserView / Playwright' },
  { key: 'agent_approval_publish', label: 'Approval before publish' },
];

export type WorkspaceSectionProps = { data: SettingsPanelModel; workspaceId?: string | null };

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted">{title}</div>
      {children}
    </div>
  );
}

export function WorkspaceSection({ data, workspaceId }: WorkspaceSectionProps) {
  const navigate = useNavigate();
  const wd = data.workspaceData;
  const pipe = (wd?.workspace?.cms_pipeline || {}) as CmsPipeline;
  const ws = wd?.workspace;
  const githubConnected = Array.isArray(data.repos) && data.repos.length > 0;

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const platformEligible = wd?.platform_r2_eligible === true;
  const prefSlug = wd?.cms_context?.theme_preference_slug ?? null;

  const patch = useCallback(
    async (partial: Record<string, unknown>) => {
      setSaving(true);
      setSaveErr(null);
      try {
        await data.patchWorkspaceCmsPipeline(partial);
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [data],
  );

  const r2 = useMemo(() => pipe.r2 || {}, [pipe.r2]);
  const ghPipe = useMemo(() => pipe.github || {}, [pipe.github]);
  const agentSam = useMemo(() => pipe.agent_sam_cms || {}, [pipe.agent_sam_cms]);
  const bm = useMemo(() => pipe.browser_monaco || {}, [pipe.browser_monaco]);

  const copyToClipboard = (t: string) => {
    void navigator.clipboard.writeText(t);
  };

  const r2Configured =
    !!(r2.public_base_url && String(r2.public_base_url).trim()) ||
    !!(ws?.r2_prefix && String(ws.r2_prefix).trim());

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
        Workspace · CMS &amp; theme pipeline
      </h2>
      {saveErr ? <div className="text-[11px] text-[var(--color-danger)]">{saveErr}</div> : null}
      {saving ? <div className="text-[11px] text-muted">Saving…</div> : null}

      {data.workspaceError2 ? (
        <div className="text-[11px] text-[var(--color-danger)]">{data.workspaceError2}</div>
      ) : null}
      {data.workspaceLoading2 && !wd ? (
        <div className="text-[12px] text-muted">Loading workspace…</div>
      ) : null}

      {wd?.notice ? (
        <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--bg-app)] px-3 py-2 text-[11px] text-muted">
          {String(wd.notice)}
        </div>
      ) : null}

      {ws && (
        <div className="flex flex-col gap-3">
          <Card title="A · Workspace identity">
            <div className="text-[18px] text-[var(--text-heading)] font-semibold">
              {String(ws.name || ws.display_name || '—')}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-muted">Slug</span>
              <code className="px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--solar-cyan)]">
                {String(ws.slug || workspaceId || '—')}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(String(ws.slug || workspaceId || ''))}
                className="px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] text-muted hover:text-main"
              >
                Copy
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-muted">Tenant</span>
              <code className="px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] font-mono">
                {String(ws.tenant_id || '—')}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(String(ws.tenant_id || ''))}
                className="px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] text-muted hover:text-main"
              >
                Copy
              </button>
            </div>
            <div className="text-[11px] text-muted">
              Workspace id ·{' '}
              <code className="font-mono text-main">{String(ws.id || workspaceId || '—')}</code>{' '}
              <button
                type="button"
                onClick={() => copyToClipboard(String(ws.id || workspaceId || ''))}
                className="ml-1 px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[10px]"
              >
                Copy
              </button>
            </div>
            <div className="text-[11px] text-muted">
              Created:{' '}
              {ws.created_at ? new Date(String(ws.created_at)).toLocaleDateString() : '—'}
            </div>
          </Card>

          <Card title="B · Theme defaults">
            <div className="text-[11px] text-muted space-y-1">
              <div>
                Active preference (D1):{' '}
                <span className="font-mono text-main">{prefSlug || '—'}</span>
              </div>
              <div>
                Workspace theme column:{' '}
                <span className="font-mono text-main">{String(ws.theme_id ?? ws.theme_set ?? '—')}</span>
              </div>
            </div>
            <label className="block text-[11px] text-muted">
              Default theme slug (pipeline metadata)
              <input
                defaultValue={pipe.default_theme_slug || ''}
                key={pipe.default_theme_slug || ''}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-[12px] text-main"
                placeholder="iam-storm-white"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  void patch({ default_theme_slug: v || undefined });
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-muted hover:text-main"
                onClick={() => navigate('/dashboard/settings/themes')}
              >
                Open theme browser
              </button>
            </div>
            <p className="text-[10px] text-muted">
              Preference scope is stored in <code className="font-mono">cms_theme_preferences</code> (workspace).
            </p>
          </Card>

          <Card title="C · CMS editing mode">
            <select
              className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-[12px] text-main"
              value={pipe.cms_editing_mode || 'preview_only'}
              onChange={(e) => void patch({ cms_editing_mode: e.target.value })}
            >
              {CMS_MODES.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </Card>

          <Card title="D · Storage / output target">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-[11px] space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-muted">Platform R2 seamless upload</span>
                <span
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                    platformEligible
                      ? 'border-[var(--color-success)]/50 text-[var(--color-success)]'
                      : 'border-[var(--border-subtle)] text-muted'
                  }`}
                >
                  {platformEligible ? 'Eligible' : 'Not eligible'}
                </span>
              </div>
              <p className="text-[10px] text-muted">
                Eligibility uses workspace <code className="font-mono">cms_pipeline</code>, or env{' '}
                <code className="font-mono">CMS_THEME_PLATFORM_WORKSPACE_IDS</code> — no hardcoded workspace IDs.
              </p>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-main">
              <input
                type="checkbox"
                checked={pipe.platform_r2_upload === true || pipe.platform_r2_upload === 1}
                onChange={(e) => void patch({ platform_r2_upload: e.target.checked })}
              />
              Allow platform R2 uploads for this workspace (requires ASSETS binding + eligibility)
            </label>
            <label className="block text-[11px] text-muted">
              Preferred storage output
              <select
                className="mt-1 w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-[12px] text-main"
                value={pipe.storage_output || (platformEligible ? 'platform_r2' : 'ask')}
                onChange={(e) => void patch({ storage_output: e.target.value })}
              >
                {STORAGE_OPTS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {!platformEligible && (pipe.storage_output === 'platform_r2' || pipe.platform_r2_upload) ? (
              <p className="text-[10px] text-[var(--color-warning)]">
                Platform R2 is selected but not eligible — theme packaging will fall back to export unless you configure
                env allowlists or workspace flags.
              </p>
            ) : null}
          </Card>

          <Card title="E · R2 configuration">
            <div className="text-[11px] space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted">Status</span>
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                  {r2Configured ? 'Partial / configured' : 'Not configured'}
                </span>
              </div>
              <p className="text-[10px] text-muted">
                Binding names come from the Worker env (e.g. ASSETS). Store display metadata here for Agent Sam output
                routing.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              {(
                [
                  ['bucket_name', 'Bucket name'],
                  ['binding_name', 'Binding name (display)'],
                  ['public_base_url', 'Public base URL'],
                  ['cms_prefix', 'CMS prefix'],
                  ['themes_prefix', 'Themes prefix'],
                  ['captures_prefix', 'Captures prefix'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-muted">
                  {label}
                  <input
                    defaultValue={String((r2 as Record<string, string>)[key] || '')}
                    className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-2 py-1.5 text-[12px] text-main"
                    onBlur={(e) =>
                      void patch({
                        r2: { ...r2, [key]: e.target.value.trim() || undefined },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-muted hover:text-main disabled:opacity-40"
                disabled={!r2.public_base_url?.trim()}
                onClick={() => {
                  const u = String(r2.public_base_url || '').trim();
                  if (u) window.open(u, '_blank', 'noopener,noreferrer');
                }}
              >
                Test public base URL
              </button>
            </div>
          </Card>

          <Card title="F · Repo / GitHub">
            <div className="text-[11px] text-muted space-y-1">
              <div>
                Workspace repo field:{' '}
                <span className="font-mono text-main">{String(ws.github_repo || '—')}</span>
              </div>
              <div>
                GitHub integration:{' '}
                <span className={githubConnected ? 'text-[var(--color-success)]' : ''}>
                  {githubConnected ? 'Connected (repos list non-empty)' : 'Not configured'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              {(
                [
                  ['branch', 'Branch'],
                  ['theme_package_path', 'Theme package path'],
                  ['cms_export_path', 'CMS export path'],
                  ['pr_preference', 'PR / push preference'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-muted">
                  {label}
                  <input
                    defaultValue={String((ghPipe as Record<string, string>)[key] || '')}
                    className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-2 py-1.5 text-[12px] text-main"
                    onBlur={(e) =>
                      void patch({
                        github: { ...ghPipe, [key]: e.target.value.trim() || undefined },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </Card>

          <Card title="G · Agent Sam CMS permissions">
            <p className="text-[10px] text-muted">
              Stored under <code className="font-mono">cms_pipeline.agent_sam_cms</code>. Unchecked means “off” unless you
              set defaults elsewhere.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AGENT_KEYS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-[11px] text-main">
                  <input
                    type="checkbox"
                    checked={agentSam[key] === true || agentSam[key] === 1}
                    onChange={(e) =>
                      void patch({
                        agent_sam_cms: { ...agentSam, [key]: e.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Card>

          <Card title="H · BrowserView + Monaco CMS editing">
            <p className="text-[10px] text-muted mb-2">
              Capability flags for the realtime loop (BrowserView → ChatAssistant → Monaco). If integrations are not
              wired, leave these off — Agent Sam reads workspace metadata only.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {BROWSER_MONACO_KEYS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-[11px] text-main">
                  <input
                    type="checkbox"
                    checked={bm[key] === true || bm[key] === 1}
                    onChange={(e) =>
                      void patch({
                        browser_monaco: { ...bm, [key]: e.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted mt-2">
              <input
                type="checkbox"
                checked={pipe.validation?.require_approval_publish === true}
                onChange={(e) =>
                  void patch({
                    validation: {
                      ...(pipe.validation || {}),
                      require_approval_publish: e.target.checked,
                    },
                  })
                }
              />
              Require approval before publish (validation)
            </label>
          </Card>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted">
                Members
              </div>
              <span className="text-[10px] text-muted">
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
                    : 'text-muted';
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
                      <div className="text-[12px] text-main truncate">
                        {String(m.display_name || '—')}
                      </div>
                      <div className="text-[10px] text-muted truncate">
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
            <div className="text-[10px] font-black uppercase tracking-widest text-muted">
              Limits
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
                <div className="text-[10px] text-muted uppercase tracking-wider">
                  Max daily cost
                </div>
                <div className="mt-1 text-[12px] text-main font-mono">
                  {ws.max_daily_cost_usd != null
                    ? `$${Number(ws.max_daily_cost_usd).toFixed(2)} / day`
                    : 'No limits configured'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
                <div className="text-[10px] text-muted uppercase tracking-wider">
                  Max members
                </div>
                <div className="mt-1 text-[12px] text-main font-mono">
                  {ws.max_members != null
                    ? `${Number(ws.max_members)} members`
                    : 'No limits configured'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted">
                Code index
              </div>
              <button
                type="button"
                onClick={() => void data.postWorkspaceReindex()}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-muted hover:text-main"
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
                            : 'text-muted';
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
                  <span className="text-[10px] text-muted">
                    {Number(wd.indexJob.indexed_file_count || 0)} / {Number(wd.indexJob.file_count || 0)} files
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
                <div className="mt-2 text-[10px] text-muted">
                  Last sync: {wd.indexJob.last_sync_at ? relativeTime(wd.indexJob.last_sync_at) : 'Never'}
                </div>
                {wd.indexJob.last_error ? (
                  <div className="mt-1 text-[10px] text-[var(--color-danger)]">
                    {String(wd.indexJob.last_error)}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 text-[11px] text-muted">No index job found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
