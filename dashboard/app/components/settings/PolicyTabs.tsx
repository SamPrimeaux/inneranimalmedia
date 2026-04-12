import React, { useState, useEffect, useCallback } from "react";
import { Btn, ControlledSwitch, SettingsRow, Input, WideModal } from "../atoms";
import { AGENTSAM_WORKSPACE_QUERY, ROUTING_MATCH_TYPES } from "../constants";
import { agentsamWorkspaceQueryString } from "../utils";

// ─── CmdAllowlistTab ──────────────────────────────────────────────────────────

export function CmdAllowlistTab() {
  const wsq = agentsamWorkspaceQueryString();
  const [rows,   setRows]   = useState<any[]>([]);
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [newCmd,  setNewCmd]  = useState("");

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const [rList, rPol] = await Promise.all([
        fetch(`/api/agentsam/cmd-allowlist?${wsq}`, { credentials: "same-origin" }),
        fetch(`/api/agentsam/user-policy?${wsq}`,   { credentials: "same-origin" }),
      ]);
      const listData = await rList.json().catch(() => null);
      const polData  = await rPol.json().catch(() => null);
      if (!rList.ok) throw new Error(listData?.error || `Allowlist load failed (${rList.status})`);
      if (!rPol.ok)  throw new Error(polData?.error  || `Policy load failed (${rPol.status})`);
      setRows(Array.isArray(listData) ? listData : []);
      setPolicy(polData);
    } catch (e: any) { setError(e?.message || String(e)); setRows([]); }
    finally { setLoading(false); }
  }, [wsq]);

  useEffect(() => { load(); }, [load]);

  const addCmd = async () => {
    const command = newCmd.trim();
    if (!command) return;
    setError(null);
    try {
      const r = await fetch("/api/agentsam/cmd-allowlist", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, workspace_id: AGENTSAM_WORKSPACE_QUERY }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) { setError(data?.error || "Command already in allowlist"); return; }
      if (!r.ok) throw new Error(data?.error || `Add failed (${r.status})`);
      setNewCmd(""); await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const del = async (id: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/cmd-allowlist/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed (${r.status})`);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const mode = (policy?.auto_run_mode || "allowlist").trim() || "allowlist";

  if (loading) return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading…</div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Command allowlist</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Auto-run mode: <span style={{ color: "var(--text-primary)", fontFamily: "ui-monospace, monospace" }}>{mode}</span>
        </div>
        {mode !== "allowlist" && (
          <div style={{ marginTop: 10, padding: 8, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)" }}>
            {`Auto-run mode is set to '${mode}' — this list is only enforced in allowlist mode.`}
          </div>
        )}
        {error && <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>{error}</div>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Input value={newCmd} onChange={(e) => setNewCmd(e.target.value)} placeholder="Command to allowlist" style={{ flex: 1 }} />
          <Btn variant="primary" onClick={addCmd}>Add</Btn>
        </div>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)", fontSize: 12 }}>
            No commands allowlisted. In allowlist mode, the agent will ask before running any command.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 10, marginBottom: 6, background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 6 }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--text-primary)" }}>{row.command}</span>
              <Btn variant="danger" size="sm" onClick={() => del(row.id)}>Delete</Btn>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── McpToolsTab ──────────────────────────────────────────────────────────────
// Bug fix: onChange={(v) => toggleTool(tn, inList)} was ignoring v entirely.
// Since toggleTool(name, currentlyOn) decides what to do based on current state,
// the unused v parameter caused misleading dead code. Cleaned to () => toggleTool(tn, inList).

export function McpToolsTab() {
  const wsq = agentsamWorkspaceQueryString();
  const [policy,   setPolicy]   = useState<any>(null);
  const [allow,    setAllow]    = useState<any[]>([]);
  const [registry, setRegistry] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState("");
  const [openCat,  setOpenCat]  = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const [rA, rR, rP] = await Promise.all([
        fetch(`/api/agentsam/mcp-allowlist?${wsq}`, { credentials: "same-origin" }),
        fetch("/api/agentsam/tools-registry",        { credentials: "same-origin" }),
        fetch(`/api/agentsam/user-policy?${wsq}`,   { credentials: "same-origin" }),
      ]);
      const aData   = await rA.json().catch(() => null);
      const regData = await rR.json().catch(() => null);
      const pData   = await rP.json().catch(() => null);
      if (!rA.ok) throw new Error(aData?.error   || `Allowlist failed (${rA.status})`);
      if (!rR.ok) throw new Error(regData?.error  || `Registry failed (${rR.status})`);
      if (!rP.ok) throw new Error(pData?.error    || `Policy failed (${rP.status})`);
      setAllow(Array.isArray(aData) ? aData : []);
      setRegistry(Array.isArray(regData) ? regData : []);
      setPolicy(pData);
    } catch (e: any) { setError(e?.message || String(e)); setAllow([]); setRegistry([]); }
    finally { setLoading(false); }
  }, [wsq]);

  useEffect(() => { load(); }, [load]);

  const allowByToolKey = useCallback((): Map<string, any> => {
    const m = new Map<string, any>();
    for (const r of allow) { if (r.tool_key) m.set(r.tool_key, r); }
    return m;
  }, [allow]);

  const toggleTool = async (toolName: string, currentlyOn: boolean) => {
    setError(null);
    const map = allowByToolKey();
    try {
      if (currentlyOn) {
        const row = map.get(toolName);
        if (!row?.id) { await load(); return; }
        const r = await fetch(`/api/agentsam/mcp-allowlist/${encodeURIComponent(row.id)}`, { method: "DELETE", credentials: "same-origin" });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Remove failed (${r.status})`);
      } else {
        const r = await fetch("/api/agentsam/mcp-allowlist", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool_key: toolName, workspace_id: AGENTSAM_WORKSPACE_QUERY }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Add failed (${r.status})`);
      }
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const protOff = policy && Number(policy.mcp_tools_protection) === 0;
  const f       = filter.trim().toLowerCase();
  const filtered = registry.filter((t) => !f || (t.tool_name || "").toLowerCase().includes(f) || (t.description || "").toLowerCase().includes(f));
  const byCat    = filtered.reduce<Record<string, any[]>>((acc, t) => {
    const c = t.tool_category || "other";
    if (!acc[c]) acc[c] = [];
    acc[c].push(t);
    return acc;
  }, {});
  const categories = Object.keys(byCat).sort((a, b) => a.localeCompare(b));
  const map        = allowByToolKey();

  if (loading) return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading MCP tools…</div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          MCP tools <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-muted)" }}>{allow.length} / {registry.length} tools allowlisted</span>
        </div>
        {protOff && (
          <div style={{ marginTop: 10, padding: 8, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)" }}>
            MCP tool protection is disabled — all tools are permitted regardless of this list.
          </div>
        )}
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or description"
          style={{ width: "100%", marginTop: 10, padding: "8px 10px", background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
        />
        {error && <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>{error}</div>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {categories.map((cat) => {
          const open = openCat[cat] !== false;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setOpenCat((prev) => ({ ...prev, [cat]: !open }))}
                style={{ width: "100%", textAlign: "left", padding: "8px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                {open ? "[-]" : "[+]"} {cat} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({byCat[cat].length})</span>
              </button>
              {open && (
                <div style={{ marginTop: 6 }}>
                  {byCat[cat].map((t) => {
                    const tn     = t.tool_name || "";
                    const inList = map.has(tn);
                    const desc   = (t.description || "").length > 80 ? `${(t.description || "").slice(0, 80)}…` : (t.description || "");
                    const en     = Number(t.enabled) !== 0;
                    return (
                      <div key={t.id || tn} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, marginBottom: 4, background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{tn}</div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>{desc}</div>
                        </div>
                        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "var(--bg-elevated)", color: en ? "var(--color-success, var(--text-secondary))" : "var(--text-muted)", border: "1px solid var(--border)" }}>
                          {en ? "enabled" : "off"}
                        </span>
                        <ControlledSwitch checked={inList} onChange={() => toggleTool(tn, inList)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RoutingRulesTab ──────────────────────────────────────────────────────────

export function RoutingRulesTab() {
  const [rules,        setRules]        = useState<any[]>([]);
  const [models,       setModels]       = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [editing,      setEditing]      = useState<any>(null);
  const [priorityEdit, setPriorityEdit] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const [rRules, rModels] = await Promise.all([
        fetch("/api/ai/routing-rules", { credentials: "same-origin" }),
        fetch("/api/ai/models",        { credentials: "same-origin" }),
      ]);
      const d1 = await rRules.json().catch(() => null);
      const d2 = await rModels.json().catch(() => null);
      if (!rRules.ok) throw new Error(d1?.error  || `Routing rules failed (${rRules.status})`);
      if (!rModels.ok) throw new Error(d2?.error || `Models failed (${rModels.status})`);
      const list = Array.isArray(d1?.rules) ? d1.rules : [];
      list.sort((a: any, b: any) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
      setRules(list);
      setModels(Array.isArray(d2?.models) ? d2.models : []);
    } catch (e: any) { setError(e?.message || String(e)); setRules([]); setModels([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) { e.preventDefault(); setEditing(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, saving]);

  const saveModal = async (draft: any) => {
    const rule_name        = (draft.rule_name || "").trim();
    const match_value      = (draft.match_value || "").trim();
    const target_model_key = (draft.target_model_key || "").trim();
    const target_provider  = (draft.target_provider || "").trim();
    if (!rule_name || !match_value || !target_model_key || !target_provider) {
      setError("Rule name, match value, target provider, and target model are required."); return;
    }
    setSaving(true); setError(null);
    try {
      const isEdit = Boolean(draft.id);
      const body: Record<string, any> = { rule_name, priority: Number(draft.priority) || 50, match_type: draft.match_type || "keyword", match_value, target_model_key, target_provider, reason: draft.reason || "", is_active: draft.is_active !== false ? 1 : 0 };
      const r = await fetch(
        isEdit ? `/api/ai/routing-rules/${encodeURIComponent(draft.id)}` : "/api/ai/routing-rules",
        { method: isEdit ? "PATCH" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Save failed (${r.status})`);
      setEditing(null); await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const patchPriority = async (id: string, raw: string) => {
    const p = Math.min(9999, Math.max(0, parseInt(raw, 10) || 0));
    setError(null);
    try {
      const r = await fetch(`/api/ai/routing-rules/${encodeURIComponent(id)}`, {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: p }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (${r.status})`);
      setPriorityEdit(null); await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const toggleRule = async (row: any, nextOn: boolean) => {
    setError(null);
    try {
      const r = await fetch(`/api/ai/routing-rules/${encodeURIComponent(row.id)}`, {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextOn ? 1 : 0 }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (${r.status})`);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const deleteRule = async (id: string) => {
    if (!window.confirm("Delete this routing rule?")) return;
    setError(null);
    try {
      const r = await fetch(`/api/ai/routing-rules/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed (${r.status})`);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const modelsByProvider = models.reduce<Record<string, any[]>>((acc, m) => {
    const p = m.provider || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});
  const providers = Object.keys(modelsByProvider).sort((a, b) => a.localeCompare(b));

  const syncTargetsFromModel = (modelKey: string) => {
    const m = models.find((x) => x.model_key === modelKey || x.id === modelKey);
    return m ? { target_model_key: m.model_key || m.id, target_provider: m.provider || "" } : {};
  };

  if (loading) return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading routing rules…</div>;

  const newRuleDraft = { rule_name: "", priority: 50, match_type: "keyword", match_value: "", target_provider: "", target_model_key: "", reason: "", is_active: true };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Btn variant="primary" size="sm" onClick={() => setEditing(newRuleDraft)}>+ New</Btn>
        {error && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{error}</span>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {rules.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 12 }}>No routing rules</div>
        ) : (
          rules.map((row) => (
            <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 12, marginBottom: 8, background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 8 }}>
              {priorityEdit === row.id ? (
                <input
                  type="number" autoFocus defaultValue={row.priority}
                  onBlur={(e) => patchPriority(row.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{ width: 56, padding: "4px 6px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, fontFamily: "inherit" }}
                />
              ) : (
                <button type="button" onClick={() => setPriorityEdit(row.id)} title="Edit priority"
                  style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit" }}>
                  {row.priority}
                </button>
              )}
              <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>{row.rule_name}</span>
              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.match_type}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace" }}>{row.target_provider}:{row.target_model_key}</span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ControlledSwitch checked={Number(row.is_active) !== 0} onChange={(v) => toggleRule(row, v)} />
                <Btn variant="inline" onClick={() => setEditing({ id: row.id, rule_name: row.rule_name, priority: row.priority, match_type: row.match_type, match_value: row.match_value, target_provider: row.target_provider, target_model_key: row.target_model_key, reason: row.reason || "", is_active: Number(row.is_active) !== 0 })}>Edit</Btn>
                <Btn variant="danger" size="sm" onClick={() => deleteRule(row.id)}>Delete</Btn>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <WideModal open onClose={() => !saving && setEditing(null)} title={editing.id ? "Edit routing rule" : "New routing rule"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Rule name",      key: "rule_name",   placeholder: "" },
              { label: "Match value",    key: "match_value", placeholder: "" },
              { label: "Target provider",key: "target_provider", placeholder: "" },
            ].map(({ label, key, placeholder }) => (
              <React.Fragment key={key}>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</div>
                <Input value={(editing as any)[key] ?? ""} onChange={(e) => setEditing((x: any) => ({ ...x, [key]: e.target.value }))} placeholder={placeholder} />
              </React.Fragment>
            ))}
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Priority</div>
            <Input type="number" value={String(editing.priority ?? 50)} onChange={(e) => setEditing((x: any) => ({ ...x, priority: e.target.value }))} />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Match type</div>
            <select value={editing.match_type || "keyword"} onChange={(e) => setEditing((x: any) => ({ ...x, match_type: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit" }}>
              {ROUTING_MATCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Target model</div>
            <select value={editing.target_model_key || ""} onChange={(e) => { const mk = e.target.value; setEditing((x: any) => ({ ...x, ...syncTargetsFromModel(mk), target_model_key: mk })); }}
              style={{ width: "100%", padding: "8px 10px", background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit" }}>
              <option value="">Select model</option>
              {providers.map((p) => (
                <optgroup key={p} label={p}>
                  {modelsByProvider[p].map((m) => { const key = m.model_key || m.id; return <option key={key} value={key}>{m.display_name || key}</option>; })}
                </optgroup>
              ))}
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Reason (optional)</div>
            <textarea value={editing.reason ?? ""} onChange={(e) => setEditing((x: any) => ({ ...x, reason: e.target.value }))} rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: 8, background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit", resize: "vertical" }} />
            <SettingsRow label="Active" description="Inactive rules are skipped."
              control={<ControlledSwitch checked={editing.is_active !== false} onChange={(v) => setEditing((x: any) => ({ ...x, is_active: v }))} />} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => !saving && setEditing(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={saving} onClick={() => saveModal(editing)}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </WideModal>
      )}
    </div>
  );
}
