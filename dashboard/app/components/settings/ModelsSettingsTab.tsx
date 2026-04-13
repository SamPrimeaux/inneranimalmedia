import { useState, useCallback, useEffect } from "react";
import { Btn, ControlledSwitch } from "./atoms";
import { formatUsd2 } from "../utils";

export function ModelsSettingsTab() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterText, setFilterText] = useState("");
  const [filterProvider, setFilterProvider] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [patchErr, setPatchErr] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/ai/models", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load models");
        setModels(Array.isArray(d.models) ? d.models : []);
      })
      .catch((e) => {
        setError(e?.message || String(e));
        setModels([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchField = async (id, partial) => {
    setPatchErr(null);
    try {
      const r = await fetch(`/api/ai/models/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Update failed (${r.status})`);
      const row = d.model;
      if (row) {
        setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...row } : m)));
      } else {
        await load();
      }
    } catch (e) {
      setPatchErr(e?.message || String(e));
    }
  };

  const filtered = models
    .filter((m) => {
      if (activeOnly && Number(m.is_active) === 0) return false;
      if (filterProvider !== "all" && String(m.provider || "") !== filterProvider) return false;
      if (filterText.trim()) {
        const q = filterText.trim().toLowerCase();
        if (!String(m.display_name || "").toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const pa = String(a.provider || "");
      const pb = String(b.provider || "");
      if (pa !== pb) return pa.localeCompare(pb);
      return String(a.display_name || "").localeCompare(String(b.display_name || ""));
    });

  const yn = (v) => (v ? "Y" : "-");
  const ctxK = (m) => {
    const t = m.context_max_tokens;
    if (t == null || Number(t) === 0) return "-";
    return `${Math.round(Number(t) / 1000)}k`;
  };
  const rateFmt = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return "-";
    return formatUsd2(x);
  };

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input
          type="search"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          aria-label="Filter models by name"
          style={{
            flex: "1 1 160px",
            minWidth: 140,
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid var(--border)",
            background: "var(--bg-canvas)",
            color: "var(--text-primary)",
            fontSize: 11,
          }}
        />
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          style={{
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid var(--border)",
            background: "var(--bg-canvas)",
            color: "var(--text-primary)",
            fontSize: 11,
          }}
        >
          <option value="all">All providers</option>
          <option value="anthropic">anthropic</option>
          <option value="openai">openai</option>
          <option value="google">google</option>
          <option value="workers_ai">workers_ai</option>
          <option value="cursor">cursor</option>
          <option value="stability">stability</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
          <ControlledSwitch checked={activeOnly} onChange={setActiveOnly} />
          Active only
        </label>
      </div>

      {patchErr ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>{patchErr}</div>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Loading models…</div>
      ) : error ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: 16 }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>No models match.</div>
      ) : (
        <>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
            {filtered.length} models
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "6px 4px" }}>Model</th>
                  <th style={{ padding: "6px 4px" }}>Provider</th>
                  <th style={{ padding: "6px 4px" }}>Size</th>
                  <th style={{ padding: "6px 4px" }}>Tools</th>
                  <th style={{ padding: "6px 4px" }}>Vision</th>
                  <th style={{ padding: "6px 4px" }}>Cache</th>
                  <th style={{ padding: "6px 4px" }}>Context</th>
                  <th style={{ padding: "6px 4px" }}>In $/M</th>
                  <th style={{ padding: "6px 4px" }}>Out $/M</th>
                  <th style={{ padding: "6px 4px" }}>Picker</th>
                  <th style={{ padding: "6px 4px" }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 4px", color: "var(--text-primary)", maxWidth: 180 }}>{m.display_name || m.id}</td>
                    <td style={{ padding: "6px 4px" }}>{m.provider || "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{m.size_class || "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{yn(Number(m.supports_tools) !== 0)}</td>
                    <td style={{ padding: "6px 4px" }}>{yn(Number(m.supports_vision) !== 0)}</td>
                    <td style={{ padding: "6px 4px" }}>{yn(Number(m.supports_cache) !== 0)}</td>
                    <td style={{ padding: "6px 4px" }}>{ctxK(m)}</td>
                    <td style={{ padding: "6px 4px", fontFamily: "ui-monospace, monospace" }}>{rateFmt(m.input_rate_per_mtok)}</td>
                    <td style={{ padding: "6px 4px", fontFamily: "ui-monospace, monospace" }}>{rateFmt(m.output_rate_per_mtok)}</td>
                    <td style={{ padding: "6px 4px" }}>
                      <ControlledSwitch
                        checked={Number(m.show_in_picker) !== 0}
                        onChange={(v) => patchField(m.id, { show_in_picker: v ? 1 : 0 })}
                      />
                    </td>
                    <td style={{ padding: "6px 4px" }}>
                      <ControlledSwitch
                        checked={Number(m.is_active) !== 0}
                        onChange={(v) => patchField(m.id, { is_active: v ? 1 : 0 })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
