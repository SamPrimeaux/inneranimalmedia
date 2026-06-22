import React from 'react';
import { Box, FolderOpen, Terminal, Triangle, Upload, Wand2 } from 'lucide-react';
import type { CreationTool } from './useCreationStation';

const TOOLS: { id: CreationTool; label: string; icon: React.ReactNode }[] = [
  { id: 'text-to-3d', label: 'Text to 3D', icon: <Wand2 size={17} strokeWidth={2} /> },
  { id: 'import', label: 'Import', icon: <Upload size={17} strokeWidth={2} /> },
  { id: 'blender', label: 'Blender', icon: <Triangle size={17} strokeWidth={2} /> },
  { id: 'scene', label: 'Scene', icon: <FolderOpen size={17} strokeWidth={2} /> },
];

type Props = {
  active: CreationTool;
  onSelect: (tool: CreationTool) => void;
  onOpenLog: () => void;
  className?: string;
};

export function ToolRail({ active, onSelect, onOpenLog, className = '' }: Props) {
  return (
    <nav
      className={`hidden md:flex flex-col items-center gap-1 py-3 px-1.5 border-r border-white/[0.06] bg-[#0c0d12] shrink-0 ${className}`}
      aria-label="Tools"
    >
      <div className="w-9 h-9 mb-2 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
        <Box size={16} />
      </div>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          onClick={() => onSelect(t.id)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            active === t.id
              ? 'bg-emerald-400 text-[#071018] shadow-[0_0_16px_rgba(52,211,153,0.35)]'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
          }`}
        >
          {t.icon}
        </button>
      ))}
      <button
        type="button"
        title="Log / Terminal"
        onClick={onOpenLog}
        className="w-10 h-10 rounded-xl mt-auto flex items-center justify-center text-zinc-500 hover:text-emerald-400 hover:bg-white/[0.04]"
      >
        <Terminal size={17} />
      </button>
    </nav>
  );
}

export function MobileToolStrip({
  active,
  onSelect,
}: {
  active: CreationTool;
  onSelect: (tool: CreationTool) => void;
}) {
  return (
    <div className="flex md:hidden gap-1 p-2 border-b border-white/[0.06] bg-[#0c0d12] overflow-x-auto shrink-0">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
            active === t.id
              ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-500/30'
              : 'text-zinc-500 border border-transparent'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
