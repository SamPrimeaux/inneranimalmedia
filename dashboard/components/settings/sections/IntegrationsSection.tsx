import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IntegrationCard, type CatalogRow, type ConnectionRow } from '../components/IntegrationCard';
import { IntegrationIconTile } from '../components/IntegrationIconTile';
import { catalogSlugForRegistry, isSlugConnected, registrySlugForCatalog } from '../../../lib/integrationSlugAliases';
import {
  CfStackWizard,
  CfStackSummary,
  type CfStackConfig,
} from './CfStackWizard';

import '../../ui/AppIcon.css';

type ConnectedItem = {
  catalog: CatalogRow | null;
  connection: ConnectionRow | null;
  legacy: { is_connected?: number; last_used?: string } | null;
  iam_hosted: boolean;
  integration_status?: { connected?: boolean; error?: string };
};

export type IntegrationsSectionProps = {
  userId?: string | null;
  workspaceId?: string | null;
  onOpenInMonaco?: (content: string, virtualPath: string) => void;
};

type TabId = 'connected' | 'available' | 'custom';

function integrationTileStatus(item: ConnectedItem): 'warning' | 'error' | null {
  const st = String(item.connection?.status || '').toLowerCase();
  if (st === 'auth_expired') return 'error';
  if (st === 'degraded') return 'warning';
  if (item.integration_status?.error === 'token_expired') return 'error';
  if (item.integration_status?.error === 'tunnel_unreachable') return 'warning';
  return null;
}

function integrationSubtitle(item: ConnectedItem): string {
  const st = String(item.connection?.status || '').toLowerCase();
  if (st === 'connected') return 'Connected';
  if (st === 'auth_expired') return 'Reconnect';
  if (st === 'degraded') return 'Issue';
  return st || 'Setup';
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((j as { error?: string }).error || res.statusText || 'Request failed');
  }
  return j as T;
}

export function IntegrationsSection({
  workspaceId,
  onOpenInMonaco,
}: IntegrationsSectionProps) {
  const [tab, setTab] = useState<TabId>('connected');
  const [connected, setConnected] = useState<ConnectedItem[]>([]);
  const [connectedSlugs, setConnectedSlugs] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [customRows, setCustomRows] = useState<
    { id: string; provider_key: string; display_name: string; account_display?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>('');
  const [cfStackConfig, setCfStackConfig] = useState<CfStackConfig | null>(null);
  const [cfWizardOpen, setCfWizardOpen] = useState(false);

  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customAuth, setCustomAuth] = useState<'none' | 'bearer' | 'oauth'>('none');
  const [customBearer, setCustomBearer] = useState('');
  const [customBusy, setCustomBusy] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const loadConnected = useCallback(async () => {
    const data = await fetchJson<{
      items: ConnectedItem[];
      connected_slugs?: string[];
    }>('/api/settings/integrations/connected');
    setConnected(data.items || []);
    setConnectedSlugs(
      new Set(
        (data.connected_slugs || [])
          .map((s) => s.toLowerCase())
          .filter(Boolean),
      ),
    );
  }, []);

  const loadCatalog = useCallback(async () => {
    const data = await fetchJson<{ integrations: CatalogRow[] }>(
      '/api/catalog/integrations',
    );
    setCatalog(data.integrations || []);
  }, []);

  const loadCustom = useCallback(async () => {
    const data = await fetchJson<{ items: typeof customRows }>(
      '/api/settings/integrations/custom',
    );
    setCustomRows(data.items || []);
  }, []);

  const loadCfStackConfig = useCallback(async () => {
    const ws = workspaceId?.trim();
    if (!ws) {
      setCfStackConfig(null);
      return;
    }
    try {
      const data = await fetchJson<{ settings_json?: CfStackConfig }>(
        `/api/workspace/settings?workspace_id=${encodeURIComponent(ws)}`,
      );
      setCfStackConfig(data.settings_json || null);
    } catch {
      setCfStackConfig(null);
    }
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadConnected();
        if (cancelled) return;
        await Promise.all([
          loadCatalog().catch(() => {
            /* catalog may 500 if table missing */
          }),
          loadCfStackConfig().catch(() => {}),
        ]);
      } catch (e) {
        if (!cancelled) {
          setErr(String(e instanceof Error ? e.message : e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadConnected, loadCatalog, loadCfStackConfig]);

  useEffect(() => {
    if (tab === 'available') {
      loadCatalog().catch(() => {});
    }
    if (tab === 'custom') {
      loadCustom().catch(() => {});
    }
  }, [tab, loadCatalog, loadCustom]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const c of catalog) {
      if (c.category) s.add(String(c.category));
    }
    return Array.from(s).sort();
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    if (!catFilter) return catalog;
    return catalog.filter((c) => String(c.category) === catFilter);
  }, [catalog, catFilter]);

  const cfOAuthConnected = useMemo(
    () =>
      connected.some(
        (item) =>
          String(item.connection?.provider_key || '').toLowerCase() === 'cloudflare_oauth' &&
          String(item.connection?.status || '').toLowerCase() === 'connected',
      ),
    [connected],
  );

  const cfStackConfigured = Boolean(cfStackConfig?.cf_stack_configured_at);

  const onConnectOAuth = useCallback((slug: string) => {
    window.location.href = `/api/integrations/${encodeURIComponent(slug)}/connect`;
  }, []);

  const onConnectApiKey = useCallback(async (slug: string, apiKey: string) => {
    await fetchJson(`/api/integrations/${encodeURIComponent(slug)}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    await loadConnected();
  }, [loadConnected]);

  const onDisconnect = useCallback(
    async (slug: string) => {
      await fetchJson(`/api/integrations/${encodeURIComponent(slug)}/disconnect`, {
        method: 'POST',
      });
      await loadConnected();
    },
    [loadConnected],
  );

  const onTest = useCallback(async (slug: string) => {
    const res = await fetch(
      `/api/settings/integrations/${encodeURIComponent(slug)}/test`,
      { method: 'POST', credentials: 'same-origin' },
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      latency_ms?: number;
      error?: string;
    };
    if (!res.ok) {
      return { status: 'error', latency_ms: j.latency_ms, error: j.error || res.statusText };
    }
    return {
      status: j.ok ? 'connected' : 'degraded',
      latency_ms: j.latency_ms,
      error: j.error,
    };
  }, []);

  const saveCustomMcp = useCallback(async () => {
    setCustomBusy(true);
    try {
      await fetchJson('/api/settings/integrations/custom-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: customName,
          endpoint_url: customUrl,
          auth_type: customAuth,
          bearer_token: customAuth === 'bearer' ? customBearer : undefined,
        }),
      });
      setCustomName('');
      setCustomUrl('');
      setCustomBearer('');
      await loadCustom();
      await loadConnected();
    } finally {
      setCustomBusy(false);
    }
  }, [customAuth, customBearer, customName, customUrl, loadCustom, loadConnected]);

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div>
        <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
          Integrations
        </h2>
        <p className="text-[11px] text-muted mt-1">
          Connect third-party services and MCP endpoints. OAuth completes in the provider window,
          then returns here.
        </p>
      </div>

      <div className="flex gap-1 border-b border-[var(--border-subtle)] pb-2">
        {(
          [
            ['connected', 'Connected'],
            ['available', 'Available'],
            ['custom', 'Custom'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`text-[11px] px-3 py-1.5 rounded-lg border ${
              tab === id
                ? 'border-[var(--solar-blue)] text-[var(--text-heading)] bg-[var(--bg-hover)]'
                : 'border-transparent text-muted hover:bg-[var(--bg-hover)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {err ? (
        <div className="text-[11px] text-[var(--accent-danger)]">{err}</div>
      ) : null}

      {loading && tab === 'connected' ? (
        <div className="text-[11px] text-muted">Loading connections…</div>
      ) : null}

      {tab === 'connected' ? (
        <div className="flex flex-col gap-4">
          {connected.length === 0 && !loading ? (
            <div className="text-[11px] text-muted">
              No integration rows for this workspace yet. Use Available to connect.
            </div>
          ) : null}
          {connected.length ? (
            <div className="iam-app-icon-grid max-w-4xl">
              {connected.map((item, idx) => {
                const slug = String(
                  item.connection?.provider_key || item.catalog?.slug || idx,
                );
                const catalogSlug = catalogSlugForRegistry(slug);
                const title = String(item.catalog?.name || item.connection?.display_name || slug);
                const isSelected = selectedSlug === slug;
                return (
                  <IntegrationIconTile
                    key={slug}
                    title={title}
                    iconSlug={item.catalog?.icon_slug || catalogSlug}
                    imageUrl={item.catalog?.icon_url}
                    status={integrationTileStatus(item)}
                    subtitle={integrationSubtitle(item)}
                    onClick={() => setSelectedSlug(isSelected ? null : slug)}
                  />
                );
              })}
            </div>
          ) : null}
          {selectedSlug ? (
            connected
              .filter((item) => {
                const slug = String(item.connection?.provider_key || item.catalog?.slug || '');
                return slug === selectedSlug;
              })
              .map((item) => {
                const slug = String(item.connection?.provider_key || item.catalog?.slug || selectedSlug);
                return (
                  <div key={`detail-${slug}`} className="flex flex-col gap-3">
                    <IntegrationCard
                      mode="connected"
                      initialExpanded
                      catalog={item.catalog}
                      connection={item.connection}
                      legacy={item.legacy}
                      iamHosted={item.iam_hosted}
                      onConnectOAuth={onConnectOAuth}
                      onConnectApiKey={onConnectApiKey}
                      onDisconnect={onDisconnect}
                      onTest={onTest}
                      onOpenInMonaco={onOpenInMonaco}
                    />
                    {slug === 'cloudflare_oauth' && cfOAuthConnected ? (
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4 flex flex-col gap-2">
                        <div className="text-[12px] font-semibold text-[var(--text-heading)]">
                          Cloudflare stack
                        </div>
                        {cfStackConfigured ? (
                          <>
                            <p className="text-[10px] text-muted">
                              Workspace bindings are configured.
                            </p>
                            <CfStackSummary config={cfStackConfig} />
                            <button
                              type="button"
                              onClick={() => setCfWizardOpen(true)}
                              className="text-[11px] px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-main w-fit mt-1"
                            >
                              Reconfigure stack
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-[10px] text-muted">
                              OAuth is connected. Pick which D1, Worker, and Tunnel belong to this
                              workspace.
                            </p>
                            <button
                              type="button"
                              disabled={!workspaceId?.trim()}
                              onClick={() => setCfWizardOpen(true)}
                              className="text-[11px] px-3 py-2 rounded-lg bg-[var(--solar-blue)] text-[var(--toggle-knob)] w-fit disabled:opacity-50"
                            >
                              Configure your CF stack →
                            </button>
                            {!workspaceId?.trim() ? (
                              <p className="text-[10px] text-[var(--accent-warning)]">
                                Select an active workspace to configure stack bindings.
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
          ) : connected.length ? (
            <p className="text-[10px] text-muted">
              Tap an app icon to manage connection, test, or disconnect.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'available' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`text-[10px] px-2 py-1 rounded-full border ${
                !catFilter
                  ? 'border-[var(--solar-blue)] text-[var(--text-heading)]'
                  : 'border-[var(--border-subtle)] text-muted'
              }`}
              onClick={() => setCatFilter('')}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`text-[10px] px-2 py-1 rounded-full border ${
                  catFilter === c
                    ? 'border-[var(--solar-blue)] text-[var(--text-heading)]'
                    : 'border-[var(--border-subtle)] text-muted'
                }`}
                onClick={() => setCatFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {filteredCatalog.length === 0 ? (
            <div className="text-[11px] text-muted">
              No catalog entries returned. Ensure integration_catalog is populated in D1.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="iam-app-icon-grid max-w-4xl">
                {filteredCatalog.map((row) => {
                  const slug = String(row.slug || '').toLowerCase();
                  const isConn = isSlugConnected(slug, connectedSlugs);
                  const isIam =
                    String(row.category || '').toLowerCase() === 'iam_hosted' ||
                    ['agentsam', 'autodidact'].includes(slug);
                  return (
                    <IntegrationIconTile
                      key={slug || String(row.id)}
                      title={String(row.name || slug)}
                      iconSlug={row.icon_slug || slug}
                      imageUrl={row.icon_url}
                      subtitle={isConn ? 'Connected' : isIam ? 'Hosted' : 'Connect'}
                      onClick={() => {
                        if (isIam) {
                          setSelectedSlug(slug);
                          return;
                        }
                        if (isConn) {
                          setTab('connected');
                          setSelectedSlug(registrySlugForCatalog(slug));
                          return;
                        }
                        onConnectOAuth(slug);
                      }}
                    />
                  );
                })}
              </div>
              {selectedSlug ? (
                filteredCatalog
                  .filter((row) => String(row.slug || '').toLowerCase() === selectedSlug)
                  .map((row) => {
                    const slug = String(row.slug || '').toLowerCase();
                    const isConn = isSlugConnected(slug, connectedSlugs);
                    const isIam =
                      String(row.category || '').toLowerCase() === 'iam_hosted' ||
                      ['agentsam', 'autodidact'].includes(slug);
                    return (
                      <IntegrationCard
                        key={`available-detail-${slug}`}
                        mode="available"
                        catalog={row}
                        connection={null}
                        connected={isConn}
                        iamHosted={isIam}
                        onConnectOAuth={isIam ? undefined : onConnectOAuth}
                        onConnectApiKey={isIam ? undefined : onConnectApiKey}
                      />
                    );
                  })
              ) : (
                <p className="text-[10px] text-muted">
                  Tap an icon to connect OAuth or view hosted MCP details.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'custom' ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4 flex flex-col gap-3">
            <div className="text-[12px] font-semibold text-[var(--text-heading)]">
              Add custom MCP
            </div>
            <label className="text-[10px] text-muted flex flex-col gap-1">
              Display name
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px]"
              />
            </label>
            <label className="text-[10px] text-muted flex flex-col gap-1">
              Endpoint URL (https)
              <input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://example.com/mcp"
                className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px] font-mono"
              />
            </label>
            <label className="text-[10px] text-muted flex flex-col gap-1">
              Auth
              <select
                value={customAuth}
                onChange={(e) =>
                  setCustomAuth(e.target.value as 'none' | 'bearer' | 'oauth')
                }
                className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px]"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="oauth">OAuth (stored as connection placeholder)</option>
              </select>
            </label>
            {customAuth === 'bearer' ? (
              <label className="text-[10px] text-muted flex flex-col gap-1">
                Bearer token
                <input
                  type="password"
                  value={customBearer}
                  onChange={(e) => setCustomBearer(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px]"
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={customBusy}
              onClick={() => void saveCustomMcp()}
              className="text-[11px] px-3 py-2 rounded-lg bg-[var(--solar-blue)] text-[var(--toggle-knob)] w-fit"
            >
              {customBusy ? 'Saving…' : 'Test and save'}
            </button>
          </div>

          <div className="text-[11px] font-semibold text-[var(--text-heading)]">
            Custom MCP connections
          </div>
          {customRows.length === 0 ? (
            <div className="text-[11px] text-muted">None yet.</div>
          ) : (
            <ul className="text-[11px] text-main space-y-1">
              {customRows.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 border-b border-[var(--border-subtle)] pb-1">
                  <span>{r.display_name || r.provider_key}</span>
                  <span className="text-muted truncate font-mono text-[10px]">
                    {r.account_display || r.provider_key}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {workspaceId?.trim() ? (
        <CfStackWizard
          open={cfWizardOpen}
          workspaceId={workspaceId.trim()}
          onClose={() => setCfWizardOpen(false)}
          onComplete={() => void loadCfStackConfig()}
        />
      ) : null}
    </div>
  );
}
