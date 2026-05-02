import React from 'react';
import type { ModelsTabId } from '../hooks/useSettingsSections';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { Toggle, formatCompactNumber, formatUsdMaybe } from '../settingsUi';

export type AIModelsSectionProps = {
  data: SettingsPanelModel;
  modelsTab: ModelsTabId;
  setModelsTab: (v: ModelsTabId) => void;
};

export function AIModelsSection({ data, modelsTab, setModelsTab }: AIModelsSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
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

      {data.modelsError ? (
        <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-xl px-3 py-2">
          {data.modelsError}
        </div>
      ) : null}

      {data.modelsLoading && !data.settingsModels ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading models…</div>
      ) : null}

      {!data.settingsModels ? (
        <div className="text-[12px] text-[var(--text-muted)]">No models data.</div>
      ) : null}

      {data.settingsModels && modelsTab === 'models' && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
          <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
            <div className="col-span-1">Provider</div>
            <div className="col-span-2">Name</div>
            <div className="col-span-1">Context</div>
            <div className="col-span-1">Cost/MTok</div>
            <div className="col-span-1 text-right">Picker · Active</div>
          </div>

          {(() => {
            const rows = data.settingsModels.models || [];
            const byProvider = rows.reduce<Record<string, typeof rows>>((acc, r) => {
              const p = String(r.provider || 'unknown');
              (acc[p] ||= []).push(r);
              return acc;
            }, {});
            const providers = Object.keys(byProvider).sort((a, b) => a.localeCompare(b));
            const providerColor = (p: string) => {
              const k = p.toLowerCase();
              if (k === 'anthropic')
                return 'bg-[var(--color-provider-anthropic,var(--accent))]/15 text-[var(--color-provider-anthropic,var(--accent))]';
              if (k === 'openai')
                return 'bg-[var(--color-provider-openai,var(--color-success))]/15 text-[var(--color-provider-openai,var(--color-success))]';
              if (k === 'google')
                return 'bg-[var(--color-provider-google,var(--color-warning))]/15 text-[var(--color-provider-google,var(--color-warning))]';
              return 'bg-[var(--color-muted)]/15 text-[var(--color-muted)]';
            };
            return providers.map((p) => (
              <div key={p}>
                <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                  <span
                    className={`inline-flex items-center gap-2 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${providerColor(p)}`}
                  >
                    {p}
                  </span>
                </div>
                {byProvider[p].map((m) => {
                  const inactive = !Number(m.is_active);
                  const ctx =
                    m.context_window != null ? formatCompactNumber(Number(m.context_window)) : '—';
                  const costIn = formatUsdMaybe(m.cost_per_input_mtok as number | null | undefined);
                  const costOut = formatUsdMaybe(m.cost_per_output_mtok as number | null | undefined);
                  return (
                    <div
                      key={m.id}
                      className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] items-center text-[11px]"
                      style={{ opacity: inactive ? 0.45 : 1 }}
                    >
                      <div className="col-span-1 text-[var(--text-muted)]">{m.provider}</div>
                      <div className="col-span-2 min-w-0">
                        <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{m.name}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{m.id}</div>
                      </div>
                      <div className="col-span-1 text-[var(--text-main)] font-mono">{ctx}</div>
                      <div className="col-span-1 text-[var(--text-muted)]">
                        <div>{costIn} in</div>
                        <div>{costOut} out</div>
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-2">
                        <Toggle
                          on={!!Number(m.show_in_picker)}
                          onChange={(v) => void data.toggleModelField(m.id, 'show_in_picker', v)}
                        />
                        <Toggle
                          on={!!Number(m.is_active)}
                          onChange={(v) => void data.toggleModelField(m.id, 'is_active', v)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      )}

      {data.settingsModels && modelsTab === 'routing' && (
        <div className="flex flex-col gap-3">
          {Array.isArray(data.settingsModels.tiers) && data.settingsModels.tiers.length === 0 ? (
            <div className="text-[12px] text-[var(--text-muted)]">No tiers configured for this workspace.</div>
          ) : null}

          {(Array.isArray(data.settingsModels.tiers) ? data.settingsModels.tiers : []).map((tRaw: any) => {
            const tierId = String(tRaw?.id || '');
            const tierLevel = Number(tRaw?.tier_level ?? 0);
            const tierName = String(tRaw?.tier_name ?? '');
            const modelId = String(tRaw?.model_id ?? '');
            const isActive = !!Number(tRaw?.is_active ?? 0);
            const esc = Number(tRaw?.escalate_if_confidence_below ?? 0);
            const maxCtx = tRaw?.max_context_tokens != null ? String(tRaw.max_context_tokens) : '';

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
                              tiers: (prev.tiers || []).map((x: any) =>
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
                                tiers: (prev.tiers || []).map((x: any) =>
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
                      {data.modelOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
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
                                tiers: (prev.tiers || []).map((x: any) =>
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
                                tiers: (prev.tiers || []).map((x: any) =>
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
        </div>
      )}
    </div>
  );
}
