import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";

// ─────────────────────────────────────────────────────────────
// SettingsPanel — drop into FloatingPreviewPanel settings tab
// Props: availableCommands, runCommandRunnerRef, connectedIntegrations
// Requires: /api/env/* routes live on worker, VAULT_KEY set
// ─────────────────────────────────────────────────────────────

function SettingsRow({ label, description, control }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{control}</div>
    </div>
  );
}

function ToggleSwitch({ defaultOn = false }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        background: on ? "var(--accent)" : "var(--border)",
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 150ms", flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute", top: 2,
          left: on ? 16 : 2, width: 14, height: 14,
          borderRadius: "50%", background: "var(--text-primary)",
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

/** Controlled toggle for persisted settings (same look as ToggleSwitch). */
function ControlledSwitch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        background: checked ? "var(--accent)" : "var(--border)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 150ms",
        flexShrink: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          position: "absolute", top: 2,
          left: checked ? 16 : 2, width: 14, height: 14,
          borderRadius: "50%", background: "var(--text-primary)",
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

const SETTINGS_TAB_STORAGE_KEY = "iam-settings-tab";
const TAB_COMPOSER_PREFS_KEY = "iam_tab_composer_prefs";

function readTabComposerPrefs() {
  try {
    const s = localStorage.getItem(TAB_COMPOSER_PREFS_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      return {
        partialAccepts: typeof parsed.partialAccepts === "boolean" ? parsed.partialAccepts : true,
        suggestionsInComments: typeof parsed.suggestionsInComments === "boolean" ? parsed.suggestionsInComments : true,
        whitespaceOnlySuggestions: typeof parsed.whitespaceOnlySuggestions === "boolean" ? parsed.whitespaceOnlySuggestions : true,
        tsAutoImport: typeof parsed.tsAutoImport === "boolean" ? parsed.tsAutoImport : true,
      };
    }
  } catch (_) {}
  return {
    partialAccepts: true,
    suggestionsInComments: true,
    whitespaceOnlySuggestions: true,
    tsAutoImport: true,
  };
}

function writeTabComposerPrefs(prefs) {
  try {
    localStorage.setItem(TAB_COMPOSER_PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

/** Agent Sam settings nav (15). Environment vault lives under General only. */
const AGENT_SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "plan_usage", label: "Plan & Usage" },
  { id: "agents", label: "Agents" },
  { id: "tab", label: "Tab" },
  { id: "models", label: "Models" },
  { id: "cloud_agents", label: "Cloud Agents" },
  { id: "plugins", label: "Integrations", sectionBreak: true },
  { id: "rules_skills", label: "Rules, Skills & Subagents" },
  { id: "tools_mcp", label: "Tools & MCP" },
  { id: "hooks", label: "Hooks", sectionBreak: true },
  { id: "cmd_allowlist", label: "Cmd Allowlist" },
  { id: "mcp_tools", label: "MCP Tools" },
  { id: "routing_rules", label: "Routing Rules" },
  { id: "indexing_docs", label: "Indexing & Docs" },
  { id: "network", label: "Network" },
  { id: "beta", label: "Development" },
  { id: "marketplace", label: "Marketplace" },
  { id: "docs", label: "Repositories" },
  { id: "provider_docs", label: "Docs" },
];

const SETTINGS_TAB_IDS = new Set(AGENT_SETTINGS_TABS.map((t) => t.id));

/** Default workspace id for /api/agentsam/subagents and scoped rules (empty = global user scope). */
const AGENTSAM_WORKSPACE_QUERY = "";

const HOOK_TRIGGERS = ["start", "stop", "pre_deploy", "post_deploy", "pre_commit", "error"];

const ROUTING_MATCH_TYPES = ["intent", "mode", "keyword", "tag", "model"];

function agentsamWorkspaceQueryString() {
  return new URLSearchParams({ workspace_id: AGENTSAM_WORKSPACE_QUERY }).toString();
}

function agentsamWorkspaceIdForNewRule(filter) {
  if (filter === "workspace") return "tenant_sam_primeaux";
  return null;
}

function ruleMatchesFilter(rule, filter) {
  if (filter === "all") return true;
  const w = rule.workspace_id;
  const hasWs = w != null && String(w).trim() !== "";
  if (filter === "user") return !hasWs;
  if (filter === "workspace") return hasWs;
  return true;
}

function subagentMatchesFilter(s, filter) {
  if (filter === "all") return true;
  const w = s.workspace_id;
  const hasWs = w != null && String(w).trim() !== "";
  if (filter === "user") return !hasWs;
  if (filter === "workspace") return hasWs;
  return true;
}

function skillMatchesFilter(skill, filter) {
  if (filter === "all") return true;
  const w = skill.workspace_id;
  const hasWs = w != null && String(w).trim() !== "";
  if (filter === "user") return !hasWs;
  if (filter === "workspace") return hasWs;
  return true;
}

function pillStyle(active) {
  return {
    padding: "6px 14px",
    background: active ? "var(--bg-elevated)" : "var(--bg-canvas)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 16,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
    fontWeight: active ? 600 : 400,
  };
}

const WORKSPACE_ENFORCEMENT = [
  { name: "No auto-deploy", desc: "Agent must ask Sam for confirmation before any wrangler deploy" },
  { name: "No secret deletion", desc: "Agent cannot delete secrets — only Sam via Settings UI" },
  { name: "No naked wrangler", desc: "All wrangler commands must include --config wrangler.production.toml" },
  { name: "Exposed key detection", desc: "If a secret pattern appears in chat, warning banner and Roll button" },
  { name: "Remote-only R2 ops", desc: "All R2 reads and writes use --remote flag. No local file paths." },
  { name: "Verify before claim", desc: "Agent must show raw output proof before reporting success" },
  { name: "No wasted loops", desc: "If a command fails twice — stop, report exact error, do not retry" },
  { name: "Workspace lock", desc: "Before any wrangler command: show current dir, git branch, confirm" },
  { name: "D1 verify post-deploy", desc: "SELECT from deployments after every deploy to confirm version ID" },
];

function readStoredSettingsTab() {
  try {
    const s = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
    if (s === "ignore_patterns") return "indexing_docs";
    if (s && SETTINGS_TAB_IDS.has(s)) return s;
  } catch (_) {}
  return "general";
}

function writeStoredSettingsTab(id) {
  try {
    localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, id);
  } catch (_) {}
}

const PROVIDER_COLORS = {
  anthropic:  "var(--color-warning)",
  openai:     "var(--color-primary)",
  google:     "var(--color-accent)",
  cloudflare: "var(--color-primary)",
  stripe:     "var(--color-accent)",
  github:     "var(--text-muted)",
  other:      "var(--text-secondary)",
};

function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function formatLastRanUnix(unixSec) {
  if (unixSec == null || unixSec === "") return null;
  const t = Number(unixSec);
  if (!Number.isFinite(t)) return null;
  const ms = t < 1e12 ? t * 1000 : t;
  const diff = Date.now() - ms;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return timeAgo(new Date(ms).toISOString());
}

/** Relative time from unix seconds or parseable date string (spec: seconds-based diff). */
function relativeTime(ts) {
  if (ts == null || ts === "") return null;
  let sec = Number(ts);
  if (!Number.isFinite(sec)) {
    const ms = Date.parse(String(ts));
    if (!Number.isFinite(ms)) return null;
    sec = ms / 1000;
  } else if (sec > 1e12) {
    sec /= 1000;
  }
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function runCmd(runCommandRunnerRef, cmd) {
  runCommandRunnerRef?.current?.runCommandInTerminal?.(cmd);
}

// ── Shared UI atoms ──────────────────────────────────────────

function Btn({ onClick, variant = "ghost", size = "sm", disabled, children, style }) {
  const base = {
    border: "none", borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit", fontWeight: 500, opacity: disabled ? 0.5 : 1,
    transition: "opacity 150ms, background 150ms",
    padding: size === "sm" ? "4px 10px" : "6px 14px",
    fontSize: size === "sm" ? 11 : 12,
    ...style,
  };
  const variants = {
    primary: { background: "var(--accent)", color: "var(--bg-canvas)" },
    danger:  { background: "var(--color-error)", color: "var(--bg-surface)", border: "1px solid var(--color-border)" },
    ghost:   { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" },
    inline:  { background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "2px 6px", fontSize: 10 },
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

function StatusDot({ status }) {
  const colors = { ok: "var(--color-primary)", fail: "var(--color-error)", untested: "var(--text-muted)", checking: "var(--color-warning)" };
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: colors[status] || colors.untested, flexShrink: 0,
      animation: status === "checking" ? "spPulse 1.2s infinite" : "none",
    }} />
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
      color: "var(--text-secondary)", marginBottom: 6, paddingBottom: 4,
      borderBottom: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--color-text) 70%, transparent)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: 8, padding: 16, minWidth: 340, maxWidth: 480, width: "90vw",
        maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 32px color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 14, fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
          <span>{title}</span>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-secondary)",
              fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)",
        color: "var(--text-primary)", padding: "6px 8px", borderRadius: 4,
        fontFamily: "inherit", fontSize: 11, width: "100%", boxSizing: "border-box",
        outline: "none", ...style }} />
  );
}

// ── Environment Tab ──────────────────────────────────────────

function EnvironmentTab({ runCommandRunnerRef }) {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vaultOk, setVaultOk] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [revealModal, setRevealModal] = useState(null);
  const [revealValue, setRevealValue] = useState("");
  const [revealCountdown, setRevealCountdown] = useState(30);
  const [rollModal, setRollModal] = useState(null);
  const [rollValue, setRollValue] = useState("");
  const [rollNote, setRollNote] = useState("");
  const [newKey, setNewKey] = useState({ key_name: "", value: "", provider: "", label: "" });
  const [saving, setSaving] = useState(false);
  const [rolling, setRolling] = useState(false);
  const revealTimerRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/env/secrets", { credentials: "same-origin" })
      .then(r => r.json())
      .then(d => { setSecrets(d.secrets || []); setVaultOk(true); })
      .catch(() => setVaultOk(false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const reveal = async (keyName) => {
    setRevealModal(keyName); setRevealValue("Decrypting...");
    const r = await fetch("/api/env/secrets/reveal", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_name: keyName }),
    });
    const d = await r.json();
    setRevealValue(d.value || d.error || "Failed");
    let t = 30; setRevealCountdown(t);
    clearInterval(revealTimerRef.current);
    revealTimerRef.current = setInterval(() => {
      t--; setRevealCountdown(t);
      if (t <= 0) { clearInterval(revealTimerRef.current); setRevealModal(null); }
    }, 1000);
  };

  const roll = async () => {
    if (!rollValue.trim()) return;
    setRolling(true);
    const r = await fetch(`/api/env/secrets/${rollModal}`, {
      method: "PATCH", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: rollValue, note: rollNote }),
    });
    const d = await r.json();
    if (d.success) { setRollModal(null); setRollValue(""); setRollNote(""); load(); }
    setRolling(false);
  };

  const addSecret = async () => {
    if (!newKey.key_name || !newKey.value || !newKey.provider) return;
    setSaving(true);
    const r = await fetch("/api/env/secrets", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newKey),
    });
    const d = await r.json();
    if (d.success) { setShowAdd(false); setNewKey({ key_name: "", value: "", provider: "", label: "" }); load(); }
    setSaving(false);
  };

  const testSecret = async (keyName, setStatus) => {
    setStatus("checking");
    const r = await fetch(`/api/env/secrets/test/${keyName}`, { method: "POST", credentials: "same-origin" });
    const d = await r.json();
    setStatus(d.status);
    load();
  };

  const loadAudit = async () => {
    const r = await fetch("/api/env/audit?limit=100", { credentials: "same-origin" });
    const d = await r.json();
    setAuditLog(d.log || []);
    setAuditOpen(true);
  };

  const byProvider = secrets.reduce((acc, s) => {
    const p = s.provider || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(s);
    return acc;
  }, {});

  return (
    <div id="iam-settings-vault" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Btn variant="primary" onClick={() => setShowAdd(v => !v)}>+ Add Secret</Btn>
        <Btn onClick={loadAudit}>Audit Log</Btn>
        <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace",
          padding: "2px 6px", borderRadius: 3,
          background: vaultOk === null ? "var(--bg-elevated)" : vaultOk ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "color-mix(in srgb, var(--color-error) 12%, transparent)",
          color: vaultOk === null ? "var(--text-secondary)" : vaultOk ? "var(--color-primary)" : "var(--color-error)",
          border: `1px solid ${vaultOk === null ? "transparent" : vaultOk ? "var(--color-border)" : "var(--color-border)"}` }}>
          {vaultOk === null ? "checking..." : vaultOk ? "vault ok" : "VAULT_KEY missing"}
        </span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)",
          borderRadius: 6, padding: 12, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <Input value={newKey.key_name} placeholder="KEY_NAME"
              onChange={e => setNewKey(v => ({ ...v, key_name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_") }))} />
            <select value={newKey.provider}
              onChange={e => setNewKey(v => ({ ...v, provider: e.target.value }))}
              style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)",
                color: "var(--text-primary)", padding: "6px 8px", borderRadius: 4, fontSize: 11, fontFamily: "inherit" }}>
              <option value="">provider</option>
              {["anthropic","openai","google","cloudflare","stripe","github","other"].map(p =>
                <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <Input value={newKey.label} placeholder="Display label (optional)"
            onChange={e => setNewKey(v => ({ ...v, label: e.target.value }))} />
          <Input type="password" value={newKey.value} placeholder="Secret value"
            onChange={e => setNewKey(v => ({ ...v, value: e.target.value }))} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Btn variant="primary" disabled={saving} onClick={addSecret}>{saving ? "Saving..." : "Save Encrypted"}</Btn>
            <Btn onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Secrets list */}
      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>Loading...</div>
      ) : secrets.length === 0 ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>
          No secrets yet. Click + Add Secret to get started.
        </div>
      ) : (
        Object.entries(byProvider).map(([provider, items]) => (
          <div key={provider} style={{ marginBottom: 16 }}>
            <SectionLabel>{provider}</SectionLabel>
            {items.map(s => <SecretCard key={s.key_name} secret={s} onReveal={reveal} onRoll={setRollModal} onTest={testSecret} />)}
          </div>
        ))
      )}

      {/* Reveal modal */}
      <Modal open={!!revealModal} onClose={() => { setRevealModal(null); clearInterval(revealTimerRef.current); }} title={`Reveal — ${revealModal}`}>
        <div style={{ fontSize: 10, color: "var(--color-warning)", background: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
          padding: "4px 8px", borderRadius: 4, marginBottom: 10 }}>
          Auto-hides in {revealCountdown}s
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <code style={{ flex: 1, wordBreak: "break-all", fontSize: 11, background: "var(--bg-canvas)",
            padding: 8, borderRadius: 4, border: "1px solid var(--border)", color: "var(--color-primary)",
            fontFamily: "monospace", display: "block" }}>{revealValue}</code>
          <Btn variant="inline" onClick={() => navigator.clipboard.writeText(revealValue)}>Copy</Btn>
        </div>
      </Modal>

      {/* Roll modal */}
      <Modal open={!!rollModal} onClose={() => { setRollModal(null); setRollValue(""); setRollNote(""); }} title={`Roll — ${rollModal}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Input type="password" value={rollValue} placeholder="New secret value"
            onChange={e => setRollValue(e.target.value)} />
          <Input value={rollNote} placeholder="Reason (optional)" onChange={e => setRollNote(e.target.value)} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Btn variant="danger" disabled={rolling || !rollValue.trim()} onClick={roll}>
              {rolling ? "Rolling..." : "Rotate Secret"}
            </Btn>
            <Btn onClick={() => setRollModal(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* Audit modal */}
      <Modal open={auditOpen} onClose={() => setAuditOpen(false)} title="Audit Log">
        {auditLog.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 16 }}>No events yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr>{["Time","Key","Action","Note"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--border)",
                  color: "var(--text-secondary)", textTransform: "uppercase", fontSize: 9, letterSpacing: "0.06em" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {auditLog.map((e, i) => (
                <tr key={i}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "monospace" }}>{e.key_name}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", fontFamily: "monospace",
                    color: { read: "var(--text-secondary)", rotate: "var(--color-warning)", create: "var(--color-primary)", delete: "var(--color-error)" }[e.action] || "var(--text-secondary)" }}>
                    {e.action}
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{e.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}

function SecretCard({ secret: s, onReveal, onRoll, onTest }) {
  const [testStatus, setTestStatus] = useState(s.test_status || "untested");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8,
      borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)",
      marginBottom: 4, opacity: s.is_active ? 1 : 0.4 }}>
      <StatusDot status={testStatus} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.key_name}</div>
        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
          {s.label || s.key_name} · {timeAgo(s.last_rotated_at)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <Btn variant="inline" onClick={() => onReveal(s.key_name)}>reveal</Btn>
        <Btn variant="inline" onClick={() => onRoll(s.key_name)}>roll</Btn>
        <Btn variant="inline" onClick={() => onTest(s.key_name, setTestStatus)}>test</Btn>
      </div>
    </div>
  );
}

// ── Wrangler Tab ─────────────────────────────────────────────

function WranglerTab({ runCommandRunnerRef, onDeployStart, onDeployComplete }) {
  const [deployOpen, setDeployOpen] = useState(false);
  const [recentDeploys, setRecentDeploys] = useState([]);
  const [deployLoading, setDeployLoading] = useState(true);
  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCtxLoading(true);
    fetch("/api/settings/deploy-context", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load deploy context");
        if (!cancelled) setCtx(d);
      })
      .catch(() => { if (!cancelled) setCtx(null); })
      .finally(() => { if (!cancelled) setCtxLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deployments/recent?limit=10", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setRecentDeploys(Array.isArray(d.deployments) ? d.deployments : []);
      })
      .catch(() => { if (!cancelled) setRecentDeploys([]); })
      .finally(() => { if (!cancelled) setDeployLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const wranglerConfig = ctx?.wrangler_config != null ? String(ctx.wrangler_config) : "wrangler.production.toml";
  const workerName = ctx?.worker_name != null ? String(ctx.worker_name) : "—";
  const deployScript = ctx?.deploy_script != null ? String(ctx.deploy_script) : "npm run deploy";
  const envWrapper = ctx?.env_wrapper != null ? String(ctx.env_wrapper) : "";
  const r2Bucket = ctx?.r2_bucket != null ? String(ctx.r2_bucket) : "—";
  const deployNote = ctx?.note != null ? String(ctx.note) : "";

  const deploySecondsFmt = (row) => {
    if (row.deploy_time_seconds != null && Number(row.deploy_time_seconds) > 0) {
      return `${Number(row.deploy_time_seconds)}s`;
    }
    if (row.duration_seconds != null && Number(row.duration_seconds) > 0) {
      return `${Number(row.duration_seconds)}s`;
    }
    if (row.deploy_duration_ms != null && Number(row.deploy_duration_ms) > 0) {
      return `${Math.round(Number(row.deploy_duration_ms) / 1000)}s`;
    }
    return "-";
  };

  const versionShort = (row) => {
    const g = (row.git_hash || "").trim();
    if (g.length >= 7) return g.slice(0, 7);
    const v = (row.version || "").trim();
    if (v.length >= 7) return v.slice(0, 7);
    return v || "—";
  };

  const triggeredByLabel = (row) => (row.triggered_by || row.deployed_by || "—").trim() || "—";

  const relCreated = (row) => {
    const ca = row.created_at;
    if (ca != null && /^\d+$/.test(String(ca))) {
      return relativeTime(Number(ca)) || formatLastRanUnix(Number(ca)) || "—";
    }
    const ts = row.timestamp;
    if (ts) return timeAgo(String(ts).replace(" ", "T"));
    return "—";
  };

  const statusBadge = (row) => {
    const s = String(row.status || "").toLowerCase();
    const ok = s === "success";
    const fail = s === "failed" || s === "failure";
    const pend = s === "pending" || s === "running";
    return {
      label: row.status || "—",
      border: "1px solid var(--border)",
      background: "var(--bg-canvas)",
      color: fail ? "var(--color-danger, var(--text-secondary))" : ok ? "var(--color-success, var(--accent))" : pend ? "var(--accent)" : "var(--text-primary)",
    };
  };

  const fire = (cmd) => runCmd(runCommandRunnerRef, cmd);

  const quickCmds = ctxLoading || !ctx ? [] : [
    { label: "whoami", cmd: `wrangler whoami --config ${wranglerConfig}` },
    { label: "list secrets", cmd: `wrangler secret list --config ${wranglerConfig}` },
    { label: "deployments", cmd: `wrangler deployments list --config ${wranglerConfig}` },
    { label: "tail logs", cmd: `wrangler tail --config ${wranglerConfig}` },
    { label: "git status", cmd: "git status && git log --oneline -5" },
    { label: "git branch", cmd: "git branch -a" },
  ];

  const deployCmd = [envWrapper, deployScript].filter(Boolean).join(" ").trim() || deployScript;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {ctxLoading ? (
        <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Loading configuration…</div>
      ) : (
        <div style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "10px 12px",
          marginBottom: 16,
          fontSize: 10,
          fontFamily: "ui-monospace, monospace",
          color: "var(--text-secondary)",
          lineHeight: 1.65,
        }}>
          <div>worker: <span style={{ color: "var(--text-primary)" }}>{workerName}</span></div>
          <div>config: <span style={{ color: "var(--text-primary)" }}>{wranglerConfig}</span></div>
          <div>deploy: <span style={{ color: "var(--text-primary)" }}>{deployScript}</span></div>
          <div>env wrapper: <span style={{ color: "var(--text-primary)" }}>{envWrapper || "—"}</span></div>
          <div>R2 bucket: <span style={{ color: "var(--text-primary)" }}>{r2Bucket}</span></div>
          {deployNote ? (
            <div style={{ marginTop: 8, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>{deployNote}</div>
          ) : null}
        </div>
      )}

      <SectionLabel>Quick Commands</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
        {quickCmds.map(({ label, cmd }) => (
          <button key={label} type="button" onClick={() => fire(cmd)}
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", padding: "4px 8px", borderRadius: 4,
              cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>
            {label}
          </button>
        ))}
      </div>

      <SectionLabel>Deploy</SectionLabel>
      <div style={{ marginBottom: 16 }}>
        <Btn variant="danger" style={{ width: "100%", textAlign: "center" }}
          onClick={() => setDeployOpen(true)}>
          Deploy to Production
        </Btn>
      </div>

      <SectionLabel>Rollback</SectionLabel>
      <Btn onClick={() => fire(`wrangler rollback --config ${wranglerConfig}`)}>
        List + Rollback Options
      </Btn>

      <SectionLabel>Recent Deploys</SectionLabel>
      <div style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
        {deployLoading ? (
          <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Loading recent deploys…</div>
        ) : recentDeploys.length === 0 ? (
          <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>No deployments recorded.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Version</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Triggered By</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Duration</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentDeploys.slice(0, 10).map((row) => {
                const st = statusBadge(row);
                return (
                  <tr key={row.id || row.version} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace", color: "var(--text-primary)" }}>
                      {versionShort(row)}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 9,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        border: st.border,
                        background: st.background,
                        color: st.color,
                      }}>{st.label}</span>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 6px",
                        borderRadius: 10,
                        fontSize: 9,
                        background: "var(--bg-canvas)",
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }} title={triggeredByLabel(row)}>{triggeredByLabel(row)}</span>
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace", color: "var(--text-secondary)" }}>
                      {deploySecondsFmt(row)}
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{relCreated(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={deployOpen} onClose={() => setDeployOpen(false)} title="Confirm Deploy">
        <div style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-canvas)",
          padding: 10, borderRadius: 4, border: "1px solid var(--border)", marginBottom: 12, lineHeight: 1.6 }}>
          <div>Worker: <code style={{ color: "var(--accent)" }}>{workerName}</code></div>
          <div>Config: <code style={{ color: "var(--accent)" }}>{wranglerConfig}</code></div>
          <div>Command: <code style={{ color: "var(--accent)" }}>{deployCmd}</code></div>
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Btn
            variant="danger"
            onClick={async () => {
              setDeployOpen(false);
              const pillId = onDeployStart?.(workerName);
              const t0 = Date.now();
              let success = false;
              let versionId = "";
              try {
                const result = await runCommandRunnerRef?.current?.runCommandInTerminal?.(deployCmd);
                const out = `${result?.output || ""}\n${result?.error || ""}`;
                const vm = out.match(/Current Version ID:\s*([a-f0-9-]+)/i) || out.match(/Version ID:\s*([a-f0-9-]+)/i);
                versionId = vm ? vm[1] : "";
                success = !!(result?.ok && /Uploaded|Deployed|Current Version ID/i.test(out));
                if (result?.error || !result?.ok) success = false;
              } catch (_) {
                success = false;
              }
              if (pillId != null) onDeployComplete?.(pillId, success, versionId || undefined, Date.now() - t0);
            }}
          >
            Yes, Deploy
          </Btn>
          <Btn onClick={() => setDeployOpen(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── Workers Tab ──────────────────────────────────────────────

function WorkersTab({ runCommandRunnerRef }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workers", { credentials: "same-origin" })
      .then(r => r.json())
      .then(d => setWorkers(d.workers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const priorityColor = { critical: "var(--color-error)", high: "var(--color-warning)", medium: "var(--color-primary)", low: "var(--text-secondary)" };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <SectionLabel>Active Workers ({workers.length})</SectionLabel>
      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, padding: 12, textAlign: "center" }}>Loading...</div>
      ) : (
        workers.map(w => (
          <div key={w.script_name || w.worker_name}
            style={{ padding: 8, borderRadius: 6, background: "var(--bg-elevated)",
              border: "1px solid var(--border)", marginBottom: 4,
              display: "flex", alignItems: "center", gap: 8 }}>
            <StatusDot status="ok" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {w.script_name || w.worker_name}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {w.worker_type || "worker"} · {timeAgo(w.last_deployment)}
              </div>
            </div>
            <span style={{ fontSize: 9, color: priorityColor[w.priority] || "var(--text-secondary)",
              textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {w.priority || ""}
            </span>
            <Btn variant="inline" onClick={() => runCmd(runCommandRunnerRef,
              `wrangler tail ${w.script_name || w.worker_name} --config /Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml`)}>
              tail
            </Btn>
          </div>
        ))
      )}
    </div>
  );
}

// ── D1 Tab ───────────────────────────────────────────────────

function D1Tab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);

  const suggestions = [
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    "SELECT key, value FROM project_memory WHERE project_id='inneranimalmedia' ORDER BY updated_at DESC LIMIT 10",
    "SELECT * FROM env_audit_log ORDER BY ts DESC LIMIT 20",
    "SELECT * FROM env_secrets ORDER BY provider, key_name",
    "SELECT * FROM spend_ledger ORDER BY occurred_at DESC LIMIT 20",
    "SELECT worker_name, deployment_status, priority FROM worker_registry ORDER BY priority",
    "SELECT id, title, status FROM roadmap_steps ORDER BY id",
  ];

  const run = async (sql) => {
    const q = sql || query.trim();
    if (!q) return;
    setRunning(true); setError(null); setResults(null);
    try {
      const r = await fetch("/api/d1/query", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: q }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); }
      else { setResults(d.results || d); setHistory(h => [q, ...h.slice(0, 9)]); }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}>
      <SectionLabel>D1 Query Runner — inneranimalmedia-business</SectionLabel>

      {/* Suggestions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {suggestions.slice(0,4).map((s, i) => (
          <button key={i} type="button" onClick={() => setQuery(s)}
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", padding: "3px 7px", borderRadius: 4,
              cursor: "pointer", fontFamily: "monospace", fontSize: 9,
              whiteSpace: "nowrap", overflow: "hidden", maxWidth: 160, textOverflow: "ellipsis" }}>
            {s.slice(0, 28)}...
          </button>
        ))}
      </div>

      {/* Query input */}
      <textarea value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
        placeholder="SELECT * FROM ... — Cmd+Enter to run"
        style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)",
          color: "var(--text-primary)", padding: 8, borderRadius: 4, fontFamily: "monospace",
          fontSize: 11, resize: "vertical", minHeight: 80, outline: "none",
          marginBottom: 8, width: "100%", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Btn variant="primary" disabled={running || !query.trim()} onClick={() => run()}>
          {running ? "Running..." : "Run Query"}
        </Btn>
        <Btn onClick={() => { setQuery(""); setResults(null); setError(null); }}>Clear</Btn>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "color-mix(in srgb, var(--color-error) 12%, transparent)", border: "1px solid var(--color-border)", borderRadius: 4,
          padding: 8, fontSize: 11, color: "var(--color-error)", marginBottom: 8, fontFamily: "monospace" }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results && Array.isArray(results) && results.length > 0 && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>
            {results.length} row{results.length !== 1 ? "s" : ""}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
            <thead>
              <tr>{Object.keys(results[0]).map(k => (
                <th key={k} style={{ textAlign: "left", padding: "4px 6px",
                  borderBottom: "1px solid var(--border)", color: "var(--text-secondary)",
                  whiteSpace: "nowrap", fontSize: 9, textTransform: "uppercase" }}>{k}</th>
              ))}</tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((v, j) => (
                    <td key={j} style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)",
                      color: "var(--text-primary)", maxWidth: 200, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v === null ? <span style={{ color: "var(--text-secondary)" }}>null</span> : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results && Array.isArray(results) && results.length === 0 && (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, padding: 12, textAlign: "center" }}>
          Query returned 0 rows
        </div>
      )}
    </div>
  );
}

// ── Integrations Tab ─────────────────────────────────────────

function McpServicesHealth() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/mcp/services/health", {
        credentials: "same-origin",
      });
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

  const dotColor = (status) => ({
    healthy: "var(--mode-ask)",
    degraded: "var(--mode-plan)",
    unreachable: "var(--mode-debug)",
    unverified: "var(--text-muted)",
    not_implemented: "var(--text-disabled)",
    external_site: "var(--text-muted)",
    skip: "var(--text-disabled)",
    error: "var(--mode-debug)",
  }[status] || "var(--text-muted)");

  if (loading) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>
        Checking MCP services...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 16 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "8px 0", marginBottom: 4,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: "var(--text-muted)", textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          MCP Services
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {lastChecked ? `checked ${lastChecked}` : ""}
          {lastChecked ? " · " : ""}
          <span
            style={{ cursor: "pointer", color: "var(--color-primary)" }}
            onClick={fetchHealth}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                fetchHealth();
              }
            }}
            role="button"
            tabIndex={0}
          >
            refresh
          </span>
        </span>
      </div>
      {services.filter((s) => s.is_active).map((svc) => (
        <div
          key={svc.id || svc.service_name}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "7px 10px",
            borderRadius: "var(--radius-md, 8px)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle, var(--border))",
          }}
        >
          <div
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: dotColor(svc.live_status || svc.health_status),
              boxShadow: svc.live_status === "healthy"
                ? "0 0 6px var(--mode-ask)"
                : "none",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 500,
              color: "var(--text-primary)",
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {svc.service_name}
            </div>
            <div style={{
              fontSize: 10, color: "var(--text-muted)",
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {svc.endpoint_url}
            </div>
          </div>
          {svc.tool_count > 0 && (
            <div style={{
              fontSize: 10, fontWeight: 600,
              color: "var(--text-muted)",
              background: "var(--bg-hover)",
              padding: "2px 6px", borderRadius: 10,
              flexShrink: 0,
            }}>
              {svc.tool_count} tools
            </div>
          )}
          <div style={{
            fontSize: 10, fontWeight: 600,
            color: dotColor(svc.live_status || svc.health_status),
            flexShrink: 0,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            {(svc.live_status || svc.health_status || "unknown")
              .replace(/_/g, " ")}
          </div>
        </div>
      ))}
    </div>
  );
}

function IntegrationsTab({ connectedIntegrations }) {
  const [catalogConnected, setCatalogConnected] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/marketplace-catalog", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d.items) ? d.items : [];
        const m = {};
        for (const it of items) {
          const p = it.provider != null ? String(it.provider) : "";
          if (!p) continue;
          if (it.connected) m[p] = true;
        }
        if (!cancelled) setCatalogConnected(m);
      })
      .catch(() => { if (!cancelled) setCatalogConnected({}); });
    return () => { cancelled = true; };
  }, []);

  const integrations = [
    { key: "google", providerKey: "google", label: "Google Drive", authUrl: "/api/oauth/google/start" },
    { key: "github", providerKey: "github", label: "GitHub", authUrl: "/api/oauth/github/start" },
    { key: "mcp", providerKey: null, label: "MCP Connections", authUrl: null },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <McpServicesHealth />
      <SectionLabel>Connection Status</SectionLabel>
      {integrations.map(({ key, label, authUrl, providerKey }) => {
        const connected = providerKey
          ? (catalogConnected[providerKey] || connectedIntegrations?.[key])
          : false;
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10,
            borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)",
            marginBottom: 6 }}>
            <StatusDot status={connected ? "ok" : "fail"} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {connected ? "Connected" : "Not connected"}
              </div>
            </div>
            {!connected && authUrl ? (
              <a
                href={authUrl}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 4,
                  background: "var(--accent)",
                  color: "var(--bg-canvas)",
                  textDecoration: "none",
                }}
              >
                Connect
              </a>
            ) : null}
            {key === "mcp" ? (
              <a
                href="/dashboard/mcp"
                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
              >
                Manage
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── Spend Tab ────────────────────────────────────────────────

function formatUsd2(n) {
  const x = Number(n) || 0;
  return x.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTokensK(n) {
  const x = Number(n) || 0;
  if (x === 0) return "0k";
  return `${Math.round(x / 1000)}k`;
}

function formatDayLabel(yyyyMmDd) {
  if (!yyyyMmDd || typeof yyyyMmDd !== "string") return "—";
  const [y, m, d] = yyyyMmDd.split("-").map((v) => parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return yyyyMmDd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function SpendTab() {
  const [rows, setRows] = useState([]);
  const [totalSpend, setTotalSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDays, setSelectedDays] = useState(30);
  const [selectedGroup, setSelectedGroup] = useState("provider");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const daysParam = selectedDays === 0 ? 0 : selectedDays;
    fetch(`/api/spend/unified?days=${daysParam}&group=${encodeURIComponent(selectedGroup)}`, { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load spend data");
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setTotalSpend(Number(d.total_cost_usd) || 0);
      })
      .catch((e) => {
        setError(e?.message || String(e));
        setRows([]);
        setTotalSpend(0);
      })
      .finally(() => setLoading(false));
  }, [selectedDays, selectedGroup]);

  useEffect(() => { load(); }, [load]);

  const sourceCount = rows.length;
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
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
            {formatUsd2(totalSpend)}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Period</span>
          <select
            value={selectedDays === 0 ? "0" : String(selectedDays)}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedDays(v === "0" ? 0 : Number(v) || 30);
            }}
            style={{
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-canvas)",
              color: "var(--text-primary)",
            }}
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
        {(["provider", "model", "day"]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setSelectedGroup(g)}
            style={pillStyle(selectedGroup === g)}
          >
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
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>
          No spend recorded for this period.
        </div>
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
                {selectedGroup === "provider" ? (
                  <>
                    <th style={{ padding: "6px 4px" }}>Provider</th>
                    <th style={{ padding: "6px 4px" }}>Total Spend</th>
                    <th style={{ padding: "6px 4px" }}>Tokens In</th>
                    <th style={{ padding: "6px 4px" }}>Tokens Out</th>
                    <th style={{ padding: "6px 4px" }}>Requests</th>
                  </>
                ) : selectedGroup === "model" ? (
                  <>
                    <th style={{ padding: "6px 4px" }}>Model</th>
                    <th style={{ padding: "6px 4px" }}>Provider</th>
                    <th style={{ padding: "6px 4px" }}>Total Spend</th>
                    <th style={{ padding: "6px 4px" }}>Tokens In</th>
                    <th style={{ padding: "6px 4px" }}>Tokens Out</th>
                    <th style={{ padding: "6px 4px" }}>Requests</th>
                  </>
                ) : (
                  <>
                    <th style={{ padding: "6px 4px" }}>Date</th>
                    <th style={{ padding: "6px 4px" }}>Total Spend</th>
                    <th style={{ padding: "6px 4px" }}>Requests</th>
                  </>
                )}
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
        <a href="/dashboard/finance" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
          View full finance dashboard
        </a>
      </div>
    </div>
  );
}

// ── Providers Tab ────────────────────────────────────────────

function ProvidersTab() {
  const [secrets, setSecrets] = useState([]);
  const [models, setModels] = useState([]);
  const [catalogByProvider, setCatalogByProvider] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/env/secrets", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSecrets(d.secrets || []); })
      .catch(() => { if (!cancelled) setSecrets([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/models", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        const all = Array.isArray(d.models) ? d.models : [];
        if (!cancelled) setModels(all.filter((m) => Number(m.show_in_picker) === 1));
      })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/marketplace-catalog", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d.items) ? d.items : [];
        const m = {};
        for (const it of items) {
          const p = it.provider != null ? String(it.provider) : "";
          if (!p) continue;
          if (it.connected) m[p] = true;
        }
        if (!cancelled) setCatalogByProvider(m);
      })
      .catch(() => { if (!cancelled) setCatalogByProvider({}); });
    return () => { cancelled = true; };
  }, []);

  const byProvider = secrets.reduce((acc, s) => {
    const p = s.provider || "other";
    if (!acc[p]) acc[p] = { total: 0, ok: 0, untested: 0 };
    acc[p].total++;
    if (s.test_status === "ok") acc[p].ok++;
    else if (!s.test_status || s.test_status === "untested") acc[p].untested++;
    return acc;
  }, {});

  const providerDefs = [
    { key: "anthropic", label: "Anthropic" },
    { key: "openai", label: "OpenAI" },
    { key: "google", label: "Google" },
    { key: "workers_ai", label: "Workers AI" },
    { key: "cursor", label: "Cursor" },
    { key: "stability", label: "Stability" },
  ];

  const chipsFor = (key) => {
    const list = models.filter((m) => String(m.provider || "") === key);
    return list.sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")));
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {providerDefs.map(({ key, label }) => {
        const stats = byProvider[key];
        const catConnected = !!catalogByProvider[key];
        const chipModels = chipsFor(key);
        return (
          <div key={key} style={{ padding: 10, borderRadius: 6, background: "var(--bg-elevated)",
            border: "1px solid var(--border)", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <StatusDot status={stats?.ok > 0 ? "ok" : stats ? "untested" : "fail"} />
              <div style={{ flex: 1, fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>{label}</div>
              <span style={{
                fontSize: 9,
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                color: catConnected ? "var(--color-success, var(--accent))" : "var(--text-muted)",
                background: "var(--bg-canvas)",
              }}>
                {catConnected ? "Catalog: connected" : "Catalog: not connected"}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {stats ? `${stats.ok}/${stats.total} keys ok` : "no keys"}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {chipModels.length === 0 ? (
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>No picker models for this provider.</span>
              ) : (
                chipModels.map((m) => (
                  <span
                    key={m.id}
                    style={{
                      fontSize: 9,
                      padding: "2px 5px",
                      borderRadius: 3,
                      background: "var(--bg-canvas)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {m.display_name || m.id}
                  </span>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Rules, Skills & Subagents (agentsam APIs) ────────────────

function WideModal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "color-mix(in srgb, var(--color-text) 70%, transparent)", zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: 8, padding: 16, width: "min(920px, 96vw)", maxHeight: "90vh",
          overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box",
          boxShadow: "0 8px 32px color-mix(in srgb, var(--color-text) 50%, transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 12, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--text-secondary)",
              fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

function SkillCardRow({ skill, onEdit, onDelete, onToggleActive }) {
  const active = Number(skill.is_active) !== 0;
  const scopeLabel = skill.scope === "workspace" ? "workspace" : skill.scope === "global" ? "global" : null;
  return (
    <div
      style={{
        padding: 12,
        background: "var(--bg-canvas)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        marginBottom: 8,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          background: "var(--bg-elevated)",
          border: "1px solid var(--accent)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--accent)",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        SK
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{skill.name}</div>
          {scopeLabel === "workspace" ? (
            <span style={{
              padding: "2px 8px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              fontSize: 10,
              color: "var(--accent)",
            }}>Workspace</span>
          ) : null}
          {scopeLabel === "global" ? (
            <span style={{
              padding: "2px 8px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: 10,
              color: "var(--text-secondary)",
            }}>Global</span>
          ) : null}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 8 }}>
          {skill.description || "No description."}
        </div>
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

function HooksTab() {
  const wsq = agentsamWorkspaceQueryString();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/agentsam/hooks?${wsq}`, { credentials: "same-origin" });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || `Failed to load hooks (${r.status})`);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [wsq]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editing) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || saving) return;
      e.preventDefault();
      setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, saving]);

  const patchActive = async (row, nextOn) => {
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/hooks/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextOn ? 1 : 0 }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const saveModal = async (draft) => {
    const command = (draft.command || "").trim();
    const trigger = draft.trigger || "";
    if (!command || !HOOK_TRIGGERS.includes(trigger)) {
      setError("Command and a valid trigger are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        trigger,
        command,
        is_active: draft.is_active !== false ? 1 : 0,
        workspace_id: AGENTSAM_WORKSPACE_QUERY,
      };
      const isEdit = Boolean(draft.id);
      const r = await fetch(
        isEdit ? `/api/agentsam/hooks/${encodeURIComponent(draft.id)}` : "/api/agentsam/hooks",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEdit ? { trigger, command, is_active: body.is_active } : body),
        },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Save failed (${r.status})`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteHook = async (id) => {
    if (!window.confirm("Delete this hook?")) return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/hooks/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const trunc = (s, n) => {
    const t = (s || "").trim();
    return t.length <= n ? t : `${t.slice(0, n)}…`;
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading hooks…</div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Btn variant="primary" size="sm" onClick={() => setEditing({ trigger: "start", command: "", is_active: true })}>
          + New
        </Btn>
        {error ? (
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{error}</span>
        ) : null}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {items.length === 0 ? (
          <div style={{ ...{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 12 } }}>
            No hooks configured
          </div>
        ) : (
          items.map((h) => (
            <div
              key={h.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                marginBottom: 8,
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 4,
                background: "var(--bg-elevated)",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
              }}>{h.trigger}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--text-primary)" }}>
                  {trunc(h.command, 120)}
                </div>
                <div style={{
                  fontSize: 10,
                  marginTop: 4,
                  color: (Number(h.execution_count) || 0) === 0 ? "var(--text-muted)" : "var(--text-secondary)",
                }}>
                  {(() => {
                    const n = Number(h.execution_count) || 0;
                    if (n === 0) return "Never run";
                    const rel = relativeTime(h.last_ran_at) || formatLastRanUnix(h.last_ran_at);
                    return `${n} runs${rel ? ` · last ran ${rel}` : ""}`;
                  })()}
                </div>
              </div>
              <ControlledSwitch
                checked={Number(h.is_active) !== 0}
                onChange={(v) => patchActive(h, v)}
              />
              <Btn variant="inline" onClick={() => setEditing({
                id: h.id,
                trigger: h.trigger,
                command: h.command,
                is_active: Number(h.is_active) !== 0,
              })}
              >Edit</Btn>
              <Btn variant="danger" size="sm" onClick={() => deleteHook(h.id)}>Delete</Btn>
            </div>
          ))
        )}
      </div>

      {editing && (
        <WideModal
          open
          onClose={() => !saving && setEditing(null)}
          title={editing.id ? "Edit hook" : "New hook"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Trigger</div>
            <select
              value={editing.trigger || "start"}
              onChange={(e) => setEditing((x) => ({ ...x, trigger: e.target.value }))}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-primary)",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              {HOOK_TRIGGERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Command</div>
            <Input
              value={editing.command ?? ""}
              onChange={(e) => setEditing((x) => ({ ...x, command: e.target.value }))}
              placeholder="Shell command to run"
            />
            <SettingsRow
              label="Active"
              description="When off, this hook is skipped."
              control={(
                <ControlledSwitch
                  checked={editing.is_active !== false}
                  onChange={(v) => setEditing((x) => ({ ...x, is_active: v }))}
                />
              )}
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

function CmdAllowlistTab() {
  const wsq = agentsamWorkspaceQueryString();
  const [rows, setRows] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newCmd, setNewCmd] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [rList, rPol] = await Promise.all([
        fetch(`/api/agentsam/cmd-allowlist?${wsq}`, { credentials: "same-origin" }),
        fetch(`/api/agentsam/user-policy?${wsq}`, { credentials: "same-origin" }),
      ]);
      const listData = await rList.json().catch(() => null);
      const polData = await rPol.json().catch(() => null);
      if (!rList.ok) throw new Error(listData?.error || `Allowlist load failed (${rList.status})`);
      if (!rPol.ok) throw new Error(polData?.error || `Policy load failed (${rPol.status})`);
      setRows(Array.isArray(listData) ? listData : []);
      setPolicy(polData);
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [wsq]);

  useEffect(() => { load(); }, [load]);

  const addCmd = async () => {
    const command = newCmd.trim();
    if (!command) return;
    setError(null);
    try {
      const r = await fetch("/api/agentsam/cmd-allowlist", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, workspace_id: AGENTSAM_WORKSPACE_QUERY }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) {
        setError(data?.error || "Command already in allowlist");
        return;
      }
      if (!r.ok) throw new Error(data?.error || `Add failed (${r.status})`);
      setNewCmd("");
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const del = async (id) => {
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/cmd-allowlist/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const mode = (policy?.auto_run_mode || "allowlist").trim() || "allowlist";

  if (loading) {
    return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading…</div>;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Command allowlist</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Auto-run mode:
          {" "}
          <span style={{ color: "var(--text-primary)", fontFamily: "ui-monospace, monospace" }}>{mode}</span>
        </div>
        {mode !== "allowlist" ? (
          <div style={{
            marginTop: 10,
            padding: 8,
            borderRadius: 4,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}>
            {`Auto-run mode is set to '${mode}' — this list is only enforced in allowlist mode.`}
          </div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>{error}</div>
        ) : null}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Input
            value={newCmd}
            onChange={(e) => setNewCmd(e.target.value)}
            placeholder="Command to allowlist"
            style={{ flex: 1 }}
          />
          <Btn variant="primary" onClick={addCmd}>Add</Btn>
        </div>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)", fontSize: 12 }}>
            No commands allowlisted. In allowlist mode, the agent will ask before running any command.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 10,
                marginBottom: 6,
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}
            >
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--text-primary)" }}>{row.command}</span>
              <Btn variant="danger" size="sm" onClick={() => del(row.id)}>Delete</Btn>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function McpToolsTab() {
  const wsq = agentsamWorkspaceQueryString();
  const [policy, setPolicy] = useState(null);
  const [allow, setAllow] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [openCat, setOpenCat] = useState({});

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [rA, rR, rP] = await Promise.all([
        fetch(`/api/agentsam/mcp-allowlist?${wsq}`, { credentials: "same-origin" }),
        fetch("/api/agentsam/tools-registry", { credentials: "same-origin" }),
        fetch(`/api/agentsam/user-policy?${wsq}`, { credentials: "same-origin" }),
      ]);
      const aData = await rA.json().catch(() => null);
      const regData = await rR.json().catch(() => null);
      const pData = await rP.json().catch(() => null);
      if (!rA.ok) throw new Error(aData?.error || `Allowlist failed (${rA.status})`);
      if (!rR.ok) throw new Error(regData?.error || `Registry failed (${rR.status})`);
      if (!rP.ok) throw new Error(pData?.error || `Policy failed (${rP.status})`);
      setAllow(Array.isArray(aData) ? aData : []);
      setRegistry(Array.isArray(regData) ? regData : []);
      setPolicy(pData);
    } catch (e) {
      setError(e?.message || String(e));
      setAllow([]);
      setRegistry([]);
    } finally {
      setLoading(false);
    }
  }, [wsq]);

  useEffect(() => { load(); }, [load]);

  const allowByToolKey = useCallback(() => {
    const m = new Map();
    for (const r of allow) {
      if (r.tool_key) m.set(r.tool_key, r);
    }
    return m;
  }, [allow]);

  const toggleTool = async (toolName, currentlyOn) => {
    setError(null);
    const map = allowByToolKey();
    try {
      if (currentlyOn) {
        const row = map.get(toolName);
        if (!row?.id) {
          await load();
          return;
        }
        const r = await fetch(`/api/agentsam/mcp-allowlist/${encodeURIComponent(row.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Remove failed (${r.status})`);
      } else {
        const r = await fetch("/api/agentsam/mcp-allowlist", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool_key: toolName, workspace_id: AGENTSAM_WORKSPACE_QUERY }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Add failed (${r.status})`);
      }
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const protOff = policy && Number(policy.mcp_tools_protection) === 0;
  const f = filter.trim().toLowerCase();
  const filteredReg = registry.filter((t) => {
    if (!f) return true;
    const n = (t.tool_name || "").toLowerCase();
    const d = (t.description || "").toLowerCase();
    return n.includes(f) || d.includes(f);
  });
  const byCat = filteredReg.reduce((acc, t) => {
    const c = t.tool_category || "other";
    if (!acc[c]) acc[c] = [];
    acc[c].push(t);
    return acc;
  }, {});
  const categories = Object.keys(byCat).sort((a, b) => a.localeCompare(b));
  const map = allowByToolKey();
  const allowCount = allow.length;
  const totalTools = registry.length;

  if (loading) {
    return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading MCP tools…</div>;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          MCP tools
          {" "}
          <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-muted)" }}>
            {allowCount}
            {" / "}
            {totalTools}
            {" tools allowlisted"}
          </span>
        </div>
        {protOff ? (
          <div style={{
            marginTop: 10,
            padding: 8,
            borderRadius: 4,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}>
            MCP tool protection is disabled — all tools are permitted regardless of this list.
          </div>
        ) : null}
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or description"
          style={{
            width: "100%",
            marginTop: 10,
            padding: "8px 10px",
            background: "var(--bg-canvas)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 12,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        {error ? (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>{error}</div>
        ) : null}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {categories.map((cat) => {
          const open = openCat[cat] !== false;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setOpenCat((prev) => ({ ...prev, [cat]: !open }))}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {open ? "[-]" : "[+]"}
                {" "}
                {cat}
                {" "}
                <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                  (
                  {byCat[cat].length}
                  )
                </span>
              </button>
              {open ? (
                <div style={{ marginTop: 6 }}>
                  {byCat[cat].map((t) => {
                    const tn = t.tool_name || "";
                    const inList = map.has(tn);
                    const desc = (t.description || "").slice(0, 80);
                    const descShow = (t.description || "").length > 80 ? `${desc}…` : desc;
                    const en = Number(t.enabled) !== 0;
                    return (
                      <div
                        key={t.id || tn}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: 10,
                          marginBottom: 4,
                          background: "var(--bg-canvas)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{tn}</div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>{descShow}</div>
                        </div>
                        {en ? (
                          <span style={{
                            fontSize: 9,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--bg-elevated)",
                            color: "var(--color-success, var(--text-secondary))",
                            border: "1px solid var(--border)",
                          }}>enabled</span>
                        ) : (
                          <span style={{
                            fontSize: 9,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--bg-elevated)",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border)",
                          }}>off</span>
                        )}
                        <ControlledSwitch
                          checked={inList}
                          onChange={(v) => toggleTool(tn, inList)}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoutingRulesTab() {
  const [rules, setRules] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [priorityEdit, setPriorityEdit] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [rRules, rModels] = await Promise.all([
        fetch("/api/ai/routing-rules", { credentials: "same-origin" }),
        fetch("/api/ai/models", { credentials: "same-origin" }),
      ]);
      const d1 = await rRules.json().catch(() => null);
      const d2 = await rModels.json().catch(() => null);
      if (!rRules.ok) throw new Error(d1?.error || `Routing rules failed (${rRules.status})`);
      if (!rModels.ok) throw new Error(d2?.error || `Models failed (${rModels.status})`);
      const list = Array.isArray(d1?.rules) ? d1.rules : [];
      list.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
      setRules(list);
      setModels(Array.isArray(d2?.models) ? d2.models : []);
    } catch (e) {
      setError(e?.message || String(e));
      setRules([]);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editing) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || saving) return;
      e.preventDefault();
      setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, saving]);

  const saveModal = async (draft) => {
    const rule_name = (draft.rule_name || "").trim();
    const match_value = (draft.match_value || "").trim();
    const target_model_key = (draft.target_model_key || "").trim();
    const target_provider = (draft.target_provider || "").trim();
    if (!rule_name || !match_value || !target_model_key || !target_provider) {
      setError("Rule name, match value, target provider, and target model are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isEdit = Boolean(draft.id);
      const body = {
        rule_name,
        priority: Number(draft.priority) || 50,
        match_type: draft.match_type || "keyword",
        match_value,
        target_model_key,
        target_provider,
        reason: draft.reason != null ? String(draft.reason) : "",
        is_active: draft.is_active !== false ? 1 : 0,
      };
      const r = await fetch(
        isEdit ? `/api/ai/routing-rules/${encodeURIComponent(draft.id)}` : "/api/ai/routing-rules",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEdit ? {
            rule_name: body.rule_name,
            priority: body.priority,
            match_type: body.match_type,
            match_value: body.match_value,
            target_model_key: body.target_model_key,
            target_provider: body.target_provider,
            reason: body.reason,
            is_active: body.is_active,
          } : body),
        },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Save failed (${r.status})`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const patchPriority = async (id, raw) => {
    const p = Math.min(9999, Math.max(0, parseInt(String(raw), 10) || 0));
    setError(null);
    try {
      const r = await fetch(`/api/ai/routing-rules/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: p }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (${r.status})`);
      setPriorityEdit(null);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const toggleRule = async (row, nextOn) => {
    setError(null);
    try {
      const r = await fetch(`/api/ai/routing-rules/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextOn ? 1 : 0 }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const deleteRule = async (id) => {
    if (!window.confirm("Delete this routing rule?")) return;
    setError(null);
    try {
      const r = await fetch(`/api/ai/routing-rules/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const modelsByProvider = models.reduce((acc, m) => {
    const p = m.provider || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});
  const providers = Object.keys(modelsByProvider).sort((a, b) => a.localeCompare(b));

  const syncTargetsFromModel = (modelKey) => {
    const m = models.find((x) => x.model_key === modelKey || x.id === modelKey);
    if (m) {
      return { target_model_key: m.model_key || m.id, target_provider: m.provider || "" };
    }
    return {};
  };

  if (loading) {
    return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading routing rules…</div>;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Btn variant="primary" size="sm" onClick={() => setEditing({
          rule_name: "",
          priority: 50,
          match_type: "keyword",
          match_value: "",
          target_provider: "",
          target_model_key: "",
          reason: "",
          is_active: true,
        })}
        >+ New</Btn>
        {error ? <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{error}</span> : null}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {rules.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 12 }}>No routing rules</div>
        ) : (
          rules.map((row) => (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                padding: 12,
                marginBottom: 8,
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              {priorityEdit === row.id ? (
                <input
                  type="number"
                  autoFocus
                  defaultValue={row.priority}
                  onBlur={(e) => patchPriority(row.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.target.blur();
                  }}
                  style={{
                    width: 56,
                    padding: "4px 6px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                    fontSize: 11,
                    fontFamily: "inherit",
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPriorityEdit(row.id)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: "var(--bg-elevated)",
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  title="Edit priority"
                >
                  {row.priority}
                </button>
              )}
              <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>{row.rule_name}</span>
              <span style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}>{row.match_type}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace" }}>
                {row.target_provider}
                :
                {row.target_model_key}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ControlledSwitch
                  checked={Number(row.is_active) !== 0}
                  onChange={(v) => toggleRule(row, v)}
                />
                <Btn variant="inline" onClick={() => setEditing({
                  id: row.id,
                  rule_name: row.rule_name,
                  priority: row.priority,
                  match_type: row.match_type,
                  match_value: row.match_value,
                  target_provider: row.target_provider,
                  target_model_key: row.target_model_key,
                  reason: row.reason || "",
                  is_active: Number(row.is_active) !== 0,
                })}
                >Edit</Btn>
                <Btn variant="danger" size="sm" onClick={() => deleteRule(row.id)}>Delete</Btn>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <WideModal
          open
          onClose={() => !saving && setEditing(null)}
          title={editing.id ? "Edit routing rule" : "New routing rule"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Rule name</div>
            <Input
              value={editing.rule_name ?? ""}
              onChange={(e) => setEditing((x) => ({ ...x, rule_name: e.target.value }))}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Priority</div>
            <Input
              type="number"
              value={editing.priority ?? 50}
              onChange={(e) => setEditing((x) => ({ ...x, priority: e.target.value }))}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Match type</div>
            <select
              value={editing.match_type || "keyword"}
              onChange={(e) => setEditing((x) => ({ ...x, match_type: e.target.value }))}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-primary)",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              {ROUTING_MATCH_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Match value</div>
            <Input
              value={editing.match_value ?? ""}
              onChange={(e) => setEditing((x) => ({ ...x, match_value: e.target.value }))}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Target model</div>
            <select
              value={editing.target_model_key || ""}
              onChange={(e) => {
                const mk = e.target.value;
                setEditing((x) => ({ ...x, ...syncTargetsFromModel(mk), target_model_key: mk }));
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-primary)",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              <option value="">Select model</option>
              {providers.map((p) => (
                <optgroup key={p} label={p}>
                  {modelsByProvider[p].map((m) => {
                    const key = m.model_key || m.id;
                    return (
                      <option key={key} value={key}>
                        {m.display_name || key}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Target provider</div>
            <Input
              value={editing.target_provider ?? ""}
              onChange={(e) => setEditing((x) => ({ ...x, target_provider: e.target.value }))}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Reason (optional)</div>
            <textarea
              value={editing.reason ?? ""}
              onChange={(e) => setEditing((x) => ({ ...x, reason: e.target.value }))}
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 8,
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-primary)",
                fontSize: 12,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <SettingsRow
              label="Active"
              description="Inactive rules are skipped."
              control={(
                <ControlledSwitch
                  checked={editing.is_active !== false}
                  onChange={(v) => setEditing((x) => ({ ...x, is_active: v }))}
                />
              )}
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

function IgnorePatternsTab() {
  const wsq = agentsamWorkspaceQueryString();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newPat, setNewPat] = useState("");
  const [newNeg, setNewNeg] = useState(false);
  const [dragId, setDragId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/agentsam/ignore-patterns?${wsq}`, { credentials: "same-origin" });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || `Load failed (${r.status})`);
      const list = Array.isArray(data) ? data : [];
      list.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
      setRows(list);
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [wsq]);

  useEffect(() => { load(); }, [load]);

  const persistOrder = async (ordered) => {
    const ids = ordered.map((x) => x.id);
    setError(null);
    try {
      const r = await fetch("/api/agentsam/ignore-patterns/reorder", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Reorder failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const onDropRow = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const ix = rows.findIndex((x) => x.id === dragId);
    const ti = rows.findIndex((x) => x.id === targetId);
    if (ix < 0 || ti < 0) return;
    const next = [...rows];
    const [moved] = next.splice(ix, 1);
    next.splice(ti, 0, moved);
    setRows(next);
    setDragId(null);
    void persistOrder(next);
  };

  const addPat = async () => {
    const pattern = newPat.trim();
    if (!pattern) return;
    setError(null);
    try {
      const r = await fetch("/api/agentsam/ignore-patterns", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern,
          is_negation: newNeg,
          workspace_id: AGENTSAM_WORKSPACE_QUERY,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Add failed (${r.status})`);
      setNewPat("");
      setNewNeg(false);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const toggleNeg = async (row) => {
    if (String(row.source || "") === "file") return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/ignore-patterns/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_negation: !Number(row.is_negation) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const delPat = async (row) => {
    if (String(row.source || "") === "file") return;
    if (!window.confirm("Delete this pattern?")) return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/ignore-patterns/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>Loading…</div>;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Ignore patterns</div>
        {error ? (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>{error}</div>
        ) : null}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <Input
            value={newPat}
            onChange={(e) => setNewPat(e.target.value)}
            placeholder="Glob or path pattern"
            style={{ flex: 1, minWidth: 160 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={newNeg}
              onChange={(e) => setNewNeg(e.target.checked)}
            />
            Negation (!)
          </label>
          <Btn variant="primary" onClick={addPat}>Add</Btn>
        </div>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 12 }}>
            No ignore patterns defined.
          </div>
        ) : (
          rows.map((row) => {
            const isFile = String(row.source || "") === "file";
            return (
              <div
                key={row.id}
                draggable
                onDragStart={() => setDragId(row.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropRow(row.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  marginBottom: 6,
                  background: "var(--bg-canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  opacity: isFile ? 0.65 : 1,
                }}
              >
                <span
                  title="Drag to reorder"
                  style={{
                    cursor: "grab",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    userSelect: "none",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >::</span>
                <code style={{ flex: 1, fontSize: 11, color: "var(--text-primary)", wordBreak: "break-all" }}>
                  {Number(row.is_negation) ? "! " : ""}
                  {row.pattern}
                </code>
                <span style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}>{row.source || "db"}</span>
                <ControlledSwitch
                  checked={Number(row.is_negation) !== 0}
                  disabled={isFile}
                  onChange={() => toggleNeg(row)}
                />
                <Btn
                  variant="danger"
                  size="sm"
                  disabled={isFile}
                  onClick={() => delPat(row)}
                >Delete</Btn>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RulesSkillsSubagentsTab() {
  const [rules, setRules] = useState([]);
  const [subagents, setSubagents] = useState([]);
  const [skills, setSkills] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [editingSubagent, setEditingSubagent] = useState(null);
  const [editingSkill, setEditingSkill] = useState(null);
  const [revisionsFor, setRevisionsFor] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [saving, setSaving] = useState(false);

  const dismissSuccess = useCallback(() => setSuccessMessage(null), []);

  const loadRules = useCallback(async () => {
    const r = await fetch("/api/agentsam/rules", { credentials: "same-origin" });
    let data;
    try {
      data = await r.json();
    } catch {
      throw new Error(`Rules: invalid response (${r.status})`);
    }
    if (!r.ok) throw new Error(data?.error || `Failed to load rules (${r.status})`);
    const list = Array.isArray(data) ? data : data?.rules || [];
    setRules(list);
  }, []);

  const loadSubagents = useCallback(async () => {
    const q = new URLSearchParams({ workspace_id: AGENTSAM_WORKSPACE_QUERY });
    const r = await fetch(`/api/agentsam/subagents?${q}`, { credentials: "same-origin" });
    let data;
    try {
      data = await r.json();
    } catch {
      throw new Error(`Subagents: invalid response (${r.status})`);
    }
    if (!r.ok) throw new Error(data?.error || `Failed to load subagents (${r.status})`);
    const list = Array.isArray(data) ? data : data?.subagents || [];
    setSubagents(list);
  }, []);

  const loadSkills = useCallback(async () => {
    const q = new URLSearchParams({ workspace_id: AGENTSAM_WORKSPACE_QUERY, include_inactive: "1" });
    const r = await fetch(`/api/agentsam/skills?${q}`, { credentials: "same-origin" });
    let data;
    try {
      data = await r.json();
    } catch {
      throw new Error(`Skills: invalid response (${r.status})`);
    }
    if (!r.ok) throw new Error(data?.error || `Failed to load skills (${r.status})`);
    setSkills(Array.isArray(data) ? data : (data?.skills || []));
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadRules(), loadSubagents(), loadSkills()]);
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      console.error("[RulesSkillsSubagentsTab] load failed:", e);
      setRules([]);
      setSubagents([]);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [loadRules, loadSubagents, loadSkills]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const t = setTimeout(() => setSuccessMessage(null), 3200);
    return () => clearTimeout(t);
  }, [successMessage]);

  useEffect(() => {
    const anyOpen = Boolean(editingRule || editingSubagent || editingSkill || revisionsFor);
    if (!anyOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (saving) return;
      if (revisionsFor) setRevisionsFor(null);
      else {
        setEditingRule(null);
        setEditingSubagent(null);
        setEditingSkill(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingRule, editingSubagent, editingSkill, revisionsFor, saving]);

  const openRevisions = async (ruleId) => {
    setRevisionsFor(ruleId);
    setRevisions([]);
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/rules/${encodeURIComponent(ruleId)}/revisions`, {
        credentials: "same-origin",
      });
      let data;
      try {
        data = await r.json();
      } catch {
        throw new Error(`Invalid revisions response (${r.status})`);
      }
      if (!r.ok) throw new Error(data?.error || `Revisions failed (${r.status})`);
      setRevisions(Array.isArray(data) ? data : []);
    } catch (e) {
      setRevisions([]);
      const msg = e?.message || String(e);
      setError(msg);
      console.error("RulesSkillsSubagentsTab: openRevisions", e);
    }
  };

  const saveRule = async (draft) => {
    const title = (draft.title || "").trim();
    const body_markdown = draft.body_markdown ?? "";
    if (!title || !body_markdown.trim()) {
      setError("Title and body are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const ws = draft.workspace_id != null
        ? draft.workspace_id
        : agentsamWorkspaceIdForNewRule(filter);
      if (draft.id) {
        const r = await fetch(`/api/agentsam/rules/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body_markdown }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Save failed ${r.status}`);
      } else {
        const body = { title, body_markdown };
        if (ws != null && String(ws).trim() !== "") body.workspace_id = ws;
        const r = await fetch("/api/agentsam/rules", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Create failed ${r.status}`);
      }
      setEditingRule(null);
      await loadRules();
      setSuccessMessage(draft.id ? "Rule updated." : "Rule created.");
      console.info("RulesSkillsSubagentsTab: rule saved");
    } catch (e) {
      const msg = e?.message || String(e);
      setError(`Save rule failed: ${msg}`);
      console.error("RulesSkillsSubagentsTab: saveRule", e);
    } finally {
      setSaving(false);
    }
  };

  const saveSubagent = async (draft) => {
    const slug = (draft.slug || "").trim();
    const display_name = (draft.display_name || "").trim();
    if (!slug || !display_name) {
      setError("Slug and display name are required.");
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(slug)) {
      setError("Slug must be lowercase letters, numbers, hyphens, or underscores.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (draft.id) {
        const r = await fetch(`/api/agentsam/subagents/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            display_name,
            default_model_id: draft.default_model_id || null,
            allowed_tool_globs: draft.allowed_tool_globs || null,
            instructions_markdown: draft.instructions_markdown || null,
            is_active: Number(draft.is_active) !== 0 ? 1 : 0,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Update failed ${r.status}`);
      } else {
        const r = await fetch("/api/agentsam/subagents", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            display_name,
            default_model_id: draft.default_model_id || null,
            allowed_tool_globs: draft.allowed_tool_globs || null,
            instructions_markdown: draft.instructions_markdown || null,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Create failed ${r.status}`);
      }
      setEditingSubagent(null);
      await loadSubagents();
      setSuccessMessage(draft.id ? "Subagent updated." : "Subagent created.");
      console.info("RulesSkillsSubagentsTab: subagent saved");
    } catch (e) {
      const msg = e?.message || String(e);
      setError(`Save subagent failed: ${msg}`);
      console.error("RulesSkillsSubagentsTab: saveSubagent", e);
    } finally {
      setSaving(false);
    }
  };

  const deleteSubagent = async (id) => {
    if (!window.confirm("Delete this subagent profile? This cannot be undone.")) return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/subagents/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed ${r.status}`);
      await loadSubagents();
      if (editingSubagent?.id === id) setEditingSubagent(null);
      setSuccessMessage("Subagent deleted.");
    } catch (e) {
      const msg = e?.message || String(e);
      setError(`Delete subagent failed: ${msg}`);
      console.error("RulesSkillsSubagentsTab: deleteSubagent", e);
    }
  };

  const saveSkill = async (draft) => {
    const name = (draft.name || "").trim();
    if (!name) {
      setError("Skill name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = {
        name,
        description: draft.description ?? "",
        content_markdown: draft.content_markdown ?? "",
        scope: draft.scope || "user",
        metadata_json: draft.metadata_json || "{}",
      };
      if (draft.scope === "workspace") {
        payload.workspace_id = draft.workspace_id || "tenant_sam_primeaux";
      } else {
        payload.workspace_id = null;
      }
      if (draft.file_path) payload.file_path = draft.file_path;

      if (draft.id) {
        const r = await fetch(`/api/agentsam/skills/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Update failed ${r.status}`);
      } else {
        const r = await fetch("/api/agentsam/skills", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Create failed ${r.status}`);
      }
      setEditingSkill(null);
      await loadSkills();
      setSuccessMessage(draft.id ? "Skill updated." : "Skill created.");
      console.info("RulesSkillsSubagentsTab: skill saved");
    } catch (e) {
      const msg = e?.message || String(e);
      setError(`Save skill failed: ${msg}`);
      console.error("RulesSkillsSubagentsTab: saveSkill", e);
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (id) => {
    if (!window.confirm("Delete this skill? This cannot be undone.")) return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/skills/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed ${r.status}`);
      await loadSkills();
      if (editingSkill?.id === id) setEditingSkill(null);
      setSuccessMessage("Skill deleted.");
    } catch (e) {
      const msg = e?.message || String(e);
      setError(`Delete skill failed: ${msg}`);
      console.error("RulesSkillsSubagentsTab: deleteSkill", e);
    }
  };

  const toggleSkill = async (id) => {
    const skill = skills.find((s) => s.id === id);
    if (!skill) return;
    setError(null);
    try {
      const newState = Number(skill.is_active) !== 0 ? 0 : 1;
      const r = await fetch(`/api/agentsam/skills/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newState }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `Toggle failed ${r.status}`);
      await loadSkills();
    } catch (e) {
      const msg = e?.message || String(e);
      setError(`Toggle skill failed: ${msg}`);
      console.error("RulesSkillsSubagentsTab: toggleSkill", e);
    }
  };

  const filteredRules = rules.filter((r) => ruleMatchesFilter(r, filter));
  const filteredSubagents = subagents.filter((s) => subagentMatchesFilter(s, filter));
  const filteredSkills = skills.filter((s) => skillMatchesFilter(s, filter));

  const openNewRuleDraft = () => {
    setError(null);
    setEditingRule({
      title: "",
      body_markdown: "",
      workspace_id: agentsamWorkspaceIdForNewRule(filter),
    });
  };

  const openNewSubagentDraft = () => {
    setError(null);
    setEditingSubagent({
      slug: "",
      display_name: "",
      default_model_id: "",
      allowed_tool_globs: "",
      instructions_markdown: "",
      is_active: true,
    });
  };

  const openNewSkillDraft = () => {
    setError(null);
    setEditingSkill({
      name: "",
      description: "",
      content_markdown: "",
      scope: filter === "workspace" ? "workspace" : "user",
      metadata_json: "{}",
    });
  };

  const emptyCardShell = {
    textAlign: "center",
    padding: "40px 20px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  };

  if (loading) {
    return (
      <>
        <style>{`
          @keyframes rssSpin { to { transform: rotate(360deg); } }
        `}</style>
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 64,
          minHeight: 240,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 24,
                height: 24,
                border: "3px solid var(--border)",
                borderTopColor: "var(--accent)",
                borderRadius: "50%",
                animation: "rssSpin 0.8s linear infinite",
                flexShrink: 0,
              }}
            />
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>Loading rules, skills, and subagents</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes rssSpin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
        Rules, skills, and subagents
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
        Domain-specific knowledge and workflows. Rules and subagents are stored in D1 and apply to Agent Sam.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setFilter("all")} style={pillStyle(filter === "all")}>All</button>
        <button type="button" onClick={() => setFilter("user")} style={pillStyle(filter === "user")}>User</button>
        <button type="button" onClick={() => setFilter("workspace")} style={pillStyle(filter === "workspace")}>
          inneranimalmedia
        </button>
      </div>

      {successMessage && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          padding: "10px 12px",
          borderRadius: 6,
          background: "var(--bg-elevated)",
          border: "1px solid var(--color-success)",
          color: "var(--color-success)",
          fontSize: 12,
        }}>
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={dismissSuccess}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-success)",
              cursor: "pointer",
              fontSize: 11,
              textDecoration: "underline",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          padding: "10px 12px",
          borderRadius: 6,
          background: "var(--bg-danger-muted)",
          border: "1px solid var(--border-danger)",
          color: "var(--color-error)",
          fontSize: 12,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-error)",
              cursor: "pointer",
              fontSize: 11,
              flexShrink: 0,
              textDecoration: "underline",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <SectionLabel>Workspace enforcement (read-only)</SectionLabel>
      <div style={{ marginBottom: 20 }}>
        {WORKSPACE_ENFORCEMENT.map((r) => (
          <div
            key={r.name}
            style={{
              padding: "8px 10px", borderRadius: 5,
              background: "var(--bg-elevated)", borderLeft: "3px solid var(--color-success)",
              marginBottom: 6,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)", marginBottom: 2 }}>{r.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{r.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>Rules</SectionLabel>
        <Btn size="sm" onClick={openNewRuleDraft}>+ New</Btn>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
        Use rules to guide agent behavior. Stored in agentsam_rules_document. Removing a rule from the API is not
        available yet; use Edit to update content.
      </div>
      <div style={{ marginBottom: 24 }}>
        {filteredRules.length === 0 ? (
          <div style={{ ...emptyCardShell, color: "var(--text-secondary)" }}>
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                margin: "0 auto 12px",
                border: "2px dashed var(--border)",
                borderRadius: 6,
                opacity: 0.6,
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>
              No rules found
            </div>
            <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
              {filter === "all"
                ? "Create your first rule to guide agent behavior."
                : filter === "user"
                  ? "No user-scoped rules for this filter."
                  : "No workspace-scoped rules for this filter."}
            </div>
            <Btn variant="primary" size="sm" onClick={openNewRuleDraft}>Create rule</Btn>
          </div>
        ) : (
          filteredRules.map((rule) => (
            <div
              key={rule.id}
              style={{
                padding: 12, border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8,
                background: "var(--bg-canvas)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{rule.title}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                    v{rule.version ?? "?"} ·{" "}
                    {rule.workspace_id ? `workspace ${rule.workspace_id}` : "user scope"} ·{" "}
                    {rule.updated_at ? timeAgo(rule.updated_at) : ""}
                  </div>
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>Skills</SectionLabel>
        <Btn size="sm" onClick={openNewSkillDraft}>+ New</Btn>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
        Stored in D1 as agentsam_skill. Toggle active to include or exclude a skill without deleting it.
      </div>
      <div style={{ marginBottom: 24 }}>
        {filteredSkills.length === 0 ? (
          <div style={{ ...emptyCardShell, color: "var(--text-secondary)" }}>
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                margin: "0 auto 12px",
                border: "2px dashed var(--border)",
                borderRadius: 6,
                opacity: 0.6,
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>
              No skills found
            </div>
            <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
              {filter === "all"
                ? "Create your first skill to provide specialized capabilities."
                : filter === "user"
                  ? "No user-scoped skills for this filter."
                  : "No workspace-scoped skills for this filter."}
            </div>
            <Btn variant="primary" size="sm" onClick={openNewSkillDraft}>Create skill</Btn>
          </div>
        ) : (
          filteredSkills.map((sk) => (
            <SkillCardRow
              key={sk.id}
              skill={sk}
              onEdit={() => setEditingSkill({ ...sk })}
              onDelete={() => deleteSkill(sk.id)}
              onToggleActive={() => toggleSkill(sk.id)}
            />
          ))
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>Subagents</SectionLabel>
        <Btn onClick={openNewSubagentDraft}>+ New</Btn>
      </div>
      <div style={{ marginBottom: 24 }}>
        {filteredSubagents.length === 0 ? (
          <div style={{ ...emptyCardShell, color: "var(--text-secondary)" }}>
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                margin: "0 auto 12px",
                border: "2px dashed var(--border)",
                borderRadius: 6,
                opacity: 0.6,
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>
              No subagents found
            </div>
            <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
              {filter === "all"
                ? "Create a subagent profile for specialized tasks."
                : filter === "user"
                  ? "No user-scoped subagents for this filter."
                  : "No workspace-scoped subagents for this filter."}
            </div>
            <Btn variant="primary" size="sm" onClick={openNewSubagentDraft}>Create subagent</Btn>
          </div>
        ) : (
          filteredSubagents.map((s) => (
            <div
              key={s.id}
              style={{
                padding: 12, border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8,
                background: "var(--bg-canvas)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{s.display_name}</div>
                  <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)" }}>{s.slug}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                    {Number(s.is_active) !== 0 ? "active" : "inactive"}
                    {s.updated_at ? ` · ${timeAgo(s.updated_at)}` : ""}
                  </div>
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

      {editingRule && (
        <WideModal
          open
          onClose={() => !saving && setEditingRule(null)}
          title={editingRule.id ? "Edit rule" : "New rule"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input
              value={editingRule.title ?? ""}
              onChange={(e) => setEditingRule((x) => ({ ...x, title: e.target.value }))}
              placeholder="Title"
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Body (Markdown)
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", minHeight: 320 }}>
              <Editor
                height="320px"
                defaultLanguage="markdown"
                theme="vs-dark"
                value={editingRule.body_markdown ?? ""}
                onChange={(v) => setEditingRule((x) => ({ ...x, body_markdown: v ?? "" }))}
                options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => !saving && setEditingRule(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={saving} onClick={() => saveRule(editingRule)}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </WideModal>
      )}

      {revisionsFor && (
        <Modal open onClose={() => setRevisionsFor(null)} title="Rule revision history">
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {revisions.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>No revisions or still loading.</div>
            ) : (
              revisions.map((rev) => (
                <div
                  key={rev.id}
                  style={{
                    padding: 8, borderBottom: "1px solid var(--border)", fontSize: 11,
                    color: "var(--text-secondary)",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>v{rev.version}</div>
                  <div>{rev.created_at} · {rev.created_by || "—"}</div>
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <Btn onClick={() => setRevisionsFor(null)}>Close</Btn>
          </div>
        </Modal>
      )}

      {editingSubagent && (
        <WideModal
          open
          onClose={() => !saving && setEditingSubagent(null)}
          title={editingSubagent.id ? "Edit subagent" : "New subagent"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input
              value={editingSubagent.slug ?? ""}
              onChange={(e) => setEditingSubagent((x) => ({ ...x, slug: e.target.value }))}
              placeholder="slug (lowercase, a-z 0-9 _ -)"
              disabled={!!editingSubagent.id}
            />
            <Input
              value={editingSubagent.display_name ?? ""}
              onChange={(e) => setEditingSubagent((x) => ({ ...x, display_name: e.target.value }))}
              placeholder="Display name"
            />
            <Input
              value={editingSubagent.default_model_id ?? ""}
              onChange={(e) => setEditingSubagent((x) => ({ ...x, default_model_id: e.target.value }))}
              placeholder="Default model id (optional)"
            />
            <Input
              value={editingSubagent.allowed_tool_globs ?? ""}
              onChange={(e) => setEditingSubagent((x) => ({ ...x, allowed_tool_globs: e.target.value }))}
              placeholder="Allowed tool globs (optional)"
            />
            {editingSubagent.id ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-primary)" }}>
                <input
                  type="checkbox"
                  checked={Number(editingSubagent.is_active) !== 0}
                  onChange={(e) => setEditingSubagent((x) => ({ ...x, is_active: e.target.checked ? 1 : 0 }))}
                />
                Active
              </label>
            ) : null}
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Instructions (Markdown)</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", minHeight: 240 }}>
              <Editor
                height="240px"
                defaultLanguage="markdown"
                theme="vs-dark"
                value={editingSubagent.instructions_markdown ?? ""}
                onChange={(v) => setEditingSubagent((x) => ({ ...x, instructions_markdown: v ?? "" }))}
                options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => !saving && setEditingSubagent(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={saving} onClick={() => saveSubagent(editingSubagent)}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </WideModal>
      )}

      {editingSkill && (
        <WideModal
          open
          onClose={() => !saving && setEditingSkill(null)}
          title={editingSkill.id ? "Edit skill" : "New skill"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Name</div>
            <Input
              value={editingSkill.name ?? ""}
              onChange={(e) => setEditingSkill((x) => ({ ...x, name: e.target.value }))}
              placeholder="e.g. cloudflare-workers-dev"
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Description</div>
            <Input
              value={editingSkill.description ?? ""}
              onChange={(e) => setEditingSkill((x) => ({ ...x, description: e.target.value }))}
              placeholder="Brief description of when to use this skill"
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Scope</div>
            <select
              value={editingSkill.scope || "user"}
              onChange={(e) => {
                const v = e.target.value;
                setEditingSkill((x) => ({
                  ...x,
                  scope: v,
                  workspace_id: v === "workspace" ? (x.workspace_id || "tenant_sam_primeaux") : null,
                }));
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--bg-canvas)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-primary)",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              <option value="user">User</option>
              <option value="workspace">Workspace</option>
              <option value="global">Global</option>
            </select>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Content (Markdown)</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", minHeight: 320 }}>
              <Editor
                height="320px"
                defaultLanguage="markdown"
                theme="vs-dark"
                value={editingSkill.content_markdown ?? ""}
                onChange={(v) => setEditingSkill((x) => ({ ...x, content_markdown: v ?? "" }))}
                options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 12 }}
              />
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

function SettingsPlaceholderTab({ title, body }) {
  return (
    <div style={{ padding: 16, flex: 1, overflowY: "auto" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65 }}>{body}</div>
    </div>
  );
}

function GeneralWithEnvironment({ runCommandRunnerRef }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <GeneralTab />
      <div style={{ borderTop: "1px solid var(--border)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <EnvironmentTab runCommandRunnerRef={runCommandRunnerRef} />
      </div>
    </div>
  );
}

function PluginsCombinedTab({ connectedIntegrations }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <IntegrationsTab connectedIntegrations={connectedIntegrations} />
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <ProvidersTab />
      </div>
    </div>
  );
}

function ToolsMcpTab() {
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
                padding: 12,
                marginBottom: 8,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-canvas)",
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
                    fontSize: 9,
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}>{c.category}</span>
                ) : null}
                {c.status ? (
                  <span style={{
                    fontSize: 9,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
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
        <a href="/dashboard/mcp" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>Open MCP dashboard</a>
      </div>
    </div>
  );
}

function DeployBetaTab({ runCommandRunnerRef, onDeployStart, onDeployComplete }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
      <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, borderBottom: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
        Wrangler, Workers, and D1 console. Output still streams to the Terminal tab when you run commands from here.
      </div>
      <WranglerTab
        runCommandRunnerRef={runCommandRunnerRef}
        onDeployStart={onDeployStart}
        onDeployComplete={onDeployComplete}
      />
      <div style={{ height: 1, background: "var(--border)", margin: "0 8px" }} />
      <WorkersTab runCommandRunnerRef={runCommandRunnerRef} />
      <div style={{ height: 1, background: "var(--border)", margin: "0 8px" }} />
      <D1Tab />
    </div>
  );
}

const IAM_DOCS_STYLE_ID = "iam-docs-settings-markdown-styles";

function injectIamDocsMarkdownStyles() {
  if (typeof document === "undefined" || document.getElementById(IAM_DOCS_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = IAM_DOCS_STYLE_ID;
  style.textContent = `
.docs-markdown h1 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.docs-markdown h2 {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  margin: 16px 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.docs-markdown h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 12px 0 4px;
}
.docs-markdown code {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10.5px;
  color: var(--accent);
  font-family: var(--font-mono, monospace);
}
.docs-markdown pre {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.docs-markdown pre code {
  background: none;
  border: none;
  padding: 0;
  color: var(--text-secondary);
  font-size: 11px;
}
.docs-markdown ul {
  padding-left: 16px;
  margin: 4px 0 8px;
}
.docs-markdown li {
  margin-bottom: 3px;
  color: var(--text-secondary);
}
.docs-markdown a {
  color: var(--accent);
  text-decoration: none;
}
.docs-markdown a:hover {
  text-decoration: underline;
}
.docs-markdown strong {
  color: var(--text-primary);
  font-weight: 600;
}
.docs-markdown p {
  margin-bottom: 8px;
  color: var(--text-secondary);
}
.docs-markdown table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 11px;
}
.docs-markdown th {
  text-align: left;
  padding: 5px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--accent);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.docs-markdown td {
  padding: 4px 8px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.iam-docs-list-btn:hover {
  background: var(--bg-hover) !important;
  color: var(--text-primary) !important;
  border-left-color: var(--accent) !important;
}
`;
  document.head.appendChild(style);
}

function renderIamDocsMarkdown(md) {
  if (!md) return "";
  const esc = (s) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const inlineFmt = (s) => {
    const links = [];
    let x = String(s);
    x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const i = links.length;
      links.push({ label, href });
      return `__IAM_LINK_${i}__`;
    });
    x = esc(x);
    x = x.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    x = x.replace(/\*(.+?)\*/g, "<em>$1</em>");
    x = x.replace(/`([^`]+)`/g, "<code>$1</code>");
    x = x.replace(/__IAM_LINK_(\d+)__/g, (_, i) => {
      const { label, href } = links[Number(i)];
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    });
    return x;
  };
  let t = String(md);
  const fences = [];
  t = t.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    const id = fences.length;
    fences.push("<pre><code>" + esc(code) + "</code></pre>");
    return "\n%%FENCE" + id + "%%\n";
  });
  const parts = t.split(/\n%%FENCE(\d+)%%\n/);
  const htmlParts = parts.map((chunk, idx) => {
    if (idx % 2 === 1) return fences[Number(chunk)];
    const lines = chunk.split("\n");
    const rows = [];
    let buf = [];
    const flushPara = () => {
      if (!buf.length) return;
      const text = buf.join("\n").trim();
      if (text) rows.push("<p>" + inlineFmt(text) + "</p>");
      buf = [];
    };
    for (const line of lines) {
      const fenceMatch = line.match(/^%%FENCE(\d+)%%$/);
      if (fenceMatch) {
        flushPara();
        rows.push(fences[Number(fenceMatch[1])]);
        continue;
      }
      if (/^### /.test(line)) {
        flushPara();
        rows.push("<h3>" + inlineFmt(line.slice(4)) + "</h3>");
      } else if (/^## /.test(line)) {
        flushPara();
        rows.push("<h2>" + inlineFmt(line.slice(3)) + "</h2>");
      } else if (/^# /.test(line)) {
        flushPara();
        rows.push("<h1>" + inlineFmt(line.slice(2)) + "</h1>");
      } else if (/^[\-\*] /.test(line)) {
        flushPara();
        rows.push("<li>" + inlineFmt(line.slice(2)) + "</li>");
      } else if (line.trim() === "") {
        flushPara();
      } else {
        buf.push(line);
      }
    }
    flushPara();
    let h = rows.join("");
    h = h.replace(/(?:<li>.*?<\/li>\s*)+/g, (m) => `<ul>${m.trim()}</ul>`);
    return h;
  });
  return htmlParts.join("");
}

function DocsTab() {
  const [currentDoc, setCurrentDoc] = useState(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    injectIamDocsMarkdownStyles();
  }, []);

  const DOCS = [
    { label: "Platform Overview", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/cursor/IAM-CURSOR-CONTEXT.md" },
    { label: "Deploy Runbook", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/deploy-runbook.md" },
    { label: "Worker Routing", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/worker-routing.md" },
    { label: "R2 Bucket Map", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/r2-bucket-map.md" },
    { label: "D1 Schema", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/d1-schema-overview.md" },
    { label: "Bindings Reference", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/bindings-reference.md" },
    { label: "AI Agents Overview", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/README.md" },
    { label: "Anthropic / Claude", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/anthropic.md" },
    { label: "OpenAI / GPT", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/openai.md" },
    { label: "Google Gemini", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/google-gemini.md" },
    { label: "Workers AI", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/workers-ai.md" },
    { label: "Auto Mode", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/auto-mode.md" },
    { label: "Tool Reference", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/tool-reference.md" },
    { label: "How RAG Works", group: "AutoRAG", url: "https://docs.inneranimalmedia.com/autorag/architecture/how-rag-works.md" },
    { label: "All Clients", group: "Clients", url: "https://docs.inneranimalmedia.com/clients/README.md" },
  ];

  const groups = [...new Set(DOCS.map((d) => d.group))];

  const filtered = search
    ? DOCS.filter((d) =>
        d.label.toLowerCase().includes(search.toLowerCase())
        || d.group.toLowerCase().includes(search.toLowerCase()))
    : DOCS;

  async function loadDoc(doc) {
    setCurrentDoc(doc);
    setLoading(true);
    setContent("");
    try {
      const res = await fetch(doc.url, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setContent(text);
    } catch (e) {
      setContent(`Failed to load document: ${e?.message || String(e)}`);
    }
    setLoading(false);
  }

  if (currentDoc) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        minHeight: 0, overflow: "hidden",
      }}
      >
        <div style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          background: "var(--bg-elevated)",
        }}
        >
          <button
            type="button"
            onClick={() => setCurrentDoc(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "inherit",
            }}
          >
            Back
          </button>
          <span style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            flex: 1,
          }}
          >
            {currentDoc.group} / {currentDoc.label}
          </span>
          <a
            href="https://docs.inneranimalmedia.com/index.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 10,
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            Open full docs
          </a>
        </div>
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          fontSize: 12,
          lineHeight: 1.7,
          color: "var(--text-secondary)",
        }}
        >
          {loading ? (
            <div style={{
              color: "var(--text-muted)",
              textAlign: "center",
              padding: 40,
              fontSize: 11,
            }}
            >
              Loading
            </div>
          ) : (
            <div
              className="docs-markdown"
              dangerouslySetInnerHTML={{ __html: renderIamDocsMarkdown(content) }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      minHeight: 0, overflow: "hidden",
    }}
    >
      <div style={{
        padding: "10px 12px 8px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
      >
        <input
          type="text"
          placeholder="Filter docs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 11,
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono, monospace)",
            outline: "none",
          }}
        />
      </div>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
      >
        <a
          href="https://docs.inneranimalmedia.com/index.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "7px 10px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            textDecoration: "none",
            color: "var(--text-secondary)",
            fontSize: 11,
            transition: "border-color 150ms",
          }}
        >
          <span>docs.inneranimalmedia.com</span>
          <span style={{ color: "var(--accent)" }} aria-hidden="true">+</span>
        </a>
      </div>
      <div style={{
        flex: 1, overflowY: "auto", padding: "8px 0",
      }}
      >
        {groups.map((group) => {
          const items = filtered.filter((d) => d.group === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                padding: "8px 12px 4px",
              }}
              >
                {group}
              </div>
              {items.map((doc) => (
                <button
                  key={doc.url}
                  type="button"
                  className="iam-docs-list-btn"
                  onClick={() => loadDoc(doc)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 12px",
                    background: "none",
                    border: "none",
                    color: "var(--text-secondary)",
                    fontSize: 11,
                    cursor: "pointer",
                    textAlign: "left",
                    borderLeft: "2px solid transparent",
                    transition: "all 100ms",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    flexShrink: 0,
                  }}
                  >
                    -
                  </span>
                  {doc.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Commands Tab (existing, preserved) ───────────────────────

function CommandsTab({ availableCommands }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Commands</h3>
      <div style={{ marginBottom: 24 }}>
        {availableCommands.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>No commands loaded. Type /help in chat.</div>
        ) : (
          availableCommands.map((cmd) => (
            <div key={cmd.command_name || cmd.trigger || cmd.description}
              style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6,
                marginBottom: 8, background: "var(--bg-canvas)" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                /{cmd.command_name || cmd.trigger || "command"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {cmd.description || "No description."}
              </div>
            </div>
          ))
        )}
      </div>
      <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Keyboard Shortcuts</h3>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
        <div>Cmd+K — Open settings</div>
        <div>Cmd+/ — Focus chat input</div>
        <div>Esc — Close panels</div>
      </div>
    </div>
  );
}

function GeneralTab() {
  const policyQuery = new URLSearchParams({ workspace_id: AGENTSAM_WORKSPACE_QUERY }).toString();
  const DEFAULT_MODEL_FALLBACK = "claude-haiku-4-5-20251001";
  const [models, setModels] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [defaultModelId, setDefaultModelId] = useState(DEFAULT_MODEL_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [modelErr, setModelErr] = useState(null);
  const [policyErr, setPolicyErr] = useState(null);
  const [saveModelOk, setSaveModelOk] = useState(false);
  const [savePolicyOk, setSavePolicyOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setModelErr(null);
      setPolicyErr(null);
      try {
        const [rModels, rPol, rBoot] = await Promise.all([
          fetch("/api/ai/models", { credentials: "same-origin" }),
          fetch(`/api/agentsam/user-policy?${policyQuery}`, { credentials: "same-origin" }),
          fetch("/api/agent/boot", { credentials: "same-origin" }),
        ]);
        const dModels = await rModels.json().catch(() => ({}));
        const dPol = await rPol.json().catch(() => ({}));
        const dBoot = await rBoot.json().catch(() => ({}));
        if (cancelled) return;
        if (rModels.ok) setModels(Array.isArray(dModels.models) ? dModels.models : []);
        else setModelErr(dModels?.error || "Failed to load models");
        if (rPol.ok) setPolicy(dPol);
        else setPolicyErr(dPol?.error || "Failed to load policy");
        const dm = dBoot?.default_model_id != null && String(dBoot.default_model_id).trim() !== ""
          ? String(dBoot.default_model_id).trim()
          : DEFAULT_MODEL_FALLBACK;
        if (rBoot.ok || dBoot?.default_model_id != null) setDefaultModelId(dm);
      } catch (e) {
        if (!cancelled) {
          setModelErr(e?.message || String(e));
          setPolicyErr(e?.message || String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [policyQuery]);

  const pickerModels = models.filter((m) => Number(m.show_in_picker) === 1);
  const byProvider = pickerModels.reduce((acc, m) => {
    const p = m.provider || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});
  const providerOrder = Object.keys(byProvider).sort((a, b) => a.localeCompare(b));

  const patchModel = async (value) => {
    setSaveModelOk(false);
    setModelErr(null);
    try {
      const r = await fetch("/api/settings/agent-config", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_model_id: value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Save failed (${r.status})`);
      setDefaultModelId(value);
      setSaveModelOk(true);
      setTimeout(() => setSaveModelOk(false), 2500);
    } catch (e) {
      setModelErr(e?.message || String(e));
    }
  };

  const patchPolicyField = async (partial) => {
    setSavePolicyOk(false);
    setPolicyErr(null);
    try {
      const r = await fetch(`/api/agentsam/user-policy?${policyQuery}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Save failed (${r.status})`);
      setPolicy(d);
      setSavePolicyOk(true);
      setTimeout(() => setSavePolicyOk(false), 2500);
    } catch (e) {
      setPolicyErr(e?.message || String(e));
    }
  };

  const autoClear = policy != null ? Number(policy.auto_clear_chat) !== 0 : false;
  const modEnter = policy != null ? Number(policy.submit_with_mod_enter) !== 0 : false;
  const textSize = policy != null && policy.text_size != null && String(policy.text_size).trim() !== ""
    ? String(policy.text_size).trim()
    : "default";

  return (
    <div style={{ padding: 16, flexShrink: 0 }}>
      <SectionLabel>Agent Configuration</SectionLabel>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>
        Workspace: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Inner Animal Media</span>
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 8 }}>Loading configuration…</div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>Default model</div>
        <select
          value={defaultModelId}
          onChange={(e) => patchModel(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 420,
            padding: "8px 10px",
            background: "var(--bg-canvas)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {(() => {
            const idSet = new Set(pickerModels.map((m) => m.id));
            const extra = !idSet.has(defaultModelId) ? (
              <option key="_current" value={defaultModelId}>{defaultModelId}</option>
            ) : null;
            if (pickerModels.length === 0) {
              return <option value={defaultModelId}>{defaultModelId}</option>;
            }
            return (
              <>
                {extra}
                {providerOrder.map((prov) => (
                  <optgroup key={prov} label={prov}>
                    {(byProvider[prov] || []).map((m) => (
                      <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
                    ))}
                  </optgroup>
                ))}
              </>
            );
          })()}
        </select>
        {saveModelOk ? (
          <div style={{ fontSize: 11, color: "var(--color-success, var(--accent))", marginTop: 6 }}>Saved</div>
        ) : null}
        {modelErr ? (
          <div style={{ fontSize: 11, color: "var(--color-error, var(--text-secondary))", marginTop: 6 }}>{modelErr}</div>
        ) : null}
      </div>

      <SettingsRow
        label="Auto-clear chat"
        description="Clear conversation when enabled in policy"
        control={(
          <ControlledSwitch
            checked={autoClear}
            disabled={policy == null || loading}
            onChange={(v) => patchPolicyField({ auto_clear_chat: v ? 1 : 0 })}
          />
        )}
      />
      <SettingsRow
        label="Submit with modifier+Enter"
        description="Send message with modifier+Enter when enabled"
        control={(
          <ControlledSwitch
            checked={modEnter}
            disabled={policy == null || loading}
            onChange={(v) => patchPolicyField({ submit_with_mod_enter: v ? 1 : 0 })}
          />
        )}
      />
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>Text size</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Composer density</div>
        </div>
        <select
          value={textSize}
          disabled={policy == null || loading}
          onChange={(e) => patchPolicyField({ text_size: e.target.value })}
          style={{
            padding: "6px 10px",
            background: "var(--bg-canvas)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 11,
            fontFamily: "inherit",
          }}
        >
          <option value="default">default</option>
          <option value="compact">compact</option>
          <option value="large">large</option>
        </select>
      </div>
      {savePolicyOk ? (
        <div style={{ fontSize: 11, color: "var(--color-success, var(--accent))", marginTop: 8 }}>Saved</div>
      ) : null}
      {policyErr ? (
        <div style={{ fontSize: 11, color: "var(--color-error, var(--text-secondary))", marginTop: 8 }}>{policyErr}</div>
      ) : null}
    </div>
  );
}

function formatSuccessRatePct(v) {
  if (v == null || v === "") return null;
  let x = Number(v);
  if (!Number.isFinite(x)) return null;
  if (x > 0 && x <= 1) x *= 100;
  return `${Math.round(x)}%`;
}

function AgentsTab() {
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
                      fontSize: 9,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}>{a.role_name}</span>
                  ) : null}
                  <span style={{
                    fontSize: 9,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: active ? "var(--color-success, var(--accent))" : "var(--text-muted)",
                  }}>{active ? "active" : "inactive"}</span>
                  {a.mode ? (
                    <span style={{
                      fontSize: 9,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--bg-elevated)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                    }}>{a.mode}</span>
                  ) : null}
                  {a.safety_level != null && String(a.safety_level).trim() !== "" ? (
                    <span style={{
                      fontSize: 9,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--bg-elevated)",
                      color: "var(--text-secondary)",
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
                    fontSize: 10,
                    padding: "2px 6px",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                  }}>{runs} runs</span>
                ) : null}
                {cost != null ? (
                  <span style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                  }}>{formatUsd2(cost)}</span>
                ) : null}
                {showSr ? (
                  <span style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                  }}>{sr}</span>
                ) : null}
                {avgMs != null ? (
                  <span style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
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

function ModelsSettingsTab() {
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

function CloudAgentsSettingsTab() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/mcp/agents", { credentials: "same-origin" })
      .then(async (r) => {
        if (r.status === 404) return [];
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Failed to load remote agents");
        return Array.isArray(d.agents) ? d.agents : [];
      })
      .then((rows) => {
        if (!cancelled) setAgents(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || String(e));
          setAgents([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Loading…</div>
      ) : error ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>{error}</div>
          <a href="/dashboard/mcp" style={{ color: "var(--accent)", textDecoration: "none" }}>Open MCP dashboard</a>
        </div>
      ) : agents.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>No remote agents connected. Configure agents via the MCP dashboard.</div>
          <a href="/dashboard/mcp" style={{ color: "var(--accent)", textDecoration: "none" }}>Open MCP dashboard</a>
        </div>
      ) : (
        agents.map((a) => (
          <div
            key={a.id || a.name}
            style={{
              padding: 12,
              marginBottom: 8,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-canvas)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>{a.name || a.id}</div>
              <span style={{
                fontSize: 9,
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}>{a.status || "unknown"}</span>
            </div>
            {a.updated_at || a.last_seen ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                {relativeTime(a.last_seen || a.updated_at) || "—"}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function formatR2Bytes(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (x < 1024) return `${x} B`;
  if (x < 1048576) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / 1048576).toFixed(1)} MB`;
}

function autoragStatsFields(stats) {
  if (!stats || typeof stats !== "object") {
    return {
      name: "iam-autorag",
      vectorCount: null,
      fileCount: null,
      lastSync: null,
      statusLabel: "Unknown",
    };
  }
  const st = String(stats.status || stats.state || stats.job_status || "").toLowerCase();
  let statusLabel = "Indexed";
  if (st.includes("process") || st === "running") statusLabel = "Processing";
  else if (st.includes("queue") || st === "pending") statusLabel = "Queued";
  else if (st.includes("error") || st === "failed") statusLabel = "Error";
  else if (!st && stats) statusLabel = "Indexed";
  return {
    name: stats.name || stats.instance_name || stats.id || "iam-autorag",
    vectorCount: stats.vector_count ?? stats.vectorCount ?? stats.metrics?.vector_count ?? stats.indexed_vectors ?? null,
    fileCount: stats.file_count ?? stats.source_file_count ?? stats.document_count ?? stats.files_indexed ?? null,
    lastSync: stats.last_synced_at || stats.last_sync_at || stats.updated_at || stats.modified_at || null,
    statusLabel,
  };
}

function chunkPreviewText(chunk) {
  if (chunk == null) return "";
  if (typeof chunk === "string") return chunk;
  const t = chunk.content ?? chunk.text ?? chunk.body ?? chunk.snippet;
  if (t != null) return String(t);
  try {
    return JSON.stringify(chunk);
  } catch {
    return String(chunk);
  }
}

function chunkSourceName(chunk) {
  if (!chunk || typeof chunk !== "object") return "—";
  const m = chunk.metadata && typeof chunk.metadata === "object" ? chunk.metadata : null;
  return (
    chunk.filename
    || chunk.source
    || chunk.file_id
    || m?.filename
    || m?.source
    || m?.path
    || "—"
  );
}

function IndexingDocsTab() {
  const wsq = agentsamWorkspaceQueryString();
  const fileInputRef = useRef(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  const [statsBody, setStatsBody] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState(null);
  const [uploadMsg, setUploadMsg] = useState(null);

  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchChunks, setSearchChunks] = useState([]);

  const loadSummary = useCallback(() => {
    setSummaryError(null);
    setSummaryLoading(true);
    fetch(`/api/agentsam/indexing-summary?${wsq}`, { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load indexing summary");
        setSummary(d);
      })
      .catch((e) => {
        setSummaryError(e?.message || String(e));
        setSummary(null);
      })
      .finally(() => setSummaryLoading(false));
  }, [wsq]);

  const loadStats = useCallback(() => {
    setStatsError(null);
    setStatsLoading(true);
    fetch("/api/agentsam/autorag/stats", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok && d?.error) throw new Error(d.error);
        setStatsBody(d);
      })
      .catch((e) => {
        setStatsError(e?.message || String(e));
        setStatsBody(null);
      })
      .finally(() => setStatsLoading(false));
  }, []);

  const loadFiles = useCallback(() => {
    setFilesError(null);
    setFilesLoading(true);
    fetch("/api/agentsam/autorag/files", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load files");
        setFiles(Array.isArray(d.files) ? d.files : []);
      })
      .catch((e) => {
        setFilesError(e?.message || String(e));
        setFiles([]);
      })
      .finally(() => setFilesLoading(false));
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadStats();
    loadFiles();
  }, [loadStats, loadFiles]);

  const onSyncNow = async () => {
    setSyncMsg(null);
    setSyncing(true);
    try {
      const r = await fetch("/api/agentsam/autorag/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Sync failed (${r.status})`);
      setSyncMsg("Sync job started.");
      setTimeout(() => {
        loadStats();
      }, 3000);
    } catch (e) {
      setSyncMsg(e?.message || String(e));
    } finally {
      setSyncing(false);
    }
  };

  const onDeleteFile = async (key) => {
    if (!key || !window.confirm("Remove this file from storage?")) return;
    setFilesError(null);
    try {
      const r = await fetch("/api/agentsam/autorag/files", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Delete failed (${r.status})`);
      await loadFiles();
    } catch (e) {
      setFilesError(e?.message || String(e));
    }
  };

  const onUploadPick = () => fileInputRef.current?.click();

  const onFileSelected = async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    setUploadMsg(null);
    setFilesError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/agentsam/autorag/upload", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Upload failed (${r.status})`);
      setUploadMsg(`Uploaded: ${d.key || file.name}`);
      await loadFiles();
    } catch (err) {
      setFilesError(err?.message || String(err));
    }
  };

  const onSearch = async () => {
    const query = searchQ.trim();
    if (!query) return;
    setSearchError(null);
    setSearching(true);
    setSearchChunks([]);
    try {
      const r = await fetch("/api/agentsam/autorag/search", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Search failed (${r.status})`);
      setSearchChunks(Array.isArray(d.chunks) ? d.chunks : []);
    } catch (err) {
      setSearchError(err?.message || String(err));
    } finally {
      setSearching(false);
    }
  };

  const ci = summary?.code_index || {};
  const codeStatus = String(ci.status || "idle").toLowerCase();
  const arStats = statsBody?.stats;
  const arFields = autoragStatsFields(arStats);
  const bindings = summary?.bindings || {};

  const groupedFiles = (() => {
    const g = { "source/docs": [], "autorag-knowledge": [], other: [] };
    for (const f of files) {
      const k = f.key || "";
      if (k.startsWith("source/docs/")) g["source/docs"].push(f);
      else if (k.startsWith("autorag-knowledge/")) g["autorag-knowledge"].push(f);
      else g.other.push(f);
    }
    return g;
  })();

  const pill = (label, on) => (
    <span style={{
      fontSize: 10,
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid var(--border)",
      color: on ? "var(--color-success, var(--accent))" : "var(--text-muted)",
      background: "var(--bg-canvas)",
      fontWeight: 500,
    }}>{label}{on ? "" : " (inactive)"}</span>
  );

  const cardStyle = {
    marginBottom: 16,
    padding: 14,
    background: "var(--bg-canvas)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  };

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1, minHeight: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
        Indexing and docs
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.55 }}>
        AutoRAG instance, knowledge files in R2, test retrieval, and ignore patterns.
      </div>

      <SectionLabel>AutoRAG index</SectionLabel>
      <div style={cardStyle}>
        {statsLoading ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading AutoRAG status…</div>
        ) : statsError ? (
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{statsError}</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{arFields.name}</span>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--accent)",
              }}>{arFields.statusLabel}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
              <div>Vectors: {arFields.vectorCount != null ? String(arFields.vectorCount) : "—"}</div>
              <div>Files (reported): {arFields.fileCount != null ? String(arFields.fileCount) : "—"}</div>
              <div>Last sync: {arFields.lastSync ? (relativeTime(arFields.lastSync) || String(arFields.lastSync)) : "—"}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <Btn variant="primary" disabled={syncing} onClick={onSyncNow}>{syncing ? "Syncing…" : "Sync now"}</Btn>
              {syncMsg ? <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{syncMsg}</span> : null}
            </div>
          </>
        )}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
            Repository code index
          </div>
          {summaryLoading ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading…</div>
          ) : summaryError ? (
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{summaryError}</div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span>Status: {codeStatus}</span>
                {ci.vector_backend ? (
                  <span style={{
                    fontSize: 9,
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}>{ci.vector_backend}</span>
                ) : null}
              </div>
              <div>{Number(ci.file_count) || 0} files indexed</div>
              <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", marginTop: 8 }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, Number(ci.progress_percent) || 0))}%`,
                  height: 4,
                  marginTop: 1,
                  background: "var(--accent)",
                  borderRadius: 2,
                }} />
              </div>
              {ci.last_sync_at ? (
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                  Last sync {relativeTime(ci.last_sync_at) || String(ci.last_sync_at)}
                </div>
              ) : null}
              {ci.last_error ? (
                <div style={{ fontSize: 10, color: "var(--color-danger, var(--text-secondary))", marginTop: 8 }}>{ci.last_error}</div>
              ) : null}
            </div>
          )}
        </div>
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {pill("Vectorize", !!bindings.vectorize)}
          {pill("R2", !!bindings.r2)}
          {pill("Workers AI", !!bindings.workers_ai)}
          {pill("AutoRAG API", !!bindings.autorag)}
        </div>
      </div>

      <SectionLabel>Knowledge files</SectionLabel>
      <div style={{ ...cardStyle, padding: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <Btn variant="primary" onClick={onUploadPick}>Upload doc</Btn>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={onFileSelected}
          />
          {uploadMsg ? <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{uploadMsg}</span> : null}
          <Btn variant="ghost" size="sm" onClick={() => loadFiles()}>Refresh</Btn>
        </div>
        {filesLoading ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading files…</div>
        ) : filesError ? (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>{filesError}</div>
        ) : null}
        {["source/docs", "autorag-knowledge", "other"].map((groupKey) => {
          const list = groupedFiles[groupKey];
          if (!list.length) return null;
          return (
            <div key={groupKey} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>{groupKey}</div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 72px 100px 40px",
                  gap: 0,
                  padding: "8px 10px",
                  background: "var(--bg-elevated)",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}>
                  <span>File</span>
                  <span>Size</span>
                  <span>Uploaded</span>
                  <span style={{ textAlign: "center" }}>Del</span>
                </div>
                {list.map((f) => {
                  const name = (f.key || "").split("/").pop() || f.key;
                  const uploaded = f.uploaded ? new Date(f.uploaded).toLocaleString() : "—";
                  return (
                    <div
                      key={f.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 72px 100px 40px",
                        alignItems: "center",
                        padding: "8px 10px",
                        borderTop: "1px solid var(--border)",
                        fontSize: 11,
                        color: "var(--text-primary)",
                      }}
                    >
                      <code style={{ fontSize: 10, wordBreak: "break-all", color: "var(--text-primary)" }} title={f.key}>{name}</code>
                      <span style={{ color: "var(--text-secondary)" }}>{formatR2Bytes(f.size)}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{uploaded}</span>
                      <div style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          title="Delete file"
                          onClick={() => onDeleteFile(f.key)}
                          style={{
                            background: "none",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                            padding: "2px 6px",
                            color: "var(--text-secondary)",
                            fontFamily: "inherit",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!filesLoading && !files.length && !filesError ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: 16 }}>
            No files under source/docs or autorag-knowledge.
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <SectionLabel>Knowledge base (D1)</SectionLabel>
        <a href="/dashboard/knowledge" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
          Manage knowledge base
        </a>
      </div>
      <div style={{ ...cardStyle, fontSize: 11, color: "var(--text-secondary)", marginTop: 0 }}>
        {summaryLoading ? "…" : `${Number(summary?.knowledge?.active_documents) || 0} active documents`}
      </div>

      <SectionLabel>Test search</SectionLabel>
      <div style={cardStyle}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Test a query…"
            style={{ flex: 1, minWidth: 200 }}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
          <Btn variant="primary" disabled={searching} onClick={onSearch}>{searching ? "Searching…" : "Search"}</Btn>
        </div>
        {searchError ? (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>{searchError}</div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {searchChunks.map((ch, i) => {
            const text = chunkPreviewText(ch);
            const short = text.length > 200 ? `${text.slice(0, 200)}…` : text;
            const src = chunkSourceName(ch);
            return (
              <div
                key={i}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                }}
              >
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>{String(src)}</div>
                <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{short}</div>
              </div>
            );
          })}
        </div>
      </div>

      <SectionLabel>Ignore rules</SectionLabel>
      <div style={{
        marginBottom: 24,
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        maxHeight: 520,
        display: "flex",
        flexDirection: "column",
      }}
      >
        <IgnorePatternsTab />
      </div>
    </div>
  );
}

function NetworkSettingsTab({ onOpenGeneral }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tunnel, setTunnel] = useState(null);
  const [tunnelErr, setTunnelErr] = useState(null);
  const [restarting, setRestarting] = useState(false);

  const loadTunnelStatus = useCallback(() => {
    fetch("/api/tunnel/status", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Tunnel status failed");
        setTunnel(d);
        setTunnelErr(null);
      })
      .catch((e) => {
        setTunnel(null);
        setTunnelErr(e?.message || String(e));
      });
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
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || String(e));
          setData(null);
        }
      })
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
      .catch((e) => {
        setTunnelErr(e?.message || String(e));
      })
      .finally(() => setRestarting(false));
  }, [loadTunnelStatus]);

  const row = (label, on) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{label}</span>
      <span style={{ fontSize: 12, color: on ? "var(--color-success, var(--accent))" : "var(--text-muted)" }}>
        {on ? "Configured" : "Not configured"}
      </span>
    </div>
  );

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      <div
        style={{
          marginBottom: 20,
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--bg-canvas)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>Cloudflare Tunnel</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              color: tunnelErr
                ? "var(--text-muted)"
                : tunnel?.healthy
                  ? "var(--color-success, var(--accent))"
                  : "var(--text-muted)",
              background: "var(--bg-elevated)",
            }}
          >
            {tunnelErr ? "Status unavailable" : tunnel?.healthy ? "Healthy" : "Not healthy"}
          </span>
        </div>
        {tunnel && !tunnelErr ? (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
            {tunnel.status != null && tunnel.status !== "" ? (
              <div>
                Status: <span style={{ color: "var(--text-primary)" }}>{String(tunnel.status)}</span>
              </div>
            ) : null}
            <div>
              Connections: <span style={{ color: "var(--text-primary)" }}>{typeof tunnel.connections === "number" ? tunnel.connections : "—"}</span>
            </div>
            {tunnel.created_at ? (
              <div style={{ marginTop: 4 }}>
                Created: <span style={{ color: "var(--text-primary)" }}>{String(tunnel.created_at)}</span>
              </div>
            ) : null}
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
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: restarting ? "wait" : "pointer",
              opacity: restarting ? 0.7 : 1,
            }}
          >
            {restarting ? "Restarting…" : "Restart Tunnel"}
          </button>
          <a
            href="https://one.dash.cloudflare.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "var(--accent)", textDecoration: "underline" }}
          >
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
          {row("Terminal", !!data.terminal_configured)}
          {row("Direct WSS", !!data.direct_wss_available)}
          <div style={{ marginTop: 20 }}>
            <SectionLabel>Configuration</SectionLabel>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.65, margin: "8px 0 12px" }}>
              Terminal credentials are managed via Wrangler secrets: TERMINAL_WS_URL and TERMINAL_SECRET.
              Never paste secret values here — manage via vault or wrangler secret put.
            </p>
            <button
              type="button"
              onClick={() => onOpenGeneral?.()}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 12,
                color: "var(--accent)",
                fontFamily: "inherit",
                textDecoration: "underline",
              }}
            >
              Open Environment Vault
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const MARKETPLACE_TYPE_LABELS = {
  llm: "Language Models",
  rag_pipeline: "RAG & Search",
  embedding_store: "Embedding Stores",
  routing: "Routing",
  telemetry: "Telemetry",
  workflow_engine: "Workflow Engines",
  ide_agent: "IDE Agents",
};

function MarketplaceSettingsTab({ onOpenGeneral }) {
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
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-canvas)",
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
                    fontSize: 11,
                    marginBottom: 8,
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
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          fontSize: 11,
                          color: "var(--accent)",
                          fontFamily: "inherit",
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

function TabSettingsTab() {
  const policyQuery = new URLSearchParams({ workspace_id: AGENTSAM_WORKSPACE_QUERY }).toString();
  const [composerPrefs, setComposerPrefs] = useState(() => readTabComposerPrefs());
  const [agentAutocomplete, setAgentAutocomplete] = useState(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyError, setPolicyError] = useState(null);
  const [savingAutocomplete, setSavingAutocomplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPolicyError(null);
      setPolicyLoading(true);
      try {
        const r = await fetch(`/api/agentsam/user-policy?${policyQuery}`, { credentials: "same-origin" });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Failed to load policy (${r.status})`);
        if (!cancelled) {
          setAgentAutocomplete(Number(data?.agent_autocomplete) !== 0);
        }
      } catch (e) {
        if (!cancelled) {
          setPolicyError(e?.message || String(e));
          setAgentAutocomplete(true);
        }
      } finally {
        if (!cancelled) setPolicyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [policyQuery]);

  const patchAutocomplete = async (nextOn) => {
    setSavingAutocomplete(true);
    setPolicyError(null);
    try {
      const r = await fetch(`/api/agentsam/user-policy?${policyQuery}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_autocomplete: nextOn ? 1 : 0 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `Save failed (${r.status})`);
      setAgentAutocomplete(Number(data?.agent_autocomplete) !== 0);
    } catch (e) {
      setPolicyError(e?.message || String(e));
    } finally {
      setSavingAutocomplete(false);
    }
  };

  const updateLocalPref = (key, value) => {
    setComposerPrefs((prev) => {
      const next = { ...prev, [key]: value };
      writeTabComposerPrefs(next);
      return next;
    });
  };

  const autocompleteChecked = agentAutocomplete !== false;
  const autocompleteDisabled = policyLoading || savingAutocomplete;

  return (
    <div style={{ padding: 16, flex: 1, overflowY: "auto" }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
        Tab
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.55 }}>
        Inline completion preferences. &quot;Agent Tab&quot; syncs to your workspace policy. Other toggles are stored in this browser until the composer reads them.
      </div>
      {policyError ? (
        <div style={{
          fontSize: 11, color: "var(--text-secondary)", marginBottom: 12, padding: 8,
          background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 4,
        }}>
          {policyError}
        </div>
      ) : null}

      <SettingsRow
        label="Agent Tab"
        description="Context-aware, multi-line suggestions around your cursor based on recent edits."
        control={(
          <ControlledSwitch
            checked={autocompleteChecked}
            disabled={autocompleteDisabled}
            onChange={(v) => patchAutocomplete(v)}
          />
        )}
      />

      <SettingsRow
        label={(
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>Partial Accepts</span>
            <span
              title="When a suggestion appears, accept one word at a time with your shortcut (e.g. Ctrl or Cmd plus Right Arrow) instead of the full block."
              style={{ cursor: "help", fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}
            >
              (i)
            </span>
          </span>
        )}
        description="Accept the next word of a suggestion with a keyboard shortcut (e.g. Ctrl or Cmd plus Right Arrow)."
        control={(
          <ControlledSwitch
            checked={composerPrefs.partialAccepts}
            onChange={(v) => updateLocalPref("partialAccepts", v)}
          />
        )}
      />

      <SettingsRow
        label="Suggestions While Commenting"
        description="Allow inline suggestions while the cursor is in a comment region."
        control={(
          <ControlledSwitch
            checked={composerPrefs.suggestionsInComments}
            onChange={(v) => updateLocalPref("suggestionsInComments", v)}
          />
        )}
      />

      <SettingsRow
        label="Whitespace-Only Suggestions"
        description="Suggest edits that only add or change new lines and indentation."
        control={(
          <ControlledSwitch
            checked={composerPrefs.whitespaceOnlySuggestions}
            onChange={(v) => updateLocalPref("whitespaceOnlySuggestions", v)}
          />
        )}
      />

      <SettingsRow
        label="Imports"
        description="When suggestions use symbols from other files, automatically add the corresponding TypeScript import at the top of the file."
        control={(
          <ControlledSwitch
            checked={composerPrefs.tsAutoImport}
            onChange={(v) => updateLocalPref("tsAutoImport", v)}
          />
        )}
      />
    </div>
  );
}

// ── Root component ───────────────────────────────────────────

export default function SettingsPanel({
  availableCommands,
  runCommandRunnerRef,
  connectedIntegrations,
  onOpenInBrowser,
  onDeployStart,
  onDeployComplete,
}) {
  const [tab, setTab] = useState(readStoredSettingsTab);

  const pickTab = (id) => {
    setTab(id);
    writeStoredSettingsTab(id);
  };

  useEffect(() => {
    const onGo = (e) => {
      const id = e?.detail?.tab;
      if (id && SETTINGS_TAB_IDS.has(id)) {
        setTab(id);
        writeStoredSettingsTab(id);
      }
    };
    window.addEventListener("iam-settings-goto-tab", onGo);
    return () => window.removeEventListener("iam-settings-goto-tab", onGo);
  }, []);

  const tabContent = {
    general: <GeneralWithEnvironment runCommandRunnerRef={runCommandRunnerRef} />,
    plan_usage: <SpendTab />,
    agents: <AgentsTab />,
    tab: <TabSettingsTab />,
    models: <ModelsSettingsTab />,
    cloud_agents: <CloudAgentsSettingsTab />,
    plugins: <PluginsCombinedTab connectedIntegrations={connectedIntegrations} />,
    rules_skills: <RulesSkillsSubagentsTab />,
    tools_mcp: <ToolsMcpTab />,
    hooks: <HooksTab />,
    cmd_allowlist: <CmdAllowlistTab />,
    mcp_tools: <McpToolsTab />,
    routing_rules: <RoutingRulesTab />,
    indexing_docs: <IndexingDocsTab />,
    network: <NetworkSettingsTab onOpenGeneral={() => pickTab("general")} />,
    beta: (
      <DeployBetaTab
        runCommandRunnerRef={runCommandRunnerRef}
        onDeployStart={onDeployStart}
        onDeployComplete={onDeployComplete}
      />
    ),
    marketplace: <MarketplaceSettingsTab onOpenGeneral={() => pickTab("general")} />,
    docs: <DocsTab />,
    provider_docs: <DocsTab />,
  };

  const activeContent = tabContent[tab] || tabContent.general;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeContent}
      </div>

      <div
        style={{
          width: "min(220px, 42%)",
          flexShrink: 0,
          background: "var(--bg-canvas)",
          borderLeft: "1px solid var(--border)",
          overflowY: "auto",
          padding: "8px 0",
        }}
      >
        {AGENT_SETTINGS_TABS.map((item) => (
          <div key={item.id}>
            {item.sectionBreak ? (
              <div style={{ borderTop: "1px solid var(--border)", margin: "10px 8px 6px" }} />
            ) : null}
            <button
              type="button"
              onClick={() => pickTab(item.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: tab === item.id ? "var(--bg-elevated)" : "none",
                border: "none",
                borderRight: tab === item.id ? "2px solid var(--accent)" : "2px solid transparent",
                color: tab === item.id ? "var(--text-primary)" : "var(--text-secondary)",
                padding: "7px 14px 7px 10px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                lineHeight: 1.35,
                transition: "all 120ms",
              }}
              onMouseEnter={(e) => {
                if (tab !== item.id) {
                  e.currentTarget.style.background = "var(--bg-elevated)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== item.id) {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
