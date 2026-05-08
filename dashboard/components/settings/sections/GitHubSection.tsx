import React from 'react';
import { ExternalLink, GitBranch } from 'lucide-react';
import type { GitRepo } from '../types';
import { StatusDot } from '../settingsUi';
import { useSettingsSectionStatus } from '../hooks/useSettingsSectionStatus';
import {
  ActionRow,
  DataTable,
  EmptyState,
  LoadingRow,
  ProviderCard,
  RelTime,
  SectionHeader,
  SummaryGrid,
  WarningStrip,
} from '../components/SectionPrimitives';

export type GitHubSectionProps = { repos: GitRepo[] };

type ConnectionRow = {
  id?: string;
  provider_key?: string;
  status?: string;
  account_label?: string | null;
  resource_label?: string | null;
  last_synced_at?: string | number | null;
  updated_at?: string | number | null;
};

type IndexJobRow = {
  id?: string;
  repo_full_name?: string;
  status?: string;
  started_at?: string | number | null;
  finished_at?: string | number | null;
  indexed_files?: number;
};

type AuditRow = {
  id?: string;
  provider_key?: string;
  event_type?: string;
  severity?: string;
  created_at?: string | number | null;
};

type GithubSummary = {
  connection_status?: string;
  connection_count?: number;
  oauth_token_count?: number;
  latest_index_job_status?: string | null;
  latest_index_job_at?: string | number | null;
};

type GithubExtra = {
  oauth_tokens?: Array<{
    provider?: string;
    account_label?: string | null;
    scope?: string | null;
    updated_at?: string | number | null;
    expires_at?: string | number | null;
  }>;
  code_index_jobs?: IndexJobRow[];
  audit_log?: AuditRow[];
};

export function GitHubSection({ repos }: GitHubSectionProps) {
  const { data: section, loading, error, reload } = useSettingsSectionStatus<ConnectionRow>({
    endpoint: '/api/settings/github',
  });
  const summary = (section?.summary || {}) as GithubSummary;
  const extra = (section?.extra || {}) as GithubExtra;
  const provider = section?.providers?.[0];

  const onAction = (key: string) => {
    if (key === 'connect_github') {
      window.location.href = '/api/integrations/github/connect';
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <SectionHeader
        title="GitHub"
        description="Connection status from integration_connections, codebase index history, and recent integration audit events."
        right={
          <button
            type="button"
            onClick={() => reload()}
            disabled={loading}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {error ? (
        <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-xl px-3 py-2">
          {error}
        </div>
      ) : null}
      {loading && !section ? <LoadingRow /> : null}

      {section ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {provider ? <ProviderCard p={provider} /> : null}
            <SummaryGrid
              items={[
                { label: 'Connections', value: String(summary.connection_count ?? 0) },
                { label: 'OAuth tokens', value: String(summary.oauth_token_count ?? 0) },
                {
                  label: 'Last index',
                  value: summary.latest_index_job_status || '—',
                  hint: summary.latest_index_job_at ? undefined : 'no jobs yet',
                },
              ]}
            />
          </div>
          <WarningStrip warnings={section.warnings} />
          <ActionRow actions={section.actions} onAction={onAction} />
        </>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Repositories (from GitHub API)
        </div>
        {repos.length === 0 ? (
          <EmptyState message="No repos returned from /api/integrations/github/repos." />
        ) : (
          <div className="flex flex-col gap-2">
            {repos.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl hover:border-[var(--solar-cyan)]/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                    <GitBranch size={13} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">
                      {r.repo_full_name}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">
                      branch: {r.default_branch}{' '}
                      {r.cloudflare_worker_name ? `· worker: ${r.cloudflare_worker_name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusDot on={!!r.is_active} />
                  <a
                    href={r.repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {section ? (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Code index jobs
            </div>
            {(extra.code_index_jobs || []).length === 0 ? (
              <EmptyState message="No agentsam_code_index_job rows." />
            ) : (
              <DataTable<IndexJobRow>
                emptyMessage="No jobs."
                rows={extra.code_index_jobs || []}
                columns={[
                  { key: 'repo_full_name', label: 'Repo' },
                  { key: 'status', label: 'Status' },
                  {
                    key: 'finished_at',
                    label: 'Finished',
                    render: (row) => (
                      <RelTime value={row.finished_at ?? row.started_at ?? null} />
                    ),
                  },
                  {
                    key: 'indexed_files',
                    label: 'Files',
                    render: (row) => (row.indexed_files != null ? String(row.indexed_files) : '—'),
                  },
                ]}
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Audit events (integration_audit_log)
            </div>
            {(extra.audit_log || []).length === 0 ? (
              <EmptyState message="No GitHub-related audit rows." />
            ) : (
              <DataTable<AuditRow>
                emptyMessage="No events."
                rows={extra.audit_log || []}
                columns={[
                  {
                    key: 'created_at',
                    label: 'When',
                    render: (row) => <RelTime value={row.created_at ?? null} />,
                  },
                  { key: 'event_type', label: 'Event' },
                  { key: 'severity', label: 'Severity' },
                ]}
              />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
