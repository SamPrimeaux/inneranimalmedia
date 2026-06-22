import React from 'react';
import type { RightPanelTab } from './cadStudioTypes';

export type RightPanelTabsProps = {
  active: RightPanelTab;
  onChange: (tab: RightPanelTab) => void;
  children: React.ReactNode;
};

export function RightPanelTabs({ active, onChange, children }: RightPanelTabsProps) {
  const tabs: { id: RightPanelTab; label: string }[] = [
    { id: 'outliner', label: 'Outliner' },
    { id: 'assets', label: 'Assets' },
    { id: 'properties', label: 'Properties' },
  ];

  return (
    <aside className="cad-editor cad-editor--right-tabs">
      <div className="cad-right-tabs__head" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={`cad-right-tabs__tab${active === t.id ? ' active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="cad-right-tabs__body">{children}</div>
    </aside>
  );
}
