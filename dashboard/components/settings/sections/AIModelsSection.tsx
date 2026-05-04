import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModelsTabId } from '../hooks/useSettingsSections';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { Toggle } from '../settingsUi';

export type AIModelsSectionProps = {
  data: SettingsPanelModel;
  modelsTab: ModelsTabId;
  setModelsTab: (v: ModelsTabId) => void;
};

type CatalogModel = {
  model_key: string;
  display_name: string;
  status: string;
  show_in_picker: boolean;
  picker_eligible: boolean;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_cache: boolean;
  supports_thinking: boolean;
  supports_structured_output: boolean;
  supports_responses_api: boolean;
  context_max_tokens: number | null;
  input_rate_per_mtok: number | null;
  output_rate_per_mtok: number | null;
  size_class: string;
  sort_order: number;
};

type CatalogProvider = {
  provider: string;
  api_platform: string;
  has_personal_key: boolean;
  key_preview: string | null;
  cost_30d: number;
  tokens_30d: number;
  calls_30d: number;
  models: CatalogModel[];
};

type CatalogResponse = { providers: CatalogProvider[] };

const SIZE_ORDER: Record<string, number> = {
  large: 0,
  medium: 1,
  small: 2,
  nano: 3,
};

function providerDisplayName(slug: string): string {
  const s = String(slug || '').toLowerCase();
  if (s === 'openai') return 'OpenAI';
  if (s === 'anthropic') return 'Anthropic';
  if (s === 'google_ai' || s === 'google') return 'Google';
  if (s === 'cloudflare' || s === 'workers_ai') return 'Cloudflare';
  if (s === 'ollama') return 'Ollama';
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Other';
}

function sizeRank(sc: string): number {
  const k = String(sc || '').trim().toLowerCase();
  return SIZE_ORDER[k] != null ? SIZE_ORDER[k] : 50;
}

function formatCtxTok(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function formatUsdPerMtok(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)} / MTok`;
}

export function AIModelsSection({ data, modelsTab, setModelsTab }: AIModelsSectionProps) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openConnectSlug, setOpenConnectSlug] = useState<string | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [keySubmitErr, setKeySubmitErr] = useState<Record<string, string | null>>({});
  const [keyBusy, setKeyBusy] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const r = await fetch('/api/settings/ai-models', { credentials: 'same-origin' });
      const j = (await r.json().catch(() => ({}))) as CatalogResponse & { error?: string };
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setCatalog({ providers: Array.isArray(j.providers) ? j.providers : [] });
    } catch (e) {
      setCatalog(null);
      setCatalogError(e instanceof Error ? e.message : 'Failed to load AI models');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const summary = useMemo(() => {
    const provs = catalog?.providers || [];
    let activeModels = 0;
    let monthUsd = 0;
    for (const p of provs) {
      monthUsd += Number(p.cost_30d) || 0;
      for (const m of p.models || []) {
        if (String(m.status || '').toLowerCase() === 'active') activeModels += 1;
      }
    }
    const totalProv = provs.length;
    const withPersonal = provs.filter((p) => p.has_personal_key).length;
    return {
      activeModels,
      withPersonal,
      totalProv,
      monthUsd,
    };
  }, [catalog]);

  const patchModel = useCallback(
    async (modelKey: string, patch: { show_in_picker?: boolean; status?: 'active' | 'inactive' }) => {
      setCatalog((prev) => {
        if (!prev) return prev;
        return {
          providers: prev.providers.map((p) => ({
            ...p,
            models: p.models.map((m) =>
              m.model_key === modelKey
                ? {
                    ...m,
                    ...(patch.show_in_picker != null ? { show_in_picker: patch.show_in_picker } : {}),
                    ...(patch.status != null ? { status: patch.status } : {}),
                  }
                : m,
            ),
          })),
        };
      });
      try {
        const r = await fetch(`/api/settings/ai-models/${encodeURIComponent(modelKey)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(typeof (j as { error?: string }).error === 'string' ? (j as { error: string }).error : `Save failed (${r.status})`);
        }
      } catch (e) {
        void loadCatalog();
        setToast(e instanceof Error ? e.message : 'Save failed');
        window.setTimeout(() => setToast(null), 5000);
      }
    },
    [loadCatalog],
  );

  const submitKey = async (providerSlug: string) => {
    const raw = String(keyInputs[providerSlug] || '').trim();
    if (!raw) {
      setKeySubmitErr((s) => ({ ...s, [providerSlug]: 'Paste an API key first.' }));
      return;
    }
    setKeyBusy(providerSlug);
    setKeySubmitErr((s) => ({ ...s, [providerSlug]: null }));
    try {
      const r = await fetch('/api/settings/ai-models/keys', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerSlug, keyName: 'default', rawKey: raw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      setOpenConnectSlug(null);
      setKeyInputs((k) => ({ ...k, [providerSlug]: '' }));
      await loadCatalog();
    } catch (e) {
      setKeySubmitErr((s) => ({
        ...s,
        [providerSlug]: e instanceof Error ? e.message : 'Save failed',
      }));
    } finally {
      setKeyBusy(null);
    }
  };

  const deleteKey = async (providerSlug: string) => {
    try {
      const r = await fetch(`/api/settings/ai-models/keys/${encodeURIComponent(providerSlug)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Remove failed (${r.status})`);
      await loadCatalog();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Remove failed');
      window.setTimeout(() => setToast(null), 5000);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">AI Models</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModelsTab('models')}
            className={`px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
              modelsTab === 'models'
                ? 'border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] bg-[var(--solar-cyan)]/10'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            Models
          </button>
          <button
            type="button"
            onClick={() => setModelsTab('routing')}
            className={`px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
              modelsTab === 'routing'
                ? 'border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] bg-[var(--solar-cyan)]/10'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            Routing
          </button>
        </div>
      </div>

      {toast ? (
        <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-xl px-3 py-2">
          {toast}
        </div>
      ) : null}

      {modelsTab === 'models' ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 bg-[var(--bg-app)]">
            <span className="text-[var(--text-main)]">
              <span className="font-semibold text-[var(--solar-cyan)]">{summary.activeModels}</span> models active
            </span>
            <span className="text-[var(--border-subtle)]">·</span>
            <span>
              <span className="font-semibold text-[var(--text-main)]">
                {summary.withPersonal}/{summary.totalProv || 0}
              </span>{' '}
              providers with personal keys
            </span>
            <span className="text-[var(--border-subtle)]">·</span>
            <span>
              <span className="font-semibold text-[var(--text-main)]">${summary.monthUsd.toFixed(2)}</span> this month
            </span>
          </div>

          {catalogError ? (
            <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-xl px-3 py-2">
              {catalogError}
            </div>
          ) : null}

          {catalogLoading && !catalog ? (
            <div className="text-[12px] text-[var(--text-muted)]">Loading catalog…</div>
          ) : null}

          {!catalogLoading && catalog && catalog.providers.length === 0 ? (
            <div className="text-[12px] text-[var(--text-muted)]">No models in catalog.</div>
          ) : null}

          {catalog?.providers.map((p) => {
            const slug = p.provider;
            const label = providerDisplayName(slug);
            const month = Number(p.cost_30d) || 0;
            const modelsSorted = [...(p.models || [])].sort((a, b) => {
              const sr = sizeRank(a.size_class) - sizeRank(b.size_class);
              if (sr !== 0) return sr;
              return (a.sort_order || 0) - (b.sort_order || 0);
            });
            const groups = new Map<string, CatalogModel[]>();
            for (const m of modelsSorted) {
              const g = String(m.size_class || '').trim().toLowerCase() || 'other';
              if (!groups.has(g)) groups.set(g, []);
              groups.get(g)!.push(m);
            }
            const groupKeys = Array.from(groups.keys()).sort((a, b) => sizeRank(a) - sizeRank(b));

            return (
              <div
                key={slug}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-[13px] font-semibold text-[var(--text-main)] truncate">{label}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                        p.has_personal_key
                          ? 'border-[var(--color-success)]/40 text-[var(--color-success)] bg-[var(--color-success)]/10'
                          : 'border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] bg-[var(--solar-cyan)]/10'
                      }`}
                    >
                      {p.has_personal_key ? 'Personal Key' : 'Platform Key'}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      ${month.toFixed(2)} this month
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.has_personal_key ? (
                      <button
                        type="button"
                        onClick={() => void deleteKey(slug)}
                        className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-muted)]"
                      >
                        Remove key
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setOpenConnectSlug((cur) => (cur === slug ? null : slug))
                      }
                      className="text-[11px] px-3 py-1.5 rounded-lg border border-[var(--solar-cyan)]/50 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/10"
                    >
                      Connect API Key
                    </button>
                  </div>
                </div>

                {openConnectSlug === slug ? (
                  <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-col gap-2 bg-[var(--bg-panel)]">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={`Paste your ${label} API key`}
                      value={keyInputs[slug] || ''}
                      onChange={(e) => setKeyInputs((k) => ({ ...k, [slug]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-main)]"
                    />
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Encrypted at rest — never stored in plaintext
                    </p>
                    {keySubmitErr[slug] ? (
                      <p className="text-[11px] text-[var(--color-danger)]">{keySubmitErr[slug]}</p>
                    ) : null}
                    <button
                      type="button"
                      disabled={keyBusy === slug}
                      onClick={() => void submitKey(slug)}
                      className="self-start text-[11px] px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 disabled:opacity-50"
                    >
                      {keyBusy === slug ? 'Working…' : 'Validate & Save'}
                    </button>
                  </div>
                ) : null}

                <div className="overflow-x-auto">
                  {groupKeys.map((gk) => (
                    <div key={`${slug}-${gk}`}>
                      <div className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] bg-[var(--bg-app)] border-b border-[var(--border-subtle)]">
                        {gk === 'other' ? 'Other sizes' : `${gk.charAt(0).toUpperCase()}${gk.slice(1)}`}
                      </div>
                      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.5fr)_minmax(0,0.7fr)_minmax(0,0.45fr)_minmax(0,0.6fr)] gap-0 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        <div className="px-2">Model</div>
                        <div className="px-2">Context</div>
                        <div className="px-2">Input / Output</div>
                        <div className="px-2 text-center">Picker</div>
                        <div className="px-2 text-center">Status</div>
                      </div>
                      {(groups.get(gk) || []).map((m) => {
                        const inactive = String(m.status || '').toLowerCase() !== 'active';
                        return (
                          <div
                            key={m.model_key}
                            className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.5fr)_minmax(0,0.7fr)_minmax(0,0.45fr)_minmax(0,0.6fr)] gap-0 px-2 py-2 border-b border-[var(--border-subtle)] items-center text-[11px] ${
                              inactive ? 'opacity-50' : ''
                            }`}
                          >
                            <div className="px-2 min-w-0">
                              <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">
                                {m.display_name || m.model_key}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {m.supports_tools ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/25">
                                    Tools
                                  </span>
                                ) : null}
                                {m.supports_vision ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/25">
                                    Vision
                                  </span>
                                ) : null}
                                {m.supports_cache ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/25">
                                    Cache
                                  </span>
                                ) : null}
                                {m.supports_thinking ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/25">
                                    Thinking
                                  </span>
                                ) : null}
                                {m.supports_structured_output ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-teal,var(--solar-cyan))]/15 text-[var(--color-teal,var(--solar-cyan))] border border-[var(--color-teal,var(--solar-cyan))]/25">
                                    Structured
                                  </span>
                                ) : null}
                                {m.supports_responses_api ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--text-muted)]/15 text-[var(--text-muted)] border border-[var(--border-subtle)]">
                                    Responses API
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="px-2 text-[var(--text-main)] font-mono">
                              {formatCtxTok(m.context_max_tokens)}
                            </div>
                            <div className="px-2 text-[var(--text-muted)] leading-tight">
                              <div>{formatUsdPerMtok(m.input_rate_per_mtok)}</div>
                              <div>{formatUsdPerMtok(m.output_rate_per_mtok)}</div>
                            </div>
                            <div className="px-2 flex justify-center">
                              <Toggle
                                on={!!m.show_in_picker}
                                onChange={(v) => void patchModel(m.model_key, { show_in_picker: v })}
                              />
                            </div>
                            <div className="px-2 flex flex-col items-center gap-1">
                              <span
                                className={`text-[10px] font-bold uppercase ${
                                  inactive ? 'text-[var(--text-muted)]' : 'text-[var(--color-success)]'
                                }`}
                              >
                                {inactive ? 'Inactive' : 'Active'}
                              </span>
                              <Toggle
                                on={!inactive}
                                onChange={(v) =>
                                  void patchModel(m.model_key, {
                                    status: v ? 'active' : 'inactive',
                                  })
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      ) : null}

      {modelsTab === 'routing' ? (
        <div className="flex flex-col gap-3">
          {data.modelsError ? (
            <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-xl px-3 py-2">
              {data.modelsError}
            </div>
          ) : null}

          {data.modelsLoading && !data.settingsModels ? (
            <div className="text-[12px] text-[var(--text-muted)]">Loading routing…</div>
          ) : null}

          {!data.settingsModels ? (
            <div className="text-[12px] text-[var(--text-muted)]">No routing data.</div>
          ) : null}

          {data.settingsModels && (
            <>
              {Array.isArray(data.settingsModels.tiers) && data.settingsModels.tiers.length === 0 ? (
                <div className="text-[12px] text-[var(--text-muted)]">No tiers configured for this workspace.</div>
              ) : null}

              {(Array.isArray(data.settingsModels.tiers) ? data.settingsModels.tiers : []).map((tRaw: unknown) => {
                const tr = tRaw as Record<string, unknown>;
                const tierId = String(tr?.id || '');
                const tierLevel = Number(tr?.tier_level ?? 0);
                const tierName = String(tr?.tier_name ?? '');
                const modelId = String(tr?.model_id ?? '');
                const isActive = !!Number(tr?.is_active ?? 0);
                const esc = Number(tr?.escalate_if_confidence_below ?? 0);
                const maxCtx = tr?.max_context_tokens != null ? String(tr.max_context_tokens) : '';

                return (
                  <div
                    key={tierId || `${tierLevel}`}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                          T{tierLevel}
                        </span>
                        <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">
                          {tierName || 'Tier'}
                        </div>
                      </div>
                      <Toggle
                        on={isActive}
                        onChange={(v) => {
                          data.setSettingsModels((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  tiers: (prev.tiers || []).map((x: Record<string, unknown>) =>
                                    String(x?.id) === tierId ? { ...x, is_active: v ? 1 : 0 } : x,
                                  ),
                                }
                              : prev,
                          );
                          data.patchTierDebounced(tierId, { is_active: v ? 1 : 0 });
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                          Model
                        </div>
                        <select
                          value={modelId}
                          onChange={(e) => {
                            const v = e.target.value;
                            data.setSettingsModels((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    tiers: (prev.tiers || []).map((x: Record<string, unknown>) =>
                                      String(x?.id) === tierId ? { ...x, model_id: v } : x,
                                    ),
                                  }
                                : prev,
                            );
                            data.patchTierDebounced(tierId, { model_id: v });
                          }}
                          className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)]"
                        >
                          <option value="">—</option>
                          {data.modelOptions.map((mo) => (
                            <option key={mo.id} value={mo.id}>
                              {mo.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                          Max context tokens
                        </div>
                        <input
                          value={maxCtx}
                          onChange={(e) => {
                            const v = e.target.value;
                            data.setSettingsModels((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    tiers: (prev.tiers || []).map((x: Record<string, unknown>) =>
                                      String(x?.id) === tierId
                                        ? { ...x, max_context_tokens: v === '' ? null : Number(v) }
                                        : x,
                                    ),
                                  }
                                : prev,
                            );
                            data.patchTierDebounced(tierId, {
                              max_context_tokens: v === '' ? null : Number(v),
                            });
                          }}
                          inputMode="numeric"
                          className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)]"
                          placeholder="e.g. 120000"
                        />
                      </div>

                      <div className="flex flex-col gap-1 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                            Escalate if confidence below
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">
                            {Math.round((Number.isFinite(esc) ? esc : 0) * 100)}%
                          </div>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={Number.isFinite(esc) ? esc : 0}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            data.setSettingsModels((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    tiers: (prev.tiers || []).map((x: Record<string, unknown>) =>
                                      String(x?.id) === tierId ? { ...x, escalate_if_confidence_below: v } : x,
                                    ),
                                  }
                                : prev,
                            );
                            data.patchTierDebounced(tierId, { escalate_if_confidence_below: v });
                          }}
                          className="w-full accent-[var(--solar-cyan)]"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
