import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plug } from 'lucide-react';

type Jsonish = Record<string, unknown> | null;

export type CatalogRow = {
  id?: string;
  name?: string;
  slug?: string;
  category?: string;
  auth_type?: string;
  oauth_scopes_default?: unknown;
  oauth_scopes_available?: unknown;
  api_key_label?: string;
  api_key_placeholder?: string;
  docs_url?: string;
  icon_slug?: string;
  description?: string;
};

export type ConnectionRow = {
  provider_key?: string;
  display_name?: string;
  status?: string;
  account_display?: string | null;
  last_sync_at?: string | null;
  last_health_check_at?: string | null;
  last_health_latency_ms?: number | null;
  last_health_status?: string | null;
  scopes_json?: unknown;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/).slice(0, 2);
  return p.map((w) => w[0]).join('').toUpperCase() || '?';
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function statusBadgeClass(status: string | undefined): string {
  switch (status) {
    case 'connected':
      return 'bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30';
    case 'degraded':
      return 'bg-[var(--accent-warning)]/15 text-[var(--accent-warning)] border-[var(--accent-warning)]/30';
    case 'auth_expired':
      return 'bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border-[var(--accent-danger)]/30';
    default:
      return 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-subtle)]';
  }
}

function parseScopes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type IntegrationCardProps = {
  mode: 'connected' | 'available';
  catalog: CatalogRow | null;
  connection: ConnectionRow | null;
  legacy?: { is_connected?: number; last_used?: string } | null;
  iamHosted?: boolean;
  connected?: boolean;
  onConnectOAuth?: (slug: string) => void;
  onConnectApiKey?: (slug: string, apiKey: string) => Promise<void>;
  onDisconnect?: (slug: string) => Promise<void>;
  onTest?: (slug: string) => Promise<{ status?: string; latency_ms?: number; error?: string }>;
  onOpenInMonaco?: (content: string, filename: string) => void;
  monacoSnippet?: { content: string; filename: string };
};

export function IntegrationCard({
  mode,
  catalog,
  connection,
  legacy,
  iamHosted,
  connected,
  onConnectOAuth,
  onConnectApiKey,
  onDisconnect,
  onTest,
  onOpenInMonaco,
  monacoSnippet,
}: IntegrationCardProps) {
  const slug =
    String(catalog?.slug || connection?.provider_key || '').trim() || 'unknown';
  const title = String(
    catalog?.name || connection?.display_name || slug,
  );
  const category = String(catalog?.category || '').trim();
  const authType = String(catalog?.auth_type || '').trim();

  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'test' | 'key' | 'disc' | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [iconFailed, setIconFailed] = useState(false);

  const scopes = parseScopes(connection?.scopes_json);

  const runTest = useCallback(async () => {
    if (!onTest) return;
    setBusy('test');
    setTestMsg(null);
    try {
      const r = await onTest(slug);
      const line = r.error
        ? `Failed: ${r.error}`
        : `OK${r.latency_ms != null ? ` (${r.latency_ms} ms)` : ''}`;
      setTestMsg(line);
    } catch (e) {
      setTestMsg(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }, [onTest, slug]);

  const submitApiKey = useCallback(async () => {
    if (!onConnectApiKey || !apiKey.trim()) return;
    setBusy('key');
    try {
      await onConnectApiKey(slug, apiKey.trim());
      setApiKey('');
    } finally {
      setBusy(null);
    }
  }, [apiKey, onConnectApiKey, slug]);

  const doDisconnect = useCallback(async () => {
    if (!onDisconnect) return;
    setBusy('disc');
    try {
      await onDisconnect(slug);
    } finally {
      setBusy(null);
    }
  }, [onDisconnect, slug]);

  const status = String(connection?.status || (connected ? 'connected' : 'disconnected'));

  const iconSrc =
    catalog?.icon_slug && !iconFailed
      ? `/assets/integrations/${encodeURIComponent(catalog.icon_slug)}.svg`
      : null;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 overflow-hidden">
          {iconSrc ? (
            <img
              src={iconSrc}
              alt=""
              className="w-6 h-6"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <span className="text-[11px] font-bold text-[var(--text-heading)]">
              {initials(title)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-[var(--text-heading)] truncate">
              {title}
            </span>
            {category ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wide">
                {category}
              </span>
            ) : null}
            {authType ? (
              <span className="text-[10px] text-[var(--text-muted)]">{authType}</span>
            ) : null}
          </div>
          {catalog?.description ? (
            <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2">
              {String(catalog.description)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`text-[10px] px-2 py-0.5 rounded border ${statusBadgeClass(status)}`}
          >
            {status}
          </span>
          {mode === 'available' ? (
            connected ? (
              <span className="text-[10px] text-[var(--accent-success)]">Connected</span>
            ) : authType === 'oauth2' ? (
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded-lg bg-[var(--solar-blue)] text-[var(--toggle-knob)]"
                onClick={() => onConnectOAuth?.(slug)}
              >
                Connect
              </button>
            ) : authType === 'oauth_or_key' ? (
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  className="text-[10px] px-2 py-1 rounded-lg bg-[var(--solar-blue)] text-[var(--toggle-knob)]"
                  onClick={() => onConnectOAuth?.(slug)}
                >
                  OAuth
                </button>
                <button
                  type="button"
                  className="text-[10px] px-2 py-1 rounded-lg bg-[var(--bg-hover)] text-[var(--text-heading)] border border-[var(--border-subtle)]"
                  onClick={() => setExpanded(true)}
                >
                  API key
                </button>
              </div>
            ) : authType === 'api_key' ? (
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded-lg bg-[var(--bg-hover)] text-[var(--text-heading)] border border-[var(--border-subtle)]"
                onClick={() => setExpanded(true)}
              >
                Connect
              </button>
            ) : (
              <span className="text-[10px] text-[var(--text-muted)]">View docs</span>
            )
          ) : iamHosted ? (
            <button
              type="button"
              className="text-[10px] px-2 py-1 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-heading)] inline-flex items-center gap-1"
              onClick={() =>
                monacoSnippet &&
                onOpenInMonaco?.(monacoSnippet.content, monacoSnippet.filename)
              }
            >
              <Plug size={12} />
              Details
            </button>
          ) : (
            <button
              type="button"
              className="text-[10px] px-2 py-1 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-heading)] inline-flex items-center gap-1"
              onClick={() => setExpanded((v) => !v)}
            >
              Manage
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
        </div>
      </div>

      {mode === 'available' &&
      !connected &&
      (authType === 'api_key' || authType === 'oauth_or_key') &&
      expanded ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-2">
          <label className="text-[10px] text-[var(--text-muted)]">
            {catalog?.api_key_label || 'API key'}
          </label>
          <input
            type="password"
            autoComplete="off"
            placeholder={catalog?.api_key_placeholder || 'Paste key'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-main)]"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === 'key'}
              onClick={() => void submitApiKey()}
              className="text-[11px] px-2 py-1 rounded-lg bg-[var(--solar-blue)] text-[var(--toggle-knob)] inline-flex items-center gap-1"
            >
              {busy === 'key' ? <Loader2 size={12} className="animate-spin" /> : null}
              Save key
            </button>
            {authType === 'oauth_or_key' ? (
              <button
                type="button"
                onClick={() => onConnectOAuth?.(slug)}
                className="text-[11px] px-2 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-heading)]"
              >
                Use OAuth instead
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === 'connected' && expanded && !iamHosted ? (
        <div className="mt-2 border-t border-[var(--border-subtle)] pt-2 flex flex-col gap-2">
          {connection?.account_display ? (
            <div className="text-[11px] text-[var(--text-main)]">
              <span className="text-[var(--text-muted)]">Account: </span>
              {connection.account_display}
            </div>
          ) : null}
          {connection?.last_sync_at ? (
            <div className="text-[10px] text-[var(--text-muted)]">
              Last sync: {relTime(connection.last_sync_at)}
            </div>
          ) : null}
          {legacy?.last_used ? (
            <div className="text-[10px] text-[var(--text-muted)]">
              Last used (legacy): {relTime(legacy.last_used)}
            </div>
          ) : null}
          {connection?.last_health_status != null && connection.last_health_status !== '' ? (
            <div className="text-[10px] text-[var(--text-muted)]">
              Health: {String(connection.last_health_status)}
              {connection.last_health_latency_ms != null
                ? ` (${connection.last_health_latency_ms} ms)`
                : ''}
            </div>
          ) : null}
          {scopes.length ? (
            <div className="flex flex-wrap gap-1">
              {scopes.map((s) => (
                <span
                  key={s}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)]"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === 'test'}
              onClick={() => void runTest()}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-heading)] inline-flex items-center gap-1"
            >
              {busy === 'test' ? <Loader2 size={12} className="animate-spin" /> : null}
              Test connection
            </button>
            {testMsg ? (
              <span className="text-[10px] text-[var(--text-muted)] self-center">{testMsg}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {authType === 'oauth2' || authType === 'oauth_or_key' ? (
              <button
                type="button"
                onClick={() => onConnectOAuth?.(slug)}
                className="text-[11px] px-2 py-1 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]"
              >
                Re-authorize
              </button>
            ) : null}
            {(authType === 'api_key' || authType === 'oauth_or_key') && (
              <div className="flex flex-col gap-1 w-full">
                <span className="text-[10px] text-[var(--text-muted)]">Rotate key</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="New key"
                  className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px]"
                />
                <button
                  type="button"
                  disabled={busy === 'key'}
                  onClick={() => void submitApiKey()}
                  className="text-[11px] px-2 py-1 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)] w-fit inline-flex items-center gap-1"
                >
                  {busy === 'key' ? <Loader2 size={12} className="animate-spin" /> : null}
                  Save new key
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={busy === 'disc'}
              onClick={() => void doDisconnect()}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--accent-danger)]/40 text-[var(--accent-danger)] inline-flex items-center gap-1"
            >
              {busy === 'disc' ? <Loader2 size={12} className="animate-spin" /> : null}
              Disconnect
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'connected' && expanded && iamHosted ? (
        <div className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-[11px] text-[var(--text-muted)] space-y-2">
          <div>
            MCP:{' '}
            <span className="text-[var(--text-main)] font-mono text-[10px]">
              https://mcp.inneranimalmedia.com/mcp
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenInMonaco?.(
                JSON.stringify(
                  {
                    mcpServers: {
                      'inneranimalmedia-mcp': {
                        url: 'https://mcp.inneranimalmedia.com/mcp',
                        transport: 'http',
                      },
                    },
                  },
                  null,
                  2,
                ),
                '.cursor-mcp-config.example.json',
              )
            }
            className="text-[11px] px-2 py-1 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-heading)]"
          >
            Open sample MCP config in Monaco
          </button>
        </div>
      ) : null}

      {catalog?.docs_url ? (
        <a
          href={catalog.docs_url}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-[var(--solar-cyan)] hover:underline"
        >
          Documentation
        </a>
      ) : null}
    </div>
  );
}
