import React, { useState, useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { Btn, ControlledSwitch, SectionLabel, Input, Modal, WideModal } from "./atoms";
import { AGENTSAM_WORKSPACE_QUERY, WORKSPACE_ENFORCEMENT } from "./constants";
import { agentsamWorkspaceIdForNewRule, ruleMatchesFilter, subagentMatchesFilter, skillMatchesFilter, timeAgo, pillStyle } from "./utils";

// ─── SkillCardRow ─────────────────────────────────────────────────────────────

interface SkillCardRowProps {
  skill: any;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

function SkillCardRow({ skill, onEdit, onDelete, onToggleActive }: SkillCardRowProps) {
  const active     = Number(skill.is_active) !== 0;
  const scopeLabel = skill.scope === "workspace" ? "workspace" : skill.scope === "global" ? "global" : null;
  return (
    <div style={{ padding: 12, background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ width: 40, height: 40, background: "var(--bg-elevated)", border: "1px solid var(--accent)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 600, color: "var(--accent)", fontFamily: "ui-monospace, monospace" }}>SK</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{skill.name}</div>
          {scopeLabel === "workspace" && <span style={{ padding: "2px 8px", background: "var(--bg-elevated)", border: "1px solid var(--accent)", borderRadius: 4, fontSize: 10, color: "var(--accent)" }}>Workspace</span>}
          {scopeLabel === "global"    && <span style={{ padding: "2px 8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 10, color: "var(--text-secondary)" }}>Global</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 8 }}>{skill.description || "No description."}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn variant="inline" onClick={onEdit}>Edit</Btn>
          <Btn variant="danger" size="sm" onClick={onDelete}>Delete</Btn>
        </div>
      </div>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <ControlledSwitch checked={active} onChange={onToggleActive} />
      </div>
    </div>
  );
}

// ─── RulesSkillsSubagentsTab ──────────────────────────────────────────────────

export function RulesSkillsSubagentsTab() {
  const [rules,     setRules]     = useState<any[]>([]);
  const [subagents, setSubagents] = useState<any[]>([]);
  const [skills,    setSkills]    = useState<any[]>([]);
  const [filter,    setFilter]    = useState("all");
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingRule,     setEditingRule]     = useState<any>(null);
  const [editingSubagent, setEditingSubagent] = useState<any>(null);
  const [editingSkill,    setEditingSkill]    = useState<any>(null);
  const [revisionsFor,    setRevisionsFor]    = useState<string | null>(null);
  const [revisions,       setRevisions]       = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    const r = await fetch("/api/agentsam/rules", { credentials: "same-origin" });
    const data = await r.json().catch(() => { throw new Error(`Rules: invalid response (${r.status})`); });
    if (!r.ok) throw new Error(data?.error || `Failed to load rules (${r.status})`);
    setRules(Array.isArray(data) ? data : data?.rules || []);
  }, []);

  const loadSubagents = useCallback(async () => {
    const q = new URLSearchParams({ workspace_id: AGENTSAM_WORKSPACE_QUERY });
    const r = await fetch(`/api/agentsam/subagents?${q}`, { credentials: "same-origin" });
    const data = await r.json().catch(() => { throw new Error(`Subagents: invalid response (${r.status})`); });
    if (!r.ok) throw new Error(data?.error || `Failed to load subagents (${r.status})`);
    setSubagents(Array.isArray(data) ? data : data?.subagents || []);
  }, []);

  const loadSkills = useCallback(async () => {
    const q = new URLSearchParams({ workspace_id: AGENTSAM_WORKSPACE_QUERY, include_inactive: "1" });
    const r = await fetch(`/api/agentsam/skills?${q}`, { credentials: "same-origin" });
    const data = await r.json().catch(() => { throw new Error(`Skills: invalid response (${r.status})`); });
    if (!r.ok) throw new Error(data?.error || `Failed to load skills (${r.status})`);
    setSkills(Array.isArray(data) ? data : (data?.skills || []));
  }, []);

  const loadAll = useCallback(async () => {
    setError(null); setLoading(true);
    try { await Promise.all([loadRules(), loadSubagents(), loadSkills()]); }
    catch (e: any) { setError(e?.message || String(e)); setRules([]); setSubagents([]); setSkills([]); }
    finally { setLoading(false); }
  }, [loadRules, loadSubagents, loadSkills]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 3200);
    return () => clearTimeout(t);
  }, [successMessage]);

  useEffect(() => {
    const anyOpen = Boolean(editingRule || editingSubagent || editingSkill || revisionsFor);
    if (!anyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (saving) return;
      if (revisionsFor) setRevisionsFor(null);
      else { setEditingRule(null); setEditingSubagent(null); setEditingSkill(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingRule, editingSubagent, editingSkill, revisionsFor, saving]);

  const openRevisions = async (ruleId: string) => {
    setRevisionsFor(ruleId); setRevisions([]); setError(null);
    try {
      const r = await fetch(`/api/agentsam/rules/${encodeURIComponent(ruleId)}/revisions`, { credentials: "same-origin" });
      const data = await r.json().catch(() => { throw new Error(`Invalid revisions response (${r.status})`); });
      if (!r.ok) throw new Error(data?.error || `Revisions failed (${r.status})`);
      setRevisions(Array.isArray(data) ? data : []);
    } catch (e: any) { setRevisions([]); setError(e?.message || String(e)); }
  };

  const saveRule = async (draft: any) => {
    const title         = (draft.title || "").trim();
    const body_markdown = draft.body_markdown ?? "";
    if (!title || !body_markdown.trim()) { setError("Title and body are required."); return; }
    setSaving(true); setError(null);
    try {
      const ws = draft.workspace_id != null ? draft.workspace_id : agentsamWorkspaceIdForNewRule(filter);
      if (draft.id) {
        const r = await fetch(`/api/agentsam/rules/${encodeURIComponent(draft.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body_markdown }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Save failed ${r.status}`);
      } else {
        const body: Record<string, any> = { title, body_markdown };
        if (ws != null && String(ws).trim() !== "") body.workspace_id = ws;
        const r = await fetch("/api/agentsam/rules", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Create failed ${r.status}`);
      }
      setEditingRule(null); await loadRules();
      setSuccessMessage(draft.id ? "Rule updated." : "Rule created.");
    } catch (e: any) { setError(`Save rule failed: ${e?.message || String(e)}`); }
    finally { setSaving(false); }
  };

  const saveSubagent = async (draft: any) => {
    const slug         = (draft.slug || "").trim();
    const display_name = (draft.display_name || "").trim();
    if (!slug || !display_name) { setError("Slug and display name are required."); return; }
    if (!/^[a-z0-9_-]+$/.test(slug)) { setError("Slug must be lowercase letters, numbers, hyphens, or underscores."); return; }
    setSaving(true); setError(null);
    try {
      const payload = { slug, display_name, default_model_id: draft.default_model_id || null, allowed_tool_globs: draft.allowed_tool_globs || null, instructions_markdown: draft.instructions_markdown || null, is_active: Number(draft.is_active) !== 0 ? 1 : 0 };
      if (draft.id) {
        const r = await fetch(`/api/agentsam/subagents/${encodeURIComponent(draft.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Update failed ${r.status}`);
      } else {
        const r = await fetch("/api/agentsam/subagents", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Create failed ${r.status}`);
      }
      setEditingSubagent(null); await loadSubagents();
      setSuccessMessage(draft.id ? "Subagent updated." : "Subagent created.");
    } catch (e: any) { setError(`Save subagent failed: ${e?.message || String(e)}`); }
    finally { setSaving(false); }
  };

  const deleteSubagent = async (id: string) => {
    if (!window.confirm("Delete this subagent profile? This cannot be undone.")) return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/subagents/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed ${r.status}`);
      await loadSubagents();
      if (editingSubagent?.id === id) setEditingSubagent(null);
      setSuccessMessage("Subagent deleted.");
    } catch (e: any) { setError(`Delete subagent failed: ${e?.message || String(e)}`); }
  };

  const saveSkill = async (draft: any) => {
    const name = (draft.name || "").trim();
    if (!name) { setError("Skill name is required."); return; }
    setSaving(true); setError(null);
    try {
      const payload: Record<string, any> = { name, description: draft.description ?? "", content_markdown: draft.content_markdown ?? "", scope: draft.scope || "user", metadata_json: draft.metadata_json || "{}" };
      payload.workspace_id = draft.scope === "workspace" ? (draft.workspace_id || "tenant_sam_primeaux") : null;
      if (draft.file_path) payload.file_path = draft.file_path;
      if (draft.id) {
        const r = await fetch(`/api/agentsam/skills/${encodeURIComponent(draft.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Update failed ${r.status}`);
      } else {
        const r = await fetch("/api/agentsam/skills", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Create failed ${r.status}`);
      }
      setEditingSkill(null); await loadSkills();
      setSuccessMessage(draft.id ? "Skill updated." : "Skill created.");
    } catch (e: any) { setError(`Save skill failed: ${e?.message || String(e)}`); }
    finally { setSaving(false); }
  };

  const deleteSkill = async (id: string) => {
    if (!window.confirm("Delete this skill? This cannot be undone.")) return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/skills/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed ${r.status}`);
      await loadSkills();
      if (editingSkill?.id === id) setEditingSkill(null);
      setSuccessMessage("Skill deleted.");
    } catch (e: any) { setError(`Delete skill failed: ${e?.message || String(e)}`); }
  };

  const toggleSkill = async (id: string) => {
    const skill = skills.find((s) => s.id === id);
    if (!skill) return;
    setError(null);
    try {
      const newState = Number(skill.is_active) !== 0 ? 0 : 1;
      const r = await fetch(`/api/agentsam/skills/${encodeURIComponent(id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: newState }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `Toggle failed ${r.status}`);
      await loadSkills();
    } catch (e: any) { setError(`Toggle skill failed: ${e?.message || String(e)}`); }
  };

  const filteredRules    = rules.filter((r)    => ruleMatchesFilter(r, filter));
  const filteredSubagents = subagents.filter((s) => subagentMatchesFilter(s, filter));
  const filteredSkills   = skills.filter((s)   => skillMatchesFilter(s, filter));

  const emptyCard: React.CSSProperties = { textAlign: "center", padding: "40px 20px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8 };
  const emptyIcon = <div aria-hidden style={{ width: 40, height: 40, margin: "0 auto 12px", border: "2px dashed var(--border)", borderRadius: 6, opacity: 0.6 }} />;

  const emptyMessage = (type: string, filter: string) => {
    if (filter === "all")       return `Create your first ${type}.`;
    if (filter === "user")      return `No user-scoped ${type}s for this filter.`;
    if (filter === "workspace") return `No workspace-scoped ${type}s for this filter.`;
    return "";
  };

  if (loading) {
    return (
      <>
        <style>{`@keyframes rssSpin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 64, minHeight: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 24, height: 24, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "rssSpin 0.8s linear infinite", flexShrink: 0 }} />
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>Loading rules, skills, and subagents</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes rssSpin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Rules, skills, and subagents</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>Domain-specific knowledge and workflows stored in D1, applied to Agent Sam.</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {(["all", "user", "workspace"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} style={pillStyle(filter === f)}>
              {f === "workspace" ? "inneranimalmedia" : f === "all" ? "All" : "User"}
            </button>
          ))}
        </div>

        {successMessage && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, padding: "10px 12px", borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--color-success)", color: "var(--color-success)", fontSize: 12 }}>
            <span>{successMessage}</span>
            <button type="button" onClick={() => setSuccessMessage(null)} style={{ background: "transparent", border: "none", color: "var(--color-success)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>Dismiss</button>
          </div>
        )}
        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12, padding: "10px 12px", borderRadius: 6, background: "var(--bg-danger-muted)", border: "1px solid var(--border-danger)", color: "var(--color-error)", fontSize: 12 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" onClick={() => setError(null)} style={{ background: "transparent", border: "none", color: "var(--color-error)", cursor: "pointer", fontSize: 11, flexShrink: 0, textDecoration: "underline" }}>Dismiss</button>
          </div>
        )}

        <SectionLabel>Workspace enforcement (read-only)</SectionLabel>
        <div style={{ marginBottom: 20 }}>
          {WORKSPACE_ENFORCEMENT.map((r) => (
            <div key={r.name} style={{ padding: "8px 10px", borderRadius: 5, background: "var(--bg-elevated)", borderLeft: "3px solid var(--color-success)", marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)", marginBottom: 2 }}>{r.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{r.desc}</div>
            </div>
          ))}
        </div>

        {/* Rules */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <SectionLabel>Rules</SectionLabel>
          <Btn size="sm" onClick={() => { setError(null); setEditingRule({ title: "", body_markdown: "", workspace_id: agentsamWorkspaceIdForNewRule(filter) }); }}>+ New</Btn>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Use rules to guide agent behavior. Stored in agentsam_rules_document.</div>
        <div style={{ marginBottom: 24 }}>
          {filteredRules.length === 0 ? (
            <div style={{ ...emptyCard, color: "var(--text-secondary)" }}>
              {emptyIcon}
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>No rules found</div>
              <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>{emptyMessage("rule", filter)}</div>
              <Btn variant="primary" size="sm" onClick={() => setEditingRule({ title: "", body_markdown: "", workspace_id: agentsamWorkspaceIdForNewRule(filter) })}>Create rule</Btn>
            </div>
          ) : (
            filteredRules.map((rule) => (
              <div key={rule.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8, background: "var(--bg-canvas)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{rule.title}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>v{rule.version ?? "?"} · {rule.workspace_id ? `workspace ${rule.workspace_id}` : "user scope"} · {rule.updated_at ? timeAgo(rule.updated_at) : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Btn variant="inline" onClick={() => openRevisions(rule.id)}>History</Btn>
                    <Btn variant="inline" onClick={() => setEditingRule({ ...rule })}>Edit</Btn>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Skills */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <SectionLabel>Skills</SectionLabel>
          <Btn size="sm" onClick={() => { setError(null); setEditingSkill({ name: "", description: "", content_markdown: "", scope: filter === "workspace" ? "workspace" : "user", metadata_json: "{}" }); }}>+ New</Btn>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Stored in D1 as agentsam_skill. Toggle active to include or exclude a skill without deleting it.</div>
        <div style={{ marginBottom: 24 }}>
          {filteredSkills.length === 0 ? (
            <div style={{ ...emptyCard, color: "var(--text-secondary)" }}>
              {emptyIcon}
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>No skills found</div>
              <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>{emptyMessage("skill", filter)}</div>
              <Btn variant="primary" size="sm" onClick={() => setEditingSkill({ name: "", description: "", content_markdown: "", scope: "user", metadata_json: "{}" })}>Create skill</Btn>
            </div>
          ) : (
            filteredSkills.map((sk) => (
              <SkillCardRow key={sk.id} skill={sk} onEdit={() => setEditingSkill({ ...sk })} onDelete={() => deleteSkill(sk.id)} onToggleActive={() => toggleSkill(sk.id)} />
            ))
          )}
        </div>

        {/* Subagents */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <SectionLabel>Subagents</SectionLabel>
          <Btn onClick={() => { setError(null); setEditingSubagent({ slug: "", display_name: "", default_model_id: "", allowed_tool_globs: "", instructions_markdown: "", is_active: true }); }}>+ New</Btn>
        </div>
        <div style={{ marginBottom: 24 }}>
          {filteredSubagents.length === 0 ? (
            <div style={{ ...emptyCard, color: "var(--text-secondary)" }}>
              {emptyIcon}
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>No subagents found</div>
              <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>{emptyMessage("subagent", filter)}</div>
              <Btn variant="primary" size="sm" onClick={() => setEditingSubagent({ slug: "", display_name: "", default_model_id: "", allowed_tool_globs: "", instructions_markdown: "", is_active: true })}>Create subagent</Btn>
            </div>
          ) : (
            filteredSubagents.map((s) => (
              <div key={s.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8, background: "var(--bg-canvas)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{s.display_name}</div>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)" }}>{s.slug}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{Number(s.is_active) !== 0 ? "active" : "inactive"}{s.updated_at ? ` · ${timeAgo(s.updated_at)}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Btn variant="inline" onClick={() => setEditingSubagent({ ...s })}>Edit</Btn>
                    <Btn variant="danger" size="sm" onClick={() => deleteSubagent(s.id)}>Delete</Btn>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Rule edit modal */}
      {editingRule && (
        <WideModal open onClose={() => !saving && setEditingRule(null)} title={editingRule.id ? "Edit rule" : "New rule"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input value={editingRule.title ?? ""} onChange={(e) => setEditingRule((x: any) => ({ ...x, title: e.target.value }))} placeholder="Title" />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Body (Markdown)</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", minHeight: 320 }}>
              <Editor height="320px" defaultLanguage="markdown" theme="vs-dark" value={editingRule.body_markdown ?? ""} onChange={(v) => setEditingRule((x: any) => ({ ...x, body_markdown: v ?? "" }))} options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => !saving && setEditingRule(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={saving} onClick={() => saveRule(editingRule)}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </WideModal>
      )}

      {/* Revisions modal */}
      {revisionsFor && (
        <Modal open onClose={() => setRevisionsFor(null)} title="Rule revision history">
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {revisions.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>No revisions or still loading.</div>
            ) : (
              revisions.map((rev) => (
                <div key={rev.id} style={{ padding: 8, borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>v{rev.version}</div>
                  <div>{rev.created_at} · {rev.created_by || "—"}</div>
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: 12 }}><Btn onClick={() => setRevisionsFor(null)}>Close</Btn></div>
        </Modal>
      )}

      {/* Subagent edit modal */}
      {editingSubagent && (
        <WideModal open onClose={() => !saving && setEditingSubagent(null)} title={editingSubagent.id ? "Edit subagent" : "New subagent"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input value={editingSubagent.slug ?? ""} onChange={(e) => setEditingSubagent((x: any) => ({ ...x, slug: e.target.value }))} placeholder="slug (lowercase, a-z 0-9 _ -)" disabled={!!editingSubagent.id} />
            <Input value={editingSubagent.display_name ?? ""} onChange={(e) => setEditingSubagent((x: any) => ({ ...x, display_name: e.target.value }))} placeholder="Display name" />
            <Input value={editingSubagent.default_model_id ?? ""} onChange={(e) => setEditingSubagent((x: any) => ({ ...x, default_model_id: e.target.value }))} placeholder="Default model id (optional)" />
            <Input value={editingSubagent.allowed_tool_globs ?? ""} onChange={(e) => setEditingSubagent((x: any) => ({ ...x, allowed_tool_globs: e.target.value }))} placeholder="Allowed tool globs (optional)" />
            {editingSubagent.id && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-primary)" }}>
                <input type="checkbox" checked={Number(editingSubagent.is_active) !== 0} onChange={(e) => setEditingSubagent((x: any) => ({ ...x, is_active: e.target.checked ? 1 : 0 }))} />
                Active
              </label>
            )}
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Instructions (Markdown)</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", minHeight: 240 }}>
              <Editor height="240px" defaultLanguage="markdown" theme="vs-dark" value={editingSubagent.instructions_markdown ?? ""} onChange={(v) => setEditingSubagent((x: any) => ({ ...x, instructions_markdown: v ?? "" }))} options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => !saving && setEditingSubagent(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={saving} onClick={() => saveSubagent(editingSubagent)}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </WideModal>
      )}

      {/* Skill edit modal */}
      {editingSkill && (
        <WideModal open onClose={() => !saving && setEditingSkill(null)} title={editingSkill.id ? "Edit skill" : "New skill"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Name</div>
            <Input value={editingSkill.name ?? ""} onChange={(e) => setEditingSkill((x: any) => ({ ...x, name: e.target.value }))} placeholder="e.g. cloudflare-workers-dev" />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Description</div>
            <Input value={editingSkill.description ?? ""} onChange={(e) => setEditingSkill((x: any) => ({ ...x, description: e.target.value }))} placeholder="Brief description of when to use this skill" />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Scope</div>
            <select value={editingSkill.scope || "user"} onChange={(e) => { const v = e.target.value; setEditingSkill((x: any) => ({ ...x, scope: v, workspace_id: v === "workspace" ? (x.workspace_id || "tenant_sam_primeaux") : null })); }}
              style={{ width: "100%", padding: "8px 10px", background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit" }}>
              <option value="user">User</option>
              <option value="workspace">Workspace</option>
              <option value="global">Global</option>
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Content (Markdown)</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", minHeight: 320 }}>
              <Editor height="320px" defaultLanguage="markdown" theme="vs-dark" value={editingSkill.content_markdown ?? ""} onChange={(v) => setEditingSkill((x: any) => ({ ...x, content_markdown: v ?? "" }))} options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => !saving && setEditingSkill(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={saving} onClick={() => saveSkill(editingSkill)}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </WideModal>
      )}
    </>
  );
}
