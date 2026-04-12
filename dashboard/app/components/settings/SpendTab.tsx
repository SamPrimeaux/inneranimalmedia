import React, { useState, useEffect, useCallback } from "react";
import { Btn } from "../atoms";
import { formatUsd2, formatTokensK, formatDayLabel, pillStyle } from "../utils";

export function SpendTab() {
  const [rows,          setRows]          = useState<any[]>([]);
  const [totalSpend,    setTotalSpend]    = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [selectedDays,  setSelectedDays]  = useState(30);
  const [selectedGroup, setSelectedGroup] = useState("provider");

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch(`/api/spend/unified?days=${selectedDays}&group=${encodeURIComponent(selectedGroup)}`, { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load spend data");
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setTotalSpend(Number(d.total_cost_usd) || 0);
      })
      .catch((e: any) => { setError(e?.message || String(e)); setRows([]); setTotalSpend(0); })
      .finally(() => setLoading(false));
  }, [selectedDays, selectedGroup]);

  useEffect(() => { load(); }, [load]);

  const sourceCount   = rows.length;
  const providerCount = selectedGroup === "provider"
    ? rows.length
    : selectedGroup === "model"
      ? new Set(rows.map((r) => r.provider).filter(Boolean)).size
      : rows.length;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Total spend</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{formatUsd2(totalSpend)}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Period</span>
          <select
            value={selectedDays === 0 ? "0" : String(selectedDays)}
            onChange={(e) => setSelectedDays(e.target.value === "0" ? 0 : Number(e.target.value) || 30)}
            style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)" }}
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="0">All time</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {(["provider", "model", "day"] as const).map((g) => (
          <button key={g} type="button" onClick={() => setSelectedGroup(g)} style={pillStyle(selectedGroup === g)}>
            {g === "provider" ? "Provider" : g === "model" ? "Model" : "Day"}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>Loading spend data…</div>
      ) : error ? (
        <div style={{ padding: 16 }}>
          <div style={{ color: "var(--text-secondary)", fontSize: 11, marginBottom: 10 }}>Failed to load spend data</div>
          <Btn variant="primary" size="sm" onClick={load}>Retry</Btn>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>No spend recorded for this period.</div>
      ) : (
        <>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
            {selectedGroup === "day"
              ? `${sourceCount} day${sourceCount === 1 ? "" : "s"}`
              : `${sourceCount} sources across ${providerCount} provider${providerCount === 1 ? "" : "s"}`}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                {selectedGroup === "provider" && <><th style={{ padding: "6px 4px" }}>Provider</th><th style={{ padding: "6px 4px" }}>Total Spend</th><th style={{ padding: "6px 4px" }}>Tokens In</th><th style={{ padding: "6px 4px" }}>Tokens Out</th><th style={{ padding: "6px 4px" }}>Requests</th></>}
                {selectedGroup === "model"    && <><th style={{ padding: "6px 4px" }}>Model</th><th style={{ padding: "6px 4px" }}>Provider</th><th style={{ padding: "6px 4px" }}>Total Spend</th><th style={{ padding: "6px 4px" }}>Tokens In</th><th style={{ padding: "6px 4px" }}>Tokens Out</th><th style={{ padding: "6px 4px" }}>Requests</th></>}
                {selectedGroup === "day"      && <><th style={{ padding: "6px 4px" }}>Date</th><th style={{ padding: "6px 4px" }}>Total Spend</th><th style={{ padding: "6px 4px" }}>Requests</th></>}
              </tr>
            </thead>
            <tbody>
              {selectedGroup === "provider" && rows.map((row) => (
                <tr key={row.provider} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 4px", color: "var(--text-primary)" }}>{row.provider}</td>
                  <td style={{ padding: "6px 4px", fontFamily: "ui-monospace, monospace" }}>{formatUsd2(row.total_cost_usd)}</td>
                  <td style={{ padding: "6px 4px" }}>{formatTokensK(row.total_tokens_in)}</td>
                  <td style={{ padding: "6px 4px" }}>{formatTokensK(row.total_tokens_out)}</td>
                  <td style={{ padding: "6px 4px", color: "var(--text-muted)" }}>{row.row_count}</td>
                </tr>
              ))}
              {selectedGroup === "model" && rows.map((row) => (
                <tr key={row.model} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 4px", color: "var(--text-primary)" }}>{row.model}</td>
                  <td style={{ padding: "6px 4px" }}>{row.provider}</td>
                  <td style={{ padding: "6px 4px", fontFamily: "ui-monospace, monospace" }}>{formatUsd2(row.total_cost_usd)}</td>
                  <td style={{ padding: "6px 4px" }}>{formatTokensK(row.total_tokens_in)}</td>
                  <td style={{ padding: "6px 4px" }}>{formatTokensK(row.total_tokens_out)}</td>
                  <td style={{ padding: "6px 4px", color: "var(--text-muted)" }}>{row.row_count}</td>
                </tr>
              ))}
              {selectedGroup === "day" && rows.map((row) => (
                <tr key={row.date} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 4px", color: "var(--text-primary)" }}>{formatDayLabel(row.date)}</td>
                  <td style={{ padding: "6px 4px", fontFamily: "ui-monospace, monospace" }}>{formatUsd2(row.total_cost_usd)}</td>
                  <td style={{ padding: "6px 4px", color: "var(--text-muted)" }}>{row.row_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/finance" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>View full finance dashboard</a>
      </div>
    </div>
  );
}
