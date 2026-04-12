import React, { useState, useEffect, useCallback } from "react";
import { StatusDot, SectionLabel } from "../atoms";

// ─── McpServicesHealth ────────────────────────────────────────────────────────

function McpServicesHealth() {
  const [services,     setServices]     = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [lastChecked,  setLastChecked]  = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/mcp/services/health", { credentials: "same-origin" });
      const d = await r.json();
      setServices(d.services || []);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (_) {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const dotColor = (status: string) => ({
    healthy:          "var(--mode-ask)",
    degraded:         "var(--mode-plan)",
    unreachable:      "var(--mode-debug)",
    unverified:       "var(--text-muted)",
    not_implemented:  "var(--text-disabled)",
    external_site:    "var(--text-muted)",
    skip:             "var(--text-disabled)",
    error:            "var(--mode-debug)",
  } as Record<string, string>)[status] || "var(--text-muted)";

  if (loading) {
    return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>Checking MCP services…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>MCP Services</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {lastChecked ? `checked ${lastChecked} · ` : ""}
          <span
            style={{ cursor: "pointer", color: "var(--color-primary)" }}
            onClick={fetchHealth}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fetchHealth(); } }}
            role="button"
            tabIndex={0}
          >refresh</span>
        </span>
      </div>
      {services.filter((s) => s.is_active).map((svc) => {
        const status = svc.live_status || svc.health_status;
        return (
          <div key={svc.id || svc.service_name}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: "var(--radius-md, 8px)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle, var(--border))" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(status), boxShadow: status === "healthy" ? "0 0 6px var(--mode-ask)" : "none", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc.service_name}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc.endpoint_url}</div>
            </div>
            {svc.tool_count > 0 && (
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-hover)", padding: "2px 6px", borderRadius: 10, flexShrink: 0 }}>
                {svc.tool_count} tools
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 600, color: dotColor(status), flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {status?.replace(/_/g, " ") || "unknown"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── IntegrationsTab ──────────────────────────────────────────────────────────

interface IntegrationsTabProps {
  connectedIntegrations?: Record<string, boolean>;
}

export function IntegrationsTab({ connectedIntegrations }: IntegrationsTabProps) {
  const [catalogConnected, setCatalogConnected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/marketplace-catalog", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d.items) ? d.items : [];
        const m: Record<string, boolean> = {};
        for (const it of items) {
          const p = it.provider != null ? String(it.provider) : "";
          if (p && it.connected) m[p] = true;
        }
        if (!cancelled) setCatalogConnected(m);
      })
      .catch(() => { if (!cancelled) setCatalogConnected({}); });
    return () => { cancelled = true; };
  }, []);

  const integrations = [
    { key: "google", providerKey: "google", label: "Google Drive", authUrl: "/api/oauth/google/start" },
    { key: "github", providerKey: "github", label: "GitHub",       authUrl: "/api/oauth/github/start" },
    { key: "mcp",    providerKey: null,      label: "MCP Connections", authUrl: null },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <McpServicesHealth />
      <SectionLabel>Connection Status</SectionLabel>
      {integrations.map(({ key, label, authUrl, providerKey }) => {
        const connected = providerKey ? (catalogConnected[providerKey] || !!connectedIntegrations?.[key]) : false;
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)", marginBottom: 6 }}>
            <StatusDot status={connected ? "ok" : "fail"} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{connected ? "Connected" : "Not connected"}</div>
            </div>
            {!connected && authUrl && (
              <a href={authUrl} style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 4, background: "var(--accent)", color: "var(--bg-canvas)", textDecoration: "none" }}>Connect</a>
            )}
            {key === "mcp" && (
              <a href="/dashboard/mcp" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>Manage</a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── ProvidersTab ─────────────────────────────────────────────────────────────

export function ProvidersTab() {
  const [secrets,           setSecrets]           = useState<any[]>([]);
  const [models,            setModels]            = useState<any[]>([]);
  const [catalogByProvider, setCatalogByProvider] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/env/secrets", { credentials: "same-origin" })
      .then((r) => r.json()).then((d) => { if (!cancelled) setSecrets(d.secrets || []); })
      .catch(() => { if (!cancelled) setSecrets([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/models", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setModels((Array.isArray(d.models) ? d.models : []).filter((m: any) => Number(m.show_in_picker) === 1)); })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/marketplace-catalog", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, boolean> = {};
        for (const it of (Array.isArray(d.items) ? d.items : [])) {
          const p = it.provider != null ? String(it.provider) : "";
          if (p && it.connected) m[p] = true;
        }
        if (!cancelled) setCatalogByProvider(m);
      })
      .catch(() => { if (!cancelled) setCatalogByProvider({}); });
    return () => { cancelled = true; };
  }, []);

  const byProvider = secrets.reduce<Record<string, { total: number; ok: number; untested: number }>>((acc, s) => {
    const p = s.provider || "other";
    if (!acc[p]) acc[p] = { total: 0, ok: 0, untested: 0 };
    acc[p].total++;
    if (s.test_status === "ok") acc[p].ok++;
    else if (!s.test_status || s.test_status === "untested") acc[p].untested++;
    return acc;
  }, {});

  const providerDefs = [
    { key: "anthropic",  label: "Anthropic"   },
    { key: "openai",     label: "OpenAI"       },
    { key: "google",     label: "Google"       },
    { key: "workers_ai", label: "Workers AI"   },
    { key: "cursor",     label: "Cursor"       },
    { key: "stability",  label: "Stability"    },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {providerDefs.map(({ key, label }) => {
        const stats        = byProvider[key];
        const catConnected = !!catalogByProvider[key];
        const chipModels   = models.filter((m) => String(m.provider || "") === key)
          .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")));
        return (
          <div key={key} style={{ padding: 10, borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <StatusDot status={stats?.ok > 0 ? "ok" : stats ? "untested" : "fail"} />
              <div style={{ flex: 1, fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>{label}</div>
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, border: "1px solid var(--border)", color: catConnected ? "var(--color-success, var(--accent))" : "var(--text-muted)", background: "var(--bg-canvas)" }}>
                {catConnected ? "Catalog: connected" : "Catalog: not connected"}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {stats ? `${stats.ok}/${stats.total} keys ok` : "no keys"}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {chipModels.length === 0 ? (
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>No picker models for this provider.</span>
              ) : chipModels.map((m) => (
                <span key={m.id} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, background: "var(--bg-canvas)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  {m.display_name || m.id}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
