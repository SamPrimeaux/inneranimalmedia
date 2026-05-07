import React from 'react';

/** Primary analytics nav — merged views vs legacy Health tabs (models→agent, deploys→workers, D1→database, advisors→overview). */
export const ANALYTICS_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'agent', label: 'Agent' },
  { id: 'workers', label: 'Workers' },
  { id: 'database', label: 'Database' },
  { id: 'mcp', label: 'MCP' },
] as const;

export type HealthTabId = (typeof ANALYTICS_TABS)[number]['id'];

type Props = {
  tab: HealthTabId;
  onTab: (t: HealthTabId) => void;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export const HealthShell: React.FC<Props> = ({
  tab,
  onTab,
  title = 'Analytics',
  subtitle = 'Telemetry, cost, and platform observability',
  actions,
  children,
}) => (
  <div className="ov-wrap flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden w-full">
    <header className="ov-header shrink-0">
      <div className="ov-title">
        <h1 className="ov-h1">{title}</h1>
        <p className="ov-sub">{subtitle}</p>
      </div>
      {actions ? <div className="ov-actions">{actions}</div> : null}
    </header>

    <div className="flex flex-wrap gap-1 px-1 pb-2 shrink-0 border-b border-[var(--border-subtle)]">
      {ANALYTICS_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`ov-btn text-[12px] !py-1 !px-2 ${tab === t.id ? 'ring-1 ring-[var(--solar-cyan)]' : ''}`}
          onClick={() => onTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>

    <div className="flex-1 min-h-0 overflow-auto p-3">{children}</div>
  </div>
);
