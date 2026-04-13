import { useState, useEffect } from "react";
import { SectionLabel } from "./atoms";

export function ToolsMcpTab() {
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/commands", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || !d.success) throw new Error(d?.error || "Failed to load commands");
        if (!cancelled) setCommands(Array.isArray(d.commands) ? d.commands : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || String(e));
          setCommands([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: 16 }}>
        <SectionLabel>Slash commands</SectionLabel>
        {loading ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 16 }}>Loading…</div>
        ) : error ? (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: 16 }}>{error}</div>
        ) : commands.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 16 }}>No commands returned.</div>
        ) : (
          commands.map((c) => (
            <div
              key={c.slug || c.name}
              style={{
                padding: 12, marginBottom: 8, borderRadius: 6,
                border: "1px solid var(--border)", background: "var(--bg-canvas)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{c.name || c.slug}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace", marginTop: 4 }}>{c.slug}</div>
              {c.description ? (
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.45 }}>{c.description}</div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {c.category ? (
                  <span style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 4,
                    border: "1px solid var(--border)", color: "var(--text-secondary)",
                  }}>{c.category}</span>
                ) : null}
                {c.status ? (
                  <span style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 4,
                    background: "var(--bg-elevated)", color: "var(--text-secondary)",
                  }}>{c.status}</span>
                ) : null}
                {Number(c.usage_count) > 0 ? (
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.usage_count} uses</span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ flexShrink: 0, padding: 12, borderTop: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
        <SectionLabel>MCP</SectionLabel>
        <a href="/dashboard/mcp" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
          Open MCP dashboard
        </a>
      </div>
    </div>
  );
}
