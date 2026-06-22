import React from 'react';
import { Box, FolderOpen, Terminal, Triangle, Upload, Wand2 } from 'lucide-react';
import type { CreationTool } from './useCreationStation';

const TOOLS: { id: CreationTool; label: string; icon: React.ReactNode }[] = [
  { id: 'text-to-3d', label: 'Text to 3D', icon: <Wand2 size={18} /> },
  { id: 'import', label: 'Import GLB', icon: <Upload size={18} /> },
  { id: 'blender', label: 'Blender', icon: <Triangle size={18} /> },
  { id: 'scene', label: 'Scene', icon: <FolderOpen size={18} /> },
];

type Props = {
  active: CreationTool;
  panelOpen: boolean;
  onSelect: (tool: CreationTool) => void;
  onTogglePanel: () => void;
};

export function ToolRail({ active, panelOpen, onSelect, onTogglePanel }: Props) {
  return (
    <nav
      className="flex flex-row md:flex-col items-center gap-1 p-1.5 md:p-2 border-[var(--border-subtle)] border-b md:border-b-0 md:border-r bg-[var(--bg-panel)] shrink-0"
      aria-label="Design Studio tools"
    >
      <div className="hidden md:flex items-center justify-center w-10 h-10 mb-2 rounded-xl bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)]">
        <Box size={18} />
      </div>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          onClick={() => {
            onSelect(t.id);
            if (!panelOpen) onTogglePanel();
          }}
          className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
            active === t.id
              ? 'bg-[var(--solar-cyan)] text-black shadow-[0_0_12px_rgba(0,255,204,0.25)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
          }`}
        >
          {t.icon}
        </button>
      ))}
      <button
        type="button"
        title="Log / Terminal"
        onClick={onTogglePanel}
        className={`hidden md:flex items-center justify-center w-10 h-10 rounded-xl mt-auto transition-all ${
          panelOpen ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
        }`}
      >
        <Terminal size={18} />
      </button>
    </nav>
  );
}
