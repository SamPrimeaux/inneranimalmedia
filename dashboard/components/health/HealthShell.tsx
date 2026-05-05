import React from 'react';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'agent', label: 'Agent' },
  { id: 'workers', label: 'Workers' },
  { id: 'mcp', label: 'MCP' },
  { id: 'models', label: 'Models' },
  { id: 'd1', label: 'D1 telemetry' },
  { id: 'advisors', label: 'Advisors' },
  { id: 'deployments', label: 'Deploys' },
] as const;

export type HealthTabId = (typeof TABS)[number]['id'];

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
  title = 'Health',
  subtitle = 'Telemetry, cost, and platform checks',
  actions,
  children,
}) => (
  <div className="ov-wrap h-full min-h-0 flex flex-col overflow-hidden">
    <header className="ov-header shrink-0">
      <div className="ov-title">
        <h1 className="ov-h1">{title}</h1>
        <p className="ov-sub">{subtitle}</p>
      </div>
      {actions ? <div className="ov-actions">{actions}</div> : null}
    </header>

    <div className="flex flex-wrap gap-1 px-1 pb-2 shrink-0 border-b border-[var(--border-subtle)]">
      {TABS.map((t) => (
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
