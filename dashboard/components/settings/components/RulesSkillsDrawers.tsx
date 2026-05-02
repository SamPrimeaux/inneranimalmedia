import React from 'react';
import Editor from '@monaco-editor/react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { Toggle } from '../settingsUi';

export type RulesSkillsDrawersProps = {
  data: SettingsPanelModel;
};

export function RulesSkillsDrawers({ data }: RulesSkillsDrawersProps) {
  return (
    <>
      {data.skillDrawerOpen && (
        <div className="fixed inset-0 z-[250]">
          <div
            className="absolute inset-0 bg-[var(--text-main)]/40"
            onClick={() => data.setSkillDrawerOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && data.setSkillDrawerOpen(false)}
            role="presentation"
          />
          <div className="absolute top-0 right-0 h-full w-[480px] max-w-[92vw] bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="text-[12px] font-semibold text-[var(--text-heading)]">
                {data.editingSkill ? 'Edit Skill' : 'New Skill'}
              </div>
              <button
                type="button"
                className="text-[11px] text-[var(--text-muted)]"
                onClick={() => data.setSkillDrawerOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Name</span>
                <input
                  value={data.skillDraft.name || ''}
                  onChange={(e) => data.setSkillDraft((p: any) => ({ ...p, name: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Description</span>
                <textarea
                  rows={3}
                  value={data.skillDraft.description || ''}
                  onChange={(e) => data.setSkillDraft((p: any) => ({ ...p, description: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                />
              </label>
              <div className="text-[11px] text-[var(--text-muted)]">Content (markdown)</div>
              <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <Editor
                  height="300px"
                  defaultLanguage="markdown"
                  theme="vs-dark"
                  value={data.skillDraft.content_markdown || ''}
                  onChange={(v) => data.setSkillDraft((p: any) => ({ ...p, content_markdown: v || '' }))}
                  options={{ minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false }}
                />
              </div>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Slash trigger</span>
                <input
                  placeholder="/myskill"
                  value={data.skillDraft.slash_trigger || ''}
                  onChange={(e) => data.setSkillDraft((p: any) => ({ ...p, slash_trigger: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Globs</span>
                <input
                  placeholder="**/*.ts"
                  value={data.skillDraft.globs || ''}
                  onChange={(e) => data.setSkillDraft((p: any) => ({ ...p, globs: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                />
              </label>
              <div className="flex items-center justify-between py-2">
                <div className="text-[11px] text-[var(--text-muted)]">Always apply</div>
                <Toggle
                  on={!!data.skillDraft.always_apply}
                  onChange={(v) => data.setSkillDraft((p: any) => ({ ...p, always_apply: v }))}
                />
              </div>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Tags</span>
                <input
                  placeholder="tag1,tag2"
                  value={data.skillDraft.tags || ''}
                  onChange={(e) => data.setSkillDraft((p: any) => ({ ...p, tags: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                />
              </label>
            </div>
            <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--bg-app)]">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                onClick={() => data.setSkillDrawerOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
                onClick={() => void data.saveSkillDrawer()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {data.subagentDrawerOpen && (
        <div className="fixed inset-0 z-[250]">
          <div
            className="absolute inset-0 bg-[var(--text-main)]/40"
            onClick={() => data.setSubagentDrawerOpen(false)}
            role="presentation"
          />
          <div className="absolute top-0 right-0 h-full w-[480px] max-w-[92vw] bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="text-[12px] font-semibold text-[var(--text-heading)]">Edit Subagent</div>
              <button
                type="button"
                className="text-[11px] text-[var(--text-muted)]"
                onClick={() => data.setSubagentDrawerOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Display name</span>
                <input
                  value={data.subagentDraft.display_name || ''}
                  onChange={(e) => data.setSubagentDraft((p: any) => ({ ...p, display_name: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Description</span>
                <textarea
                  rows={3}
                  value={data.subagentDraft.description || ''}
                  onChange={(e) => data.setSubagentDraft((p: any) => ({ ...p, description: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                />
              </label>
              <div className="text-[11px] text-[var(--text-muted)]">Instructions (markdown)</div>
              <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <Editor
                  height="300px"
                  defaultLanguage="markdown"
                  theme="vs-dark"
                  value={data.subagentDraft.instructions_markdown || ''}
                  onChange={(v) => data.setSubagentDraft((p: any) => ({ ...p, instructions_markdown: v || '' }))}
                  options={{ minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false }}
                />
              </div>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Default model</span>
                <select
                  value={data.subagentDraft.default_model_id || ''}
                  onChange={(e) => data.setSubagentDraft((p: any) => ({ ...p, default_model_id: e.target.value }))}
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
                  onChange={(e) => data.setSubagentDraft((p: any) => ({ ...p, personality_tone: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                >
                  <option value="professional">professional</option>
                  <option value="casual">casual</option>
                  <option value="technical">technical</option>
                  <option value="concise">concise</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Sandbox mode</span>
                <select
                  value={data.subagentDraft.sandbox_mode || 'workspace-read'}
                  onChange={(e) => data.setSubagentDraft((p: any) => ({ ...p, sandbox_mode: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                >
                  <option value="workspace-write">workspace-write</option>
                  <option value="workspace-read">workspace-read</option>
                  <option value="isolated">isolated</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Reasoning effort</span>
                <select
                  value={data.subagentDraft.model_reasoning_effort || 'medium'}
                  onChange={(e) =>
                    data.setSubagentDraft((p: any) => ({ ...p, model_reasoning_effort: e.target.value }))
                  }
                  className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
              <div className="text-[11px] text-[var(--text-muted)]">Agent type</div>
              <div className="text-[11px] text-[var(--text-main)] font-mono">
                {String(data.subagentDraft.agent_type || '—')}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--bg-app)]">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                onClick={() => data.setSubagentDrawerOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
                onClick={() => void data.saveSubagentDrawer()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
