import React, { useMemo, useState } from 'react';
import type { WorkspaceId } from './cadStudioTypes';
import { buildDockDomains, type DockAction, type DockDomainId } from './toolDockRegistry';
import { dispatchCadChat } from './dispatchCadChat';

export type CreativeToolDockProps = {
  workspace: WorkspaceId;
  activeTool: string;
  activeDomain: DockDomainId | null;
  onDomainChange: (domain: DockDomainId | null) => void;
  onToolChange: (toolId: string) => void;
  onLocalAction: (actionId: string) => void;
  onOpenOperator: (operatorId?: string, prompt?: string) => void;
  selectedObjectId?: string | null;
  sceneId?: string | null;
};

export function CreativeToolDock({
  workspace,
  activeTool,
  activeDomain,
  onDomainChange,
  onToolChange,
  onLocalAction,
  onOpenOperator,
  selectedObjectId,
  sceneId,
}: CreativeToolDockProps) {
  const domains = useMemo(() => buildDockDomains(workspace), [workspace]);
  const [pinned, setPinned] = useState(false);
  const openDomain = domains.find((d) => d.id === activeDomain) ?? null;

  const handleAction = (action: DockAction) => {
    if (action.kind === 'local') {
      if (['select', 'move', 'rotate', 'scale'].includes(action.id)) {
        onToolChange(action.id);
        return;
      }
      onLocalAction(action.id);
      return;
    }
    if (action.kind === 'panel') {
      onLocalAction(action.id);
      return;
    }
    if (action.kind === 'operator' && action.operatorId) {
      onOpenOperator(action.operatorId, `Apply ${action.label} in ${workspace} workspace.`);
    }
  };

  return (
    <div className="cad-dock-wrap" aria-label="Creative tool dock">
      <div className={`cad-dock${openDomain ? ' cad-dock--open' : ''}`}>
        <div className="cad-dock__rail" role="toolbar" aria-label="Tool domains">
          {domains.map((domain) => {
            const Icon = domain.icon;
            const active = activeDomain === domain.id;
            return (
              <button
                key={domain.id}
                type="button"
                className={`cad-dock__rail-btn${active ? ' active' : ''}`}
                title={domain.label}
                aria-pressed={active}
                onClick={() => {
                  if (active && !pinned) {
                    onDomainChange(null);
                  } else {
                    onDomainChange(domain.id);
                    setPinned(true);
                  }
                }}
              >
                <Icon size={16} strokeWidth={1.75} />
              </button>
            );
          })}
        </div>

        {openDomain ? (
          <div className="cad-dock__panel">
            <div className="cad-dock__panel-head">
              <span>{openDomain.label}</span>
              <button type="button" className="cad-studio__btn" onClick={() => { onDomainChange(null); setPinned(false); }}>
                Close
              </button>
            </div>
            {openDomain.sections.map((section) => (
              <div key={section.title} className="cad-dock__section">
                <div className="cad-dock__section-title">{section.title}</div>
                <div className="cad-dock__actions">
                  {section.actions.map((action) => {
                    const Icon = action.icon;
                    const isActive = activeTool === action.id;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        className={`cad-dock__action${isActive ? ' active' : ''}`}
                        onClick={() => handleAction(action)}
                        disabled={action.id === 'none'}
                      >
                        <Icon size={14} strokeWidth={1.75} />
                        <span>{action.label}</span>
                        {action.shortcut ? <span className="cad-dock__shortcut">{action.shortcut}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="cad-dock__hint">Runner tools open Operator Search as draft — confirm in Agent before send.</p>
          </div>
        ) : null}

        {activeTool ? (
          <div className="cad-dock__context">
            Active: <strong>{activeTool}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function openOperatorDraft(
  operatorId: string,
  opts: { prompt?: string; workspace?: string; selectedObjectId?: string | null; sceneId?: string | null },
): void {
  dispatchCadChat({
    operatorId,
    prompt: opts.prompt,
    workspace: opts.workspace,
    selectedObjectId: opts.selectedObjectId,
    sceneId: opts.sceneId,
    send: false,
  });
}
