import React, { useState, useEffect, useRef, useCallback } from "react";
import { Btn, StatusDot, SectionLabel, Input, Modal } from "../atoms";
import { timeAgo } from "../utils";

// ─── SecretCard ───────────────────────────────────────────────────────────────

interface Secret {
  key_name: string;
  label?: string;
  provider?: string;
  is_active?: number | boolean;
  last_rotated_at?: string;
  test_status?: string;
}

interface SecretCardProps {
  secret: Secret;
  onReveal: (keyName: string) => void;
  onRoll: (keyName: string) => void;
  onTest: (keyName: string, setStatus: (s: string) => void) => void;
}

function SecretCard({ secret: s, onReveal, onRoll, onTest }: SecretCardProps) {
  const [testStatus, setTestStatus] = useState(s.test_status || "untested");
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: 8,
      borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)",
      marginBottom: 4, opacity: s.is_active ? 1 : 0.4,
    }}>
      <StatusDot status={testStatus} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.key_name}</div>
        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>{s.label || s.key_name} · {timeAgo(s.last_rotated_at)}</div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <Btn variant="inline" onClick={() => onReveal(s.key_name)}>reveal</Btn>
        <Btn variant="inline" onClick={() => onRoll(s.key_name)}>roll</Btn>
        <Btn variant="inline" onClick={() => onTest(s.key_name, setTestStatus)}>test</Btn>
      </div>
    </div>
  );
}

// ─── EnvironmentTab ───────────────────────────────────────────────────────────

interface EnvironmentTabProps {
  runCommandRunnerRef?: React.RefObject<any>;
}

export function EnvironmentTab({ runCommandRunnerRef }: EnvironmentTabProps) {
  const [secrets,         setSecrets]         = useState<Secret[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [vaultOk,         setVaultOk]         = useState<boolean | null>(null);
  const [showAdd,         setShowAdd]         = useState(false);
  const [auditOpen,       setAuditOpen]       = useState(false);
  const [auditLog,        setAuditLog]        = useState<any[]>([]);
  const [revealModal,     setRevealModal]     = useState<string | null>(null);
  const [revealValue,     setRevealValue]     = useState("");
  const [revealCountdown, setRevealCountdown] = useState(30);
  const [rollModal,       setRollModal]       = useState<string | null>(null);
  const [rollValue,       setRollValue]       = useState("");
  const [rollNote,        setRollNote]        = useState("");
  const [newKey,          setNewKey]          = useState({ key_name: "", value: "", provider: "", label: "" });
  const [saving,          setSaving]          = useState(false);
  const [rolling,         setRolling]         = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/env/secrets", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { setSecrets(d.secrets || []); setVaultOk(true); })
      .catch(() => setVaultOk(false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const reveal = async (keyName: string) => {
    setRevealModal(keyName); setRevealValue("Decrypting…");
    const r = await fetch("/api/env/secrets/reveal", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_name: keyName }),
    });
    const d = await r.json();
    setRevealValue(d.value || d.error || "Failed");
    let t = 30; setRevealCountdown(t);
    if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    revealTimerRef.current = setInterval(() => {
      t--; setRevealCountdown(t);
      if (t <= 0) { clearInterval(revealTimerRef.current!); setRevealModal(null); }
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

  const testSecret = async (keyName: string, setStatus: (s: string) => void) => {
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

  const byProvider = secrets.reduce<Record<string, Secret[]>>((acc, s) => {
    const p = s.provider || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(s);
    return acc;
  }, {});

  const vaultBg    = vaultOk === null ? "var(--bg-elevated)" : vaultOk ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "color-mix(in srgb, var(--color-error) 12%, transparent)";
  const vaultColor = vaultOk === null ? "var(--text-secondary)" : vaultOk ? "var(--color-primary)" : "var(--color-error)";

  return (
    <div id="iam-settings-vault" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Btn variant="primary" onClick={() => setShowAdd((v) => !v)}>+ Add Secret</Btn>
        <Btn onClick={loadAudit}>Audit Log</Btn>
        <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace", padding: "2px 6px", borderRadius: 3, background: vaultBg, color: vaultColor, border: "1px solid transparent" }}>
          {vaultOk === null ? "checking…" : vaultOk ? "vault ok" : "VAULT_KEY missing"}
        </span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 6, padding: 12, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <Input
              value={newKey.key_name}
              placeholder="KEY_NAME"
              onChange={(e) => setNewKey((v) => ({ ...v, key_name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") }))}
            />
            <select
              value={newKey.provider}
              onChange={(e) => setNewKey((v) => ({ ...v, provider: e.target.value }))}
              style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: "6px 8px", borderRadius: 4, fontSize: 11, fontFamily: "inherit" }}
            >
              <option value="">provider</option>
              {["anthropic","openai","google","cloudflare","stripe","github","other"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <Input value={newKey.label}    placeholder="Display label (optional)" onChange={(e) => setNewKey((v) => ({ ...v, label: e.target.value }))} />
          <Input value={newKey.value}    placeholder="Secret value" type="password" onChange={(e) => setNewKey((v) => ({ ...v, value: e.target.value }))} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Btn variant="primary" disabled={saving} onClick={addSecret}>{saving ? "Saving…" : "Save Encrypted"}</Btn>
            <Btn onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Secrets list */}
      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
      ) : secrets.length === 0 ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>No secrets yet. Click + Add Secret to get started.</div>
      ) : (
        Object.entries(byProvider).map(([provider, items]) => (
          <div key={provider} style={{ marginBottom: 16 }}>
            <SectionLabel>{provider}</SectionLabel>
            {items.map((s) => (
              <SecretCard key={s.key_name} secret={s} onReveal={reveal} onRoll={setRollModal} onTest={testSecret} />
            ))}
          </div>
        ))
      )}

      {/* Reveal modal */}
      <Modal open={!!revealModal} onClose={() => { setRevealModal(null); clearInterval(revealTimerRef.current!); }} title={`Reveal — ${revealModal}`}>
        <div style={{ fontSize: 10, color: "var(--color-warning)", background: "color-mix(in srgb, var(--color-warning) 12%, transparent)", padding: "4px 8px", borderRadius: 4, marginBottom: 10 }}>
          Auto-hides in {revealCountdown}s
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <code style={{ flex: 1, wordBreak: "break-all", fontSize: 11, background: "var(--bg-canvas)", padding: 8, borderRadius: 4, border: "1px solid var(--border)", color: "var(--color-primary)", fontFamily: "monospace", display: "block" }}>{revealValue}</code>
          <Btn variant="inline" onClick={() => navigator.clipboard.writeText(revealValue)}>Copy</Btn>
        </div>
      </Modal>

      {/* Roll modal */}
      <Modal open={!!rollModal} onClose={() => { setRollModal(null); setRollValue(""); setRollNote(""); }} title={`Roll — ${rollModal}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Input type="password" value={rollValue} placeholder="New secret value" onChange={(e) => setRollValue(e.target.value)} />
          <Input value={rollNote} placeholder="Reason (optional)" onChange={(e) => setRollNote(e.target.value)} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Btn variant="danger" disabled={rolling || !rollValue.trim()} onClick={roll}>{rolling ? "Rolling…" : "Rotate Secret"}</Btn>
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
              <tr>{["Time","Key","Action","Note"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: 9, letterSpacing: "0.06em" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {auditLog.map((e, i) => {
                const actionColor: Record<string, string> = { read: "var(--text-secondary)", rotate: "var(--color-warning)", create: "var(--color-primary)", delete: "var(--color-error)" };
                return (
                  <tr key={i}>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "monospace", whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString()}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "monospace" }}>{e.key_name}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", fontFamily: "monospace", color: actionColor[e.action] || "var(--text-secondary)" }}>{e.action}</td>
                    <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{e.note || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
