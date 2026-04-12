import { useState, useEffect } from "react";
import { SectionLabel } from "../atoms";

const MARKETPLACE_TYPE_LABELS = {
  llm: "Language Models",
  rag_pipeline: "RAG & Search",
  embedding_store: "Embedding Stores",
  routing: "Routing",
  telemetry: "Telemetry",
  workflow_engine: "Workflow Engines",
  ide_agent: "IDE Agents",
};

interface MarketplaceSettingsTabProps {
  onOpenGeneral?: () => void;
}

export function MarketplaceSettingsTab({ onOpenGeneral }: MarketplaceSettingsTabProps) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/settings/marketplace-catalog", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load catalog");
        if (!cancelled) setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || String(e));
          setItems([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const byType = items.reduce((acc, it) => {
    const t = it.integration_type != null ? String(it.integration_type) : "other";
    if (!acc[t]) acc[t] = [];
    acc[t].push(it);
    return acc;
  }, {});
  const typeKeys = Object.keys(byType).sort((a, b) => a.localeCompare(b));

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Loading…</div>
      ) : error ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: 16 }}>{error}</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>No marketplace items.</div>
      ) : (
        typeKeys.map((tk) => (
          <div key={tk} style={{ marginBottom: 20 }}>
            <SectionLabel>{MARKETPLACE_TYPE_LABELS[tk] || tk}</SectionLabel>
            {byType[tk].map((it) => {
              const connected = !!it.connected;
              const prov = String(it.provider || "");
              const showVault = ["anthropic", "openai", "google"].includes(prov) && !connected;
              const showGh = it.integration_key === "github" && !connected;
              return (
                <div
                  key={it.id || `${tk}-${it.name}`}
                  style={{
                    padding: 12, marginBottom: 8, borderRadius: 6,
                    border: "1px solid var(--border)", background: "var(--bg-canvas)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)", marginBottom: 6 }}>{it.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{prov || "—"}</span>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{tk}</span>
                    {it.supports_chat ? <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "var(--bg-elevated)" }}>Chat</span> : null}
                    {it.supports_embeddings ? <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "var(--bg-elevated)" }}>Embeddings</span> : null}
                    {it.supports_rag ? <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "var(--bg-elevated)" }}>RAG</span> : null}
                    {it.supports_workflows ? <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "var(--bg-elevated)" }}>Workflows</span> : null}
                  </div>
                  <div style={{
                    fontSize: 11, marginBottom: 8,
                    color: connected ? "var(--color-success, var(--accent))" : "var(--text-muted)",
                  }}>
                    {connected ? "Connected" : "Not connected"}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {showVault ? (
                      <button
                        type="button"
                        onClick={() => onOpenGeneral?.()}
                        style={{
                          background: "none", border: "none", padding: 0, cursor: "pointer",
                          fontSize: 11, color: "var(--accent)", fontFamily: "inherit",
                          textDecoration: "underline",
                        }}
                      >
                        Add key in vault
                      </button>
                    ) : null}
                    {showGh ? (
                      <a href="/api/oauth/github/start" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>Connect</a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
