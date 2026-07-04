import React, { useState } from 'react';
import { LocalTerminalSettingsPanel } from '../../LocalTerminalSetup';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { useSettingsSectionStatus } from '../hooks/useSettingsSectionStatus';
import {
  DataTable,
  EmptyState,
  LoadingRow,
  RelTime,
  SectionHeader,
  SummaryGrid,
  WarningStrip,
} from '../components/SectionPrimitives';

export type NetworkSectionProps = { data: SettingsPanelModel; workspaceId?: string | null };

type DomainRow = {
  workspace_id?: string;
  domain?: string;
  status?: string;
  verified_at?: string | number | null;
  created_at?: string | number | null;
};

type AllowlistRow = {
  host?: string;
  notes?: string | null;
  created_at?: string | number | null;
};

type TrustedOriginRow = {
  origin?: string;
  notes?: string | null;
  created_at?: string | number | null;
};

type IntegrationEndpointRow = {
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

export function NetworkSection({ data, workspaceId }: NetworkSectionProps) {
  const worker = data.workerBaseUrl?.trim() || '';
  const { data: section, loading, error, reload } = useSettingsSectionStatus<DomainRow>({
    endpoint: '/api/settings/network',
  });

  const summary = (section?.summary || {}) as NetworkSummary;
  const extra = (section?.extra || {}) as NetworkExtra;

  // ── Add domain state ────────────────────────────────────────────────────
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainSuccess, setDomainSuccess] = useState<string | null>(null);

  // ── Remove domain state ─────────────────────────────────────────────────
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function handleAddDomain() {
    const domain = domainInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain) {
      setDomainError('Enter a domain name.');
      return;
    }
    if (!workspaceId) {
      setDomainError('No workspace selected.');
      return;
    }
    setDomainSaving(true);
    setDomainError(null);
    setDomainSuccess(null);
    try {
      const res = await fetch('/api/settings/network/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ domain, workspace_id: workspaceId }),
      });
      const json = await res.json() as { ok: boolean; error?: string; domain?: string };
      if (!json.ok) {
        setDomainError(json.error || 'Failed to add domain.');
      } else {
        setDomainSuccess(`${json.domain} added.`);
        setDomainInput('');
        setShowAddDomain(false);
        reload();
      }
    } catch (e: unknown) {
      setDomainError(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setDomainSaving(false);
    }
  }

  async function handleRemoveDomain(domain: string) {
    if (!workspaceId) return;
    setRemovingDomain(domain);
    setRemoveError(null);
    try {
      const res = await fetch('/api/settings/network/domains', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ domain, workspace_id: workspaceId }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) {
        setRemoveError(json.error || 'Failed to remove domain.');
      } else {
        reload();
      }
    } catch (e: unknown) {
      setRemoveError(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setRemovingDomain(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <LocalTerminalSettingsPanel workspaceId={workspaceId ?? undefined} />

      <SectionHeader
        title="Network"
        description="Workspace domains, fetch/origin allowlists, and integration endpoint registry."
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

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted font-semibold">
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

          {/* ── Workspace Domains ───────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted">
                Workspace domains
              </div>
              {workspaceId ? (
                <button
                  type="button"
                  onClick={() => { setShowAddDomain((v) => !v); setDomainError(null); setDomainSuccess(null); }}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-muted hover:text-main"
                >
                  {showAddDomain ? 'Cancel' : '+ Add domain'}
                </button>
              ) : (
                <span className="text-[10px] text-muted italic">Select a workspace to add domains</span>
              )}
            </div>

            {showAddDomain && (
              <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
                <div className="text-[11px] text-muted">
                  Enter a bare hostname (e.g. <code>example.com</code>). No protocol or trailing slash.
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddDomain(); }}
                    placeholder="example.com"
                    className="flex-1 text-[12px] font-mono bg-[var(--bg-input,var(--bg-app))] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-main placeholder:text-muted outline-none focus:border-[var(--solar-blue)]"
                    disabled={domainSaving}
                  />
                  <button
                    type="button"
                    onClick={handleAddDomain}
                    disabled={domainSaving || !domainInput.trim()}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-[var(--solar-blue)] text-white disabled:opacity-50"
                  >
                    {domainSaving ? 'Adding…' : 'Add'}
                  </button>
                </div>
                {domainError && (
                  <div className="text-[11px] text-[var(--color-danger)]">{domainError}</div>
                )}
                {domainSuccess && (
                  <div className="text-[11px] text-[var(--color-success,#22c55e)]">{domainSuccess}</div>
                )}
              </div>
            )}

            {removeError && (
              <div className="text-[11px] text-[var(--color-danger)] px-1">{removeError}</div>
            )}

            {(section.rows || []).length === 0 ? (
              <EmptyState message="No workspace domains registered." />
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
                  {
                    key: 'domain',
                    label: '',
                    widthClass: 'minmax(0, 0.4fr)',
                    render: (row) =>
                      workspaceId ? (
                        <button
                          type="button"
                          onClick={() => row.domain && handleRemoveDomain(row.domain)}
                          disabled={removingDomain === row.domain}
                          className="text-[10px] text-[var(--color-danger)] opacity-60 hover:opacity-100 disabled:opacity-30"
                        >
                          {removingDomain === row.domain ? 'Removing…' : 'Remove'}
                        </button>
                      ) : null,
                  },
                ]}
              />
            )}
          </section>

          {/* ── Trusted origins + Fetch allowlist ──────────────────────── */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted">
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
                    { key: 'notes', label: 'Notes' },
                  ]}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted">
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
                    { key: 'notes', label: 'Notes' },
                  ]}
                />
              )}
            </div>
          </section>

          {/* ── Integration endpoints ───────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted">
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
