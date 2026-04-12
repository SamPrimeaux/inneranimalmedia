/**
 * ToolLauncherBar — Studio engine bottom toolbar
 *
 * Event-driven: each tool fires a typed CustomEvent.
 * Agent Sam dispatches the same events via MCP tool launch_tool(id, context?).
 * Tool list fetched from /api/agent/tools — not hardcoded.
 *
 * tldraw removed. Upload + Plus merged into one GLB import trigger.
 * External URLs replaced with internal panel events.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Wand2,
  Triangle,
  PenLine,
  Upload,
  Loader2,
} from 'lucide-react';

// ── Event constants ───────────────────────────────────────────────────────────
export const TOOL_EVENTS = {
  meshy:      'iam-tool:meshy',
  spline:     'iam-tool:spline',
  blender:    'iam-tool:blender',
  draw:       'iam-tool:draw',
  importGlb:  'iam-tool:import-glb',
} as const;

type ToolEventKey = keyof typeof TOOL_EVENTS;

// ── Tool definition ───────────────────────────────────────────────────────────
interface ToolDef {
  id:        ToolEventKey;
  label:     string;
  icon:      React.ReactNode;
  colorVar:  string;
  /** If true, opens an external URL in the internal Browser panel instead of a panel event */
  externalUrl?: string;
}

// ── Default tool list — overridden by /api/agent/tools response ───────────────
const DEFAULT_TOOLS: ToolDef[] = [
  {
    id:         'meshy',
    label:      'Meshy',
    icon:       <Box size={16} />,
    colorVar:   'var(--solar-cyan)',
    externalUrl:'https://app.meshy.ai',
  },
  {
    id:         'spline',
    label:      'Spline',
    icon:       <Wand2 size={16} />,
    colorVar:   'var(--solar-blue)',
    externalUrl:'https://app.spline.design',
  },
  {
    id:         'blender',
    label:      'Blender',
    icon:       <Triangle size={16} />,
    colorVar:   'var(--solar-orange)',
    // No externalUrl — fires iam-tool:blender → shell handles bridge modal
  },
  {
    id:         'draw',
    label:      'Draw',
    icon:       <PenLine size={16} />,
    colorVar:   'var(--solar-violet)',
    // Fires iam-tool:draw → opens internal Excalidraw panel
  },
];

// ── DB tool row shape (from /api/agent/tools) ─────────────────────────────────
interface ApiTool {
  tool_id?:     string;
  id?:          string;
  label?:       string;
  name?:        string;
  color_var?:   string;
  external_url?:string;
  is_active?:   number;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ToolLauncherBarProps {
  /** Called when a tool fires its event — parent can open Browser panel with URL */
  onToolEvent:  (eventName: string, detail: Record<string, unknown>) => void;
  /** Called when a GLB file is imported */
  onImportGlb?: (file: File) => void;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
const Tip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group">
    {children}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest font-bold text-[var(--text-muted)] z-50">
      {label}
    </div>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────
export const ToolLauncherBar: React.FC<ToolLauncherBarProps> = ({
  onToolEvent,
  onImportGlb,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tools,   setTools]   = useState<ToolDef[]>(DEFAULT_TOOLS);
  const [loading, setLoading] = useState(false);

  // ── Fetch tool list from DB ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/agent/tools?context=studio', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { tools?: ApiTool[] } | null) => {
        if (!d || !Array.isArray(d.tools) || d.tools.length === 0) return;
        const mapped: ToolDef[] = d.tools
          .filter(t => t.is_active !== 0)
          .map(t => {
            const id = (t.tool_id ?? t.id ?? '') as ToolEventKey;
            const existing = DEFAULT_TOOLS.find(def => def.id === id);
            return {
              id,
              label:       t.label ?? t.name ?? id,
              icon:        existing?.icon ?? <Box size={16} />,
              colorVar:    t.color_var ?? existing?.colorVar ?? 'var(--solar-cyan)',
              externalUrl: t.external_url ?? existing?.externalUrl,
            };
          })
          .filter(t => t.id); // drop rows with no id
        if (mapped.length > 0) setTools(mapped);
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  // ── Fire tool event ───────────────────────────────────────────────────────
  const fireTool = useCallback((tool: ToolDef) => {
    const eventName = TOOL_EVENTS[tool.id] ?? `iam-tool:${tool.id}`;
    const detail: Record<string, unknown> = {
      tool_id:      tool.id,
      label:        tool.label,
      external_url: tool.externalUrl ?? null,
    };
    // Dispatch for shell / App.tsx to handle
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
    // Also call prop so parent can react (e.g. open Browser panel with URL)
    onToolEvent(eventName, detail);
  }, [onToolEvent]);

  // ── GLB import ────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportGlb?.(file);
    window.dispatchEvent(new CustomEvent(TOOL_EVENTS.importGlb, { detail: { fileName: file.name } }));
    // Reset so same file can be re-picked
    e.target.value = '';
  };

  // ── Agent Sam can call window.__iamLaunchTool(id, context?) ───────────────
  useEffect(() => {
    (window as Window & { __iamLaunchTool?: unknown }).__iamLaunchTool = (
      toolId: string,
      context?: Record<string, unknown>
    ) => {
      const tool = tools.find(t => t.id === toolId);
      if (!tool) {
        console.warn(`[ToolLauncherBar] unknown tool: ${toolId}`);
        return;
      }
      const eventName = TOOL_EVENTS[tool.id as ToolEventKey] ?? `iam-tool:${toolId}`;
      const detail = { tool_id: toolId, ...context };
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
      onToolEvent(eventName, detail);
    };
    return () => {
      delete (window as Window & { __iamLaunchTool?: unknown }).__iamLaunchTool;
    };
  }, [tools, onToolEvent]);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel)]/80 backdrop-blur-xl shadow-2xl glass-panel">

        {/* GLB import — single consolidated button */}
        <Tip label="Import GLB">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fileInputRef.current?.click();
              // Reset loading after picker closes (no reliable event, use timeout)
              setTimeout(() => setLoading(false), 2000);
            }}
            className="flex items-center justify-center p-2 rounded-full hover:bg-[var(--bg-hover)] text-[var(--solar-cyan)] transition-all"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          </button>
        </Tip>

        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />

        {/* Tool buttons */}
        {tools.map(tool => (
          <Tip key={tool.id} label={`Launch ${tool.label}`}>
            <button
              type="button"
              onClick={() => fireTool(tool)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[var(--bg-hover)] transition-all group border border-transparent hover:border-[var(--border-subtle)]"
            >
              <div
                className="transition-transform group-hover:scale-110"
                style={{ color: tool.colorVar }}
              >
                {tool.icon}
              </div>
              <span className="text-[11px] font-bold text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors">
                {tool.label}
              </span>
            </button>
          </Tip>
        ))}
      </div>
    </div>
  );
};
