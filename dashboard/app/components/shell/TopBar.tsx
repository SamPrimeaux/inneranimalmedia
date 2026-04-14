import React, { useState, useEffect } from 'react';
import { 
  Search, ShieldCheck, ShieldAlert, Cpu, 
  ChevronDown, Layout, Maximize2, Columns2,
  Settings, User, LogOut, ExternalLink, RefreshCw,
  Bell
} from 'lucide-react';
import { LayoutMode } from '../../hooks/useWorkbench';

interface TopBarProps {
  productLabel: string;
  workspaceName: string;
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  onSearchToggle: () => void;
  onSettingsToggle: () => void;
  tunnelHealthy: boolean | null;
  tunnelLabel: string | null;
}

export const TopBar: React.FC<TopBarProps> = ({
  productLabel,
  workspaceName,
  layoutMode,
  onLayoutChange,
  onSearchToggle,
  onSettingsToggle,
  tunnelHealthy,
  tunnelLabel
}) => {
  const [isTunnelOpen, setIsTunnelOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <header className="h-10 bg-[var(--bg-topbar)] border-b border-[var(--border-subtle)] flex items-center justify-between px-3 gap-4 z-40 shrink-0">
      
      {/* ── LEFT: Logo & Breadcrumbs ── */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-6 h-6 rounded-md bg-[var(--solar-cyan)] flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(45,212,191,0.25)]">
          <span className="text-[10px] font-black text-[#071020]">IA</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide truncate">
          <span className="text-[var(--text-muted)] opacity-50">{productLabel}</span>
          <span className="text-[var(--text-muted)]/30">/</span>
          <span className="text-[var(--text-main)] truncate">{workspaceName}</span>
        </div>
      </div>

      {/* ── CENTER: Search & Tunnel ── */}
      <div className="flex-1 flex items-center justify-center max-w-2xl gap-3">
        {/* Search Input Trigger */}
        <button
          onClick={onSearchToggle}
          className="flex-1 max-w-lg h-7 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-md px-3 flex items-center justify-between text-[11px] text-[var(--text-muted)] hover:border-[var(--solar-cyan)]/30 transition-all group"
        >
          <div className="flex items-center gap-2">
            <Search size={12} className="group-hover:text-[var(--solar-cyan)]" />
            <span>Search or run command...</span>
          </div>
          <div className="flex items-center gap-1 opacity-40">
            <span className="px-1 py-0.5 rounded border border-[var(--border-subtle)] font-mono text-[9px]">⌘</span>
            <span className="px-1 py-0.5 rounded border border-[var(--border-subtle)] font-mono text-[9px]">K</span>
          </div>
        </button>

        {/* SSH Tunnel Status */}
        <div className="relative">
          <button
            onClick={() => setIsTunnelOpen(!isTunnelOpen)}
            className={`h-7 flex items-center gap-2 px-2.5 rounded-md border text-[10px] font-mono transition-all ${
              tunnelHealthy === true
                ? 'border-[var(--solar-green)]/30 bg-[var(--solar-green)]/5 text-[var(--solar-green)]'
                : tunnelHealthy === false
                  ? 'border-[var(--solar-red)]/30 bg-[var(--solar-red)]/5 text-[var(--solar-red)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-muted)]'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${tunnelHealthy ? 'bg-[var(--solar-green)] animate-pulse' : 'bg-current opacity-40'}`} />
            <span className="hidden sm:inline">{tunnelLabel || 'No Tunnel'}</span>
            <ChevronDown size={10} className={`opacity-40 transition-transform ${isTunnelOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Tunnel Dropdown Placeholder */}
          {isTunnelOpen && (
            <div className="absolute top-full mt-2 right-0 w-64 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-3 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 z-50">
              <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest px-1">SSH Tunnel Status</div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-app)] border border-white/5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold">{tunnelLabel || 'Not Connected'}</span>
                  <span className="text-[9px] text-[var(--text-muted)]">{tunnelHealthy ? 'Active connection' : 'Offline'}</span>
                </div>
                {tunnelHealthy ? <ShieldCheck size={14} className="text-[var(--solar-green)]" /> : <ShieldAlert size={14} className="text-[var(--solar-red)]" />}
              </div>
              <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] text-[11px] font-bold hover:bg-[var(--solar-cyan)]/20 transition-all border border-[var(--solar-cyan)]/20">
                <RefreshCw size={12} />
                Reconnect Tunnel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Layout & Profile ── */}
      <div className="flex items-center gap-2">
        {/* Layout Switcher */}
        <div className="flex items-center bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-md p-0.5">
          <LayoutBtn active={layoutMode === 'default'} onClick={() => onLayoutChange('default')} icon={Layout} title="Default" />
          <LayoutBtn active={layoutMode === 'split'}   onClick={() => onLayoutChange('split')}   icon={Columns2} title="Split" />
          <LayoutBtn active={layoutMode === 'wide'}    onClick={() => onLayoutChange('wide')}    icon={Maximize2} title="Wide" />
        </div>

        <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

        {/* Profile */}
        <button 
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="w-7 h-7 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] hover:border-[var(--solar-cyan)] transition-all overflow-hidden"
        >
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--solar-cyan)]/20 to-transparent">
            <User size={14} />
          </div>
        </button>
      </div>

    </header>
  );
};

const LayoutBtn: React.FC<{ active: boolean; onClick: () => void; icon: any; title: string }> = ({ active, onClick, icon: Icon, title }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-1 rounded-sm transition-all ${active ? 'bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
  >
    <Icon size={14} />
  </button>
);
