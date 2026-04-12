import { useState, useEffect } from "react";
import { ControlledSwitch, SettingsRow } from "../atoms";
import { AGENTSAM_WORKSPACE_QUERY, readTabComposerPrefs, writeTabComposerPrefs } from "../constants";

export function TabSettingsTab() {
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
