import React, { useState } from 'react';
import { 
  X, Maximize2, Minimize2, Terminal as TermIcon, 
  ChevronDown, LayoutGrid, Layers, Monitor, 
  PenTool, Database, Box, LucideIcon
} from 'lucide-react';
import { DashboardRoute, LayoutMode } from '../../hooks/useWorkbench';
import { MonacoEditorView } from '../MonacoEditorView';
import { BrowserView } from '../BrowserView';
import { ExcalidrawView } from '../ExcalidrawView';
import { DatabaseBrowser } from '../DatabaseBrowser';
import { Overview } from '../Overview';
import { WorkspaceDashboard } from '../WorkspaceDashboard';
import { MCPPanel } from '../MCPPanel';
import { GorillaModeShell } from '../GorillaModeShell';

interface Tab {
  id: string;
  title: string;
  icon: LucideIcon;
  route: DashboardRoute;
}

interface MainWorkbenchProps {
  activeRoute: DashboardRoute;
  onNavigate: (route: DashboardRoute) => void;
  layoutMode: LayoutMode;
  isTerminalOpen: boolean;
  onTerminalToggle: () => void;
  // Dynamic Props for components
  workspaceProps: any;
  editorProps: any;
  browserProps: any;
  terminalProps: any;
}

export const MainWorkbench: React.FC<MainWorkbenchProps> = ({
  activeRoute,
  onNavigate,
  layoutMode,
  isTerminalOpen,
  onTerminalToggle,
  workspaceProps,
  editorProps,
  browserProps,
  terminalProps
}) => {
  const [terminalHeight, setTerminalHeight] = useState(260);

  // ── Render Content based on Route ─────────────────────────────────────────
  const renderContent = () => {
    switch (activeRoute) {
      case 'overview':
        return <Overview />;
      case 'agent':
        // If workspace is active, maybe show Launcher? 
        // For now, default to WorkspaceDashboard per plan
        return <WorkspaceDashboard {...workspaceProps} />;
      case 'mcp':
        return <MCPPanel />;
      case 'cloud':
        return <div className="p-8 text-[var(--text-muted)]">Remote Explorer coming soon...</div>;
      case 'finance':
        return <div className="p-8 text-[var(--text-muted)]">Finance Dashboard coming soon...</div>;
      case 'database':
        return <DatabaseBrowser onClose={() => onNavigate('agent')} />;

      default:
        // Handle other routes or fallback
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
            <Layers size={48} className="opacity-10 mb-4" />
            <p className="text-[11px] font-mono uppercase tracking-widest opacity-50">View: {activeRoute}</p>
          </div>
        );
    }
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-app)] relative overflow-hidden">
      
      {/* ── Tab Bar (If in Agent/IDE mode) ── */}
      {activeRoute === 'agent' && (
        <div className="h-10 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/30 flex items-center px-1 overflow-x-auto no-scrollbar shrink-0">
          <WorkbenchTab icon={LayoutGrid} title="Overview" active />
          <WorkbenchTab icon={Layers}     title="Welcome"   active={false} />
          {/* ... more tabs ... */}
        </div>
      )}

      {/* ── Content Area ── */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {renderContent()}
      </div>

      {/* ── Bottom Terminal ── */}
      {isTerminalOpen && (
        <div 
          className="absolute bottom-0 left-0 right-0 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] flex flex-col z-40 transition-all duration-200"
          style={{ height: terminalHeight }}
        >
          <div className="h-8 border-b border-[var(--border-subtle)] flex items-center justify-between px-3 cursor-ns-resize shrink-0">
            <div className="flex items-center gap-2">
              <TermIcon size={11} className="text-[var(--solar-cyan)]" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Terminal</span>
            </div>
            <button onClick={onTerminalToggle} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
              <X size={13} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
             <GorillaModeShell {...terminalProps} />
          </div>
        </div>
      )}

    </main>
  );
};

const WorkbenchTab: React.FC<{ icon: LucideIcon; title: string; active: boolean }> = ({ icon: Icon, title, active }) => (
  <button className={`h-8 px-3 flex items-center gap-2 border-r border-[var(--border-subtle)] text-[11px] font-medium transition-all ${
    active 
      ? 'bg-[var(--bg-app)] text-[var(--text-main)] border-b-2 border-b-[var(--solar-cyan)]' 
      : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
  }`}>
    <Icon size={12} className={active ? 'text-[var(--solar-cyan)]' : ''} />
    <span>{title}</span>
    <X size={10} className="ml-1 opacity-0 group-hover:opacity-40" />
  </button>
);
