import React from 'react';
import Editor from '@monaco-editor/react';
import type { SettingsPanelModel } from '../../hooks/useSettingsData';

export function RulesSkillsSubagentInlineEditor({ data }: { data: SettingsPanelModel }) {
  const id = data.editingSubagentId;
  if (!id) return null;

  return (
    <div className="rounded-2xl border border-[var(--solar-cyan)]/25 bg-[var(--bg-panel)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-[var(--text-heading)]">Edit subagent</div>
          <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
            {String(data.subagentDraft.slug || id)}
          </div>
        </div>
        <button
          type="button"
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
          onClick={() => data.closeSubagentEdit()}
        >
          Close
        </button>
      </div>
      <div className="p-4 space-y-3 max-h-[min(70vh,640px)] overflow-y-auto custom-scrollbar">
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-[var(--text-muted)]">Display name</span>
          <input
            value={data.subagentDraft.display_name || ''}
            onChange={(e) => data.setSubagentDraft((p: Record<string, unknown>) => ({ ...p, display_name: e.target.value }))}
            className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-[var(--text-muted)]">Description</span>
          <textarea
            rows={2}
            value={data.subagentDraft.description || ''}
            onChange={(e) => data.setSubagentDraft((p: Record<string, unknown>) => ({ ...p, description: e.target.value }))}
            className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] resize-y"
          />
        </label>
        <div className="text-[11px] text-[var(--text-muted)]">Instructions (markdown)</div>
        <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-app)]">
          <Editor
            height="220px"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={data.subagentDraft.instructions_markdown || ''}
            onChange={(v) =>
              data.setSubagentDraft((p: Record<string, unknown>) => ({ ...p, instructions_markdown: v || '' }))
            }
            options={{ minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false }}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Default model</span>
            <select
              value={data.subagentDraft.default_model_id || ''}
              onChange={(e) =>
                data.setSubagentDraft((p: Record<string, unknown>) => ({ ...p, default_model_id: e.target.value }))
              }
              className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
            >
              <option value="">—</option>
              {data.modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Personality tone</span>
            <select
              value={data.subagentDraft.personality_tone || 'professional'}
              onChange={(e) =>
                data.setSubagentDraft((p: Record<string, unknown>) => ({ ...p, personality_tone: e.target.value }))
              }
              className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
            >
              <option value="professional">professional</option>
              <option value="casual">casual</option>
              <option value="technical">technical</option>
              <option value="concise">concise</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Access mode</span>
            <select
              value={data.subagentDraft.access_mode || 'read_write'}
              onChange={(e) =>
                data.setSubagentDraft((p: Record<string, unknown>) => ({ ...p, access_mode: e.target.value }))
              }
              className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
            >
              <option value="read_write">read_write</option>
              <option value="read_only">read_only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Sandbox mode</span>
            <select
              value={data.subagentDraft.sandbox_mode || 'workspace-write'}
              onChange={(e) =>
                data.setSubagentDraft((p: Record<string, unknown>) => ({ ...p, sandbox_mode: e.target.value }))
              }
              className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
            >
              <option value="workspace-write">workspace-write</option>
              <option value="workspace-read">workspace-read</option>
              <option value="isolated">isolated</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
            <span className="text-[var(--text-muted)]">Reasoning effort</span>
            <select
              value={data.subagentDraft.model_reasoning_effort || 'medium'}
              onChange={(e) =>
                data.setSubagentDraft((p: Record<string, unknown>) => ({
                  ...p,
                  model_reasoning_effort: e.target.value,
                }))
              }
              className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          Agent type:{' '}
          <span className="font-mono text-[var(--text-main)]">{String(data.subagentDraft.agent_type || 'custom')}</span>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--bg-app)]/60">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
          onClick={() => data.closeSubagentEdit()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
          onClick={() => void data.saveSubagentEdit()}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
