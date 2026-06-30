import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  Github,
  Globe,
  Loader2,
  RefreshCw,
  Shield,
} from 'lucide-react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import {
  findConnectedItem,
  isIntegrationConnected,
  PROJECT_SERVICE_TILES,
  tileIconSlug,
  connectedSubtitle,
  useWorkspaceSnapshot,
  type KeyRow,
  type OpSettings,
} from '../hooks/useWorkspaceSnapshot';
import { IntegrationIconTile } from '../components/IntegrationIconTile';
import { CfStackWizard, CfStackSummary, type CfStackConfig } from './CfStackWizard';
import { WorkspaceActiveSwitcher } from '../components/WorkspaceActiveSwitcher';
import { initialsFromDisplayName, relativeTime } from '../settingsUi';

export type WorkspaceSectionProps = { data: SettingsPanelModel; workspaceId?: string | null };

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 space-y-3 ${className}`}
    >
      <h3 className="text-[10px] font-black uppercase tracking-widest text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[12px] py-1.5 border-b border-[var(--border-subtle)]/60 last:border-0">
      <span className="text-muted shrink-0 min-w-[100px]">{label}</span>
      <span className="text-main text-right break-all">{children}</span>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'text-[var(--accent-success)] border-[var(--accent-success)]/30 bg-[var(--accent-success)]/10'
      : tone === 'warn'
        ? 'text-[var(--accent-warning)] border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10'
        : tone === 'bad'
          ? 'text-[var(--accent-danger)] border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10'
          : 'text-muted border-[var(--border-subtle)] bg-[var(--bg-hover)]';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}

function deployCommand(op: OpSettings): string {
  return (
    op.deploy_stack_command?.trim() ||
    op.deploy_command?.trim() ||
    'npm run deploy:full'
  );
}

function workerName(ws: Record<string, unknown> | null, op: OpSettings): string {
  return (
    op.cf_worker_name?.trim() ||
    (ws?.worker_name != null ? String(ws.worker_name) : '') ||
    (ws?.slug != null ? String(ws.slug) : '') ||
    '—'
  );
}

function productionDomain(ws: Record<string, unknown> | null, op: OpSettings): string {
  const deployUrl = ws?.deploy_url != null ? String(ws.deploy_url).trim() : '';
  if (deployUrl) {
    try {
      return new URL(deployUrl.startsWith('http') ? deployUrl : `https://${deployUrl}`).hostname;
    } catch {
      return deployUrl.replace(/^https?:\/\//, '').split('/')[0];
    }
  }
  const slug = String(ws?.slug || ws?.workspace_slug || '').trim();
  return slug ? `${slug}.inneranimalmedia.com` : 'inneranimalmedia.com';
}

const WATCH_SECRETS: { id: string; label: string; hint?: string }[] = [
  { id: 'openai', label: 'OPENAI_API_KEY' },
  { id: 'anthropic', label: 'ANTHROPIC_API_KEY' },
  { id: 'supabase', label: 'SUPABASE_URL', hint: 'Supabase project URL' },
  { id: 'supabase', label: 'SUPABASE_SERVICE_ROLE_KEY', hint: 'Supabase service role' },
  { id: 'resend', label: 'RESEND_API_KEY', hint: 'Required for email sending' },
  { id: 'cloudflare', label: 'CLOUDFLARE_API_TOKEN' },
];

function secretRows(keys: KeyRow[]) {
  const byProvider = new Map<string, KeyRow>();
  for (const k of keys) {
    const p = String(k.provider || k.secret_name || k.label || '').toLowerCase();
    if (p && !byProvider.has(p)) byProvider.set(p, k);
  }

  return WATCH_SECRETS.map((w) => {
    const hit =
      keys.find((k) => String(k.label || '').toUpperCase() === w.label) ||
      keys.find((k) => String(k.secret_name || '').toUpperCase() === w.label) ||
      byProvider.get(w.id);
    const set = Boolean(hit && String(hit.status || 'active').toLowerCase() !== 'revoked');
    return { ...w, set, row: hit };
  });
}

export function WorkspaceSection({ data, workspaceId }: WorkspaceSectionProps) {
  const navigate = useNavigate();
  const wsId = workspaceId?.trim() || '';
  const { loading, error, snapshot, reload, runHealthCheck, healthChecking } = useWorkspaceSnapshot(wsId);
  const [cfWizardOpen, setCfWizardOpen] = useState(false);

  const ws = snapshot.workspace;
  const op = snapshot.opSettings;
  const cfConfig = op as CfStackConfig;

  const displayName = String(ws?.display_name || ws?.name || ws?.slug || 'Workspace');
  const repo =
    snapshot.git?.repo_full_name ||
    snapshot.git?.repo ||
    String(ws?.github_repo || op.github_repo || '').trim() ||
    null;
  const branch = snapshot.git?.branch || 'main';
  const healthOverall = String(snapshot.health?.overall || '').toLowerCase();
  const healthTone: 'ok' | 'warn' | 'bad' | 'muted' =
    healthOverall === 'healthy' ? 'ok' : healthOverall === 'degraded' ? 'warn' : healthOverall === 'down' ? 'bad' : 'muted';

  const githubOk = isIntegrationConnected(snapshot.connected, 'github') && Boolean(repo);
  const cfOk = isIntegrationConnected(snapshot.connected, 'cloudflare_oauth');
  const secrets = useMemo(() => secretRows(snapshot.keys), [snapshot.keys]);
  const secretsSet = secrets.filter((s) => s.set).length;

  const snapshotLine = [
    healthOverall === 'healthy' ? 'Healthy' : healthOverall ? healthOverall : 'Status unknown',
    cfOk ? 'Cloudflare connected' : 'Cloudflare not linked',
    githubOk ? 'GitHub repo connected' : 'Repo not linked',
  ].join(' · ');

  if (loading && !ws) {
    return <div className="text-[12px] text-muted py-8">Loading workspace…</div>;
  }

  if (error && !ws) {
    return <div className="text-[12px] text-[var(--accent-danger)] py-8">{error}</div>;
  }

  const resolvedWorkspaceId =
    (typeof ws?.id === "string" && ws.id.trim()) ||
    (typeof ws?.workspace_id === "string" && String(ws.workspace_id).trim()) ||
    wsId ||
    "—";

  return (
    <div className="flex flex-col gap-5 max-w-5xl pb-8">
      <div>
        <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
          Workspace
        </h2>
        <p className="text-[11px] text-muted mt-1">
          Project connections, deploy target, and infrastructure at a glance.
        </p>
      </div>

      <WorkspaceActiveSwitcher />

      {/* 1 · Project snapshot */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-[var(--bg-panel)] to-[var(--bg-app)] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[22px] font-semibold text-[var(--text-heading)] tracking-tight">
              {displayName}
            </div>
            <div className="text-[12px] text-muted">{snapshotLine}</div>
            <div className="flex flex-wrap gap-2 pt-2">
              <StatusPill tone={healthTone}>
                {healthOverall === 'healthy' ? 'Live' : healthOverall || 'Unknown'}
              </StatusPill>
              {githubOk ? <StatusPill tone="ok">Repo linked</StatusPill> : <StatusPill tone="muted">No repo</StatusPill>}
              {cfOk ? <StatusPill tone="ok">Cloudflare</StatusPill> : <StatusPill tone="warn">CF OAuth needed</StatusPill>}
              <StatusPill tone={secretsSet >= 3 ? 'ok' : 'warn'}>
                {secretsSet} secrets configured
              </StatusPill>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              className="text-[11px] px-3 py-2 rounded-lg bg-[var(--solar-blue)] text-[var(--toggle-knob)]"
              onClick={() => window.open(`https://${productionDomain(ws, op)}`, '_blank', 'noopener,noreferrer')}
            >
              Open site
            </button>
            {repo ? (
              <button
                type="button"
                className="text-[11px] px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-main hover:bg-[var(--bg-hover)]"
                onClick={() => window.open(`https://github.com/${repo}`, '_blank', 'noopener,noreferrer')}
              >
                Open repo
              </button>
            ) : null}
            <button
              type="button"
              disabled={healthChecking}
              className="text-[11px] px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-main hover:bg-[var(--bg-hover)] inline-flex items-center gap-1.5 disabled:opacity-50"
              onClick={() => void runHealthCheck()}
            >
              {healthChecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Health check
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-app)]/50 px-4 py-2">
          <Row label="Domain">{productionDomain(ws, op)}</Row>
          <Row label="Repo">{repo || '—'}</Row>
          <Row label="Branch">{branch}</Row>
          <Row label="Deploy">{workerName(ws, op)} · Cloudflare Workers</Row>
          <Row label="Last deploy">
            {snapshot.lastDeploy.at ? relativeTime(snapshot.lastDeploy.at) : '—'}
          </Row>
          <Row label="Workspace ID">
            <code className="text-[10px] font-mono">{resolvedWorkspaceId}</code>
          </Row>
        </div>
      </div>

      {/* 2 · Connected services */}
      <Panel title="Connected services">
        <div className="iam-app-icon-grid max-w-4xl">
          {PROJECT_SERVICE_TILES.map((def) => {
            const item = findConnectedItem(snapshot.connected, def.registryKey);
            const connected = isIntegrationConnected(snapshot.connected, def.registryKey);
            const subtitle = connected
              ? def.registryKey === 'github' && repo
                ? `${branch}${snapshot.git?.behind_by ? ` · ${snapshot.git.behind_by} behind` : ''}`
                : connectedSubtitle(item)
              : 'Not connected';
            return (
              <IntegrationIconTile
                key={def.id}
                title={def.title}
                iconSlug={tileIconSlug(def, item)}
                subtitle={subtitle}
                status={
                  connected
                    ? null
                    : def.registryKey === 'cloudflare_oauth' && !cfConfig.cf_stack_configured_at
                      ? 'warning'
                      : 'error'
                }
                onClick={() => navigate(def.settingsPath)}
              />
            );
          })}
        </div>
        <button
          type="button"
          className="text-[11px] text-[var(--solar-blue)] hover:underline"
          onClick={() => navigate('/dashboard/settings/integrations')}
        >
          Manage integrations →
        </button>
      </Panel>

      {/* Cloudflare stack (operational — not themes) */}
      {cfOk && wsId ? (
        <Panel title="Cloudflare stack">
          {cfConfig.cf_stack_configured_at ? (
            <>
              <CfStackSummary config={cfConfig} />
              <button
                type="button"
                className="text-[11px] px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-main w-fit"
                onClick={() => setCfWizardOpen(true)}
              >
                Reconfigure D1 / Worker / Tunnel
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted">
                OAuth is connected. Select which D1 database, Worker, and Tunnel belong to this workspace.
              </p>
              <button
                type="button"
                className="text-[11px] px-3 py-2 rounded-lg bg-[var(--solar-blue)] text-[var(--toggle-knob)] w-fit"
                onClick={() => setCfWizardOpen(true)}
              >
                Configure Cloudflare stack →
              </button>
            </>
          )}
        </Panel>
      ) : null}

      {/* 3 · Repo + deploy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Repository">
          <Row label="Owner">{repo ? repo.split('/')[0] : '—'}</Row>
          <Row label="Repo">{repo ? repo.split('/')[1] || repo : '—'}</Row>
          <Row label="Branch">{branch}</Row>
          <Row label="Last commit">
            {snapshot.git?.checkpoint_sha
              ? String(snapshot.git.checkpoint_sha).slice(0, 7)
              : snapshot.lastDeploy.git_sha
                ? String(snapshot.lastDeploy.git_sha).slice(0, 7)
                : '—'}
          </Row>
          <Row label="Sync">
            {snapshot.git?.status === 'live' ? 'Synced with GitHub' : String(snapshot.git?.status || '—')}
          </Row>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-muted hover:text-main inline-flex items-center gap-1"
              onClick={() => navigate('/dashboard/settings/github')}
            >
              <Github size={13} /> GitHub settings
            </button>
            {repo ? (
              <button
                type="button"
                className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-muted hover:text-main inline-flex items-center gap-1"
                onClick={() => window.open(`https://github.com/${repo}`, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink size={13} /> Open repo
              </button>
            ) : null}
          </div>
        </Panel>

        <Panel title="Deployment">
          <Row label="Provider">Cloudflare Workers</Row>
          <Row label="Worker">{workerName(ws, op)}</Row>
          <Row label="Environment">production</Row>
          <Row label="Command">
            <code className="text-[10px] font-mono">{deployCommand(op)}</code>
          </Row>
          <Row label="Last deploy">
            {snapshot.lastDeploy.at ? relativeTime(snapshot.lastDeploy.at) : '—'}
          </Row>
          <Row label="Result">
            <StatusPill tone={String(snapshot.lastDeploy.status || '').toLowerCase().includes('fail') ? 'bad' : 'ok'}>
              {snapshot.lastDeploy.status || '—'}
            </StatusPill>
          </Row>
          <button
            type="button"
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-muted hover:text-main mt-1"
            onClick={() => navigate('/dashboard/settings/cicd')}
          >
            CI/CD details →
          </button>
        </Panel>
      </div>

      {/* 4 · Secrets + domains */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Worker secrets">
          <p className="text-[10px] text-muted -mt-1">Status only — values never shown here.</p>
          <ul className="space-y-2">
            {secrets.map((s) => (
              <li
                key={s.label}
                className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border-subtle)]/50 last:border-0"
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-mono text-main">{s.label}</div>
                  {s.hint && !s.set ? (
                    <div className="text-[10px] text-muted">{s.hint}</div>
                  ) : s.row?.updated_at ? (
                    <div className="text-[10px] text-muted">
                      {relativeTime(s.row.updated_at)}
                    </div>
                  ) : null}
                </div>
                <StatusPill tone={s.set ? 'ok' : 'bad'}>{s.set ? 'Set' : 'Missing'}</StatusPill>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-muted hover:text-main inline-flex items-center gap-1"
            onClick={() => navigate('/dashboard/settings/keys')}
          >
            <Shield size={13} /> Keys &amp; secrets
          </button>
        </Panel>

        <Panel title="Domains &amp; data">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Domains</div>
              <Row label={productionDomain(ws, op)}>Active</Row>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Routes</div>
              <Row label="/api/*">Worker</Row>
              <Row label="/dashboard/*">App shell</Row>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Storage</div>
              <Row label="D1">
                {op.cf_d1_database_name || op.cf_d1_database_id ? 'Connected' : 'Not configured'}
              </Row>
              <Row label="R2">
                {snapshot.health?.services?.find((s) => s.service === 'r2')?.status === 'healthy'
                  ? 'Connected'
                  : 'Unknown'}
              </Row>
              <Row label="Supabase">
                {isIntegrationConnected(snapshot.connected, 'supabase_oauth') ? 'Connected' : 'Not connected'}
              </Row>
            </div>
          </div>
          <button
            type="button"
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-muted hover:text-main inline-flex items-center gap-1"
            onClick={() => navigate('/dashboard/settings/network')}
          >
            <Globe size={13} /> Network settings
          </button>
        </Panel>
      </div>

      {/* Team (compact) */}
      {snapshot.members.length > 0 ? (
        <Panel title="Team">
          <ul className="space-y-2">
            {snapshot.members
              .filter((m) => String(m.status || 'active') !== 'removed')
              .slice(0, 8)
              .map((m) => (
                <li key={String(m.member_id || m.user_id)} className="flex items-center gap-3 py-1">
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center text-[10px] font-bold text-[var(--solar-cyan)]">
                    {initialsFromDisplayName(String(m.display_name || m.email || '?'))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-main truncate">
                      {String(m.display_name || m.email || '—')}
                    </div>
                    <div className="text-[10px] text-muted">{String(m.role || 'member')}</div>
                  </div>
                </li>
              ))}
          </ul>
        </Panel>
      ) : null}

      {/* 5 · Activity + code index */}
      <Panel title="Recent activity">
        {snapshot.activity.length === 0 ? (
          <p className="text-[11px] text-muted">No workspace audit events yet.</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.activity.slice(0, 8).map((ev, i) => (
              <li key={i} className="text-[11px] text-main flex justify-between gap-2">
                <span>{String(ev.action || 'event').replace(/\./g, ' · ')}</span>
                <span className="text-muted shrink-0">{relativeTime(ev.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Code index">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted">
            Refresh the Agent Sam codebase index for this workspace.
          </p>
          <button
            type="button"
            onClick={() => void data.postWorkspaceReindex()}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-muted hover:text-main shrink-0"
          >
            Re-index
          </button>
        </div>
        {data.workspaceData?.indexJob ? (
          <div className="text-[10px] text-muted">
            Status: {String(data.workspaceData.indexJob.status || '—')} ·{' '}
            {relativeTime(data.workspaceData.indexJob.last_sync_at)}
          </div>
        ) : null}
      </Panel>

      {wsId ? (
        <CfStackWizard
          open={cfWizardOpen}
          workspaceId={wsId}
          onClose={() => setCfWizardOpen(false)}
          onComplete={() => void reload()}
        />
      ) : null}
    </div>
  );
}
