import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Key, Plus, RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  LoadingRow,
  RelTime,
  SectionHeader,
  SummaryGrid,
  WarningStrip,
} from '../components/SectionPrimitives';

type ApiKeyItem = {
  id: string;
  workspace_id: string | null;
  provider: string | null;
  label: string | null;
  status: string;
  scope: string;
  last_four: string;
  created_at: string | null;
  updated_at: string | null;
  last_used_at: string | null;
  rotated_at: string | null;
  expires_at: string | number | null;
};

type AuditRow = {
  id: string;
  api_key_id: string;
  event_type: string;
  actor: string | null;
  previous_last4: string | null;
  new_last4: string | null;
  notes: string | null;
  created_at: string | number | null;
};

function providerLabel(p: string | null) {
  const s = String(p || '').toLowerCase();
  const map: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    cloudflare: 'Cloudflare',
    resend: 'Resend',
    github: 'GitHub',
    supabase: 'Supabase',
    other: 'Other',
  };
  return map[s] || (p ? p : '—');
}

function badgeClass(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'active')
    return 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]';
  if (s === 'revoked')
    return 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]';
  if (s === 'disabled')
    return 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]';
  return 'border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-muted)]';
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${badgeClass(
        status,
      )}`}
    >
      {status || 'unknown'}
    </span>
  );
}

function ScopePill({ scope }: { scope: string }) {
  const s = String(scope || '').toLowerCase() || 'workspace';
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-muted)]">
      {s}
    </span>
  );
}

export type ApiKeysSectionProps = { workspaceId?: string | null };

function apiKeysJsonHeaders(workspaceId: string | null) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (workspaceId) h['X-IAM-Workspace-Id'] = workspaceId;
  return h;
}

function readApiError(j: Record<string, unknown>, fallback: string): string {
  const msg = j.message;
  const err = j.error;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  return fallback;
}

export function ApiKeysSection({ workspaceId }: ApiKeysSectionProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ApiKeyItem[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [provider, setProvider] = useState('openai');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [scope, setScope] = useState<'user' | 'workspace'>('workspace');
  const [expiresAt, setExpiresAt] = useState('');

  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<ApiKeyItem | null>(null);
  const [newApiKey, setNewApiKey] = useState('');

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);

  const ws = workspaceId || null;

  const load = useCallback(async () => {
    if (!ws) {
      setItems([]);
      setLoading(false);
      setError('workspaceId missing');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/settings/api-keys`, {
        credentials: 'same-origin',
        headers: ws ? { 'X-IAM-Workspace-Id': ws } : undefined,
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { items?: ApiKeyItem[] };
      if (!r.ok) throw new Error(readApiError(j, `Load failed (${r.status})`));
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [ws]);

  const loadAudit = useCallback(async () => {
    if (!ws) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const r = await fetch(`/api/settings/api-keys/audit?limit=20`, {
        credentials: 'same-origin',
        headers: ws ? { 'X-IAM-Workspace-Id': ws } : undefined,
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { items?: AuditRow[] };
      if (!r.ok) throw new Error(readApiError(j, `Audit load failed (${r.status})`));
      setAuditRows(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      setAuditRows([]);
      setAuditError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setAuditLoading(false);
    }
  }, [ws]);

  useEffect(() => {
    void load();
    void loadAudit();
  }, [load, loadAudit]);

  const summary = useMemo(() => {
    const active = items.filter((i) => String(i.status || '').toLowerCase() === 'active').length;
    const revoked = items.filter((i) => String(i.status || '').toLowerCase() === 'revoked').length;
    return {
      total: items.length,
      active,
      revoked,
      providers: new Set(items.map((i) => String(i.provider || '').toLowerCase()).filter(Boolean)).size,
    };
  }, [items]);

  const onCreate = async () => {
    if (!ws) return;
    const labelT = label.trim();
    const keyT = apiKey.trim();
    if (!provider.trim()) {
      setError('Provider is required.');
      return;
    }
    if (!labelT) {
      setError('Label is required.');
      return;
    }
    if (!keyT) {
      setError('API key is required.');
      return;
    }
    if (!scope) {
      setError('Scope is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/settings/api-keys', {
        method: 'POST',
        credentials: 'same-origin',
        headers: apiKeysJsonHeaders(ws),
        body: JSON.stringify({
          provider: provider.trim().toLowerCase(),
          label: labelT,
          key_name: labelT,
          api_key: keyT,
          scope,
          expires_at: expiresAt.trim() ? expiresAt.trim() : null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new Error(readApiError(j, `Create failed (${r.status})`));
      setCreateOpen(false);
      setLabel('');
      setApiKey('');
      setProvider('openai');
      setScope('workspace');
      setExpiresAt('');
      await load();
      await loadAudit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const openRotate = (row: ApiKeyItem) => {
    setRotateTarget(row);
    setNewApiKey('');
    setRotateOpen(true);
  };

  const onRotate = async () => {
    if (!ws || !rotateTarget) return;
    setRotatingId(rotateTarget.id);
    setError(null);
    const keyToSend = newApiKey;
    setNewApiKey('');
    try {
      const r = await fetch(`/api/settings/api-keys/${encodeURIComponent(rotateTarget.id)}/rotate`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: apiKeysJsonHeaders(ws),
        body: JSON.stringify({ api_key: keyToSend }),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new Error(readApiError(j, `Rotate failed (${r.status})`));
      setRotateOpen(false);
      setRotateTarget(null);
      await load();
      await loadAudit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotate failed');
    } finally {
      setRotatingId(null);
    }
  };

  const onRevoke = async (row: ApiKeyItem) => {
    if (!ws) return;
    if (!window.confirm(`Revoke "${row.label || row.id}"? This cannot be undone.`)) return;
    setRevokingId(row.id);
    setError(null);
    try {
      const r = await fetch(`/api/settings/api-keys/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: apiKeysJsonHeaders(ws),
        body: JSON.stringify({}),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new Error(readApiError(j, `Revoke failed (${r.status})`));
      await load();
      await loadAudit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <SectionHeader
        title="API Keys"
        description="Store workspace API keys securely. Keys are encrypted at rest and never shown again after you save them."
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              title="Refresh"
            >
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw size={12} />
                Refresh
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--solar-cyan)]/50 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/10"
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus size={12} />
                Add key
              </span>
            </button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 px-3 py-2 text-[11px] text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      <SummaryGrid
        items={[
          { label: 'Total', value: summary.total },
          { label: 'Active', value: summary.active },
          { label: 'Revoked', value: summary.revoked },
          { label: 'Providers', value: summary.providers },
        ]}
      />

      {loading ? (
        <LoadingRow label="Loading API keys…" />
      ) : items.length === 0 ? (
        <EmptyState message="No API keys saved yet. Add a key to get started." />
      ) : (
        <DataTable<ApiKeyItem>
          emptyMessage="No API keys saved yet."
          columns={[
            {
              key: 'provider',
              label: 'Provider',
              widthClass: '140px',
              render: (r) => (
                <span className="inline-flex items-center gap-2">
                  <Key size={14} className="text-[var(--text-muted)]" />
                  <span className="text-[var(--text-main)]">{providerLabel(r.provider)}</span>
                </span>
              ),
            },
            {
              key: 'label',
              label: 'Label',
              widthClass: '1.4fr',
              render: (r) => (
                <div className="min-w-0">
                  <div className="truncate">{r.label || '—'}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                    ••••{r.last_four}
                  </div>
                </div>
              ),
            },
            {
              key: 'scope',
              label: 'Scope',
              widthClass: '110px',
              render: (r) => <ScopePill scope={r.scope} />,
            },
            {
              key: 'status',
              label: 'Status',
              widthClass: '110px',
              render: (r) => <StatusPill status={r.status} />,
            },
            {
              key: 'rotated_at',
              label: 'Rotated',
              widthClass: '110px',
              render: (r) => <RelTime value={r.rotated_at} />,
            },
            {
              key: 'last_used_at',
              label: 'Last used',
              widthClass: '110px',
              render: (r) => <RelTime value={r.last_used_at} />,
            },
            {
              key: 'actions',
              label: '',
              widthClass: '210px',
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={rotatingId === r.id}
                    onClick={() => openRotate(r)}
                    className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                    title="Rotate"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <RotateCw size={12} />
                      Rotate
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={revokingId === r.id}
                    onClick={() => void onRevoke(r)}
                    className="text-[10px] px-2 py-1 rounded border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
                    title="Revoke"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Trash2 size={12} />
                      Revoke
                    </span>
                  </button>
                </div>
              ),
            },
          ]}
          rows={items}
        />
      )}

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Audit (latest)
          </div>
          <button
            type="button"
            onClick={() => void loadAudit()}
            className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
          >
            Refresh
          </button>
        </div>
        {auditError ? (
          <WarningStrip
            warnings={[{ code: 'AUDIT_LOAD_FAILED', message: auditError, severity: 'warn' }]}
          />
        ) : null}
        {auditLoading ? (
          <LoadingRow label="Loading audit…" />
        ) : auditRows.length === 0 ? (
          <EmptyState message="No API key audit events yet." />
        ) : (
          <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-app)]">
            {auditRows.slice(0, 12).map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--border-subtle)] text-[11px]"
              >
                <div className="min-w-0">
                  <div className="text-[var(--text-main)] truncate">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      {a.event_type}
                    </span>{' '}
                    <span className="text-[var(--text-muted)]">·</span>{' '}
                    <span className="text-[var(--text-muted)] font-mono truncate">{a.api_key_id}</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">
                    {a.actor ? `actor: ${a.actor}` : 'actor: —'}
                    {a.new_last4 ? ` · last4: ${a.new_last4}` : ''}
                  </div>
                </div>
                <div className="shrink-0">
                  <RelTime value={a.created_at} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {createOpen && (
        <div className="fixed inset-0 z-[250]">
          <div
            className="absolute inset-0 bg-[var(--text-main)]/40"
            onClick={() => setCreateOpen(false)}
            role="presentation"
          />
          <div className="absolute top-0 right-0 h-full w-[520px] max-w-[92vw] bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="text-[12px] font-semibold text-[var(--text-heading)]">Add API key</div>
              <button
                type="button"
                className="text-[11px] text-[var(--text-muted)]"
                onClick={() => setCreateOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Provider</span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                >
                  {['openai', 'anthropic', 'google', 'cloudflare', 'resend', 'github', 'supabase', 'other'].map(
                    (p) => (
                      <option key={p} value={p}>
                        {providerLabel(p)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Label</span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="OpenAI production key"
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">API key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                />
                <div className="text-[10px] text-[var(--text-muted)]">
                  This key will not be shown again after you save it.
                </div>
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Scope</span>
                <select
                  value={scope}
                  onChange={(e) => setScope((e.target.value as 'user' | 'workspace') || 'workspace')}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                >
                  <option value="workspace">workspace</option>
                  <option value="user">user</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Expiration (optional)</span>
                <input
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  placeholder="2026-12-31T00:00:00Z"
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                />
              </label>
            </div>
            <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--bg-app)]">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !label.trim() || !apiKey.trim() || !provider.trim() || !ws}
                className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 disabled:opacity-50"
                onClick={() => void onCreate()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rotateOpen && rotateTarget && (
        <div className="fixed inset-0 z-[260]">
          <div
            className="absolute inset-0 bg-[var(--text-main)]/40"
            onClick={() => setRotateOpen(false)}
            role="presentation"
          />
          <div className="absolute top-0 right-0 h-full w-[520px] max-w-[92vw] bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="text-[12px] font-semibold text-[var(--text-heading)]">Rotate API key</div>
              <button
                type="button"
                className="text-[11px] text-[var(--text-muted)]"
                onClick={() => setRotateOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 text-[11px]">
                <div className="text-[var(--text-muted)]">Target</div>
                <div className="text-[var(--text-main)] font-semibold truncate">
                  {providerLabel(rotateTarget.provider)} · {rotateTarget.label || rotateTarget.id}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono">••••{rotateTarget.last_four}</div>
              </div>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">New API key</span>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  autoComplete="off"
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                />
              </label>
            </div>
            <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--bg-app)]">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                onClick={() => setRotateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newApiKey.trim() || rotatingId === rotateTarget.id || !ws}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-warning)]/40 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 disabled:opacity-50"
                onClick={() => void onRotate()}
              >
                {rotatingId === rotateTarget.id ? 'Rotating…' : 'Confirm rotate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

