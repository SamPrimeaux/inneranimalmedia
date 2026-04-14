import React, { useRef } from 'react';
import { PenLine, Box, Triangle, Wand2, Layers, Upload, Plus } from 'lucide-react';

interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  url: string;
  color: string;
}

interface ToolLauncherBarProps {
  onNavigate: (url: string) => void;
  onImportGlb?: (file: File) => void;
}

export const ToolLauncherBar: React.FC<ToolLauncherBarProps> = ({ onNavigate, onImportGlb }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tools: Tool[] = [
    {
      id: 'meshy',
      icon: <Box size={16} />,
      label: 'Meshy',
      url: 'https://app.meshy.ai',
      color: 'text-[var(--solar-cyan)]',
    },
    {
      id: 'spline',
      icon: <Wand2 size={16} />,
      label: 'Spline',
      url: 'https://app.spline.design',
      color: 'text-[var(--solar-blue)]',
    },
    {
      id: 'blender',
      icon: <Triangle size={16} />,
      label: 'Blender',
      url: 'https://www.blender.org/download',
      color: 'text-[var(--solar-orange)]',
    },
    {
      id: 'excalidraw',
      icon: <PenLine size={16} />,
      label: 'Draw',
      url: 'https://excalidraw.com',
      color: 'text-[var(--solar-violet)]',
    },
    {
      id: 'tldraw',
      icon: <Layers size={16} />,
      label: 'tldraw',
      url: 'https://tldraw.com',
      color: 'text-[var(--solar-green)]',
    },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportGlb) {
      onImportGlb(file);
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel)]/80 backdrop-blur-xl shadow-2xl glass-panel">
        {/* Upload Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center p-2 rounded-full hover:bg-[var(--bg-hover)] text-[var(--solar-cyan)] transition-all group relative"
          title="Import GLB Model"
        >
          <Upload size={16} />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest font-bold">
            Import GLB
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />

        {/* Tool Icons */}
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onNavigate(tool.url)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[var(--bg-hover)] transition-all group relative border border-transparent hover:border-[var(--border-subtle)]"
          >
            <div className={`transition-transform group-hover:scale-110 ${tool.color}`}>
              {tool.icon}
            </div>
            <span className="text-[11px] font-bold text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors">
              {tool.label}
            </span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest font-bold">
              Launch {tool.label}
            </div>
          </button>
        ))}

        <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />

        {/* Add more placeholder */}
        <button className="flex items-center justify-center p-2 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-all">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};

