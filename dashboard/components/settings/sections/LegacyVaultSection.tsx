import React, { useCallback, useEffect, useState } from 'react';
import { formatVaultCreated } from '../settingsUi';

type LlmVaultRow = {
  id: string;
  provider?: string;
  key_name?: string;
  masked?: string;
  created_at?: string | number | null;
};

type VaultProvider = 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY';

export type LegacyVaultSectionProps = {
  /** When true, show compact intro copy for Keys page placement. */
  embeddedInKeys?: boolean;
};

export function LegacyVaultSection({ embeddedInKeys = false }: LegacyVaultSectionProps) {
  const [llmKeys, setLlmKeys] = useState<LlmVaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [llmBusy, setLlmBusy] = useState<string | null>(null);
  const [vaultProvider, setVaultProvider] = useState<VaultProvider>('OPENAI_API_KEY');
  const [vaultKeyValue, setVaultKeyValue] = useState('');

  const refreshLlmKeys = useCallback(() => {
    setLoading(true);
    fetch('/api/vault/llm-keys', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { keys?: LlmVaultRow[] }) => setLlmKeys(Array.isArray(d.keys) ? d.keys : []))
      .catch(() => setLlmKeys([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshLlmKeys();
  }, [refreshLlmKeys]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#legacy-vault') return;
    const el = document.getElementById('legacy-vault');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading]);

  const removeLlmKey = async (id: string) => {
    setLlmBusy(id);
    try {
      await fetch(`/api/vault/llm-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      refreshLlmKeys();
    } catch {
      /* ignore */
    } finally {
      setLlmBusy(null);
    }
  };

  const saveVaultKey = async () => {
    const value = vaultKeyValue.trim();
    if (!value) return;
    setLlmBusy(vaultProvider);
    try {
      const r = await fetch('/api/vault/store', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_name: vaultProvider, value }),
      });
      if (r.ok) {
        setVaultKeyValue('');
        refreshLlmKeys();
      }
    } catch {
      /* ignore */
    } finally {
      setLlmBusy(null);
    }
  };

  return (
    <div id="legacy-vault" className="scroll-mt-6 flex flex-col gap-4">
      <div className="space-y-1">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Legacy vault slots
        </h3>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          {embeddedInKeys
            ? 'Older per-slot vault keys (OpenAI / Anthropic / Gemini env names). Prefer provider keys above for new BYOK; keep these only if Agent Sam or a workflow still reads vault slots.'
            : 'Legacy BYOK slots. Prefer provider keys at the top of Keys & Secrets for new credentials.'}
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4 text-[11px] text-[var(--text-muted)]">
          Loading vault slots…
        </div>
      ) : llmKeys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-app)] p-6 text-[12px] text-[var(--text-muted)]">
          No legacy vault keys stored yet.
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
          <table className="w-full text-[11px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">Provider</th>
                <th className="px-3 py-2 font-semibold">Masked</th>
                <th className="px-3 py-2 font-semibold">Added</th>
                <th className="px-3 py-2 font-semibold w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {llmKeys.map((k) => (
                <tr key={k.id}>
                  <td className="px-3 py-2 text-[var(--text-main)]">{k.provider || k.key_name}</td>
                  <td className="px-3 py-2 font-mono text-[var(--solar-cyan)]">{k.masked}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{formatVaultCreated(k.created_at)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={llmBusy === k.id}
                      onClick={() => void removeLlmKey(k.id)}
                      className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Add legacy vault key
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Provider</span>
            <select
              value={vaultProvider}
              onChange={(e) => setVaultProvider(e.target.value as VaultProvider)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
            >
              <option value="OPENAI_API_KEY">OpenAI</option>
              <option value="ANTHROPIC_API_KEY">Anthropic</option>
              <option value="GEMINI_API_KEY">Gemini</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
            <span className="text-[var(--text-muted)]">Key name (vault slot)</span>
            <input
              type="text"
              readOnly
              value={vaultProvider}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] font-mono text-[var(--text-muted)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
            <span className="text-[var(--text-muted)]">API key</span>
            <input
              type="password"
              autoComplete="off"
              value={vaultKeyValue}
              onChange={(e) => setVaultKeyValue(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={llmBusy === vaultProvider || !vaultKeyValue.trim()}
          onClick={() => void saveVaultKey()}
          className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
        >
          Save
        </button>
      </section>
    </div>
  );
}
