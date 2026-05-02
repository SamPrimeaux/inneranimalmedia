import React from 'react';
import type { SettingsPanelModel } from '../../hooks/useSettingsData';
import { Toggle } from '../../settingsUi';

export function RulesSkillsSubagentsTab({ data }: { data: SettingsPanelModel }) {
  return (
    <>
      {data.subagentsError ? (
        <div className="text-[11px] text-[var(--color-danger)]">{data.subagentsError}</div>
      ) : null}
      {data.subagentsLoading ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading subagents…</div>
      ) : null}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
        {(data.subagents || []).map((sa) => (
          <div
            key={String(sa.id)}
            className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center text-[12px] font-bold text-[var(--solar-cyan)]">
                {String(sa.display_name || sa.id || '?')[0]?.toUpperCase?.() || '?'}
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">
                  {String(sa.display_name || sa.id || '')}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">
                  {String(sa.description || '')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                {String(sa.agent_type || 'subagent')}
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                {String(sa.sandbox_mode || '—')}
              </span>
              <Toggle
                on={!!Number(sa.is_active ?? 1)}
                onChange={(v) => {
                  const prev = data.subagents;
                  data.setSubagents((p) =>
                    p.map((x) => (String(x.id) === String(sa.id) ? { ...x, is_active: v ? 1 : 0 } : x)),
                  );
                  void data.patchSubagentActive(String(sa.id), v, prev);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  data.setSubagentDraft({ ...sa });
                  data.setSubagentDrawerOpen(true);
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
