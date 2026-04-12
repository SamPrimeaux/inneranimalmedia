import React, { useState, useEffect } from "react";
import { SettingsRow, ControlledSwitch, SectionLabel } from "../atoms";
import { AGENTSAM_WORKSPACE_QUERY } from "../constants";

const DEFAULT_MODEL_FALLBACK = "claude-haiku-4-5-20251001";

export function GeneralTab() {
  const policyQuery = new URLSearchParams({ workspace_id: AGENTSAM_WORKSPACE_QUERY }).toString();

  const [models,       setModels]       = useState<any[]>([]);
  const [policy,       setPolicy]       = useState<any>(null);
  const [defaultModelId, setDefaultModelId] = useState(DEFAULT_MODEL_FALLBACK);
  const [loading,      setLoading]      = useState(true);
  const [modelErr,     setModelErr]     = useState<string | null>(null);
  const [policyErr,    setPolicyErr]    = useState<string | null>(null);
  const [saveModelOk,  setSaveModelOk]  = useState(false);
  const [savePolicyOk, setSavePolicyOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setModelErr(null);
      setPolicyErr(null);
      try {
        const [rModels, rPol, rBoot] = await Promise.all([
          fetch("/api/ai/models",                                    { credentials: "same-origin" }),
          fetch(`/api/agentsam/user-policy?${policyQuery}`,         { credentials: "same-origin" }),
          fetch("/api/agent/boot",                                   { credentials: "same-origin" }),
        ]);
        const dModels = await rModels.json().catch(() => ({}));
        const dPol    = await rPol.json().catch(() => ({}));
        const dBoot   = await rBoot.json().catch(() => ({}));
        if (cancelled) return;
        if (rModels.ok) setModels(Array.isArray(dModels.models) ? dModels.models : []);
        else setModelErr(dModels?.error || "Failed to load models");
        if (rPol.ok) setPolicy(dPol);
        else setPolicyErr(dPol?.error || "Failed to load policy");
        const dm = dBoot?.default_model_id != null && String(dBoot.default_model_id).trim() !== ""
          ? String(dBoot.default_model_id).trim()
          : DEFAULT_MODEL_FALLBACK;
        if (rBoot.ok || dBoot?.default_model_id != null) setDefaultModelId(dm);
      } catch (e: any) {
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
  const byProvider   = pickerModels.reduce<Record<string, any[]>>((acc, m) => {
    const p = m.provider || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});
  const providerOrder = Object.keys(byProvider).sort((a, b) => a.localeCompare(b));

  const patchModel = async (value: string) => {
    setSaveModelOk(false); setModelErr(null);
    try {
      const r = await fetch("/api/settings/agent-config", {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_model_id: value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Save failed (${r.status})`);
      setDefaultModelId(value);
      setSaveModelOk(true);
      setTimeout(() => setSaveModelOk(false), 2500);
    } catch (e: any) { setModelErr(e?.message || String(e)); }
  };

  const patchPolicyField = async (partial: Record<string, unknown>) => {
    setSavePolicyOk(false); setPolicyErr(null);
    try {
      const r = await fetch(`/api/agentsam/user-policy?${policyQuery}`, {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Save failed (${r.status})`);
      setPolicy(d);
      setSavePolicyOk(true);
      setTimeout(() => setSavePolicyOk(false), 2500);
    } catch (e: any) { setPolicyErr(e?.message || String(e)); }
  };

  const autoClear  = policy != null ? Number(policy.auto_clear_chat) !== 0 : false;
  const modEnter   = policy != null ? Number(policy.submit_with_mod_enter) !== 0 : false;
  const textSize   = policy?.text_size != null && String(policy.text_size).trim() !== ""
    ? String(policy.text_size).trim() : "default";

  const idSet = new Set(pickerModels.map((m) => m.id));

  return (
    <div style={{ padding: 16, flexShrink: 0 }}>
      <SectionLabel>Agent Configuration</SectionLabel>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>
        Workspace: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Inner Animal Media</span>
      </div>

      {loading && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 8 }}>Loading configuration…</div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>Default model</div>
        <select
          value={defaultModelId}
          onChange={(e) => patchModel(e.target.value)}
          style={{
            width: "100%", maxWidth: 420, padding: "8px 10px",
            background: "var(--bg-canvas)", border: "1px solid var(--border)",
            borderRadius: 4, color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit",
          }}
        >
          {!idSet.has(defaultModelId) && (
            <option value={defaultModelId}>{defaultModelId}</option>
          )}
          {pickerModels.length === 0 ? (
            <option value={defaultModelId}>{defaultModelId}</option>
          ) : providerOrder.map((prov) => (
            <optgroup key={prov} label={prov}>
              {(byProvider[prov] || []).map((m) => (
                <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {saveModelOk && <div style={{ fontSize: 11, color: "var(--color-success, var(--accent))", marginTop: 6 }}>Saved</div>}
        {modelErr   && <div style={{ fontSize: 11, color: "var(--color-error, var(--text-secondary))", marginTop: 6 }}>{modelErr}</div>}
      </div>

      <SettingsRow
        label="Auto-clear chat"
        description="Clear conversation when enabled in policy"
        control={<ControlledSwitch checked={autoClear} disabled={policy == null || loading} onChange={(v) => patchPolicyField({ auto_clear_chat: v ? 1 : 0 })} />}
      />
      <SettingsRow
        label="Submit with modifier+Enter"
        description="Send message with modifier+Enter when enabled"
        control={<ControlledSwitch checked={modEnter} disabled={policy == null || loading} onChange={(v) => patchPolicyField({ submit_with_mod_enter: v ? 1 : 0 })} />}
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
          style={{ padding: "6px 10px", background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, fontFamily: "inherit" }}
        >
          <option value="default">default</option>
          <option value="compact">compact</option>
          <option value="large">large</option>
        </select>
      </div>

      {savePolicyOk && <div style={{ fontSize: 11, color: "var(--color-success, var(--accent))", marginTop: 8 }}>Saved</div>}
      {policyErr    && <div style={{ fontSize: 11, color: "var(--color-error, var(--text-secondary))", marginTop: 8 }}>{policyErr}</div>}
    </div>
  );
}
