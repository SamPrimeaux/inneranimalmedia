import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import type { AgentsamUserPolicy } from '../types';
import { AllowlistChipInput } from './AllowlistChipInput';
import {
  McpToolPreferenceControl,
  type McpToolPreference,
} from '../../mcp/McpToolPreferenceControl';

export type AgentsAllowlistsProps = {
  data: SettingsPanelModel;
  workspaceId?: string | null;
  policy: AgentsamUserPolicy | null;
  onPolicyChange: (patch: Partial<AgentsamUserPolicy>) => void;
};

function SubsectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      {children}
    </div>
  );
}

export function AgentsAllowlists({ data, workspaceId, policy, onPolicyChange }: AgentsAllowlistsProps) {
  const ws = data.agentsWorkspaceId || workspaceId || '';
  const groups = data.agentsMcpGroups || [];
  const prefs = data.agentsMcpGroupPrefs || {};
  const disabled = data.agentsSaving || data.agentsLoading;
  const mcpKeys = data.agentsMcp.map((t) => t.tool_key);

  const setGroupPref = (groupKey: string, value: McpToolPreference) => {
    const next = { ...prefs, [groupKey]: value };
    data.setAgentsMcpGroupPrefs(next);
    void data.saveAgentsMcpGroupPreferences(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SubsectionLabel>Run mode</SubsectionLabel>
        <select
          value={policy?.auto_run_mode || 'allowlist'}
          disabled={!policy || disabled}
          onChange={(e) => onPolicyChange({ auto_run_mode: e.target.value })}
          className="max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)] disabled:opacity-40"
        >
          <option value="allowlist">Allowlist</option>
          <option value="manual">Auto-review</option>
          <option value="auto">Run everything</option>
        </select>
        <p className="text-[10px] text-[var(--text-muted)]">
          Controls how terminal commands and tools run without explicit approval each time.
        </p>
      </div>

      <AllowlistChipInput
        label="Command allowlist"
        placeholder="e.g. git status"
        items={data.agentsCommands}
        inputValue={data.newCommand}
        onInputChange={data.setNewCommand}
        onAdd={() => void data.addAgentsCommand()}
        onRemove={(c) => void data.removeAgentsCommand(c)}
        onAddBulk={(cmds) => data.addAgentsCommandsBulk(cmds)}
        existingCommands={data.agentsCommands}
        workspaceId={ws}
        showSuggestions
        disabled={disabled}
      />

      <AllowlistChipInput
        label="MCP allowlist"
        hint="Format: server:tool · server:* · *:tool · *:*"
        placeholder="e.g. inneranimalmedia:d1_query"
        items={mcpKeys}
        inputValue={data.newToolKey}
        onInputChange={data.setNewToolKey}
        onAdd={() => void data.addAgentsMcp()}
        onRemove={(key) => void data.removeAgentsMcp(key)}
        disabled={disabled}
      />

      {groups.length > 0 ? (
        <details className="rounded-lg border border-[var(--border-subtle)]/60 bg-[var(--bg-panel)]/40 p-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-[var(--text-main)]">
            OAuth MCP tool permissions ({groups.length} groups)
          </summary>
          <p className="text-[10px] text-[var(--text-muted)] mt-2 mb-3 leading-relaxed">
            Per-group access for OAuth MCP clients. Changes apply on the next connection without
            reconnecting.
          </p>
          <div className="space-y-2">
            {groups.map((g) => (
              <div
                key={g.group_key}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 bg-[var(--bg-panel)]"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--text-main)] truncate">
                    {g.label}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {g.tools.length} tools
                    {g.read_count > 0 ? ` · ${g.read_count} read` : ''}
                    {g.write_count > 0 ? ` · ${g.write_count} write` : ''}
                  </div>
                </div>
                <McpToolPreferenceControl
                  compact
                  value={(prefs[g.group_key] as McpToolPreference) || 'deny'}
                  onChange={(v) => setGroupPref(g.group_key, v)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <AllowlistChipInput
        label="Fetch domain allowlist"
        hint="Format: example.com or *.example.com"
        placeholder="e.g. example.com"
        items={data.agentsDomains}
        inputValue={data.newDomain}
        onInputChange={data.setNewDomain}
        onAdd={() => void data.addAgentsDomain()}
        onRemove={(h) => void data.removeAgentsDomain(h)}
        disabled={disabled}
      />

      <p className="text-[10px] text-[var(--text-muted)]">
        Workspace scope: <code className="font-mono text-[var(--solar-cyan)]">{ws || '—'}</code>.
        Allowlists save immediately when you add or remove items.
      </p>
    </div>
  );
}
