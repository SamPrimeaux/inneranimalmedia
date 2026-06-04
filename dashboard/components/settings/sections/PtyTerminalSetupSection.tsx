import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Copy, Loader2, Terminal, Zap } from 'lucide-react';
import { useWorkspace } from '../../../src/context/WorkspaceContext';
import { EmptyState, LoadingRow, WarningStrip } from '../components/SectionPrimitives';

type TokenStatus = {
  ok?: boolean;
  has_token?: boolean;
  last4?: string | null;
  connection_id?: string | null;
  connection_active?: boolean;
};

type TunnelStatus = {
  ok?: boolean;
  tunnel_id?: string | null;
  tunnel_name?: string | null;
  hostname?: string | null;
  cf_status?: string;
  connection_active?: boolean;
  connections_count?: number;
  has_run_token?: boolean;
  run_token?: string | null;
};

type LocalConn = {
  has_local?: boolean;
  connection?: { id?: string; ws_url_present?: boolean; is_active?: boolean; platform?: string; shell?: string };
};

function wsHeaders(workspaceId: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (workspaceId) h['X-IAM-Workspace-Id'] = workspaceId;
  return h;
}

async function readErr(r: Response, j: Record<string, unknown>) {
  const msg = j.message ?? j.error;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return `Request failed (${r.status})`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      <Copy size={11} />
      {copied ? 'Copied' : label}
    </button>
  );
}

export type PtyTerminalSetupSectionProps = {
  workspaceId: string | null;
  hasCloudflareKey: boolean;
  onNeedCloudflareKey: () => void;
  onError: (message: string | null) => void;
};

export function PtyTerminalSetupSection({
  workspaceId: ws,
  hasCloudflareKey,
  onNeedCloudflareKey,
  onError,
}: PtyTerminalSetupSectionProps) {
  const { sessionUserId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus | null>(null);
  const [localConn, setLocalConn] = useState<LocalConn | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [tunnelName, setTunnelName] = useState('my-pty');
  const [hostname, setHostname] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [ptyTokenOnce, setPtyTokenOnce] = useState<string | null>(null);
  const [runTokenOnce, setRunTokenOnce] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<{
    hostname?: string;
    ws_url?: string;
    connection_id?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!ws) {
      setLoading(false);
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const hdr = wsHeaders(ws);
      const [tRes, tunRes, locRes] = await Promise.all([
        fetch('/api/terminal/token/status', { credentials: 'same-origin', headers: hdr }),
        fetch('/api/terminal/tunnel/status', { credentials: 'same-origin', headers: hdr }),
        fetch('/api/terminal/connections/local', { credentials: 'same-origin', headers: hdr }),
      ]);
      const tJ = (await tRes.json().catch(() => ({}))) as TokenStatus & Record<string, unknown>;
      const tunJ = (await tunRes.json().catch(() => ({}))) as TunnelStatus & Record<string, unknown>;
      const locJ = (await locRes.json().catch(() => ({}))) as LocalConn;
      if (!tRes.ok && tRes.status !== 403) {
        throw new Error(await readErr(tRes, tJ as Record<string, unknown>));
      }
      setTokenStatus(tRes.ok ? tJ : null);
      setTunnelStatus(tunRes.ok ? tunJ : null);
      setLocalConn(locRes.ok ? locJ : null);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to load terminal status');
    } finally {
      setLoading(false);
    }
  }, [ws, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasToken = !!tokenStatus?.has_token;
  const hasTunnel = !!(tunnelStatus?.tunnel_id || tunnelStatus?.hostname);
  const connectionActive =
    !!localConn?.connection?.is_active ||
    !!tunnelStatus?.connection_active ||
    !!tokenStatus?.connection_active;

  const steps = useMemo(
    () => [
      { id: 'cf', label: 'Cloudflare API key', done: hasCloudflareKey },
      { id: 'pty', label: 'PTY bridge token', done: hasToken },
      { id: 'tunnel', label: 'Cloudflare tunnel', done: hasTunnel },
      { id: 'live', label: 'Tunnel connected', done: connectionActive },
    ],
    [hasCloudflareKey, hasToken, hasTunnel, connectionActive],
  );

  const allReady = steps.every((s) => s.done);

  const onGenerateToken = async () => {
    if (!ws) return;
    if (!hasCloudflareKey) {
      onNeedCloudflareKey();
      return;
    }
    setBusy('token');
    onError(null);
    try {
      const r = await fetch('/api/terminal/token/generate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: wsHeaders(ws),
        body: JSON.stringify({}),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new Error(await readErr(r, j));
      const tok = typeof j.token === 'string' ? j.token : '';
      if (tok) setPtyTokenOnce(tok);
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Token generation failed');
    } finally {
      setBusy(null);
    }
  };

  const onProvisionTunnel = async () => {
    if (!ws) return;
    if (!hasCloudflareKey) {
      onNeedCloudflareKey();
      return;
    }
    const tn = tunnelName.trim();
    const host = hostname.trim();
    const zid = zoneId.trim();
    if (!tn || !host || !zid) {
      onError('Tunnel name, hostname, and zone ID are required.');
      return;
    }
    setBusy('tunnel');
    onError(null);
    try {
      const r = await fetch('/api/terminal/tunnel/provision', {
        method: 'POST',
        credentials: 'same-origin',
        headers: wsHeaders(ws),
        body: JSON.stringify({
          tunnel_name: tn,
          hostname: host,
          zone_id: zid,
          port: 3099,
          platform: 'windows',
          shell: 'powershell',
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        if (j.required_scopes) {
          onError(
            typeof j.message === 'string'
              ? j.message
              : 'Add your Cloudflare API token above (Tunnel + DNS scopes).',
          );
        } else {
          throw new Error(await readErr(r, j));
        }
        return;
      }
      const rt = typeof j.run_token === 'string' ? j.run_token : '';
      if (rt) setRunTokenOnce(rt);
      setProvisionResult({
        hostname: typeof j.hostname === 'string' ? j.hostname : host,
        ws_url: typeof j.ws_url === 'string' ? j.ws_url : undefined,
        connection_id: typeof j.connection_id === 'string' ? j.connection_id : undefined,
      });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Tunnel provision failed');
    } finally {
      setBusy(null);
    }
  };

  const onOneClickSetup = async () => {
    setWizardOpen(true);
    if (!hasCloudflareKey) {
      onNeedCloudflareKey();
      return;
    }
    if (!hasToken) {
      await onGenerateToken();
    }
  };

  const envBlock = useMemo(() => {
    const uid = sessionUserId || 'YOUR_USER_ID';
    const wid = ws || 'YOUR_WORKSPACE_ID';
    const token = ptyTokenOnce || 'YOUR_PTY_AUTH_TOKEN';
    const tunnel = provisionResult?.hostname || hostname || 'pty.yourdomain.com';
    const run = runTokenOnce || tunnelStatus?.run_token || 'YOUR_CLOUDFLARED_RUN_TOKEN';
    return `# iam-pty .env
PTY_AUTH_TOKEN=${token}
PTY_PORT=3099
IAM_WORKSPACES_ROOT=C:\\Users\\you\\iam-workspaces
WORKER_URL=https://inneranimalmedia.com
TUNNEL_URL=https://${tunnel.replace(/^https?:\/\//, '')}
IAM_PTY_USER_ID=${uid}
IAM_PTY_WORKSPACE_ID=${wid}

# Terminal 1 — cloudflared
cloudflared tunnel run --token ${run}

# Terminal 2 — PTY server
cd iam-pty && npm install && node server.js`;
  }, [
    sessionUserId,
    ws,
    ptyTokenOnce,
    hostname,
    provisionResult,
    runTokenOnce,
    tunnelStatus?.run_token,
  ]);

  if (!ws) {
    return (
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
        <EmptyState message="Select a workspace to configure your personal PTY terminal." />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[var(--solar-cyan)]/30 bg-[var(--solar-cyan)]/5 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-heading)]">
            <Terminal size={16} className="text-[var(--solar-cyan)]" />
            Personal PTY terminal
          </div>
          <p className="text-[11px] text-[var(--text-muted)] max-w-xl">
            One workspace, your Cloudflare account: generate a bridge token, create a tunnel on your
            zone, run iam-pty locally. No platform operator setup required.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            Refresh status
          </button>
          {!allReady ? (
            <button
              type="button"
              onClick={() => void onOneClickSetup()}
              className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 font-semibold hover:bg-[var(--solar-cyan)]/30"
            >
              <Zap size={14} />
              Start setup
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-success)] font-semibold px-2">
              <CheckCircle2 size={14} />
              Ready
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingRow label="Loading terminal status…" />
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {steps.map((s) => (
            <li
              key={s.id}
              className={`rounded-lg border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1.5 ${
                s.done
                  ? 'border-[var(--color-success)]/40 text-[var(--color-success)] bg-[var(--color-success)]/5'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--bg-app)]'
              }`}
            >
              {s.done ? <CheckCircle2 size={12} /> : <Circle size={12} />}
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {(wizardOpen || !allReady) && !loading ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 space-y-4">
          {!hasCloudflareKey ? (
            <WarningStrip
              warnings={[
                {
                  code: 'CF_KEY',
                  severity: 'warn',
                  message:
                    'Add a Cloudflare provider key below first (Account → Tunnel Edit, Zone → DNS Edit).',
                },
              ]}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!hasCloudflareKey ? (
              <button
                type="button"
                onClick={onNeedCloudflareKey}
                className="text-[11px] px-3 py-2 rounded-lg border border-[var(--solar-cyan)]/50 text-[var(--solar-cyan)]"
              >
                Add Cloudflare key
              </button>
            ) : null}
            <button
              type="button"
              disabled={!hasCloudflareKey || busy === 'token'}
              onClick={() => void onGenerateToken()}
              className="text-[11px] px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              {busy === 'token' ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Generating…
                </span>
              ) : hasToken ? (
                'Rotate PTY token'
              ) : (
                '1. Generate PTY token'
              )}
            </button>
          </div>

          {ptyTokenOnce ? (
            <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-3 space-y-2">
              <div className="text-[11px] font-semibold text-[var(--color-warning)]">
                Copy your PTY token now — shown once
              </div>
              <code className="block text-[10px] font-mono break-all text-[var(--text-main)] bg-[var(--bg-app)] p-2 rounded">
                {ptyTokenOnce}
              </code>
              <CopyButton text={ptyTokenOnce} label="Copy token" />
            </div>
          ) : hasToken ? (
            <div className="text-[11px] text-[var(--text-muted)]">
              PTY token active · last4{' '}
              <span className="font-mono text-[var(--text-main)]">{tokenStatus?.last4 || '????'}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[11px]">
              <span className="text-[var(--text-muted)]">Tunnel name</span>
              <input
                value={tunnelName}
                onChange={(e) => setTunnelName(e.target.value)}
                placeholder="connor-pty"
                className="px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
              <span className="text-[var(--text-muted)]">Public hostname (your zone)</span>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="pty.yourdomain.com"
                className="px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] sm:col-span-3">
              <span className="text-[var(--text-muted)]">Cloudflare zone ID</span>
              <input
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                placeholder="From Cloudflare dashboard → your zone → Overview"
                className="px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={!hasCloudflareKey || busy === 'tunnel'}
            onClick={() => void onProvisionTunnel()}
            className="text-[11px] px-3 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 font-semibold disabled:opacity-50"
          >
            {busy === 'tunnel' ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                Creating tunnel…
              </span>
            ) : hasTunnel ? (
              '2. Re-provision tunnel'
            ) : (
              '2. Create Cloudflare tunnel'
            )}
          </button>

          {(runTokenOnce || tunnelStatus?.run_token) && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 space-y-2">
              <div className="text-[11px] font-semibold text-[var(--text-main)]">cloudflared run token</div>
              <code className="block text-[10px] font-mono break-all text-[var(--text-muted)]">
                cloudflared tunnel run --token {(runTokenOnce || tunnelStatus?.run_token || '').slice(0, 24)}…
              </code>
              <CopyButton
                text={`cloudflared tunnel run --token ${runTokenOnce || tunnelStatus?.run_token || ''}`}
                label="Copy command"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              3. Run on your machine
            </div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg p-3 text-[var(--text-main)] max-h-48 overflow-auto">
              {envBlock}
            </pre>
            <CopyButton text={envBlock} label="Copy all commands" />
          </div>

          {tunnelStatus?.cf_status ? (
            <div className="text-[10px] text-[var(--text-muted)]">
              Tunnel health: <span className="text-[var(--text-main)]">{tunnelStatus.cf_status}</span>
              {typeof tunnelStatus.connections_count === 'number'
                ? ` · ${tunnelStatus.connections_count} connector(s)`
                : ''}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
