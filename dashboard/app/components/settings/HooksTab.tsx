import React, { useState, useEffect, useCallback } from "react";
import { Btn, ControlledSwitch, SettingsRow, Input, WideModal } from "./atoms";
import { HOOK_TRIGGERS, AGENTSAM_WORKSPACE_QUERY } from "./constants";
import { agentsamWorkspaceQueryString, relativeTime, formatLastRanUnix } from "./utils";

export function HooksTab() {
  const wsq = agentsamWorkspaceQueryString();

  const [items,   setItems]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const r = await fetch(`/api/agentsam/hooks?${wsq}`, { credentials: "same-origin" });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || `Failed to load hooks (${r.status})`);
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || String(e)); setItems([]);
    } finally {
      setLoading(false);
    }
  }, [wsq]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || saving) return;
      e.preventDefault(); setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, saving]);

  const patchActive = async (row: any, nextOn: boolean) => {
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/hooks/${encodeURIComponent(row.id)}`, {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextOn ? 1 : 0 }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (${r.status})`);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const saveModal = async (draft: any) => {
    const command = (draft.command || "").trim();
    const trigger = draft.trigger || "";
    if (!command || !(HOOK_TRIGGERS as readonly string[]).includes(trigger)) {
      setError("Command and a valid trigger are required."); return;
    }
    setSaving(true); setError(null);
    try {
      const isEdit = Boolean(draft.id);
      const body = isEdit
        ? { trigger, command, is_active: draft.is_active !== false ? 1 : 0 }
        : { trigger, command, is_active: draft.is_active !== false ? 1 : 0, workspace_id: AGENTSAM_WORKSPACE_QUERY };
      const r = await fetch(
        isEdit ? `/api/agentsam/hooks/${encodeURIComponent(draft.id)}` : "/api/agentsam/hooks",
        { method: isEdit ? "PATCH" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Save failed (${r.status})`);
      setEditing(null); await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const deleteHook = async (id: string) => {
    if (!window.confirm("Delete this hook?")) return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/hooks/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed (${r.status})`);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const trunc = (s: string, n: number) => {
    const t = (s || "").trim();
    return t.length <= n ? t : `${t.slice(0, n)}…`;
  };

  if (loading) return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading hooks…</div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Btn variant="primary" size="sm" onClick={() => setEditing({ trigger: "start", command: "", is_active: true })}>+ New</Btn>
        {error && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{error}</span>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 12 }}>No hooks configured</div>
        ) : (
          items.map((h) => {
            const n   = Number(h.execution_count) || 0;
            const rel = relativeTime(h.last_ran_at) || formatLastRanUnix(h.last_ran_at);
            const runLabel = n === 0 ? "Never run" : `${n} runs${rel ? ` · last ran ${rel}` : ""}`;
            return (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, marginBottom: 8, background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", padding: "2px 8px", borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--accent)", color: "var(--accent)" }}>{h.trigger}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--text-primary)" }}>{trunc(h.command, 120)}</div>
                  <div style={{ fontSize: 10, marginTop: 4, color: n === 0 ? "var(--text-muted)" : "var(--text-secondary)" }}>{runLabel}</div>
                </div>
                <ControlledSwitch checked={Number(h.is_active) !== 0} onChange={(v) => patchActive(h, v)} />
                <Btn variant="inline" onClick={() => setEditing({ id: h.id, trigger: h.trigger, command: h.command, is_active: Number(h.is_active) !== 0 })}>Edit</Btn>
                <Btn variant="danger" size="sm" onClick={() => deleteHook(h.id)}>Delete</Btn>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <WideModal open onClose={() => !saving && setEditing(null)} title={editing.id ? "Edit hook" : "New hook"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Trigger</div>
            <select
              value={editing.trigger || "start"}
              onChange={(e) => setEditing((x: any) => ({ ...x, trigger: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit" }}
            >
              {HOOK_TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Command</div>
            <Input value={editing.command ?? ""} onChange={(e) => setEditing((x: any) => ({ ...x, command: e.target.value }))} placeholder="Shell command to run" />
            <SettingsRow
              label="Active"
              description="When off, this hook is skipped."
              control={<ControlledSwitch checked={editing.is_active !== false} onChange={(v) => setEditing((x: any) => ({ ...x, is_active: v }))} />}
            />
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
