/**
 * UIOverlay — Voxel/Studio engine HUD overlay
 * Surgical fix: all hardcoded colors → CSS vars, replaceAll, missing keyframe.
 * No architecture changes.
 */

import React from 'react';
import { AppState, ProjectType, GenerationConfig, CADTool, CADPlane } from '../types';
import {
  Box, Loader2, Info, Activity, Zap, Mountain, Trees, LayoutGrid,
  Minus, Square, Circle, MousePointer2, Paintbrush, Layers, Maximize2,
  Undo2, Redo2, Trash2, Box as CubeIcon, Disc, ChevronUp, Construction,
} from 'lucide-react';

interface UIOverlayProps {
  voxelCount:        number;
  appState:          AppState;
  activeProject:     ProjectType;
  isGenerating:      boolean;
  onTogglePlay:      () => void;
  onClear:           () => void;
  genConfig:         GenerationConfig;
  onUpdateGenConfig: (cfg: Partial<GenerationConfig>) => void;
  onUndo:            () => void;
  onRedo:            () => void;
  canUndo:           boolean;
  canRedo:           boolean;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  voxelCount,
  activeProject,
  isGenerating,
  onClear,
  genConfig,
  onUpdateGenConfig,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const getStyleIcon = () => {
    switch (genConfig.style) {
      case 'CYBERPUNK': return <Zap size={10} />;
      case 'BRUTALIST': return <Mountain size={10} />;
      case 'ORGANIC':   return <Trees size={10} />;
      default:          return <LayoutGrid size={10} />;
    }
  };

  const cadTools = [
    { id: CADTool.NONE,      icon: <MousePointer2 size={16} />,  label: 'Orbit'  },
    { id: CADTool.VOXEL,     icon: <Construction size={16} />,   label: 'Block'  },
    { id: CADTool.PAINT,     icon: <Paintbrush size={16} />,     label: 'Paint'  },
    { id: CADTool.LINE,      icon: <Minus size={16} />,          label: 'Line'   },
    { id: CADTool.RECTANGLE, icon: <Square size={16} />,         label: 'Rect'   },
    { id: CADTool.CIRCLE,    icon: <Circle size={16} />,         label: 'Circle' },
    { id: CADTool.CUBE,      icon: <CubeIcon size={16} />,       label: 'Cube'   },
    { id: CADTool.SPHERE,    icon: <Disc size={16} />,           label: 'Sphere' },
    { id: CADTool.CONE,      icon: <ChevronUp size={16} />,      label: 'Cone'   },
  ];

  const planes = [
    { id: CADPlane.XZ, label: 'Ground (XZ)' },
    { id: CADPlane.XY, label: 'Front (XY)'  },
    { id: CADPlane.YZ, label: 'Side (YZ)'   },
  ];

  // Project display name — replaceAll so multi-underscore names render correctly
  const projectLabel = activeProject.replaceAll('_', ' ');

  return (
    <div className="absolute inset-0 pointer-events-none p-10 flex flex-col justify-between">

      {/* Top HUD */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-4">

          {/* Stats pill */}
          <div className="flex items-center gap-4 bg-[var(--bg-panel)]/70 backdrop-blur-xl border border-[var(--border-subtle)] px-6 py-4 rounded-2xl shadow-2xl">
            <div className="p-2 bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] rounded-lg animate-pulse">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-heading)]">
                {projectLabel}
              </h2>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5">
                  <Box size={10} className="text-[var(--solar-cyan)]" />
                  <span className="text-[10px] font-mono text-[var(--solar-cyan)]/80 uppercase">
                    {voxelCount} VOXELS
                  </span>
                </div>
                <div className="h-1 w-1 bg-[var(--border-subtle)] rounded-full" />
                <div className="flex items-center gap-1.5">
                  {getStyleIcon()}
                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                    {genConfig.style} MODE
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CAD toolbar */}
          {activeProject === ProjectType.CAD && (
            <div className="flex flex-col gap-2 pointer-events-auto animate-in slide-in-from-left duration-500">
              <div className="flex items-center gap-2 bg-[var(--bg-panel)]/80 backdrop-blur-2xl border border-[var(--border-subtle)] p-2 rounded-2xl shadow-2xl overflow-x-auto max-w-[500px] no-scrollbar">
                {cadTools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => onUpdateGenConfig({ cadTool: tool.id })}
                    className={`
                      p-3 rounded-xl flex flex-col items-center gap-1 transition-all shrink-0
                      ${genConfig.cadTool === tool.id
                        ? 'bg-[var(--solar-cyan)] text-black shadow-lg shadow-[var(--solar-cyan)]/20'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                      }
                    `}
                    title={tool.label}
                  >
                    {tool.icon}
                    <span className="text-[8px] font-black uppercase tracking-tighter">{tool.label}</span>
                  </button>
                ))}

                <div className="w-px h-10 bg-[var(--border-subtle)] mx-1 shrink-0" />

                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="p-3 rounded-xl flex flex-col items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-20 disabled:hover:bg-transparent transition-all shrink-0"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={16} />
                  <span className="text-[8px] font-black uppercase tracking-tighter">Undo</span>
                </button>

                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="p-3 rounded-xl flex flex-col items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-20 disabled:hover:bg-transparent transition-all shrink-0"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={16} />
                  <span className="text-[8px] font-black uppercase tracking-tighter">Redo</span>
                </button>
              </div>

              {genConfig.cadTool !== CADTool.NONE &&
               genConfig.cadTool !== CADTool.PAINT &&
               genConfig.cadTool !== CADTool.VOXEL && (
                <div className="flex flex-col gap-2 bg-[var(--bg-panel)]/80 backdrop-blur-2xl border border-[var(--border-subtle)] p-4 rounded-2xl shadow-2xl min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers size={12} className="text-[var(--solar-cyan)]" />
                    <span className="text-[10px] font-black text-[var(--text-muted)] uppercase">Plane Selection</span>
                  </div>
                  <div className="flex gap-2">
                    {planes.map(p => (
                      <button
                        key={p.id}
                        onClick={() => onUpdateGenConfig({ cadPlane: p.id })}
                        className={`
                          flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all
                          ${genConfig.cadPlane === p.id
                            ? 'bg-[var(--text-heading)] text-[var(--bg-app)] border-[var(--text-heading)]'
                            : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:border-[var(--border-focus)]'
                          }
                        `}
                      >
                        {p.id}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <Maximize2 size={12} className="text-[var(--solar-cyan)]" />
                        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-tighter">
                          {genConfig.cadTool === CADTool.SPHERE ? 'Scale Factor' : 'Extrusion / Height'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[var(--solar-cyan)]">{genConfig.extrusion}</span>
                    </div>
                    <input
                      type="range"
                      min="1" max="30" step="1"
                      value={genConfig.extrusion}
                      onChange={e => onUpdateGenConfig({ extrusion: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-[var(--border-subtle)] rounded-lg appearance-none cursor-pointer accent-[var(--solar-cyan)]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top-right controls */}
        <div className="flex gap-4 pointer-events-auto">
          {!activeProject.includes('CAD') && (
            <>
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="w-10 h-10 bg-[var(--bg-panel)]/60 border border-[var(--border-subtle)] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-20 transition-all"
                title="Undo"
              >
                <Undo2 size={18} />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="w-10 h-10 bg-[var(--bg-panel)]/60 border border-[var(--border-subtle)] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-20 transition-all"
                title="Redo"
              >
                <Redo2 size={18} />
              </button>
            </>
          )}

          <button
            onClick={onClear}
            className="px-6 py-2 bg-[var(--solar-red)]/10 hover:bg-[var(--solar-red)]/20 text-[var(--solar-red)] border border-[var(--solar-red)]/20 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all flex items-center gap-2"
          >
            <Trash2 size={14} />
            Purge Scene
          </button>

          <div className="w-10 h-10 bg-[var(--bg-panel)]/60 border border-[var(--border-subtle)] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer">
            <Info size={18} />
          </div>
        </div>
      </div>

      {/* Generation feedback */}
      {isGenerating && (
        <div className="self-center flex flex-col items-center gap-6 bg-[var(--bg-panel)]/80 backdrop-blur-3xl p-10 rounded-3xl border border-[var(--border-subtle)] shadow-[0_0_80px_rgba(0,0,0,0.8)]">
          <div className="relative">
            <div className="absolute -inset-4 bg-[var(--solar-cyan)]/20 rounded-full blur-xl animate-pulse" />
            <Loader2 size={48} className="text-[var(--solar-cyan)] animate-spin relative" />
          </div>
          <div className="text-center">
            <div className="text-[var(--text-heading)] text-sm font-black uppercase tracking-[0.3em]">
              AI Architecting
            </div>
            <div className="text-[10px] text-[var(--solar-cyan)] font-mono mt-2 tracking-widest uppercase italic">
              Applying {genConfig.style} Rules
            </div>
            {/* Progress bar — uses .animate-progress defined in index.css */}
            <div className="mt-4 h-1 w-48 bg-[var(--border-subtle)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--solar-cyan)] animate-progress" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
