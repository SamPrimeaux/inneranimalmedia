import React from 'react';
import type { SettingsPanelModel } from '../../hooks/useSettingsData';
import { Toggle } from '../../settingsUi';

export function RulesSkillsRulesTab({ data }: { data: SettingsPanelModel }) {
  return (
    <>
      {data.rulesError ? (
        <div className="text-[11px] text-[var(--color-danger)]">{data.rulesError}</div>
      ) : null}
      {data.rulesLoading ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading rules…</div>
      ) : null}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
        {data.rules.map((r) => (
          <div
            key={String(r.id)}
            className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]"
          >
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">
                {String(r.title || r.name || r.id)}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                  v{Number(r.version || 1)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Toggle
                on={!!Number(r.is_active ?? 1)}
                onChange={(v) => {
                  const prev = data.rules;
                  data.setRules((p) =>
                    p.map((x) => (String(x.id) === String(r.id) ? { ...x, is_active: v ? 1 : 0 } : x)),
                  );
                  void data.patchRuleActive(String(r.id), v, prev);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  data.setRuleDraft({
                    id: r.id,
                    title: r.title || r.name || '',
                    body_markdown: r.body_markdown || '',
                    version: r.version || 1,
                  });
                }}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
