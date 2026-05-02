import React from 'react';
import type { AgentsamUserPolicy } from '../types';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { Toggle } from '../settingsUi';
import { AgentsAllowlists } from '../components/AgentsAllowlists';

export type AgentsSectionProps = { data: SettingsPanelModel; workspaceId?: string | null };

const POLICY_TOGGLES: { key: keyof AgentsamUserPolicy; label: string; desc: string }[] = [
  { key: 'browser_protection', label: 'Browser protection', desc: 'Require confirmation for risky browser actions' },
  { key: 'mcp_tools_protection', label: 'MCP tools protection', desc: 'Require approval/allowlist for MCP tools' },
  { key: 'file_deletion_protection', label: 'File deletion protection', desc: 'Block or require confirmation for deletes' },
  { key: 'external_file_protection', label: 'External file protection', desc: 'Protect files outside the workspace' },
  { key: 'web_search_enabled', label: 'Web search enabled', desc: 'Allow web search tool usage' },
  { key: 'auto_accept_web_search', label: 'Auto-accept web search', desc: 'Skip confirm step for web search' },
  { key: 'web_fetch_enabled', label: 'Web fetch enabled', desc: 'Allow fetching web pages' },
  { key: 'agent_autocomplete', label: 'Agent autocomplete', desc: 'Autocomplete suggestions from the agent' },
  { key: 'auto_clear_chat', label: 'Auto-clear chat', desc: 'Automatically clear chat between tasks' },
  { key: 'submit_with_mod_enter', label: 'Submit with Mod+Enter', desc: 'Use Cmd/Ctrl+Enter to submit' },
  { key: 'hierarchical_ignore', label: 'Hierarchical ignore', desc: 'Use hierarchical ignore resolution' },
  { key: 'ignore_symlinks', label: 'Ignore symlinks', desc: 'Skip symlink traversal' },
  { key: 'inline_diffs', label: 'Inline diffs', desc: 'Show inline diffs for edits' },
  { key: 'jump_next_diff_on_accept', label: 'Jump next diff on accept', desc: 'Auto-jump diff cursor after accepting' },
  { key: 'auto_format_on_agent_finish', label: 'Auto-format on finish', desc: 'Format files after agent completion' },
  { key: 'legacy_terminal_tool', label: 'Legacy terminal tool', desc: 'Use legacy terminal tool behavior' },
  { key: 'toolbar_on_selection', label: 'Toolbar on selection', desc: 'Show actions toolbar on text selection' },
  { key: 'auto_parse_links', label: 'Auto-parse links', desc: 'Parse links from text automatically' },
  { key: 'themed_diff_backgrounds', label: 'Themed diff backgrounds', desc: 'Use themed diff backgrounds' },
  { key: 'terminal_hint', label: 'Terminal hint', desc: 'Show terminal hints' },
  { key: 'terminal_preview_box', label: 'Terminal preview box', desc: 'Show terminal preview panel' },
  { key: 'collapse_auto_run_commands', label: 'Collapse auto-run commands', desc: 'Collapse auto-run command output' },
  { key: 'commit_attribution', label: 'Commit attribution', desc: 'Attribute commits to agent' },
  { key: 'pr_attribution', label: 'PR attribution', desc: 'Attribute PRs to agent' },
];

export function AgentsSection({ data, workspaceId }: AgentsSectionProps) {
  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Agents</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={data.agentsLoading}
            onClick={() => void data.loadAgentsSettings(workspaceId)}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={data.agentsSaving || !data.agentsPolicy}
            onClick={() => void data.saveAgentsPolicy()}
            className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 disabled:opacity-40"
          >
            {data.agentsSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {data.agentsError ? (
        <div className="text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 rounded-lg p-3">
          {data.agentsError}
        </div>
      ) : null}

      <div className="text-[11px] text-[var(--text-muted)]">
        Workspace scope:{' '}
        <code className="font-mono text-[var(--solar-cyan)]">{data.agentsWorkspaceId || workspaceId || '—'}</code>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4 space-y-3">
        {data.agentsLoading && !data.agentsPolicy ? (
          <div className="text-[12px] text-[var(--text-muted)]">Loading…</div>
        ) : null}

        {data.agentsPolicy ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Auto-run mode</span>
                <select
                  value={data.agentsPolicy.auto_run_mode}
                  onChange={(e) =>
                    data.setAgentsPolicy((p) => (p ? { ...p, auto_run_mode: e.target.value } : p))
                  }
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                >
                  <option value="disabled">disabled</option>
                  <option value="manual">manual</option>
                  <option value="allowlist">allowlist</option>
                  <option value="auto">full_auto</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Text size</span>
                <select
                  value={data.agentsPolicy.text_size || 'default'}
                  onChange={(e) =>
                    data.setAgentsPolicy((p) => (p ? { ...p, text_size: e.target.value } : p))
                  }
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                >
                  <option value="small">small</option>
                  <option value="default">default</option>
                  <option value="large">large</option>
                  <option value="xl">xl</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Max tabs</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={data.agentsPolicy.max_tab_count}
                  onChange={(e) =>
                    data.setAgentsPolicy((p) =>
                      p ? { ...p, max_tab_count: Number(e.target.value || 0) } : p,
                    )
                  }
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-[var(--text-muted)]">Voice submit keyword</span>
                <input
                  type="text"
                  value={data.agentsPolicy.voice_submit_keyword || ''}
                  onChange={(e) =>
                    data.setAgentsPolicy((p) =>
                      p ? { ...p, voice_submit_keyword: e.target.value } : p,
                    )
                  }
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
              </label>
            </div>

            {POLICY_TOGGLES.map((row) => {
              const k = row.key;
              const on = Number(data.agentsPolicy[k] as unknown) === 1;
              return (
                <div
                  key={row.key}
                  className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50"
                >
                  <div className="min-w-0 pr-3">
                    <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{row.desc}</div>
                  </div>
                  <Toggle
                    on={on}
                    onChange={(v) =>
                      data.setAgentsPolicy((p) => (p ? { ...p, [k]: v ? 1 : 0 } : p))
                    }
                  />
                </div>
              );
            })}
          </>
        ) : null}
      </div>

      <AgentsAllowlists data={data} workspaceId={workspaceId} />
    </div>
  );
}
