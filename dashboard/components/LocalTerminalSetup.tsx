import React, { useCallback, useEffect, useState } from 'react';
import {
  detectLocalTerminalDefaults,
  LOCAL_SHELL_OPTIONS,
  type LocalTerminalConnection,
  type LocalTerminalPlatform,
} from '../src/lib/localTerminalDefaults';

export type TerminalTarget = 'platform_vm' | 'user_hosted_tunnel';

interface LocalTerminalSetupProps {
  workspaceId?: string;
  terminalTarget: TerminalTarget;
  onTargetChange: (target: TerminalTarget) => void;
  onLocalReady?: () => void;
}

export function LocalTerminalSetup({
  workspaceId,
  terminalTarget,
  onTargetChange,
  onLocalReady,
}: LocalTerminalSetupProps) {
  const defaults = detectLocalTerminalDefaults();
  const [localConn, setLocalConn] = useState<LocalTerminalConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [activating, setActivating] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showTunnelForm, setShowTunnelForm] = useState(false);
  const [platform, setPlatform] = useState<LocalTerminalPlatform>(defaults.platform);
  const [shell, setShell] = useState(defaults.shell);
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchLocal = useCallback(async () => {
    if (!workspaceId?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ workspace_id: workspaceId.trim() });
      const res = await fetch(`/api/terminal/connections/local?${qs}`, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalConn(null);
        return;
      }
      const conn = data?.connection as LocalTerminalConnection | null;
      setLocalConn(conn);
      if (conn?.platform === 'macos' || conn?.platform === 'windows' || conn?.platform === 'linux') {
        setPlatform(conn.platform);
      }
      if (conn?.shell) setShell(conn.shell);
    } catch {
      setLocalConn(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchLocal();
  }, [fetchLocal]);

  const localReady = !!(localConn?.is_active && localConn?.ws_url_present);

  const handleProvision = async () => {
    setProvisioning(true);
    setError(null);
    try {
      const res = await fetch('/api/terminal/connections/provision', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          target_type: 'user_hosted_tunnel',
          platform,
          shell,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Setup failed');
        return;
      }
      setLocalConn(data.connection as LocalTerminalConnection);
      setShowSetup(false);
      setShowTunnelForm(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setProvisioning(false);
    }
  };

  const handleActivate = async () => {
    if (!tunnelUrl.trim()) {
      setError('Enter your tunnel WebSocket URL');
      return;
    }
    setActivating(true);
    setError(null);
    try {
      const res = await fetch('/api/terminal/connections/activate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          connection_id: localConn?.id,
          ws_url: tunnelUrl.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Activation failed');
        return;
      }
      setShowTunnelForm(false);
      await fetchLocal();
      onTargetChange('user_hosted_tunnel');
      onLocalReady?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  const shellOptions = LOCAL_SHELL_OPTIONS[platform] ?? LOCAL_SHELL_OPTIONS.linux;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        title="Cloud terminal (platform VM)"
        className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wide border transition-colors ${
          terminalTarget === 'platform_vm'
            ? 'border-[var(--solar-cyan)]/50 bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)]'
            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--border-subtle)]'
        }`}
        onClick={() => onTargetChange('platform_vm')}
      >
        Cloud
      </button>

      <button
        type="button"
        title={localReady ? 'Local terminal via your tunnel' : 'Set up a local terminal tunnel first'}
        disabled={!localReady}
        className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wide border transition-colors ${
          !localReady
            ? 'border-[var(--border-subtle)] text-[var(--text-muted)]/50 cursor-not-allowed opacity-60'
            : terminalTarget === 'user_hosted_tunnel'
              ? 'border-[var(--solar-cyan)]/50 bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--border-subtle)]'
        }`}
        onClick={() => {
          if (localReady) onTargetChange('user_hosted_tunnel');
        }}
      >
        Start local
      </button>

      {!localReady && !loading && (
        <button
          type="button"
          className="px-2 py-1 rounded text-[10px] font-mono border border-[var(--solar-yellow)]/40 text-[var(--solar-yellow)] hover:bg-[var(--solar-yellow)]/10 transition-colors"
          onClick={() => {
            setShowSetup(true);
            if (localConn && !localConn.is_active) setShowTunnelForm(true);
          }}
        >
          Set up local terminal
        </button>
      )}

      {(showSetup || showTunnelForm) && (
        <div
          className="absolute left-2 right-2 top-10 z-[30] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-xl p-4 text-left max-w-md mx-auto"
          role="dialog"
          aria-label="Local terminal setup"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Local terminal setup
          </div>

          {showSetup && !localConn && (
            <div className="space-y-3">
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Run iam-pty on your machine, expose it with Cloudflare Tunnel, then paste the WebSocket URL.
                No manual database steps.
              </p>
              <label className="block text-[10px] font-mono text-[var(--text-muted)]">
                Platform
                <select
                  className="mt-1 w-full rounded border border-[var(--border-subtle)] bg-[var(--terminal-surface)] px-2 py-1.5 text-[11px] text-[var(--text-main)]"
                  value={platform}
                  onChange={(e) => {
                    const p = e.target.value as LocalTerminalPlatform;
                    setPlatform(p);
                    setShell(LOCAL_SHELL_OPTIONS[p][0].value);
                  }}
                >
                  <option value="macos">macOS</option>
                  <option value="windows">Windows</option>
                  <option value="linux">Linux</option>
                </select>
              </label>
              <label className="block text-[10px] font-mono text-[var(--text-muted)]">
                Shell
                <select
                  className="mt-1 w-full rounded border border-[var(--border-subtle)] bg-[var(--terminal-surface)] px-2 py-1.5 text-[11px] text-[var(--text-main)]"
                  value={shell}
                  onChange={(e) => setShell(e.target.value)}
                >
                  {shellOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={provisioning}
                className="w-full py-2 rounded text-[11px] font-mono bg-[var(--solar-cyan)]/15 border border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/25 disabled:opacity-50"
                onClick={() => void handleProvision()}
              >
                {provisioning ? 'Creating…' : 'Continue'}
              </button>
            </div>
          )}

          {(showTunnelForm || (localConn && !localConn.is_active)) && (
            <div className="space-y-3">
              <label className="block text-[10px] font-mono text-[var(--text-muted)]">
                Tunnel URL
                <input
                  type="url"
                  placeholder="wss://your-tunnel-hostname"
                  className="mt-1 w-full rounded border border-[var(--border-subtle)] bg-[var(--terminal-surface)] px-2 py-1.5 text-[11px] font-mono text-[var(--text-main)]"
                  value={tunnelUrl}
                  onChange={(e) => setTunnelUrl(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={activating}
                className="w-full py-2 rounded text-[11px] font-mono bg-[var(--solar-green)]/15 border border-[var(--solar-green)]/40 text-[var(--solar-green)] hover:bg-[var(--solar-green)]/25 disabled:opacity-50"
                onClick={() => void handleActivate()}
              >
                {activating ? 'Saving…' : 'Activate local terminal'}
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-[10px] font-mono text-[var(--solar-red)]">{error}</p>}

          <button
            type="button"
            className="mt-3 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
            onClick={() => {
              setShowSetup(false);
              setShowTunnelForm(false);
              setError(null);
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
