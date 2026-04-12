import React, { useState, useEffect, useCallback } from "react";
import { SectionLabel } from "../atoms";

interface NetworkSettingsTabProps {
  onOpenGeneral?: () => void;
}

export function NetworkSettingsTab({ onOpenGeneral }: NetworkSettingsTabProps) {
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [tunnel,     setTunnel]     = useState<any>(null);
  const [tunnelErr,  setTunnelErr]  = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const loadTunnelStatus = useCallback(() => {
    fetch("/api/tunnel/status", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Tunnel status failed");
        setTunnel(d); setTunnelErr(null);
      })
      .catch((e: any) => { setTunnel(null); setTunnelErr(e?.message || String(e)); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/agent/terminal/config-status", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load network status");
        if (!cancelled) setData(d);
      })
      .catch((e: any) => { if (!cancelled) { setError(e?.message || String(e)); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    loadTunnelStatus();
    const id = setInterval(loadTunnelStatus, 30000);
    return () => clearInterval(id);
  }, [loadTunnelStatus]);

  const onRestartTunnel = useCallback(() => {
    setRestarting(true);
    fetch("/api/tunnel/restart", { method: "POST", credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Restart failed");
        loadTunnelStatus();
      })
      .catch((e: any) => setTunnelErr(e?.message || String(e)))
      .finally(() => setRestarting(false));
  }, [loadTunnelStatus]);

  const statusRow = (label: string, on: boolean) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{label}</span>
      <span style={{ fontSize: 12, color: on ? "var(--color-success, var(--accent))" : "var(--text-muted)" }}>
        {on ? "Configured" : "Not configured"}
      </span>
    </div>
  );

  const tunnelHealthy    = !tunnelErr && tunnel?.healthy;
  const tunnelStatusColor = tunnelErr ? "var(--text-muted)" : tunnelHealthy ? "var(--color-success, var(--accent))" : "var(--text-muted)";
  const tunnelStatusLabel = tunnelErr ? "Status unavailable" : tunnelHealthy ? "Healthy" : "Not healthy";

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      <div style={{ marginBottom: 20, padding: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-canvas)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>Cloudflare Tunnel</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)", color: tunnelStatusColor, background: "var(--bg-elevated)" }}>
            {tunnelStatusLabel}
          </span>
        </div>

        {tunnel && !tunnelErr ? (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
            {tunnel.status != null && tunnel.status !== "" && (
              <div>Status: <span style={{ color: "var(--text-primary)" }}>{String(tunnel.status)}</span></div>
            )}
            <div>Connections: <span style={{ color: "var(--text-primary)" }}>{typeof tunnel.connections === "number" ? tunnel.connections : "—"}</span></div>
            {tunnel.created_at && (
              <div style={{ marginTop: 4 }}>Created: <span style={{ color: "var(--text-primary)" }}>{String(tunnel.created_at)}</span></div>
            )}
          </div>
        ) : tunnelErr ? (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>{tunnelErr}</div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Loading tunnel status…</div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={onRestartTunnel}
            disabled={restarting}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit", cursor: restarting ? "wait" : "pointer", opacity: restarting ? 0.7 : 1 }}
          >
            {restarting ? "Restarting…" : "Restart Tunnel"}
          </button>
          <a href="https://one.dash.cloudflare.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "underline" }}>
            Open Zero Trust Dashboard
          </a>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Loading…</div>
      ) : error ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: 16 }}>{error}</div>
      ) : !data ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>No data.</div>
      ) : (
        <>
          {statusRow("Terminal",   !!data.terminal_configured)}
          {statusRow("Direct WSS", !!data.direct_wss_available)}
          <div style={{ marginTop: 20 }}>
            <SectionLabel>Configuration</SectionLabel>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.65, margin: "8px 0 12px" }}>
              Terminal credentials are managed via Wrangler secrets: TERMINAL_WS_URL and TERMINAL_SECRET.
              Never paste secret values here — manage via vault or wrangler secret put.
            </p>
            <button
              type="button"
              onClick={() => onOpenGeneral?.()}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "var(--accent)", fontFamily: "inherit", textDecoration: "underline" }}
            >
              Open Environment Vault
            </button>
          </div>
        </>
      )}
    </div>
  );
}
