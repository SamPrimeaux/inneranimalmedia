import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import {
  McpToolPreferenceControl,
  type McpToolPreference,
} from '../../mcp/McpToolPreferenceControl';

export type AgentsAllowlistsProps = {
  data: SettingsPanelModel;
  workspaceId?: string | null;
};

export function AgentsAllowlists({ data, workspaceId }: AgentsAllowlistsProps) {
  const ws = data.agentsWorkspaceId || workspaceId || '';
  const groups = data.agentsMcpGroups || [];
  const prefs = data.agentsMcpGroupPrefs || {};

  const setGroupPref = (groupKey: string, value: McpToolPreference) => {
    const next = { ...prefs, [groupKey]: value };
    data.setAgentsMcpGroupPrefs(next);
    void data.saveAgentsMcpGroupPreferences(next);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Command allowlist
        </div>
        <div className="flex gap-2 mb-3">
          <input
            value={data.newCommand}
            onChange={(e) => data.setNewCommand(e.target.value)}
            placeholder="e.g. git status"
            className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
          />
          <button
            type="button"
            onClick={() => void data.addAgentsCommand()}
            className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] hover:border-[var(--solar-cyan)]/50"
          >
            Add
          </button>
        </div>
        <div className="space-y-1">
          {data.agentsCommands.length === 0 ? (
            <div className="text-[12px] text-[var(--text-muted)]">No commands</div>
          ) : (
            data.agentsCommands.map((c) => (
              <div
                key={c}
                className="flex items-center justify-between gap-2 text-[11px] border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 bg-[var(--bg-panel)]"
              >
                <code className="font-mono text-[var(--solar-cyan)] truncate">{c}</code>
                <button
                  type="button"
                  onClick={() => void data.removeAgentsCommand(c)}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Fetch domain allowlist
        </div>
        <div className="flex gap-2 mb-3">
          <input
            value={data.newDomain}
            onChange={(e) => data.setNewDomain(e.target.value)}
            placeholder="e.g. example.com"
            className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
          />
          <button
            type="button"
            onClick={() => void data.addAgentsDomain()}
            className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] hover:border-[var(--solar-cyan)]/50"
          >
            Add
          </button>
        </div>
        <div className="space-y-1">
          {data.agentsDomains.length === 0 ? (
            <div className="text-[12px] text-[var(--text-muted)]">No domains</div>
          ) : (
            data.agentsDomains.map((h) => (
              <div
                key={h}
                className="flex items-center justify-between gap-2 text-[11px] border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 bg-[var(--bg-panel)]"
              >
                <code className="font-mono text-[var(--solar-cyan)] truncate">{h}</code>
                <button
                  type="button"
                  onClick={() => void data.removeAgentsDomain(h)}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4 lg:col-span-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
          MCP tool permissions
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
          Per-group access for OAuth MCP clients. Changes apply on the next connection without
          reconnecting.
        </p>
        {groups.length === 0 ? (
          <div className="text-[12px] text-[var(--text-muted)]">
            No OAuth tool catalog for this workspace. Connect via MCP OAuth first, or add a tool
            key manually below.
          </div>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {groups.map((g) => (
              <div
                key={g.group_key}
                className="flex flex-col gap-2 border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 bg-[var(--bg-panel)]"
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
                  disabled={data.agentsSaving || data.agentsLoading}
                />
              </div>
            ))}
          </div>
        )}
        <details className="mt-3 text-[10px] text-[var(--text-muted)]">
          <summary className="cursor-pointer font-semibold text-[var(--text-main)]">
            Advanced: add tool by key
          </summary>
          <div className="flex gap-2 mt-2">
            <input
              value={data.newToolKey}
              onChange={(e) => data.setNewToolKey(e.target.value)}
              placeholder="tool_key"
              className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)] font-mono"
            />
            <button
              type="button"
              onClick={() => void data.addAgentsMcp()}
              className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] hover:border-[var(--solar-cyan)]/50"
            >
              Add
            </button>
          </div>
          {data.agentsMcp.length > 0 ? (
            <div className="mt-2 space-y-1">
              {data.agentsMcp.map((t) => (
                <div
                  key={t.tool_key}
                  className="flex items-center justify-between gap-2 border border-[var(--border-subtle)] rounded px-2 py-1"
                >
                  <code className="font-mono text-[var(--solar-cyan)] truncate text-[10px]">
                    {t.tool_key}
                  </code>
                  <button
                    type="button"
                    onClick={() => void data.removeAgentsMcp(t.tool_key)}
                    className="text-[9px] text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </details>
      </div>

      <div className="lg:col-span-3 text-[10px] text-[var(--text-muted)]">
        Workspace scope:{' '}
        <code className="font-mono text-[var(--solar-cyan)]">{ws || '—'}</code>. Allowlists save
        immediately.
      </div>
    </div>
  );
}
