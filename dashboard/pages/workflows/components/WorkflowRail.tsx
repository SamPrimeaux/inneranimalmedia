import React from 'react';
import {
  CheckCircle2,
  GitBranch,
  Layers,
  Link2,
  Menu,
  PanelRight,
  Play,
  Plug,
} from 'lucide-react';
import type { DrawerMode } from '../workflowTypes';

function McpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={18} height={18} aria-hidden>
      <path d="M8 8h8v8H8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Props = {
  drawerMode: DrawerMode;
  connectMode: boolean;
  traceMode: boolean;
  inspectorOpen: boolean;
  onOpenDrawer: (mode: DrawerMode) => void;
  onToggleConnect: () => void;
  onToggleTrace: () => void;
  onValidate: () => void;
  onToggleInspector: () => void;
};

export function WorkflowRail({
  drawerMode,
  connectMode,
  traceMode,
  inspectorOpen,
  onOpenDrawer,
  onToggleConnect,
  onToggleTrace,
  onValidate,
  onToggleInspector,
}: Props) {
  const btn = (mode: DrawerMode, tip: string, icon: React.ReactNode, active?: boolean) => (
    <button
      type="button"
      className={`wf-rail-btn${active ? ' active' : ''}`}
      data-tip={tip}
      onClick={() => onOpenDrawer(drawerMode === mode ? null : mode)}
      aria-pressed={active}
    >
      {icon}
    </button>
  );

  return (
    <nav className="wf-rail" aria-label="Workflow studio tools">
      {btn('blocks', 'Workflow Blocks / Actions', <Menu size={18} />, drawerMode === 'blocks')}
      {btn('library', 'Workflow Library', <Layers size={18} />, drawerMode === 'library')}
      {btn('mcp', 'MCP Workflows', <McpIcon />, drawerMode === 'mcp')}
      {btn('connections', 'Connections', <Plug size={18} />, drawerMode === 'connections')}
      <button
        type="button"
        className={`wf-rail-btn${connectMode ? ' active' : ''}`}
        data-tip="Connect stages"
        onClick={onToggleConnect}
        aria-pressed={connectMode}
      >
        <Link2 size={18} />
      </button>
      <button
        type="button"
        className={`wf-rail-btn${traceMode ? ' active' : ''}`}
        data-tip="Run visual trace"
        onClick={onToggleTrace}
        aria-pressed={traceMode}
      >
        <Play size={18} />
      </button>
      <button type="button" className="wf-rail-btn" data-tip="Validate workflow" onClick={onValidate}>
        <CheckCircle2 size={18} />
      </button>
      <button
        type="button"
        className={`wf-rail-btn${inspectorOpen ? ' active' : ''}`}
        data-tip="Inspector toggle"
        onClick={onToggleInspector}
        aria-pressed={inspectorOpen}
      >
        <PanelRight size={18} />
      </button>
      <button
        type="button"
        className="wf-rail-btn"
        data-tip="Registry graph (agentsam_workflows)"
        style={{ opacity: 0.65 }}
        disabled
        title="DAG id shown in inspector when a workflow is loaded"
      >
        <GitBranch size={16} />
      </button>
    </nav>
  );
}
