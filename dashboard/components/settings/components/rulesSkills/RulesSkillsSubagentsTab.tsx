import React from 'react';
import { Plus } from 'lucide-react';
import type { SettingsPanelModel } from '../../hooks/useSettingsData';
import { Toggle } from '../../settingsUi';
import { RulesSkillsEmpty, RulesSkillsIntro } from './rulesSkillsUi';

export function RulesSkillsSubagentsTab({ data }: { data: SettingsPanelModel }) {
  const activeCount = (data.subagents || []).filter((sa) => Number(sa.is_active ?? 1) === 1).length;

  return (
    <div className="flex flex-col gap-4">
      <RulesSkillsIntro tab="subagents" />

      {data.subagentsError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-200">
          {data.subagentsError}
        </div>
      ) : null}

      {data.subagentsLoading ? (
        <div className="text-[12px] text-[var(--text-muted)] animate-pulse">Loading subagents…</div>
      ) : null}

      {!data.subagentsLoading && !data.subagentsError && (data.subagents || []).length === 0 ? (
        <RulesSkillsEmpty
          message="No custom subagents for this workspace yet. Create focused agent profiles with their own instructions, model, and sandbox posture."
          action={
            <button
              type="button"
              onClick={() => data.openNewSubagentDrawer()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
            >
              <Plus size={14} /> New subagent
            </button>
          }
        />
      ) : null}

      {!data.subagentsLoading && (data.subagents || []).length > 0 ? (
        <>
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            <span>
              {activeCount} active · {(data.subagents || []).length} total
            </span>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden divide-y divide-[var(--border-subtle)]">
            {(data.subagents || []).map((sa) => (
              <div
                key={String(sa.id)}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg-hover)]/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center text-[12px] font-bold text-[var(--solar-cyan)]">
                    {String(sa.display_name || sa.id || '?')[0]?.toUpperCase?.() || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">
                      {String(sa.display_name || sa.id || '')}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate font-mono">
                      {String(sa.slug || '')}
                      {sa.description ? ` · ${String(sa.description)}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                    {String(sa.agent_type || 'custom')}
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                    {String(sa.access_mode || 'read_write')}
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
      ) : null}
    </div>
  );
}
