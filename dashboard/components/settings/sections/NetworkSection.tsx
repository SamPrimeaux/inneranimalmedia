import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
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

export type NetworkSectionProps = { data: SettingsPanelModel };

type DomainRow = {
  workspace_id?: string;
  domain?: string;
  status?: string;
  verified_at?: string | number | null;
  created_at?: string | number | null;
};

type AllowlistRow = {
  host?: string;
  scope?: string;
  notes?: string | null;
  created_at?: string | number | null;
};

type TrustedOriginRow = {
  origin?: string;
  scope?: string;
  notes?: string | null;
  created_at?: string | number | null;
};

type IntegrationEndpointRow = {
  slug?: string;
  display_name?: string;
  base_url?: string;
  auth_type?: string;
  is_active?: number;
};

type NetworkSummary = {
  fetch_allowlist_count?: number;
  trusted_origins_count?: number;
  workspace_domains_count?: number;
  integration_endpoints_count?: number;
  worker_base_url?: string | null;
};

type NetworkExtra = {
  fetch_allowlist?: AllowlistRow[];
  trusted_origins?: TrustedOriginRow[];
  integration_endpoints?: IntegrationEndpointRow[];
};

export function NetworkSection({ data }: NetworkSectionProps) {
  const worker = data.workerBaseUrl?.trim() || '';
  const { data: section, loading, error, reload } = useSettingsSectionStatus<DomainRow>({
    endpoint: '/api/settings/network',
  });

  const summary = (section?.summary || {}) as NetworkSummary;
  const extra = (section?.extra || {}) as NetworkExtra;

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <SectionHeader
        title="Network"
        description="Workspace domains, fetch/origin allowlists, and integration endpoint registry. Add/remove actions are disabled until validation endpoints are wired."
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

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">
          Worker base URL
        </div>
        <code className="text-[12px] font-mono break-all text-[var(--solar-blue)] mt-1 block">
          {worker || (summary.worker_base_url as string | undefined) || 'Not configured'}
        </code>
      </div>

      {error ? (
        <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-xl px-3 py-2">
          {error}
        </div>
      ) : null}
      {loading && !section ? <LoadingRow /> : null}

      {section ? (
        <>
          <SummaryGrid
            items={[
              { label: 'Workspace domains', value: String(summary.workspace_domains_count ?? 0) },
              { label: 'Fetch allowlist', value: String(summary.fetch_allowlist_count ?? 0) },
              { label: 'Trusted origins', value: String(summary.trusted_origins_count ?? 0) },
              { label: 'Integration endpoints', value: String(summary.integration_endpoints_count ?? 0) },
            ]}
          />

          <WarningStrip warnings={section.warnings} />

          <ActionRow actions={section.actions} />

          <section className="flex flex-col gap-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Workspace domains
            </div>
            {(section.rows || []).length === 0 ? (
              <EmptyState message="No rows in workspace_domains for this workspace." />
            ) : (
              <DataTable<DomainRow>
                emptyMessage="No domains."
                rows={(section.rows || []) as DomainRow[]}
                columns={[
                  { key: 'domain', label: 'Domain', widthClass: 'minmax(0, 1.5fr)' },
                  { key: 'status', label: 'Status', widthClass: 'minmax(0, 0.5fr)' },
                  {
                    key: 'verified_at',
                    label: 'Verified',
                    widthClass: 'minmax(0, 0.7fr)',
                    render: (row) => <RelTime value={row.verified_at ?? null} />,
                  },
                  {
                    key: 'created_at',
                    label: 'Added',
                    widthClass: 'minmax(0, 0.7fr)',
                    render: (row) => <RelTime value={row.created_at ?? null} />,
                  },
                ]}
              />
            )}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Trusted browser origins
              </div>
              {(extra.trusted_origins || []).length === 0 ? (
                <EmptyState message="No agentsam_browser_trusted_origin rows." />
              ) : (
                <DataTable<TrustedOriginRow>
                  emptyMessage="No origins."
                  rows={extra.trusted_origins || []}
                  columns={[
                    { key: 'origin', label: 'Origin' },
                    { key: 'scope', label: 'Scope' },
                  ]}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                Fetch domain allowlist
              </div>
              {(extra.fetch_allowlist || []).length === 0 ? (
                <EmptyState message="No agentsam_fetch_domain_allowlist rows." />
              ) : (
                <DataTable<AllowlistRow>
                  emptyMessage="No hosts."
                  rows={extra.fetch_allowlist || []}
                  columns={[
                    { key: 'host', label: 'Host' },
                    { key: 'scope', label: 'Scope' },
                  ]}
                />
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Integration endpoints (registry)
            </div>
            {(extra.integration_endpoints || []).length === 0 ? (
              <EmptyState message="No integration_registry rows." />
            ) : (
              <DataTable<IntegrationEndpointRow>
                emptyMessage="No endpoints."
                rows={extra.integration_endpoints || []}
                columns={[
                  { key: 'display_name', label: 'Provider', widthClass: 'minmax(0, 1fr)' },
                  { key: 'base_url', label: 'Base URL', widthClass: 'minmax(0, 1.5fr)' },
                  { key: 'auth_type', label: 'Auth', widthClass: 'minmax(0, 0.5fr)' },
                  {
                    key: 'is_active',
                    label: 'Active',
                    widthClass: 'minmax(0, 0.4fr)',
                    render: (row) => (Number(row.is_active) === 1 ? 'yes' : 'no'),
                  },
                ]}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
