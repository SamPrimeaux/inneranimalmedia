import React from 'react';
import { ChevronDown, ChevronUp, Pencil, Radio, RefreshCw, Trash2 } from 'lucide-react';

export type McpServerVm = {
  id: string;
  name: string;
  toolCount: number;
  enabled: boolean;
};

export type McpHealthUi = {
  status: string;
  latency_ms?: number | null;
  checked_at?: string | null;
};

function HealthDot({ status }: { status: string }) {
  const dot =
    status === 'healthy'
      ? 'bg-[var(--color-success)]'
      : status === 'checking'
        ? 'bg-amber-400 animate-pulse'
        : status === 'unreachable' || status === 'unhealthy' || status === 'degraded'
          ? 'bg-[var(--color-danger)]'
          : 'bg-[var(--border-subtle)]';
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} title={status} />;
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-[var(--solar-blue)]' : 'bg-[var(--border-subtle)]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export type McpServerCardProps = {
  server: McpServerVm;
  health: McpHealthUi | undefined;
  expanded: boolean;
  toolsLoading: boolean;
  tools: Array<{ name: string }>;
  toolsShowAll: boolean;
  onToggleExpand: () => void;
  onEditConfig: () => void;
  onDelete: () => void;
  onPing: () => void;
  onToggleEnabled: (v: boolean) => void;
  onRefreshTools: () => void;
  onShowAllTools: () => void;
  onToolClick: (toolName: string) => void;
};

const CHIP_PREVIEW = 20;

export function McpServerCard({
  server,
  health,
  expanded,
  toolsLoading,
  tools,
  toolsShowAll,
  onToggleExpand,
  onEditConfig,
  onDelete,
  onPing,
  onToggleEnabled,
  onRefreshTools,
  onShowAllTools,
  onToolClick,
}: McpServerCardProps) {
  const status = health?.status ?? 'unknown';
  const visible = toolsShowAll ? tools : tools.slice(0, CHIP_PREVIEW);
  const remaining = Math.max(0, tools.length - CHIP_PREVIEW);
  const hasMore = !toolsShowAll && remaining > 0;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className="group relative flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
      >
        <HealthDot status={status} />
        <span className="flex-1 min-w-0 font-medium text-[13px] text-[var(--text-heading)] truncate">
          {server.name}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] shrink-0">{server.toolCount} tools</span>

        <button
          type="button"
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--dashboard-card)] shrink-0"
          title="Expand tools"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <button
          type="button"
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--dashboard-card)] shrink-0"
          title="Ping server"
          onClick={(e) => {
            e.stopPropagation();
            onPing();
          }}
        >
          <Radio size={15} />
        </button>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--dashboard-card)]"
            title="Edit config"
            onClick={(e) => {
              e.stopPropagation();
              onEditConfig();
            }}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--dashboard-card)]"
            title="Remove server"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <ToggleSwitch checked={server.enabled} onChange={onToggleEnabled} />
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-[var(--border-subtle)] px-4 pb-3 pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Tools
            </span>
            <button
              type="button"
              onClick={() => onRefreshTools()}
              disabled={toolsLoading}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--solar-cyan)] hover:underline disabled:opacity-40"
            >
              <RefreshCw size={12} className={toolsLoading ? 'animate-spin' : ''} />
              Refresh tools
            </button>
          </div>
          {toolsLoading ? (
            <div className="text-[11px] text-[var(--text-muted)]">Loading tools…</div>
          ) : tools.length === 0 ? (
            <div className="text-[11px] text-[var(--text-muted)]">No tools in registry for this server.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {visible.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className="px-2 py-0.5 text-[11px] rounded-md bg-[var(--dashboard-card)] border border-[var(--dashboard-border)] text-[var(--text-muted)] hover:bg-[var(--solar-blue)] hover:text-white hover:border-[var(--solar-blue)] transition-colors"
                  onClick={() => onToolClick(t.name)}
                >
                  {t.name}
                </button>
              ))}
              {hasMore ? (
                <button
                  type="button"
                  className="px-2 py-0.5 text-[11px] rounded-md border border-dashed border-[var(--dashboard-border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  onClick={onShowAllTools}
                >
                  +{remaining} more
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
