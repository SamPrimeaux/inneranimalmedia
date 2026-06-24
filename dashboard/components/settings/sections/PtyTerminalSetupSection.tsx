import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Copy, Loader2, Terminal, Trash2, Zap } from 'lucide-react';
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
  zone_id?: string | null;
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

type CfZone = { id: string; name: string; status?: string };

function hostnameMatchesZone(hostname: string, zoneName: string): boolean {
  const h = hostname.trim().toLowerCase();
  const z = zoneName.trim().toLowerCase();
  if (!h || !z) return false;
  return h === z || h.endsWith(`.${z}`);
}

function pickZoneForHostname(zones: CfZone[], hostname: string): CfZone | null {
  const h = hostname.trim().toLowerCase();
  if (!h) return null;
  const exact = zones.find((z) => hostnameMatchesZone(h, z.name));
  if (exact) return exact;
  const parts = h.split('.');
  if (parts.length >= 2) {
    const apex = parts.slice(-2).join('.');
    return zones.find((z) => z.name.toLowerCase() === apex) ?? null;
  }
  return null;
}

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
  const [cfZones, setCfZones] = useState<CfZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  const applyPtyDefaultsFromHints = useCallback(
    (hints: {
      pty_defaults?: { zone_id?: string | null; hostname?: string | null; tunnel_name?: string | null };
    }) => {
      const d = hints?.pty_defaults;
      if (!d) return;
      if (d.zone_id) setZoneId((prev) => (prev.trim() ? prev : String(d.zone_id)));
      if (d.hostname) setHostname((prev) => (prev.trim() ? prev : String(d.hostname)));
      if (d.tunnel_name) {
        setTunnelName((prev) =>
          prev.trim() && prev !== 'my-pty' ? prev : String(d.tunnel_name),
        );
      }
    },
    [],
  );

  const applyZoneDefaults = useCallback(
    (zones: CfZone[], tun: TunnelStatus | null) => {
      if (tun?.zone_id) {
        setZoneId(String(tun.zone_id));
      } else if (zones.length === 1) {
        setZoneId(zones[0].id);
      }
      if (tun?.tunnel_name) setTunnelName(String(tun.tunnel_name));
      if (tun?.hostname) {
        setHostname(String(tun.hostname));
        if (!tun.zone_id && zones.length > 0) {
          const match = pickZoneForHostname(zones, String(tun.hostname));
          if (match) setZoneId(match.id);
        }
      } else if (zones.length === 1 && zones[0].name) {
        const z = zones[0];
        setHostname((prev) => (prev.trim() ? prev : `pty.${z.name}`));
      }
    },
    [],
  );

  const loadCfZones = useCallback(async () => {
    if (!ws || !hasCloudflareKey) {
      setCfZones([]);
      return [] as CfZone[];
    }
    setZonesLoading(true);
    try {
      const r = await fetch('/api/settings/keys/cloudflare/zones', {
        credentials: 'same-origin',
        headers: wsHeaders(ws),
      });
      const j = (await r.json().catch(() => ({}))) as { zones?: CfZone[]; message?: string; error?: string };
      if (!r.ok) {
        const msg =
          typeof j.message === 'string'
            ? j.message
            : typeof j.error === 'string'
              ? j.error
              : `Zones list failed (${r.status})`;
        throw new Error(msg);
      }
      const zones = Array.isArray(j.zones) ? j.zones.filter((z) => z?.id) : [];
      setCfZones(zones);
      return zones;
    } catch (e) {
      setCfZones([]);
      onError(e instanceof Error ? e.message : 'Failed to load Cloudflare zones');
      return [] as CfZone[];
    } finally {
      setZonesLoading(false);
    }
  }, [ws, hasCloudflareKey, onError]);

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
      const tun = tunRes.ok ? tunJ : null;
      setTokenStatus(tRes.ok ? tJ : null);
      setTunnelStatus(tun);
      setLocalConn(locRes.ok ? locJ : null);

      const hintsRes = await fetch('/api/settings/keys/hints', {
        credentials: 'same-origin',
        headers: wsHeaders(ws),
      });
      if (hintsRes.ok) {
        const hintsJ = (await hintsRes.json().catch(() => ({}))) as {
          pty_defaults?: { zone_id?: string | null; hostname?: string | null; tunnel_name?: string | null };
        };
        applyPtyDefaultsFromHints(hintsJ);
      }

      if (hasCloudflareKey) {
        const zones = await loadCfZones();
        applyZoneDefaults(zones, tun);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to load terminal status');
    } finally {
      setLoading(false);
    }
  }, [ws, onError, hasCloudflareKey, loadCfZones, applyZoneDefaults, applyPtyDefaultsFromHints]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hostname.trim() || cfZones.length === 0) return;
    const match = pickZoneForHostname(cfZones, hostname);
    if (match && zoneId !== match.id) setZoneId(match.id);
  }, [hostname, cfZones, zoneId]);

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

  const onRevokePty = async () => {
    if (!ws) return;
    const msg =
      'Revoke your PTY bridge token and Cloudflare tunnel for this workspace only? ' +
      'Other users and platform credentials are not affected.';
    if (!window.confirm(msg)) return;
    setBusy('revoke');
    onError(null);
    try {
      const hdr = { ...wsHeaders(ws), 'Content-Type': 'application/json' };
      const tunR = await fetch('/api/terminal/tunnel', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: hdr,
      });
      const tunJ = (await tunR.json().catch(() => ({}))) as Record<string, unknown>;
      if (!tunR.ok && tunR.status !== 404) {
        throw new Error(await readErr(tunR, tunJ));
      }
      const tokR = await fetch('/api/terminal/token', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: hdr,
      });
      const tokJ = (await tokR.json().catch(() => ({}))) as Record<string, unknown>;
      if (!tokR.ok) throw new Error(await readErr(tokR, tokJ));
      setPtyTokenOnce(null);
      setRunTokenOnce(null);
      setProvisionResult(null);
      setHostname('');
      setZoneId('');
      setTunnelName('my-pty');
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Revoke failed');
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
    const workerOrigin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://inneranimalmedia.com';
    return `# iam-pty .env
PTY_AUTH_TOKEN=${token}
PTY_PORT=3099
IAM_WORKSPACES_ROOT=C:\\Users\\you\\iam-workspaces
WORKER_URL=${workerOrigin}
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
            zone, run iam-pty locally. Form defaults sync from{' '}
            <code className="text-[10px]">.env.cloudflare</code> via{' '}
            <code className="text-[10px]">npm run sync:operator-keys</code>.
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
          {(hasToken || hasTunnel) && !loading ? (
            <button
              type="button"
              disabled={busy === 'revoke'}
              onClick={() => void onRevokePty()}
              className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[var(--color-danger)]/50 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
              title="Revokes only your PTY token and tunnel for this workspace"
            >
              {busy === 'revoke' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              Revoke my PTY
            </button>
          ) : null}
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
              <span className="text-[var(--text-muted)]">
                Cloudflare zone
                {zonesLoading ? ' (loading…)' : cfZones.length ? ` (${cfZones.length} on your account)` : ''}
              </span>
              {cfZones.length > 0 ? (
                <select
                  value={zoneId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setZoneId(id);
                    const z = cfZones.find((x) => x.id === id);
                    if (z?.name && !hostname.trim()) setHostname(`pty.${z.name}`);
                  }}
                  className="px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                >
                  <option value="">Select zone…</option>
                  {cfZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.id.slice(0, 8)}…)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  placeholder="Zone ID from Cloudflare dashboard"
                  className="px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                />
              )}
              {zoneId && cfZones.length > 0 ? (
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{zoneId}</span>
              ) : null}
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
