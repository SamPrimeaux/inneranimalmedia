import React from 'react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { McpServerCard } from '../components/McpServerCard';
import { McpToolRow } from '../components/McpToolRow';

export type ToolsMcpSectionProps = {
  data: SettingsPanelModel;
  onOpenInMonaco?: (content: string, virtualPath: string) => void;
  onFileSelect?: (file: { name: string; content: string }) => void;
};

export function ToolsMcpSection({ data, onOpenInMonaco, onFileSelect }: ToolsMcpSectionProps) {
  const openToolPayload = (tool: Record<string, unknown>) => {
    const id =
      tool?.id != null && String(tool.id).trim() !== ''
        ? String(tool.id).trim()
        : String(tool?.tool_name || 'tool');
    const payload = JSON.stringify(tool, null, 2);
    const path = `${id}.schema.json`;
    if (onOpenInMonaco) onOpenInMonaco(payload, path);
    else if (onFileSelect) onFileSelect({ name: path, content: payload });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
          Tools &amp; MCP
        </h2>
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          {data.settingsMcp?.tools?.length ?? 0} tools
        </span>
      </div>

      {!data.settingsMcp ? (
        <div className="text-[12px] text-[var(--text-muted)]">Loading MCP settings…</div>
      ) : null}

      {data.settingsMcp ? (
        <section className="flex flex-col gap-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            MCP servers
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(Array.isArray(data.settingsMcp.servers) ? data.settingsMcp.servers : []).map((s: any, idx: number) => {
              const name = String(s?.service_name || s?.name || `Server ${idx + 1}`);
              const endpoint = String(s?.endpoint_url || s?.url || '');
              const toolCount = Number(s?.tool_count ?? 0);
              const status = String(s?.health_status ?? '');
              const last = s?.last_health_check ?? s?.last_check_at ?? null;
              return (
                <McpServerCard
                  key={String(s?.id || endpoint || idx)}
                  name={name}
                  endpoint={endpoint}
                  toolCount={toolCount}
                  healthStatus={status}
                  lastCheckAt={last}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {data.settingsMcp ? (
        <section className="flex flex-col gap-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Registered tools
          </div>
          <div className="flex flex-col gap-1">
            {(Array.isArray(data.settingsMcp.tools) ? data.settingsMcp.tools : []).map((t: any, idx: number) => {
              const id = String(t?.id || '');
              const toolName = String(t?.tool_name || t?.name || `tool_${idx}`);
              const desc = String(t?.description || '');
              const enabled = !!Number(t?.enabled ?? 0);
              const isDegraded = !!Number(t?.is_degraded ?? 0);
              const failureRate = t?.failure_rate != null ? Number(t.failure_rate) : null;
              const stats = t?.stats as Record<string, unknown> | null | undefined;
              const statsLine = stats
                ? `${Number(stats.call_count ?? 0)} calls today · ${Number(stats.avg_duration_ms ?? 0)}ms avg`
                : 'No activity today';
              const err = data.mcpToggleError[id] || null;
              return (
                <McpToolRow
                  key={id || toolName}
                  toolName={toolName}
                  description={desc}
                  enabled={enabled}
                  isDegraded={isDegraded}
                  failureRate={failureRate}
                  statsLine={statsLine}
                  toggleError={err}
                  onToggle={(v) =>
                    void data.toggleMcpRegisteredTool(id, v, enabled)
                  }
                  onOpenSchema={() => openToolPayload(t)}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
