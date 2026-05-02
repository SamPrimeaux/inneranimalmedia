import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';

export type AgentsAllowlistsProps = {
  data: SettingsPanelModel;
  workspaceId?: string | null;
};

export function AgentsAllowlists({ data, workspaceId }: AgentsAllowlistsProps) {
  const ws = data.agentsWorkspaceId || workspaceId || '';
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

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          MCP tool allowlist
        </div>
        <div className="flex gap-2 mb-3">
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
        <div className="space-y-1">
          {data.agentsMcp.length === 0 ? (
            <div className="text-[12px] text-[var(--text-muted)]">No MCP tools</div>
          ) : (
            data.agentsMcp.map((t) => (
              <div
                key={t.tool_key}
                className="flex items-center justify-between gap-2 text-[11px] border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 bg-[var(--bg-panel)]"
              >
                <code className="font-mono text-[var(--solar-cyan)] truncate">{t.tool_key}</code>
                <button
                  type="button"
                  onClick={() => void data.removeAgentsMcp(t.tool_key)}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-3 text-[10px] text-[var(--text-muted)]">
        Workspace scope:{' '}
        <code className="font-mono text-[var(--solar-cyan)]">{ws || '—'}</code>. Allowlists save immediately.
      </div>
    </div>
  );
}
