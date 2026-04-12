import { useState, useEffect } from "react";
import { formatUsd2, relativeTime } from "../utils";

function formatSuccessRatePct(v) {
  if (v == null || v === "") return null;
  let x = Number(v);
  if (!Number.isFinite(x)) return null;
  if (x > 0 && x <= 1) x *= 100;
  return `${Math.round(x)}%`;
}

export function AgentsTab() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/agentsam/ai", { credentials: "same-origin" });
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || `Failed to load agents (${r.status})`);
        if (!cancelled) setAgents(Array.isArray(d) ? d : []);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setAgents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Loading agents…</div>
      ) : error ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: 16 }}>{error}</div>
      ) : agents.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
          No agents configured.
        </div>
      ) : (
        agents.map((a) => {
          const active = String(a.status || "").toLowerCase() === "active";
          const runs = a.total_runs != null && Number(a.total_runs) !== 0 ? Number(a.total_runs) : null;
          const cost = a.total_cost_usd != null && Number(a.total_cost_usd) !== 0 ? Number(a.total_cost_usd) : null;
          const sr = formatSuccessRatePct(a.success_rate);
          const showSr = sr != null && a.success_rate != null && Number(a.success_rate) !== 0;
          const avgMs = a.avg_response_ms != null && Number(a.avg_response_ms) !== 0 ? Number(a.avg_response_ms) : null;
          const lastRel = a.last_run_at != null ? relativeTime(a.last_run_at) : null;
          return (
            <div
              key={a.id}
              style={{
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 12,
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{a.name || a.id}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {a.role_name ? (
                    <span style={{
                      fontSize: 9, padding: "2px 8px", borderRadius: 10,
                      background: "var(--bg-elevated)", border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}>{a.role_name}</span>
                  ) : null}
                  <span style={{
                    fontSize: 9, padding: "2px 8px", borderRadius: 10,
                    background: "var(--bg-elevated)", border: "1px solid var(--border)",
                    color: active ? "var(--color-success, var(--accent))" : "var(--text-muted)",
                  }}>{active ? "active" : "inactive"}</span>
                  {a.mode ? (
                    <span style={{
                      fontSize: 9, padding: "2px 8px", borderRadius: 4,
                      background: "var(--bg-elevated)", color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                    }}>{a.mode}</span>
                  ) : null}
                  {a.safety_level != null && String(a.safety_level).trim() !== "" ? (
                    <span style={{
                      fontSize: 9, padding: "2px 8px", borderRadius: 4,
                      background: "var(--bg-elevated)", color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                    }}>{a.safety_level}</span>
                  ) : null}
                </div>
              </div>
              {a.description ? (
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.45 }}>
                  {a.description}
                </div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {runs != null ? (
                  <span style={{
                    fontSize: 10, padding: "2px 6px", background: "var(--bg-elevated)",
                    color: "var(--text-secondary)", borderRadius: 4, border: "1px solid var(--border)",
                  }}>{runs} runs</span>
                ) : null}
                {cost != null ? (
                  <span style={{
                    fontSize: 10, padding: "2px 6px", background: "var(--bg-elevated)",
                    color: "var(--text-secondary)", borderRadius: 4, border: "1px solid var(--border)",
                  }}>{formatUsd2(cost)}</span>
                ) : null}
                {showSr ? (
                  <span style={{
                    fontSize: 10, padding: "2px 6px", background: "var(--bg-elevated)",
                    color: "var(--text-secondary)", borderRadius: 4, border: "1px solid var(--border)",
                  }}>{sr}</span>
                ) : null}
                {avgMs != null ? (
                  <span style={{
                    fontSize: 10, padding: "2px 6px", background: "var(--bg-elevated)",
                    color: "var(--text-secondary)", borderRadius: 4, border: "1px solid var(--border)",
                  }}>{`${Math.round(avgMs)}ms`}</span>
                ) : null}
              </div>
              {lastRel ? (
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>Last run {lastRel}</div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
